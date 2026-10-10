import assert from "node:assert/strict";
import test from "node:test";
import { createAlbumAssistantTools } from "../src/album-assistant-tools.js";
import { MediaRetrievalServiceError } from "../src/media-retrieval-user-service.js";

const albumId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const fixture = ({ enabled = true, indexedAssets = 1, totalAssets = 1, error = null } = {}) => {
  const searches = [];
  const tool = createAlbumAssistantTools({
    userId: "owner", inputMessageId: "message-1", assertAccess: async () => {},
    listAlbums: async () => [{ id: albumId, title: "海边" }],
    service: {
      getMediaRetrievalStatus: async () => ({ enabled, availability: { canStartRun: true }, backfill: { indexedAssets, totalAssets } }),
      searchMediaRetrieval: async args => {
        if (error) throw error;
        searches.push(args);
        return { agentRunId: "run-1", results: [{ mediaAssetId: "asset-1", kind: "video", matchedFrameTimestampMs: 3000, summary: "untrusted incomplete display summary" }] };
      },
    },
  });
  return { tool, searches };
};

test("album tool binds search to server owner, one message and real references", async () => {
  const { tool, searches } = fixture();
  assert.deepEqual(await tool.execute("list_albums", {}), { albums: [{ id: albumId, title: "海边" }], truncated: false });
  const result = await tool.execute("search_media", { query: "黄昏海边的骑行视频", kind: "video", albumId });
  assert.equal(result.results[0].matchedFrameTimestampMs, 3000);
  assert.equal(result.matchedQuery, "黄昏海边的骑行视频");
  assert.equal(Object.hasOwn(result.results[0], "summary"), false);
  assert.equal(searches[0].userId, "owner");
  assert.equal(searches[0].idempotencyKey, "album-chat:message-1:search");
  assert.deepEqual(tool.metadata(), { version: 1, retrievalRunIds: ["run-1"], outcome: "found" });
  await assert.rejects(tool.execute("search_media", { query: "另一张" }));
});

test("model cannot supply an owner, arbitrary SQL, unknown tool or another album", async () => {
  for (const [name, args] of [
    ["sql", { query: "SELECT *" }],
    ["search_media", { query: "海边", userId: "other-owner" }],
    ["search_media", { query: "海边", albumId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb" }],
  ]) {
    const { tool, searches } = fixture();
    await assert.rejects(tool.execute(name, args));
    assert.equal(searches.length, 0);
  }
});

test("first permission, empty library and pending index do not dispatch retrieval models", async () => {
  for (const [settings, state] of [
    [{ enabled: false }, "error"],
    [{ indexedAssets: 0, totalAssets: 0 }, "no-media"],
    [{ indexedAssets: 0, totalAssets: 2 }, "index-pending"],
  ]) {
    const { tool, searches } = fixture(settings);
    assert.equal((await tool.execute("search_media", { query: "照片" })).state, state);
    assert.equal(searches.length, 0);
  }
});

test("partial index remains searchable and uncertain provider charges remain an explicit error", async () => {
  const partial = fixture({ indexedAssets: 1, totalAssets: 3 });
  assert.equal((await partial.tool.execute("search_media", { query: "照片" })).state, "found");
  const failed = fixture({ error: new MediaRetrievalServiceError("retrieval_unknown_charge_no_retry") });
  const result = await failed.tool.execute("search_media", { query: "照片" });
  assert.equal(result.code, "retrieval_unknown_charge_no_retry");
  assert.deepEqual(failed.tool.metadata().retrievalRunIds, []);
});
