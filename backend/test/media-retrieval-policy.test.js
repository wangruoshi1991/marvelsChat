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

test("query normalization preserves source-role classifications for the source compiler", () => {
  const candidate = {
    spans: [{ text: "示例姓名", role: "identity" }, { text: " 穿黄色连衣裙 在户外", role: "visual" }],
    parseConfidence: "high",
  };
  assert.deepEqual(normalizeRetrievalQuery(candidate), candidate);
});

test("copied OCR is isolated from every persisted visual field without removing exact-match text", () => {
  const descriptor = normalizeDescriptor({
    summary: "white PEUGEOT bicycle near 张三 sign",
    clothing: [{ type: "Alice coat", color: "blue" }],
    scene: ["张三 sign against infrared wall"],
    actions: ["Alice beside bicycle"],
    objects: ["white Peugeot bicycle", "张三 sign"],
    qualitySignals: ["Alice text sharp"],
    ocrText: ["PEUGEOT", "张三", "Hello Alice", "red"],
  });
  const { ocrText, ...visual } = descriptor;
  assert.deepEqual(ocrText, ["PEUGEOT", "张三", "Hello Alice", "red"]);
  assert.doesNotMatch(JSON.stringify(visual), /peugeot|张三|alice/iu);
  assert.match(JSON.stringify(visual), /infrared/iu);
  assert.equal(descriptor.summary, "white bicycle near sign");
  assert.equal(normalizeDescriptor({ summary: "ALICE", ocrText: ["ALICE"] }), null);
});

test("malformed parsing is rejected and low confidence is not promoted or repaired", () => {
  assert.equal(normalizeRetrievalQuery(null), null);
  const candidate = { spans: [{ text: "黄色连衣裙", role: "identity" }], parseConfidence: "low" };
  assert.deepEqual(normalizeRetrievalQuery(candidate), candidate);
});

test("OCR isolation matches normalized graphemes while preserving unrelated display text", () => {
  const descriptor = normalizeDescriptor({
    summary: "ＡＬＩＣＥ 与 Cafe\u0301 标签，黄色连衣裙",
    scene: ["Ａｌｉｃｅ sign，infrared wall"],
    objects: ["ＡＬＩＣＥ coat", "untouched ｂｉｃｙｃｌｅ，park"],
    ocrText: ["Alice", "CAFÉ", "red"],
  });
  assert.equal(descriptor.summary, "与 标签，黄色连衣裙");
  assert.deepEqual(descriptor.scene, ["sign，infrared wall"]);
  assert.deepEqual(descriptor.objects, ["coat", "untouched ｂｉｃｙｃｌｅ，park"]);
  assert.deepEqual(descriptor.ocrText, ["Alice", "CAFÉ", "red"]);
  assert.equal(normalizeDescriptor({ summary: "ＡＬＩＣＥ", ocrText: ["Alice"] }), null);
  assert.equal(normalizeDescriptor({ summary: "Alice", ocrText: ["ＡＬＩＣＥ"] }), null);
});

test("retrieval parser normalization rejects malformed schema fields instead of coercing them", () => {
  const malformedCandidates = [
    { visualQuery: "yellow dress", visualConstraints: ["yellow dress"], identityTerms: "Summer", parseConfidence: "high" },
    { visualQuery: "yellow dress", visualConstraints: ["yellow dress"], parseConfidence: "high" },
    { identityTerms: [], parseConfidence: "high" },
    { visualQuery: "yellow dress", visualConstraints: ["yellow dress"], identityTerms: [] },
    { visualQuery: "yellow dress", visualConstraints: ["yellow dress"], identityTerms: null, parseConfidence: "high" },
    { visualQuery: "yellow dress", visualConstraints: ["yellow dress"], identityTerms: ["Summer", 7], parseConfidence: "high" },
    { visualQuery: "yellow dress", visualConstraints: ["yellow dress"], identityTerms: ["x".repeat(81)], parseConfidence: "high" },
    { visualQuery: "yellow dress", visualConstraints: ["yellow dress"], identityTerms: Array.from({ length: 13 }, (_, index) => `term-${index}`), parseConfidence: "high" },
    { spans: [{ text: "yellow dress", role: "visual" }], parseConfidence: "unsupported" },
    { visualQuery: 7, identityTerms: [], parseConfidence: "high" },
  ];

  for (const candidate of malformedCandidates) {
    assert.equal(normalizeRetrievalQuery(candidate), null);
  }
});

test("descriptor phrases preserve complete natural-language evidence within a bounded length", () => {
  const phrase = "various hardcover books with visible spines in red, yellow, beige, brown, and white";
  const descriptor = { summary: "books", objects: [phrase] };
  assert.equal(normalizeDescriptor(descriptor).objects[0], phrase);
  assert.equal(normalizeDescriptor({ ...descriptor, objects: ["x".repeat(161)] }), null);
});
