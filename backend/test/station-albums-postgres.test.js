import assert from "node:assert/strict";
import { randomInt, randomUUID } from "node:crypto";
import { once } from "node:events";
import { setTimeout as wait } from "node:timers/promises";
import test, { after } from "node:test";
import express from "express";
import { closeDatabase, getPool, query } from "../src/db.js";
import { createRequestErrorHandler } from "../src/request-observability.js";
import { registerStationAlbumRoutes } from "../src/routes/station-album-routes.js";
import {
  createStationAlbum,
  createStationMediaAsset,
  deleteStationAlbum,
  getStationMediaAssetForUser,
  getStationMediaAssetForViewer,
  listStationAlbumMediaAssetsForUser,
  updateStationMediaAsset,
} from "../src/station-library-repository.js";

const skip = process.env.RUN_ACCOUNT_STORAGE_CLEANUP_POSTGRES !== "1"
  && "requires a dedicated loopback *_migration_test database";

async function createUser() {
  const userId = randomUUID();
  await query(`INSERT INTO users (id, email, password_hash, display_name, ai_id)
    VALUES (?, ?, 'test-only', ?, ?)`,
  [userId, `${userId}@example.invalid`, userId, String(randomInt(100_000_000_000, 999_999_999_999))]);
  return userId;
}

