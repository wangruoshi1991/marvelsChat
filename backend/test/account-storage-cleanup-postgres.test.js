import assert from "node:assert/strict";
import { randomInt, randomUUID } from "node:crypto";
import { once } from "node:events";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import express from "express";

import { createAccountService } from "../src/account-service.js";
import { getSessionUserFromToken, hashToken } from "../src/auth.js";
import { closeDatabase, query } from "../src/db.js";
import { createStorageCleanupRepository } from "../src/storage-cleanup-repository.js";
import { createStationAlbum, createStationMediaAsset, updateStationMediaAsset } from "../src/station-library-repository.js";
import { deleteOwnedStationAlbum, deleteOwnedStationMediaAsset } from "../src/station-media-deletion-service.js";
import { submitStationFile } from "../src/station-agent-repository.js";
import { registerStationAlbumRoutes } from "../src/routes/station-album-routes.js";
import { registerStationDiaryRoutes } from "../src/routes/station-diary-routes.js";
import { registerStationMediaRoutes } from "../src/routes/station-media-routes.js";
import { registerStationOutfitRoutes } from "../src/routes/station-outfit-routes.js";

const enabled = process.env.RUN_ACCOUNT_STORAGE_CLEANUP_POSTGRES === "1";

async function createFixture(directory) {
  const userId = randomUUID();
  const token = randomUUID();
  const id = randomUUID();
  const aiId = String(randomInt(100_000_000_000, 999_999_999_999));
  await query(`INSERT INTO users (id,email,password_hash,display_name,ai_id)
    VALUES (?,?,'test-only',?,?)`, [userId, `${id}@example.invalid`, id, aiId]);
  await query(`INSERT INTO auth_sessions (id,user_id,token_hash,expires_at)
    VALUES (?,?,?,statement_timestamp() + interval '1 day')`, [randomUUID(), userId, hashToken(token)]);
  const asset = async (filename) => {
    const assetId = randomUUID();
    const objectKey = `${id}-${filename}`;
    await writeFile(path.join(directory, objectKey), "account storage fixture");
    await query(`INSERT INTO station_media_assets (id,user_id,storage_provider,storage_key,status)
      VALUES (?,?,'local',?,'uploaded')`, [assetId, userId, objectKey]);
    return objectKey;
  };
  return { userId, token, asset };
}

test("account access is removed atomically while interrupted physical cleanup stays recoverable", {
  skip: !enabled && "RUN_ACCOUNT_STORAGE_CLEANUP_POSTGRES=1 requires a dedicated loopback *_migration_test database",
}, async () => {
  const url = new URL(process.env.DATABASE_URL);
  assert.ok(["127.0.0.1", "localhost"].includes(url.hostname));
  assert.match(url.pathname, /_migration_test$/);
  const directory = await mkdtemp(path.join(tmpdir(), "mx-account-storage-"));
  try {
    const owner = await createFixture(directory);
    const unrelated = await createFixture(directory);
    const keys = [await owner.asset("a.jpg"), await owner.asset("b.jpg")];
    const retained = await unrelated.asset("retained.jpg");
    await query(`INSERT INTO station_media_assets (id,user_id,storage_provider,storage_key,status)
      VALUES (?,?,'local',?,'uploaded')`, [randomUUID(), owner.userId, retained]);
    const service = createAccountService({ verifyPassword: async () => true });
    assert.equal((await getSessionUserFromToken(owner.token)).user.id, owner.userId);
    const accepted = await service.deleteAccount({ userId: owner.userId, password: "fixture-password" });
    assert.equal(accepted.cleanupStatus, "pending");
    await assert.rejects(() => getSessionUserFromToken(owner.token), { status: 401 });
    assert.deepEqual(await query("SELECT id FROM station_media_assets WHERE user_id = ?", [owner.userId]), []);
    assert.equal((await getSessionUserFromToken(unrelated.token)).user.id, unrelated.userId);
    assert.equal(await readFile(path.join(directory, retained), "utf8"), "account storage fixture");
    await assert.rejects(() => owner.asset("late.jpg"), { code: "23503" });
    const ready = () => query(`UPDATE storage_cleanup_objects SET not_before=now(), next_attempt_at=now()
      WHERE status='queued' AND operation_id IN (SELECT id FROM storage_cleanup_operations WHERE user_id=?)`, [owner.userId]);
    await ready();
    const remove = ({ objectKey }) => rm(path.join(directory, objectKey), { force: true });
    const beforeRestart = createStorageCleanupRepository();
    await beforeRestart.processStorageCleanup({ deleteObject: object => {
      if (object.objectKey === keys[1]) throw new Error("storage interruption");
      return remove(object);
    } });
    const state = async () => (await query("SELECT status FROM storage_cleanup_operations WHERE user_id=?", [owner.userId]))[0].status;
    assert.equal(await state(), "running");
    await assert.rejects(() => readFile(path.join(directory, keys[0])), { code: "ENOENT" });
    assert.ok(await readFile(path.join(directory, keys[1])));
    await ready();
    await createStorageCleanupRepository().processStorageCleanup({ deleteObject: remove });
    assert.equal(await state(), "completed");
    await assert.rejects(() => readFile(path.join(directory, keys[1])), { code: "ENOENT" });
    assert.ok(await readFile(path.join(directory, retained)));
  } finally {
    await closeDatabase();
    await rm(directory, { recursive: true, force: true });
  }
});

