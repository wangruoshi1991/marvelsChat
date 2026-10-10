import assert from "node:assert/strict";
import test from "node:test";
import {
  buildVisualEmbeddingInput,
  verifyVisualEmbeddingInput,
  toProviderVisualEmbeddingInput,
  createVisualEmbeddingBinding,
  verifyVisualEmbeddingBinding,
} from "../src/media-retrieval-embedding-input.js";

const visual = text => ({ spans: [{ text, role: "visual" }], parseConfidence: "high" });

test("source extraction accepts open objects, actions, relations and languages without a vocabulary", () => {
  for (const rawQuery of [
    "放在室内靠着白墙的黑色背包", "叉子插在白色表带里",
    "紫铜色菱形花瓶映着窗外的霓虹", "a bolometer beside a coelacanth sculpture",
    "une tasse turquoise près de la fenêtre", "靛蓝陶罐上的螺旋釉纹",
  ]) {
    const input = buildVisualEmbeddingInput({ rawQuery, candidate: visual(rawQuery) });
    assert.equal(input.mode, "semantic");
    assert.equal(input.semanticText, rawQuery);
    assert.deepEqual(input.visualConstraints, [rawQuery]);
    assert.deepEqual(verifyVisualEmbeddingInput(input), input);
  }
});

test("ordered source roles exclude classified identities and search wrappers from provider text", () => {
  const rawQuery = "找阿岚穿墨绿色斗篷站在石拱桥旁的照片";
  const input = buildVisualEmbeddingInput({ rawQuery, candidate: {
    spans: [
      { text: "找", role: "syntax" }, { text: "阿岚", role: "identity" },
      { text: "穿墨绿色斗篷", role: "visual" }, { text: "站在石拱桥旁", role: "visual" },
      { text: "的照片", role: "syntax" },
    ], parseConfidence: "high",
  } });
  assert.equal(input.mode, "semantic");
  assert.deepEqual(input.identityTerms, ["阿岚"]);
  assert.equal(input.semanticText, "穿墨绿色斗篷 站在石拱桥旁");
  assert.deepEqual(input.visualConstraints, ["穿墨绿色斗篷", "站在石拱桥旁", input.semanticText]);
  const providerInput = toProviderVisualEmbeddingInput(input);
  assert.deepEqual(providerInput.identityTerms, []);
  assert.doesNotMatch(JSON.stringify(providerInput), /阿岚|的照片/);
  assert.deepEqual(verifyVisualEmbeddingInput(providerInput), providerInput);
});

test("missing, old-schema, malformed and low-confidence parsing cannot use keywords or exact filters", () => {
  for (const candidate of [
    undefined, null, { visualQuery: "yellow dress", identityTerms: [], visualConstraints: ["yellow dress"], parseConfidence: "high" },
    { spans: [{ text: "yellow dress", role: "identity" }], parseConfidence: "low" },
    { spans: [], parseConfidence: "high" },
    { spans: [{ text: "yellow dress", role: "instruction" }], parseConfidence: "high" },
    { spans: [{ text: "yellow dress", role: "visual", tool: "sql" }], parseConfidence: "high" },
  ]) {
    const input = buildVisualEmbeddingInput({ rawQuery: "yellow dress", candidate });
    assert.equal(input.mode, "blocked");
    assert.equal(input.text, "");
    assert.deepEqual(input.identityTerms, []);
    assert.throws(() => verifyVisualEmbeddingInput(input), /not visual-safe/);
  }
});

test("translation, added details, omitted names and reordered or missing text fail complete source coverage", () => {
  for (const [rawQuery, spans] of [
    ["靠墙停着的单车", [{ text: "a bicycle against a wall", role: "visual" }]],
    ["a bicycle on a car", [{ text: "a bicycle", role: "visual" }]],
    ["Alice wearing yellow", [{ text: "wearing yellow", role: "visual" }]],
    ["a red cup", [{ text: "a red cup in sunlight", role: "visual" }]],
    ["red cup", [{ text: "cup", role: "visual" }, { text: "red ", role: "visual" }]],
  ]) {
    const input = buildVisualEmbeddingInput({ rawQuery, candidate: { spans, parseConfidence: "high" } });
    assert.equal(input.mode, "blocked");
    assert.equal(input.reasonCode, "parser-source-unverifiable");
    assert.throws(() => verifyVisualEmbeddingInput(input), /not visual-safe/);
  }
});

