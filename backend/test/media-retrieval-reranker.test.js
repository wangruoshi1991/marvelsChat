import assert from "node:assert/strict";
import test from "node:test";
import { retrieveB7ProductBaselineCore } from "../src/media-retrieval-b7-core.js";
import { buildVisualEmbeddingInput, createVisualEmbeddingBinding } from "../src/media-retrieval-embedding-input.js";
import { projectMediaRetrievalRerankedCandidates } from "../src/media-retrieval-reranker.js";

const frames = [
  { mediaAssetId: "video-a", kind: "video", matchedFrameTimestampMs: 1000,
    score: 0.9, summary: "bicycle parked", descriptor: { objects: ["bicycle"], actions: ["parked"] } },
  { mediaAssetId: "video-a", kind: "video", matchedFrameTimestampMs: 5000,
    score: 0.7, summary: "person riding bicycle", descriptor: { objects: ["bicycle"], actions: ["person riding bicycle"] } },
];
const match = (frame, score = 0.8) => ({ ...frame, score, matchReasons: ["semantic-match"] });

test("semantic recall preserves different frames of the same video until relevance judging", async () => {
  const rawQuery = "a person riding a bicycle";
  const input = buildVisualEmbeddingInput({ rawQuery,
    candidate: { visualQuery: rawQuery, identityTerms: [], parseConfidence: "high" } });
  const binding = createVisualEmbeddingBinding({ input,
    vector: Array(1024).fill(0.1), modelId: "test-model", modelVersion: "v1", configurationHash: "test-config" });
  const result = await retrieveB7ProductBaselineCore({
    repository: { searchMediaRetrievalSegments: async () => frames },
    userId: "owner", normalizedQuery: { visualQuery: input.text, identityTerms: [] }, queryEmbedding: binding,
  });
  assert.deepEqual(result.semanticCandidates.map((frame) => frame.matchedFrameTimestampMs), [1000, 5000]);
  const projected = projectMediaRetrievalRerankedCandidates([match(result.semanticCandidates[1])], result.semanticCandidates);
  assert.equal(projected[0].matchedFrameTimestampMs, 5000);
});

test("reranking deduplicates assets after judging and preserves the best supported frame", () => {
  const projected = projectMediaRetrievalRerankedCandidates([match(frames[0], 0.6), match(frames[1])], frames);
  assert.equal(projected.length, 1);
  assert.equal(projected[0].matchedFrameTimestampMs, 5000);
  assert.equal(projected[0].score, 0.8);
});

test("forged timestamps, unknown assets and duplicate frames fail closed", () => {
  for (const values of [
    [match({ ...frames[0], matchedFrameTimestampMs: 9000 })],
    [match({ ...frames[0], mediaAssetId: "other-owner" })],
    [match(frames[0]), match(frames[0])],
  ]) assert.equal(projectMediaRetrievalRerankedCandidates(values, frames), null);
});