test("station deletions retain their receipts, fence album moves and hide dependent references", {
  skip: !enabled && "requires a dedicated loopback migration test database",
}, async () => {
  const url = new URL(process.env.DATABASE_URL);
  assert.ok(["127.0.0.1", "localhost"].includes(url.hostname));
  assert.match(url.pathname, /_migration_test$/);
  const directory = await mkdtemp(path.join(tmpdir(), "mx-station-storage-"));
  try {
    const owner = await createFixture(directory);
    const unrelated = await createFixture(directory);
    const { id: albumId } = await createStationAlbum({ userId: owner.userId, title: "Fixture" });
    const linked = await createStationMediaAsset({ userId: owner.userId, albumId });
    const moved = await createStationMediaAsset({ userId: owner.userId, albumId });
    const postId = randomUUID();
    await query("INSERT INTO station_posts (id,user_id,body) VALUES (?,?,'fixture')", [postId, owner.userId]);
    await query("INSERT INTO station_post_media (post_id,media_asset_id,sort_order) VALUES (?,?,0)", [postId, linked.id]);
    await query("UPDATE station_media_assets SET storage_provider='local',storage_key='pending.jpg' WHERE id=?", [linked.id]);
    await updateStationMediaAsset({ userId: owner.userId, mediaAssetId: moved.id, albumId: null, hasAlbumId: true });
    assert.equal(await deleteOwnedStationAlbum({ userId: unrelated.userId, albumId }), false);
    const audit = {};
    assert.equal(await deleteOwnedStationAlbum({ userId: owner.userId, albumId, audit }), true);
    assert.equal(await deleteOwnedStationAlbum({ userId: owner.userId, albumId, audit }), true);
    await assert.rejects(() => createStationMediaAsset({ userId: owner.userId, albumId }), { status: 404 });
    await assert.rejects(() => updateStationMediaAsset({ userId: owner.userId, mediaAssetId: moved.id, albumId, hasAlbumId: true }), { status: 404 });
    const [receipt] = await query(`SELECT object_key, not_before>now() AS delayed
      FROM storage_cleanup_objects object JOIN storage_cleanup_operations operation ON operation.id=object.operation_id
      WHERE operation.user_id=? AND operation.target_id=?`, [owner.userId, albumId]);
    assert.deepEqual(receipt, { object_key: "pending.jpg", delayed: true });
    const [reference] = await query(`SELECT media.deleted_at IS NOT NULL AS hidden FROM station_post_media link
      JOIN station_media_assets media ON media.id=link.media_asset_id WHERE link.post_id=?`, [postId]);
    assert.equal(reference.hidden, true);
    assert.equal((await query("SELECT id FROM usage_events WHERE target_id=?", [albumId])).length, 1);
    const deleted = await deleteOwnedStationMediaAsset({ userId: owner.userId, mediaAssetId: moved.id });
    assert.equal(deleted.id, moved.id);
    assert.equal((await deleteOwnedStationMediaAsset({ userId: owner.userId, mediaAssetId: moved.id })).id, moved.id);
  } finally {
    await closeDatabase();
    await rm(directory, { recursive: true, force: true });
  }
});