test("an explicit high-confidence identity-only request can use exact owner filters", () => {
  const input = buildVisualEmbeddingInput({ rawQuery: "找小岚的照片", candidate: {
    spans: [{ text: "找", role: "syntax" }, { text: "小岚", role: "identity" }, { text: "的照片", role: "syntax" }],
    parseConfidence: "high",
  } });
  assert.equal(input.mode, "exact-only");
  assert.equal(input.reasonCode, null);
  assert.deepEqual(input.identityTerms, ["小岚"]);
  assert.equal(input.text, "");
  assert.throws(() => toProviderVisualEmbeddingInput(input), /not visual-safe/);
});

test("an identity copied into another visual span remains ineligible", () => {
  const input = buildVisualEmbeddingInput({ rawQuery: "Alice with Alice in yellow", candidate: {
    spans: [{ text: "Alice", role: "identity" }, { text: " with Alice in yellow", role: "visual" }],
    parseConfidence: "high",
  } });
  assert.equal(input.mode, "blocked");
  assert.equal(input.reasonCode, "parser-visual-unverifiable");
});

test("input size and role count limits reject without truncating or switching modes", () => {
  for (const rawQuery of ["x".repeat(241), "", undefined]) {
    assert.equal(buildVisualEmbeddingInput({ rawQuery, candidate: visual(String(rawQuery)) }).mode, "blocked");
  }
  const rawQuery = "x".repeat(12);
  const input = buildVisualEmbeddingInput({ rawQuery, candidate: {
    spans: Array.from({ length: 12 }, () => ({ text: "x", role: "visual" })), parseConfidence: "high",
  } });
  assert.equal(input.mode, "blocked");
});

test("complete visual text and every relation remain bound through embedding and reranking", () => {
  const input = buildVisualEmbeddingInput({ rawQuery: "an orange cat sitting on books", candidate: {
    spans: [{ text: "an orange cat", role: "visual" }, { text: " sitting on books", role: "visual" }],
    parseConfidence: "high",
  } });
  assert.equal(input.visualConstraints.at(-1), "an orange cat sitting on books");
  assert.throws(() => verifyVisualEmbeddingInput({ ...input, visualConstraints: ["an orange cat"] }), /embedding input/i);
  assert.throws(() => verifyVisualEmbeddingInput({ ...input, semanticText: "a cat", text: "semantic-v2 a cat" }), /embedding input/i);
  assert.throws(() => verifyVisualEmbeddingInput({ ...input, coverage: [{ ...input.coverage[0], end: 1 }] }), /coverage/);
  assert.throws(() => verifyVisualEmbeddingInput({ ...input, textHash: "0".repeat(64) }), /serialization/);
});

test("query, vector and embedding-space provenance cannot be substituted", () => {
  const input = buildVisualEmbeddingInput({ rawQuery: "a copper vessel", candidate: visual("a copper vessel") });
  const binding = createVisualEmbeddingBinding({
    input, vector: Array.from({ length: 1024 }, () => 0.1), modelId: "test", modelVersion: "1", configurationHash: "test-hash",
  });
  assert.deepEqual(verifyVisualEmbeddingBinding(binding).input, input);
  assert.throws(() => verifyVisualEmbeddingBinding({ ...binding, vector: binding.vector.map(() => 0.2) }), /binding/i);
  assert.throws(() => verifyVisualEmbeddingBinding(binding, { expectedEmbeddingSpace: {
    modelId: "another", modelVersion: "1", dimension: 1024, normalization: "l2-v1", configurationHash: "test-hash",
  } }), /space/i);
});
