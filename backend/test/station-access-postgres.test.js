import assert from "node:assert/strict";
import crypto from "node:crypto";
import { execFileSync } from "node:child_process";
import test from "node:test";
import pg from "pg";
import { createConnectionAdapter } from "../src/db.js";
import { createStationPostInteractionSetter } from "../src/station-interaction-repository.js";
import { createStationMediaAssetViewerReader } from "../src/station-library-repository.js";

const enabled = process.env.RUN_STATION_ACCESS_INTEGRATION === "1";
const databaseUrl = String(process.env.STATION_ACCESS_TEST_DATABASE_URL || "").trim();
const OWNER = "11111111-1111-4111-8111-111111111111";
const VIEWER = "22222222-2222-4222-8222-222222222222";
const POST = "33333333-3333-4333-8333-333333333333";
const ALBUM = "44444444-4444-4444-8444-444444444444";
const ASSET = "55555555-5555-4555-8555-555555555555";

test("station direct media and interactions follow live public authorization in PostgreSQL", {
  skip: enabled ? false : "set RUN_STATION_ACCESS_INTEGRATION=1 and STATION_ACCESS_TEST_DATABASE_URL",
}, async () => {
  if (!databaseUrl) throw new Error("An explicit disposable station access database URL is required.");
  const client = new pg.Client({ connectionString: databaseUrl });
  await client.connect();
  try {
    const identity = await client.query(
      `SELECT current_database() AS name,
        (SELECT COUNT(*)::int FROM pg_tables WHERE schemaname = 'public') AS table_count`,
    );
    if (!String(identity.rows[0]?.name).endsWith("_station_access_test") || identity.rows[0]?.table_count !== 0) {
      throw new Error("Station access integration requires an empty database ending in _station_access_test.");
    }
    execFileSync("npm", ["run", "db:migrate"], {
      cwd: new URL("..", import.meta.url),
      stdio: "pipe",
      env: { ...process.env, NODE_ENV: "test", DEFAULT_ADMIN_ENABLED: "false", DATABASE_URL: databaseUrl },
    });
    await client.query("BEGIN");
    try {
      await client.query(
        `INSERT INTO users (id, email, password_hash, display_name, ai_id) VALUES
          ($1, 'owner@station.test', 'test-hash', 'Station Owner', '100019000001'),
          ($2, 'viewer@station.test', 'test-hash', 'Station Viewer', '100019000002')`,
        [OWNER, VIEWER],
      );
      await client.query("INSERT INTO profile_visibility (user_id) VALUES ($1)", [OWNER]);
      await client.query("INSERT INTO station_posts (id, user_id, body) VALUES ($1, $2, 'visible')", [POST, OWNER]);
      await client.query("INSERT INTO station_albums (id, user_id, title, visibility) VALUES ($1, $2, 'Album', 'public')", [ALBUM, OWNER]);
      await client.query(
        `INSERT INTO station_media_assets (id, user_id, album_id, storage_provider, storage_key, status)
        VALUES ($1, $2, $3, 'local', 'private/test.jpg', 'uploaded')`,
        [ASSET, OWNER, ALBUM],
      );
      await client.query("INSERT INTO station_post_media (post_id, media_asset_id, sort_order) VALUES ($1, $2, 0)", [POST, ASSET]);

      const connection = createConnectionAdapter(client);
      const read = createStationMediaAssetViewerReader({ runQuery: connection.query });
      const interact = createStationPostInteractionSetter({
        transaction: work => work(connection),
        createId: crypto.randomUUID,
      });
      const readAs = viewerUserId => read({ viewerUserId, mediaAssetId: ASSET });
      const likeAs = userId => interact({ userId, postId: POST, interactionType: "like", active: true, audit: {} });
      const denied = async () => {
        assert.equal(await readAs(VIEWER), null);
        await assert.rejects(() => likeAs(VIEWER), error => error.status === 404);
        assert.ok(await readAs(OWNER));
      };

      assert.ok(await readAs(VIEWER));
      assert.equal((await likeAs(VIEWER)).likedByMe, true);

      await client.query("UPDATE profile_visibility SET show_posts = FALSE, show_album = FALSE WHERE user_id = $1", [OWNER]);
      await denied();
      await client.query("UPDATE profile_visibility SET show_posts = TRUE, show_album = TRUE WHERE user_id = $1", [OWNER]);
      await client.query("UPDATE users SET status = 'disabled' WHERE id = $1", [OWNER]);
      await denied();
      await client.query("UPDATE users SET status = 'active' WHERE id = $1", [OWNER]);

      await client.query("UPDATE station_posts SET visibility = 'friends' WHERE id = $1", [POST]);
      await client.query("UPDATE station_albums SET visibility = 'friends' WHERE id = $1", [ALBUM]);
      await client.query(
        `INSERT INTO social_relationships (id, follower_user_id, followed_user_id, relation_type)
        VALUES ($1, $2, $3, 'friend')`,
        [crypto.randomUUID(), VIEWER, OWNER],
      );
      assert.ok(await readAs(VIEWER));
      assert.equal((await likeAs(VIEWER)).likedByMe, true);
      await client.query("UPDATE social_relationships SET status = 'blocked' WHERE follower_user_id = $1", [VIEWER]);
      await denied();

      await client.query("UPDATE station_posts SET deleted_at = CURRENT_TIMESTAMP WHERE id = $1", [POST]);
      await client.query("UPDATE station_albums SET deleted_at = CURRENT_TIMESTAMP WHERE id = $1", [ALBUM]);
      await denied();
    } finally {
      await client.query("ROLLBACK");
    }
  } finally {
    await client.end();
  }
});
