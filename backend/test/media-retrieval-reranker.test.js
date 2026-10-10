import assert from "node:assert/strict";
import test from "node:test";
import { visualFixture } from "./helpers/media-retrieval-visual-fixture.js";
import { retrieveB7ProductBaselineCore } from "../src/media-retrieval-b7-core.js";
import { buildVisualEmbeddingInput, createVisualEmbeddingBinding } from "../src/media-retrieval-embedding-input.js";
import { projectMediaRetrievalRerankCandidates, projectMediaRetrievalRerankedCandidates, validateMediaRetrievalRerankResponse, rerankMediaRetrievalVisualCandidates } from "../src/media-retrieval-reranker.js";

const frames = [
  { ...visualFixture, mediaAssetId: "video-a", kind: "video", matchedFrameTimestampMs: 1000,
    score: 0.9, summary: "bicycle parked", descriptor: { objects: ["bicycle"], actions: ["parked"] } },
  { ...visualFixture, mediaAssetId: "video-a", kind: "video", matchedFrameTimestampMs: 5000,
    score: 0.7, summary: "person riding bicycle", descriptor: { objects: ["bicycle"], actions: ["person riding bicycle"] } },
];
const match = (frame, score = 0.8) => ({ ...frame, score, matchReasons: ["semantic-match"],
  constraintEvidence: [{ constraintIndex: 0, citations: [{ field: "image", itemIndex: 0 }] }] });

test("semantic recall preserves different frames of the same video until relevance judging", async () => {
  const rawQuery = "a person riding a bicycle";
  const input = buildVisualEmbeddingInput({ rawQuery,
    candidate: { spans: [{ text: rawQuery, role: "visual" }], parseConfidence: "high" } });
  const binding = createVisualEmbeddingBinding({ input,
    vector: Array(1024).fill(0.1), modelId: "test-model", modelVersion: "v1", configurationHash: "test-config" });
  const result = await retrieveB7ProductBaselineCore({
    repository: { searchMediaRetrievalSegments: async () => frames },
    userId: "owner", normalizedQuery: { visualQuery: input.text, identityTerms: [], parseConfidence: "high" }, queryEmbedding: binding,
  });
  assert.deepEqual(result.semanticCandidates.map((frame) => frame.matchedFrameTimestampMs), [1000, 5000]);
  const visuals = result.semanticCandidates.map(candidate => ({ ...candidate, ...visualFixture }));
  const projected = await rerankMediaRetrievalVisualCandidates({ candidates: visuals, visualConstraints: input.visualConstraints,
    invoke: async ([frame]) => frame.matchedFrameTimestampMs === 5000 ? [match(frame)] : [],
  });
  assert.equal(projected[0].matchedFrameTimestampMs, 5000);
});

test("reranking deduplicates assets only after both frames pass complete visual support", async () => {
  const projected = await rerankMediaRetrievalVisualCandidates({ candidates: [frames[1], frames[0]], visualConstraints: ["bicycle"],
    invoke: async ([frame]) => [match(frame)],
  });
  assert.equal(projected.length, 1);
  assert.equal(projected[0].matchedFrameTimestampMs, 5000);
  assert.equal(projected[0].score, 0.8);
});

test("partial or medium relevance cannot enter results or pass the provider contract", () => {
  const evidence = [{ constraintIndex: 0, citations: [{ field: "image", itemIndex: 0 }] }];
  const candidates = projectMediaRetrievalRerankCandidates([frames[0]]);
  assert.equal(validateMediaRetrievalRerankResponse({ matches: [{
    candidateKey: "c0", relevance: "medium", constraintEvidence: evidence,
  }] }, candidates, ["bicycle"]), null);
  assert.equal(projectMediaRetrievalRerankedCandidates([match(frames[0], 0.6)], [frames[0]], ["bicycle"]), null);
});

test("forged timestamps, unknown assets and duplicate frames fail closed", () => {
  for (const values of [
    [match({ ...frames[0], matchedFrameTimestampMs: 9000 })],
    [match({ ...frames[0], mediaAssetId: "other-owner" })],
    [match(frames[0]), match(frames[0])],
  ]) assert.equal(projectMediaRetrievalRerankedCandidates(values, [frames[0]], ["bicycle"]), null);
});

test("a relevance label cannot bypass missing, fabricated or unrelated-source citations", () => {
  const candidates = projectMediaRetrievalRerankCandidates([{ ...visualFixture, kind: "image", descriptor: {
    clothing: [], objects: ["orange cat"], actions: ["cat sitting on a wooden table"], scene: ["indoors"],
    ocrText: ["stack of books"], summary: "private caption stack of books",
  } }]);
  const visualConstraints = ["orange cat", "sitting", "on a stack of books"];
  const cat = { constraintIndex: 0, citations: [{ field: "image", itemIndex: 0 }] };
  const pose = { constraintIndex: 1, citations: [{ field: "image", itemIndex: 0 }] };
  for (const constraintEvidence of [
    [cat, pose],
    [cat, pose, { constraintIndex: 2, citations: [{ field: "objects", itemIndex: 1 }] }],
    [cat, pose, { constraintIndex: 2, citations: [{ field: "ocrText", itemIndex: 0 }] }],
    [cat, pose, { constraintIndex: 2, citations: [{ field: "summary", itemIndex: 0 }] }],
    [cat, pose, pose],
  ]) assert.equal(validateMediaRetrievalRerankResponse({ matches: [{
    candidateKey: "c0", relevance: "high", constraintEvidence,
  }] }, candidates, visualConstraints), null);
  assert.equal(validateMediaRetrievalRerankResponse({ matches: [{ candidateKey: "c0", relevance: "high" }] }, candidates, visualConstraints), null);
  assert.deepEqual(validateMediaRetrievalRerankResponse({ matches: [] }, candidates, visualConstraints), []);
});

test("all bound constraints need authentic evidence before public result projection", () => {
  const candidate = { ...visualFixture, mediaAssetId: "owner-asset", kind: "image", descriptor: {
    objects: ["orange cat", "stack of books"], actions: ["cat sitting on a stack of books"], scene: [], clothing: [],
  } };
  const visualConstraints = ["orange cat", "on a stack of books"];
  const value = { ...candidate, score: 0.8, matchReasons: ["semantic-match"], constraintEvidence: [
    { constraintIndex: 0, citations: [{ field: "image", itemIndex: 0 }] },
    { constraintIndex: 1, citations: [{ field: "image", itemIndex: 0 }] },
  ] };
  const result = projectMediaRetrievalRerankedCandidates([value], [candidate], visualConstraints);
  assert.equal(result[0].mediaAssetId, "owner-asset");
  assert.equal(Object.hasOwn(result[0], "constraintEvidence"), false);
  assert.equal(projectMediaRetrievalRerankedCandidates([{ ...value, constraintEvidence: value.constraintEvidence.slice(0, 1) }], [candidate], visualConstraints), null);
});