async function albumApi(t) {
  const userId = await createUser();
  const otherUserId = await createUser();
  const app = express();
  app.use(express.json());
  app.use((req, res, next) => {
    if (req.get("X-Drop-Receipt") === "yes") {
      // The real handler can reach json only after PostgreSQL has committed.
      res.json = () => req.socket.destroy();
    }
    next();
  });
  registerStationAlbumRoutes(app, {
    authenticate: (req, _res, next) => {
      req.user = { id: req.get("X-Other-Owner") ? otherUserId : userId };
      next();
    },
    asyncHandler: handler => (req, res, next) => Promise.resolve(handler(req, res)).catch(next),
  });
  app.use(createRequestErrorHandler({ production: true, logger: { error() {} } }));
  const server = app.listen(0, "127.0.0.1");
  await once(server, "listening");
  t.after(() => new Promise(resolve => server.close(resolve)));
  const url = `http://127.0.0.1:${server.address().port}/api/station/albums`;
  return {
    userId,
    create: (key, body, moreHeaders = {}) => fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Idempotency-Key": key, ...moreHeaders },
      body: JSON.stringify(body),
    }),
    update: (id, body) => fetch(`${url}/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),
    remove: id => fetch(`${url}/${id}`, { method: "DELETE" }),
  };
}

if (!skip) {
  const url = new URL(process.env.DATABASE_URL);
  assert.ok(["127.0.0.1", "localhost"].includes(url.hostname));
  assert.match(url.pathname, /_migration_test$/);
  after(closeDatabase);
}

test("concurrent same-key album POSTs return one receipt and write one usage event", { skip }, async t => {
  const { userId, create } = await albumApi(t);
  const key = randomUUID();
  const responses = await Promise.all([
    create(key, { title: "Shared", description: "", visibility: "private" }),
    create(key.toUpperCase(), { title: " Shared " }),
  ]);
  const [first, second] = await Promise.all(responses.map(response => response.json()));
  assert.deepEqual(first, second);
  assert.deepEqual(responses.map(response => response.status).sort(), [200, 201]);
  assert.deepEqual(await query("SELECT id FROM station_albums WHERE user_id = ?", [userId]), [{ id: first.data.id }]);
  assert.equal((await query("SELECT id FROM usage_events WHERE target_id = ?", [first.data.id])).length, 1);
});

test("late album creation retries cannot resurrect a deleted album", { skip }, async t => {
  const { userId, create, remove } = await albumApi(t);
  const body = { title: "Deleted before retry" };
  for (const hardDelete of [false, true]) {
    const key = randomUUID();
    const response = await create(key, body);
    assert.equal(response.status, 201);
    const { data } = await response.json();
    if (hardDelete) await query("DELETE FROM station_albums WHERE id = ?", [data.id]);
    else assert.equal((await remove(data.id)).status, 204);

    const retry = await create(key, body);
    assert.equal(retry.status, 410);
    assert.equal((await retry.json()).error.details.code, "STATION_ALBUM_RECEIPT_UNAVAILABLE");
  }
  assert.deepEqual(await query("SELECT id FROM station_albums WHERE user_id = ? AND deleted_at IS NULL", [userId]), []);
});

test("lost album receipt replays original data, rejects changed input, and new keys can create the same title", { skip }, async t => {
  const { userId, create, update } = await albumApi(t);
  const key = randomUUID();
  const body = { title: "Retry", description: "Original", visibility: "private" };
  await assert.rejects(create(key, body, { "X-Drop-Receipt": "yes" }), TypeError);
  const [committed] = await query("SELECT id FROM station_albums WHERE user_id = ?", [userId]);
  assert.ok(committed);

  assert.equal((await update(committed.id, { description: "Edited" })).status, 200);
  const replay = await create(key, body);
  assert.equal(replay.status, 200);
  const { data } = await replay.json();
  assert.equal(data.id, committed.id);
  assert.equal(data.description, "Original");
  assert.equal((await query("SELECT description FROM station_albums WHERE id = ?", [committed.id]))[0].description, "Edited");

  const conflict = await create(key, { ...body, visibility: "public" });
  assert.equal(conflict.status, 409);
  assert.equal((await conflict.json()).error.details.code, "STATION_ALBUM_IDEMPOTENCY_CONFLICT");
  assert.equal((await create("invalid", body)).status, 400);
  assert.equal((await query("SELECT id FROM station_albums WHERE user_id = ?", [userId])).length, 1);
  const next = await create(randomUUID(), body);
  assert.equal(next.status, 201);
  assert.notEqual((await next.json()).data.id, committed.id);
  const other = await create(key, body, { "X-Other-Owner": "yes" });
  assert.equal(other.status, 201);
  assert.notEqual((await other.json()).data.id, committed.id);
  assert.equal((await query("SELECT id FROM station_albums WHERE user_id = ? AND title = ?", [userId, body.title])).length, 2);
});

async function waitForAlbumLock(coordinator, blockerPid) {
  const deadline = Date.now() + 5000;
  while (Date.now() < deadline) {
    await coordinator.query("SELECT pg_stat_clear_snapshot()");
    const { rows } = await coordinator.query(`SELECT pid FROM pg_stat_activity
      WHERE query LIKE 'SELECT id FROM station_albums%' AND $1 = ANY(pg_blocking_pids(pid))`, [blockerPid]);
    if (rows.length) return rows[0].pid;
    await wait(10);
  }
  assert.fail(`No album transaction blocked by PID ${blockerPid}`);
}

for (const addFirst of [true, false]) {
  test(`album add and delete serialize when ${addFirst ? "add" : "delete"} acquires the album first`, { skip }, async () => {
    const userId = await createUser();
    const viewerUserId = await createUser();
    await query("INSERT INTO profile_visibility (user_id, show_album) VALUES (?, true)", [userId]);
    const { id: albumId } = await createStationAlbum({ userId, title: "Race", visibility: "public" });
    const original = await createStationMediaAsset({ userId, albumId });
    const joining = await createStationMediaAsset({ userId });
    const originalObject = `${original.id}.jpg`;
    const joiningObject = `${joining.id}.jpg`;
    await query("UPDATE station_media_assets SET storage_provider = 'local', storage_key = ?, status = 'uploaded' WHERE id = ?", [originalObject, original.id]);
    await query("UPDATE station_media_assets SET storage_provider = 'local', storage_key = ?, status = 'uploaded' WHERE id = ?", [joiningObject, joining.id]);
    assert.equal((await getStationMediaAssetForViewer({ viewerUserId, mediaAssetId: original.id })).id, original.id);
    assert.equal(await getStationMediaAssetForViewer({ viewerUserId, mediaAssetId: joining.id }), null);

    const coordinator = await (await getPool()).connect();
    const add = () => updateStationMediaAsset({
      userId, mediaAssetId: joining.id, albumId, hasAlbumId: true,
    }).then(value => ({ value }), error => ({ error }));
    const remove = () => deleteStationAlbum({ userId, albumId }).then(value => ({ value }), error => ({ error }));
    let first;
    let second;
    try {
      await coordinator.query("BEGIN");
      const { rows: [{ pid: coordinatorPid }] } = await coordinator.query("SELECT pg_backend_pid() AS pid");
      // Hold the album lock to queue both real repository transactions in order.
      await coordinator.query("SELECT id FROM station_albums WHERE id = $1 FOR UPDATE", [albumId]);
      first = (addFirst ? add : remove)();
      const firstPid = await waitForAlbumLock(coordinator, coordinatorPid);
      second = (addFirst ? remove : add)();
      const secondPid = await waitForAlbumLock(coordinator, firstPid);
      assert.notEqual(firstPid, secondPid);
    } finally {
      await coordinator.query("COMMIT");
      coordinator.release();
      await Promise.all([first, second]);
    }
    const [added, removed] = await (addFirst ? Promise.all([first, second]) : Promise.all([second, first]));
    assert.deepEqual(removed, { value: true });
    if (addFirst) assert.equal(added.value.albumId, albumId);
    else assert.equal(added.error.status, 404);

    const [asset] = await query("SELECT album_id, status, deleted_at IS NOT NULL AS deleted FROM station_media_assets WHERE id = ?", [joining.id]);
    assert.deepEqual(asset, addFirst
      ? { album_id: albumId, status: "deleted", deleted: true }
      : { album_id: null, status: "uploaded", deleted: false });
    assert.equal(await getStationMediaAssetForViewer({ viewerUserId, mediaAssetId: joining.id }), null);
    assert.equal(await getStationMediaAssetForViewer({ viewerUserId, mediaAssetId: original.id }), null);
    assert.equal((await getStationMediaAssetForUser({ userId, mediaAssetId: joining.id }))?.id ?? null,
      addFirst ? null : joining.id);
    assert.deepEqual(await listStationAlbumMediaAssetsForUser({ userId, albumId }), []);
    const cleanup = await query(`SELECT object.provider, object.object_key FROM storage_cleanup_objects object
      JOIN storage_cleanup_operations operation ON operation.id = object.operation_id
      WHERE operation.user_id = ? AND operation.target_id = ? AND operation.scope = 'station_album'`, [userId, albumId]);
    assert.deepEqual(cleanup.map(row => [row.provider, row.object_key]).sort(), (addFirst
      ? [["local", joiningObject], ["local", originalObject]]
      : [["local", originalObject]]).sort());
  });
}
