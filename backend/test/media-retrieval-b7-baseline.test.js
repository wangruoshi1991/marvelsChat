import assert from "node:assert/strict";
import test from "node:test";
import { retrieveB7ProductBaseline } from "../src/media-retrieval-b7-service.js";
import { B7_PRODUCT_BASELINE_CONFIGURATION, assertB7ProductBaselineConfiguration } from "../src/media-retrieval-b7-baseline.js";
import { buildVisualEmbeddingInput, createVisualEmbeddingBinding } from "../src/media-retrieval-embedding-input.js";

const userId = "11111111-1111-4111-8111-111111111111";
const bindingFor = query => createVisualEmbeddingBinding({
  input: buildVisualEmbeddingInput({ rawQuery: query, candidate: {
    spans: [{ text: query, role: "visual" }], parseConfidence: "high",
  } }), vector: Array.from({ length: 1024 }, () => 0.1), modelId: "test", modelVersion: "1", configurationHash: "test-space",
});

test("semantic retrieval uses only owner-scoped vector recall and never returns an unjudged match", async () => {
  const calls = [], binding = bindingFor("an unfamiliar sculpture beside an arch");
  const result = await retrieveB7ProductBaseline({
    repository: { searchMediaRetrievalSegments: async input => { calls.push(input); return [{
      mediaAssetId: "asset", kind: "image", score: 0.9, summary: "arch", descriptor: { objects: ["sculpture"] },
    }]; } }, userId, normalizedQuery: { visualQuery: binding.input.text, identityTerms: [], parseConfidence: "high" }, queryEmbedding: binding,
  });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].userId, userId);
  assert.equal(Object.hasOwn(calls[0], "lexicalTerms"), false);
  assert.deepEqual(result.results, []);
  assert.equal(result.semanticCandidates.length, 1);
  assert.equal(result.executionMode, "visual-vector");
});

test("explicit identity-only retrieval requires complete exact terms and retains owner and album scope", async () => {
  const calls = [];
  const result = await retrieveB7ProductBaseline({
    repository: { searchMediaRetrievalSegments: async input => { calls.push(input); return [
      { mediaAssetId: "partial", kind: "image", caption: "Alice at dusk" },
      { mediaAssetId: "exact", kind: "video", caption: "Alice", matchedFrameTimestampMs: 5000 },
      { mediaAssetId: "exact", kind: "video", tags: ["Alice"], matchedFrameTimestampMs: 1000 },
    ]; } }, userId, albumId: "album", normalizedQuery: { visualQuery: "", identityTerms: ["Alice"], parseConfidence: "high" },
  });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].userId, userId);
  assert.equal(calls[0].albumId, "album");
  assert.equal(calls[0].vector, null);
  assert.equal(Object.hasOwn(calls[0], "lexicalTerms"), false);
  assert.deepEqual(result.results.map(r => r.mediaAssetId), ["exact"]);
  assert.equal(result.results[0].matchedFrameTimestampMs, 1000);
  assert.deepEqual(result.semanticCandidates, []);
});

test("a visual request with identity terms still requires a binding and cannot become exact search", async () => {
  await assert.rejects(retrieveB7ProductBaseline({
    repository: { searchMediaRetrievalSegments: async () => assert.fail("must not search") }, userId,
    normalizedQuery: { visualQuery: "yellow dress", identityTerms: ["Alice"], parseConfidence: "high" },
  }), error => error.code === "b7_visual_embedding_required");
});

test("missing or uncertain parsing cannot activate any retrieval stage", async () => {
  for (const parseConfidence of [undefined, "low"]) {
    await assert.rejects(retrieveB7ProductBaseline({
      repository: { searchMediaRetrievalSegments: async () => assert.fail("must not search") }, userId,
      normalizedQuery: { visualQuery: "", identityTerms: ["Alice"], parseConfidence },
    }), /high-confidence/);
  }
});

test("local keyword and research controls are rejected rather than silently ignored", async () => {
  for (const key of ["allowLocalLexical", "snapshotId", "evaluator", "formalReceipt"]) {
    assert.throws(() => retrieveB7ProductBaseline({ [key]: true }), /does not accept/);
  }
  assert.deepEqual(assertB7ProductBaselineConfiguration(B7_PRODUCT_BASELINE_CONFIGURATION), B7_PRODUCT_BASELINE_CONFIGURATION);
  assert.throws(() => assertB7ProductBaselineConfiguration({ ...B7_PRODUCT_BASELINE_CONFIGURATION, allowLocalLexical: true }), /configuration/);
});

test("bare vectors and changed normalized queries never reach the repository", async () => {
  const binding = bindingFor("a striped vase");
  const common = { repository: { searchMediaRetrievalSegments: async () => assert.fail("must not search") }, userId,
    normalizedQuery: { visualQuery: binding.input.text, identityTerms: [], parseConfidence: "high" } };
  await assert.rejects(retrieveB7ProductBaseline({ ...common, queryVector: binding.vector }), /bare vector/);
  await assert.rejects(retrieveB7ProductBaseline({ ...common, queryEmbedding: binding, normalizedQuery: {
    visualQuery: "another query", identityTerms: [], parseConfidence: "high",
  } }), /normalized query/);
  await assert.rejects(retrieveB7ProductBaseline({ ...common, queryEmbedding: binding, expectedEmbeddingConfigurationHash: "other" }), /configuration/);
});

test("the full 240-character query remains bound without silently truncating the serialized prefix", async () => {
  const binding = bindingFor("x".repeat(240));
  const result = await retrieveB7ProductBaseline({
    repository: { searchMediaRetrievalSegments: async () => [] }, userId, queryEmbedding: binding,
    normalizedQuery: { visualQuery: binding.input.text, identityTerms: [], parseConfidence: "high" },
  });
  assert.deepEqual(result.results, []);
});