test("station file submission rolls back on event failure and replays the committed file once", {
  skip: !enabled && "requires a dedicated loopback migration test database",
}, async () => {
  const url = new URL(process.env.DATABASE_URL);
  assert.ok(["127.0.0.1", "localhost"].includes(url.hostname));
  assert.match(url.pathname, /_migration_test$/);
  const directory = await mkdtemp(path.join(tmpdir(), "mx-station-file-"));
  try {
    const { userId } = await createFixture(directory);
    const input = {
      userId, submissionKey: randomUUID(), originalFilename: "fixture.txt", mimeType: "text/plain",
      byteSize: 5, extractedText: "draft", parseVersion: "utf8-text-v1",
      preprocessingResult: { kind: "text" }, metadata: {},
    };
    await assert.rejects(() => submitStationFile(input, {
      recordUsage: async () => { throw new Error("fixture event failure"); },
    }), /fixture event failure/);
    assert.equal((await query("SELECT id FROM file_assets WHERE user_id=?", [userId])).length, 0);
    const [first, second] = await Promise.all([submitStationFile(input, {}), submitStationFile(input, {})]);
    assert.equal(first.asset.id, second.asset.id);
    assert.equal(Number(first.replayed) + Number(second.replayed), 1);
    const events = await query("SELECT id FROM usage_events WHERE target_id=?", [first.asset.id]);
    assert.equal(events.length, 1);
    await assert.rejects(() => submitStationFile({ ...input, extractedText: "other" }, {}), { status: 409 });
    const changed = await submitStationFile({ ...input, extractedText: "other", submissionKey: randomUUID() }, {});
    assert.notEqual(changed.asset.id, first.asset.id);
    const placeholder = await submitStationFile({
      ...input, submissionKey: undefined, extractedText: null, byteSize: null,
      parseVersion: null, status: "pending_upload", sourceKind: "upload_placeholder", storageProvider: "pending",
    }, {});
    assert.equal(placeholder.replayed, false);
  } finally {
    await closeDatabase();
    await rm(directory, { recursive: true, force: true });
  }
});

test("station album, media, diary and outfit HTTP creation rolls back on event failure", {
  skip: !enabled && "requires a dedicated loopback migration test database",
}, async () => {
  const url = new URL(process.env.DATABASE_URL);
  assert.ok(["127.0.0.1", "localhost"].includes(url.hostname));
  assert.match(url.pathname, /_migration_test$/);
  const directory = await mkdtemp(path.join(tmpdir(), "mx-station-audit-"));
  let server;
  try {
    const { userId } = await createFixture(directory);
    const roles = [
      ["albums", "station_albums", { title: "Fixture" }],
      ["media-assets", "station_media_assets", { kind: "image" }],
      ["diary", "station_diary_entries", { title: "Fixture", body: "Text" }],
      ["outfits", "station_outfits", { title: "Fixture" }],
    ];
    const app = express();
    app.use(express.json());
    const options = {
      authenticate: (req, _res, next) => { req.user = { id: userId }; next(); },
      asyncHandler: handler => (req, res, next) => Promise.resolve(handler(req, res)).catch(next),
    };
    for (const register of [
      registerStationAlbumRoutes, registerStationMediaRoutes, registerStationDiaryRoutes, registerStationOutfitRoutes,
    ]) register(app, options);
    app.use((error, _req, res, _next) => res.status(500).json({ code: error.code }));
    server = app.listen(0, "127.0.0.1");
    await once(server, "listening");
    await query("ALTER TABLE usage_events ADD CONSTRAINT station_create_audit_fixture CHECK (event_type NOT LIKE 'station.%.create') NOT VALID");
    const create = (route, payload) => fetch(`http://127.0.0.1:${server.address().port}/api/station/${route}`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload),
    });
    try {
      for (const [route, table, payload] of roles) {
        const failed = await create(route, payload);
        assert.equal(failed.status, 500);
        assert.equal((await failed.json()).code, "23514");
        assert.deepEqual(await query(`SELECT id FROM ${table} WHERE user_id=?`, [userId]), []);
      }
    } finally {
      await query("ALTER TABLE usage_events DROP CONSTRAINT station_create_audit_fixture");
    }
    for (const [route, table, payload] of roles) {
      const accepted = await create(route, payload);
      assert.equal(accepted.status, 201);
      const assetId = (await accepted.json()).data.id;
      assert.deepEqual(await query(`SELECT id FROM ${table} WHERE user_id=?`, [userId]), [{ id: assetId }]);
      assert.equal((await query("SELECT id FROM usage_events WHERE target_id=?", [assetId])).length, 1);
    }
  } finally {
    if (server) await new Promise(resolve => server.close(resolve));
    await closeDatabase();
    await rm(directory, { recursive: true, force: true });
  }
});
