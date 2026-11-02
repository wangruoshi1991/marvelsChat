import assert from "node:assert/strict";
import test from "node:test";
import { createAlbumAssistantTools } from "../src/album-assistant-tools.js";
import { MediaRetrievalServiceError } from "../src/media-retrieval-user-service.js";

const albumId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

test("every nested retrieval provider call rechecks access and preserves an optional budget receipt", async () => {
  for (const withBudget of [false, true]) {
    let enabled = true, modelCalls = 0, reservations = 0;
    const denial = new Error("Exact product consent was revoked");
    const reservation = { id: "isolated-budget-receipt" };
    const tool = createAlbumAssistantTools({ userId: `nested-provider-${withBudget}`, operationKey: "album-chat:nested-provider",
      assertAccess: async () => { if (!enabled) throw denial; }, listAlbums: async () => [],
      ...(withBudget ? { beforeRetrievalCall: async () => { reservations++; return reservation; } } : {}),
      service: {
        getMediaRetrievalStatus: async () => ({ enabled: true, availability: { canStartRun: true }, backfill: { indexedAssets: 1, skippedAssets: 0, totalAssets: 1 } }),
        searchMediaRetrieval: async options => {
          assert.equal(await options.beforeModelCall(), withBudget ? reservation : null);
          modelCalls++;
          enabled = false;
          await options.beforeModelCall();
          modelCalls++;
          assert.fail("A second retrieval model must not run after revocation");
        },
      },
    });
    await assert.rejects(tool.execute("search_media", { query: "isolated selected photo" }), error => error === denial);
    assert.equal(modelCalls, 1);
    assert.equal(reservations, withBudget ? 1 : 0);
    assert.deepEqual(tool.metadata().retrievalRunIds, []);
  }
});
const fixture = ({ enabled = true, indexedAssets = 1, skippedAssets = 0, totalAssets = 1, error = null, results = null, allowedAlbumIds = null } = {}) => {
  const searches = [];
  const tool = createAlbumAssistantTools({
    userId: "owner", operationKey: "album-chat:message-1", allowedAlbumIds, assertAccess: async () => {},
    listAlbums: async () => [{ id: albumId, title: "海边" }],
    service: {
      getMediaRetrievalStatus: async () => ({ enabled, availability: { canStartRun: true }, backfill: { indexedAssets, skippedAssets, totalAssets } }),
      searchMediaRetrieval: async args => {
        if (error) throw error;
        searches.push(args);
        return { agentRunId: "run-1", results: results ?? [{ mediaAssetId: "asset-1", kind: "video", matchedFrameTimestampMs: 3000, summary: "untrusted incomplete display summary" }] };
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
    [{ indexedAssets: 0, skippedAssets: 2, totalAssets: 2 }, "index-unavailable"],
  ]) {
    const { tool, searches } = fixture(settings);
    assert.equal((await tool.execute("search_media", { query: "照片" })).state, state);
    assert.equal(searches.length, 0);
  }
});

test("partial index remains searchable and uncertain provider charges remain an explicit error", async () => {
  const partial = fixture({ indexedAssets: 1, totalAssets: 3 });
  const partialResult = await partial.tool.execute("search_media", { query: "照片" });
  assert.equal(partialResult.state, "found");
  assert.deepEqual(partialResult.accountIndexCoverage, { indexedAssets: 1, unavailableAssets: 0, pendingAssets: 2, totalAssets: 3 });
  const failed = fixture({ error: new MediaRetrievalServiceError("retrieval_unknown_charge_no_retry") });
  const result = await failed.tool.execute("search_media", { query: "照片" });
  assert.equal(result.code, "retrieval_unknown_charge_no_retry");
  assert.deepEqual(failed.tool.metadata().retrievalRunIds, []);
});

test("unavailable assets remain explicit while pending and indexed assets retain their actual state", async () => {
  const pending = fixture({ indexedAssets: 0, skippedAssets: 1, totalAssets: 2 });
  const pendingResult = await pending.tool.execute("search_media", { query: "照片" });
  assert.equal(pendingResult.state, "index-pending");
  assert.deepEqual(pendingResult.accountIndexCoverage, { indexedAssets: 0, unavailableAssets: 1, pendingAssets: 1, totalAssets: 2 });
  assert.equal(pending.searches.length, 0);

  for (const totalAssets of [2, 3]) {
    const partial = fixture({ indexedAssets: 1, skippedAssets: 1, totalAssets });
    const result = await partial.tool.execute("search_media", { query: "照片" });
    assert.equal(result.state, "found");
    assert.equal(partial.searches.length, 1, "unavailable assets do not block searching ready assets");
    assert.deepEqual(result.accountIndexCoverage, { indexedAssets: 1, unavailableAssets: 1, pendingAssets: totalAssets - 2, totalAssets });
  }
});

test("workspace album scope rejects omitted or foreign album before retrieval", async () => {
  const searches = [];
  const other = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
  const create = () => createAlbumAssistantTools({ userId: "scope-owner", operationKey: "workspace:node", allowedAlbumIds: [albumId],
    listAlbums: async () => [{ id: other, title: "另一个" }, { id: albumId, title: "所选" }], assertAccess: async () => {},
    service: { searchMediaRetrieval: args => searches.push(args) },
  });
  assert.deepEqual(await create().execute("list_albums", {}), { albums: [{ id: albumId, title: "所选" }], truncated: false });
  for (const args of [{ query: "照片" }, { query: "照片", albumId: other }]) await assert.rejects(create().execute("search_media", args));
  assert.deepEqual(searches, []);
  assert.throws(() => createAlbumAssistantTools({ operationKey: "workspace:node", allowedAlbumIds: [] }));
  assert.throws(() => createAlbumAssistantTools({ userId: "owner" }), /explicit operation key/);
});

test("typed handoff copies only tool-returned identities and callers cannot alter tool state", async () => {
  const { tool } = fixture();
  const result = await tool.execute("search_media", { query: "素材" });
  result.results[0].mediaAssetId = "forged";
  const handoff = tool.results();
  assert.equal(handoff[0].mediaAssetId, "asset-1");
  assert.equal(Object.hasOwn(handoff[0], "summary"), false);
  handoff.pop(); tool.metadata().retrievalRunIds.pop();
  assert.equal(tool.results().length, 1);
  assert.equal(tool.metadata().retrievalRunIds.length, 1);
});


test("selected album results keep account coverage separate from the one returned match", async () => {
  const { tool, searches } = fixture({ indexedAssets: 2, totalAssets: 2, allowedAlbumIds: [albumId],
    results: [{ mediaAssetId: "dog-in-selected-album", kind: "image", matchedFrameTimestampMs: null }] });
  const result = await tool.execute("search_media", { query: "黑色巴哥犬", albumId, kind: "image" });
  assert.deepEqual(result.searchScope, { kind: "album", albumId });
  assert.deepEqual(result.accountIndexCoverage, { indexedAssets: 2, unavailableAssets: 0, pendingAssets: 0, totalAssets: 2 });
  assert.deepEqual(result.results.map(item => item.mediaAssetId), ["dog-in-selected-album"]);
  assert.equal(searches[0].albumId, albumId);
  assert.equal(Object.hasOwn(result, "indexCoverage"), false, "no ambiguous coverage field can be presented as album statistics");
  assert.equal(Object.hasOwn(result.searchScope, "totalAssets"), false, "no album total is inferred from returned matches");
});

test("empty selected album search does not turn account counts into selected album facts", async () => {
  const { tool } = fixture({ indexedAssets: 1, skippedAssets: 1, totalAssets: 3, results: [], allowedAlbumIds: [albumId] });
  const result = await tool.execute("search_media", { query: "不存在的照片", albumId });
  assert.equal(result.state, "empty");
  assert.deepEqual(result.searchScope, { kind: "album", albumId });
  assert.deepEqual(result.accountIndexCoverage, { indexedAssets: 1, unavailableAssets: 1, pendingAssets: 1, totalAssets: 3 });
  assert.deepEqual(result.results, []);
});

test("zero ready assets report account status alongside the requested search scope without retrieval", async () => {
  for (const selected of [true, false]) {
    const { tool, searches } = fixture({ indexedAssets: 0, skippedAssets: 1, totalAssets: 2,
      allowedAlbumIds: selected ? [albumId] : null });
    const result = await tool.execute("search_media", { query: "照片", ...(selected ? { albumId } : {}) });
    assert.equal(result.state, "index-pending");
    assert.deepEqual(result.searchScope, selected ? { kind: "album", albumId } : { kind: "account" });
    assert.deepEqual(result.accountIndexCoverage, { indexedAssets: 0, unavailableAssets: 1, pendingAssets: 1, totalAssets: 2 });
    assert.deepEqual(searches, []);
  }
});
