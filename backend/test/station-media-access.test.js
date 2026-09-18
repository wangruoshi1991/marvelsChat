import assert from "node:assert/strict";
import test from "node:test";

process.env.DEFAULT_ADMIN_ENABLED = "false";

const { createStationMediaAssetViewerReader } = await import("../src/station-library-repository.js");

test("station media viewer authorization covers owner and visible post or album paths", async () => {
  const calls = [];
  const readAsset = createStationMediaAssetViewerReader({
    runQuery: async (sql, params) => {
      calls.push({ sql, params });
      return [{
        id: "asset-1",
        user_id: "owner-1",
        album_id: "album-1",
        kind: "image",
        storage_provider: "oss",
        storage_key: "private/object-key",
        original_filename: "private-name.jpg",
        mime_type: "image/jpeg",
        status: "uploaded",
      }];
    },
  });

  const asset = await readAsset({ viewerUserId: "viewer-1", mediaAssetId: "asset-1" });
  assert.equal(asset.id, "asset-1");
  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0].params, ["asset-1", "viewer-1", "viewer-1", "viewer-1"]);
  assert.match(calls[0].sql, /JOIN users owner ON owner\.id = asset\.user_id/);
  assert.match(calls[0].sql, /asset\.user_id = \?/);
  assert.match(calls[0].sql, /owner\.status = 'active'/);
  assert.match(calls[0].sql, /asset\.status = 'uploaded'/);
  assert.match(calls[0].sql, /asset\.storage_key IS NOT NULL/);
  assert.match(calls[0].sql, /visibility\.show_posts = TRUE/);
  assert.match(calls[0].sql, /JOIN station_posts post/);
  assert.match(calls[0].sql, /visibility\.show_album = TRUE/);
  assert.match(calls[0].sql, /FROM station_albums album/);
  assert.match(calls[0].sql, /relationship\.relation_type = 'friend'/);
});

test("protected media file responses are not stored after a visibility change", async () => {
  const { readFileSync } = await import("node:fs");
  const { fileURLToPath } = await import("node:url");
  const route = readFileSync(fileURLToPath(new URL("../src/routes/station-media-routes.js", import.meta.url)), "utf8");
  assert.match(route, /res\.setHeader\("cache-control", "private, no-store"\)/);
  assert.doesNotMatch(route, /max-age=31536000, immutable/);
});

test("station media viewer reader returns no asset when the authorization query denies access", async () => {
  const readAsset = createStationMediaAssetViewerReader({ runQuery: async () => [] });
  assert.equal(
    await readAsset({ viewerUserId: "viewer-1", mediaAssetId: "asset-1" }),
    null,
  );
});
