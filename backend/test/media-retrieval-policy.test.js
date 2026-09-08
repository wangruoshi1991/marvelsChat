import assert from "node:assert/strict";
import test from "node:test";

const {
  normalizeDescriptor,
  normalizeRetrievalQuery,
} = await import("../src/media-retrieval-policy.js");

test("descriptor normalization strips unknown data and rejects identity attributes", () => {
  const descriptor = normalizeDescriptor({
    summary: "黄色连衣裙，室外站立",
    clothing: [{ type: "dress", color: "yellow", brand: "ignored" }],
    scene: ["outdoor"],
    actions: ["standing"],
    objects: ["umbrella"],
    ocrText: ["SALE"],
    qualitySignals: ["blurred"],
    providerMetadata: { requestId: "not persisted" },
  });
  assert.deepEqual(descriptor, {
    summary: "黄色连衣裙，室外站立",
    clothing: [{ type: "dress", color: "yellow" }],
    scene: ["outdoor"],
    actions: ["standing"],
    objects: ["umbrella"],
    ocrText: ["SALE"],
    qualitySignals: ["blurred"],
  });
  assert.equal(normalizeDescriptor({ summary: "portrait", age: 28 }), null);
  assert.equal(normalizeDescriptor({ summary: "portrait", personName: "Alice" }), null);
});

test("retrieval query removes identity terms from vector text while retaining exact-match terms", () => {
  const normalized = normalizeRetrievalQuery({
    visualQuery: "示例姓名 穿黄色连衣裙 在户外",
    identityTerms: ["示例姓名"],
    parseConfidence: "high",
  });

  assert.equal(normalized.visualQuery.includes("示例姓名"), false);
  assert.equal(normalized.visualQuery, "穿黄色连衣裙 在户外");
  assert.deepEqual(normalized.identityTerms, ["示例姓名"]);
  assert.equal(normalized.parseConfidence, "high");
});

test("malformed or low-confidence parsing falls back to lexical-only retrieval", () => {
  assert.equal(normalizeRetrievalQuery(null), null);
  assert.deepEqual(normalizeRetrievalQuery({
    visualQuery: "黄色连衣裙",
    identityTerms: ["示例姓名"],
    parseConfidence: "low",
  }), {
    visualQuery: "",
    identityTerms: ["示例姓名"],
    parseConfidence: "low",
  });
});

test("retrieval parser normalization rejects malformed schema fields instead of coercing them", () => {
  const malformedCandidates = [
    { visualQuery: "yellow dress", identityTerms: "Summer", parseConfidence: "high" },
    { visualQuery: "yellow dress", parseConfidence: "high" },
    { identityTerms: [], parseConfidence: "high" },
    { visualQuery: "yellow dress", identityTerms: [] },
    { visualQuery: "yellow dress", identityTerms: null, parseConfidence: "high" },
    { visualQuery: "yellow dress", identityTerms: ["Summer", 7], parseConfidence: "high" },
    { visualQuery: "yellow dress", identityTerms: ["x".repeat(81)], parseConfidence: "high" },
    { visualQuery: "yellow dress", identityTerms: Array.from({ length: 13 }, (_, index) => `term-${index}`), parseConfidence: "high" },
    { visualQuery: "yellow dress", identityTerms: [], parseConfidence: "unsupported" },
    { visualQuery: 7, identityTerms: [], parseConfidence: "high" },
  ];

  for (const candidate of malformedCandidates) {
    assert.equal(normalizeRetrievalQuery(candidate), null);
  }
});
