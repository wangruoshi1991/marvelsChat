import assert from "node:assert/strict";
import test from "node:test";
import { createMediaRetrievalVisualResolver } from "../src/media-retrieval-visual-resolver.js";
import { rerankMediaRetrievalVisualCandidates, projectMediaRetrievalRerankCandidates } from "../src/media-retrieval-reranker.js";
import { visualFixture } from "./helpers/media-retrieval-visual-fixture.js";

const revision = "2026-10-10T00:00:00.000Z";
const asset = { id: "asset", userId: "owner", kind: "video", status: "uploaded",
  storageKey: "private-original", mimeType: "video/mp4", byteSize: 4, contentRevisionAt: revision };
const candidates = [1000, 4000].map(timestamp => ({
  mediaAssetId: asset.id, contentRevisionAt: revision, kind: "video",
  matchedFrameTimestampMs: timestamp, score: 0.9, summary: "visible frame",
}));
function harness({ mutate, frames } = {}) {
  let reads = 0, sourceChecks = 0, authorizationChecks = 0;
  const source = { ...asset };
  const resolve = createMediaRetrievalVisualResolver({
    repository: { getMediaRetrievalVisualSources: async input => {
      assert.deepEqual(input, { userId: "owner", indexEpoch: 1, mediaAssetIds: ["asset"] });
      sourceChecks += 1;
      return [{ ...source }];
    } },
    media: {
      loadOwnedMediaBytes: async () => { reads += 1; mutate?.(source); return { bytes: Buffer.from("test"), mimeType: "video/mp4" }; },
      extractVideoFramesAtTimestamps: async input => {
        assert.deepEqual(input.timestampsMs, [1000, 4000]);
        return frames || input.timestampsMs.map(timestampMs => ({ timestampMs, bytes: Buffer.from("frame") }));
      },
      normalizeImageForReranking: async () => ({ bytes: Buffer.from(visualFixture.imageUrl.split(",")[1], "base64"), mimeType: "image/webp" }),
    },
  });
  return {
    source, counts: () => ({ reads, sourceChecks, authorizationChecks }),
    resolve: () => resolve({ userId: "owner", indexEpoch: 1, candidates,
      assertAuthorized: async () => { authorizationChecks += 1; } }),
  };
}
test("visual resolver reads each owned video once, preserves exact frames and rechecks versions", async () => {
  const fixture = harness();
  const result = await fixture.resolve();
  assert.equal(fixture.counts().reads, 1);
  assert.deepEqual(result.candidates.map(candidate => candidate.matchedFrameTimestampMs), [1000, 4000]);
  assert.equal(result.candidates.every(candidate => candidate.imageSha256 === visualFixture.imageSha256), true);
  await result.assertCurrent();
  assert.equal(fixture.counts().sourceChecks, 4);
  fixture.source.contentRevisionAt = "2026-10-10T01:00:00.000Z";
  await assert.rejects(result.assertCurrent, error => error.code === "retrieval_policy_unverifiable");
});
test("cross owner and content changes during reading cannot dispatch stale visual evidence", async () => {
  for (const change of [
    { userId: "other" }, { contentRevisionAt: "2026-10-11T00:00:00.000Z" },
    { storageKey: "replaced" }, { byteSize: 5 }, { status: "deleted" }, { kind: "image" },
  ]) {
    const fixture = harness({ mutate: source => Object.assign(source, change) });
    await assert.rejects(fixture.resolve, error => error.code === "retrieval_policy_unverifiable");
    assert.equal(fixture.counts().reads, 1);
  }
  const beforeRead = harness();
  beforeRead.source.userId = "other";
  await assert.rejects(beforeRead.resolve);
  assert.equal(beforeRead.counts().reads, 0);
});
test("missing, duplicate or different timestamps cannot replace selected video frames", async () => {
  for (const frames of [[], [{ timestampMs: 1000 }], [{ timestampMs: 1000 }, { timestampMs: 1000 }],
    [{ timestampMs: 1000 }, { timestampMs: 5000 }]]) {
    await assert.rejects(harness({ frames }).resolve, error => error.code === "retrieval_policy_unverifiable");
  }
});
test("each model batch is bounded and a failure in a later batch rejects the entire search", async () => {
  const images = Array.from({ length: 13 }, (_, index) => ({
    ...visualFixture, mediaAssetId: "asset-" + index, kind: "image", matchedFrameTimestampMs: null,
  }));
  const calls = [];
  await assert.rejects(rerankMediaRetrievalVisualCandidates({
    candidates: images, visualConstraints: ["a visible object"],
    invoke: async batch => {
      calls.push(batch.length);
      if (calls.length === 2) throw new Error("later batch failed");
      return batch.map(candidate => ({ ...candidate, score: 0.8, matchReasons: ["semantic-match"],
        constraintEvidence: [{ constraintIndex: 0, citations: [{ field: "image", itemIndex: 0 }] }] }));
    },
  }), /later batch failed/);
  assert.deepEqual(calls, [1, 1]);
});
test("forged image hashes, external URLs, old descriptor-only candidates and oversized batches are rejected", () => {
  for (const input of [
    [{ ...visualFixture, imageSha256: "0".repeat(64) }],
    [{ ...visualFixture, imageUrl: "https://untrusted.invalid/image" }],
    [{ descriptor: { objects: ["bicycle"] } }],
    Array(2).fill(visualFixture),
  ]) assert.throws(() => projectMediaRetrievalRerankCandidates(input));
});
