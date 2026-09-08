import assert from "node:assert/strict";
import test from "node:test";

import {
  B7_PRODUCT_BASELINE_METHOD,
  b7LocalTerms,
  normalizeB7ProductBaselineQuery,
  rankB7ProductBaselineCandidates,
} from "../src/media-retrieval-b7-baseline.js";
import { retrieveB7ProductBaseline } from "../src/media-retrieval-b7-service.js";
import {
  buildVisualEmbeddingInput,
  createVisualEmbeddingBinding,
} from "../src/media-retrieval-embedding-input.js";

const USER_ID = "11111111-1111-4111-8111-111111111111";

const visualEmbedding = (rawQuery = "yellow dress on a beach") => {
  const input = buildVisualEmbeddingInput({
    rawQuery,
    candidate: { visualQuery: rawQuery, identityTerms: [], parseConfidence: "high" },
  });
  return createVisualEmbeddingBinding({
    input,
    vector: Array.from({ length: 1024 }, () => 0.1),
    modelId: "product-contract-model",
    modelVersion: "v1",
    configurationHash: "product-contract-configuration-v1",
  });
};

test("B7 identity safety uses exact-only constraints before any visual embedding", () => {
  const normalized = normalizeB7ProductBaselineQuery({
    rawQuery: "Summer yellow dress",
    candidate: {
      visualQuery: "yellow dress",
      identityTerms: ["Summer"],
      parseConfidence: "high",
    },
  });

  assert.equal(normalized.method, B7_PRODUCT_BASELINE_METHOD);
  assert.equal(normalized.visualQuery, "");
  assert.deepEqual(normalized.identityTerms, ["Summer"]);
  assert.equal(normalized.parseConfidence, "low");
});

test("B7 controlled visual normalization emits only the closed attribute serialization", () => {
  const normalized = normalizeB7ProductBaselineQuery({ rawQuery: "yellow dress on a beach" });

  assert.equal(normalized.visualQuery, "visual-v2 color=yellow;clothing=dress;scene=beach");
  assert.deepEqual(normalized.identityTerms, []);
  assert.equal(normalized.parseConfidence, "high");
});

test("B7 ranks caption, tag, OCR, metadata, and vector evidence with asset-level deduplication", () => {
  const results = rankB7ProductBaselineCandidates({
    visualQuery: "yellow summer",
    identityTerms: ["Alice"],
    limit: 10,
    candidates: [
      {
        mediaAssetId: "asset-a",
        kind: "video",
        matchedFrameTimestampMs: 0,
        summary: "plain frame",
        score: 0.64,
        caption: "Alice",
        tags: ["yellow"],
        descriptor: { ocrText: ["SUMMER"] },
        metadata: { album: "summer" },
      },
      {
        mediaAssetId: "asset-a",
        kind: "video",
        matchedFrameTimestampMs: 1000,
        summary: "yellow dress",
        score: 0.92,
        caption: "Alice",
        tags: ["yellow"],
        descriptor: { ocrText: ["SUMMER"] },
        metadata: { album: "summer" },
      },
      {
        mediaAssetId: "asset-b",
        kind: "image",
        matchedFrameTimestampMs: null,
        summary: "yellow dress",
        score: 0.86,
        caption: "Alice",
        tags: ["yellow"],
        descriptor: { ocrText: [] },
        metadata: {},
      },
    ],
  });

  assert.deepEqual(results.map((result) => result.mediaAssetId), ["asset-a", "asset-b"]);
  assert.equal(results[0].matchedFrameTimestampMs, 1000);
  assert.deepEqual(results[0].matchReasons, [
    "visual-vector",
    "identity-caption-exact",
    "tag-match",
    "ocr-match",
    "metadata-match",
  ]);
});

test("B7 does not invent vector evidence for a PostgreSQL NULL score", () => {
  const results = rankB7ProductBaselineCandidates({
    visualQuery: "yellow",
    candidates: [{
      mediaAssetId: "asset-null-score",
      kind: "image",
      summary: "yellow dress",
      score: null,
      caption: "",
      tags: ["yellow"],
      descriptor: { ocrText: [] },
      metadata: {},
    }],
  });

  assert.deepEqual(results[0].matchReasons, ["tag-match"]);
});

test("B7 unions vector and local product stages before fixed local ranking", async () => {
  const calls = [];
  const queryEmbedding = visualEmbedding();
  const result = await retrieveB7ProductBaseline({
    userId: USER_ID,
    normalizedQuery: {
      visualQuery: queryEmbedding.input.text,
      identityTerms: [],
      parseConfidence: "high",
    },
    queryEmbedding,
    repository: {
      searchMediaRetrievalSegments: async (input) => {
        calls.push(input);
        if (input.vector) {
          return [{
            mediaAssetId: "asset-vector",
            kind: "image",
            summary: "yellow dress",
            score: 0.9,
            caption: "",
            tags: [],
            descriptor: { ocrText: [] },
            metadata: {},
          }];
        }
        return [{
          mediaAssetId: "asset-local",
          kind: "image",
          summary: "beach album",
          score: null,
          caption: "",
          tags: ["yellow", "dress"],
          descriptor: { ocrText: [] },
          metadata: { location: "beach" },
        }];
      },
    },
  });

  assert.deepEqual(b7LocalTerms("yellow dress beach"), ["yellow", "dress", "beach"]);
  assert.equal(calls.length, 2);
  assert.deepEqual(calls[0].lexicalTerms, []);
  assert.deepEqual(calls[1].lexicalTerms, ["yellow", "dress", "beach"]);
  assert.deepEqual(result.results.map((item) => item.mediaAssetId), ["asset-vector", "asset-local"]);
  assert.equal(result.executionMode, "visual-vector-local");
  assert.deepEqual(result.execution, {
    vectorStageUsed: true,
    exactIdentityStageUsed: false,
    localLexicalStageUsed: true,
  });
  assert.deepEqual(result.stages.map((stage) => stage.stage), ["vector", "local-lexical"]);
});

test("B7 visual retrieval rejects missing bindings before repository access", async () => {
  let repositoryCalls = 0;
  await assert.rejects(
    retrieveB7ProductBaseline({
      userId: USER_ID,
      normalizedQuery: { visualQuery: "yellow dress", identityTerms: [], parseConfidence: "high" },
      repository: {
        searchMediaRetrievalSegments: async () => {
          repositoryCalls += 1;
          return [];
        },
      },
    }),
    /visual.*embedding|binding|required/i,
  );
  assert.equal(repositoryCalls, 0);
});

test("B7 identity-only retrieval uses one exact local stage and no vector", async () => {
  const calls = [];
  const result = await retrieveB7ProductBaseline({
    userId: USER_ID,
    normalizedQuery: { visualQuery: "", identityTerms: ["Dr Alice Chen"], parseConfidence: "low" },
    repository: {
      searchMediaRetrievalSegments: async (input) => {
        calls.push(input);
        return [{
          mediaAssetId: "identity-asset",
          kind: "image",
          summary: "portrait",
          score: null,
          caption: "Dr Alice Chen",
          tags: [],
          descriptor: { ocrText: [] },
          metadata: {},
        }];
      },
    },
  });

  assert.equal(calls.length, 1);
  assert.equal(calls[0].vector, null);
  assert.deepEqual(calls[0].lexicalTerms, []);
  assert.deepEqual(calls[0].identityTerms, ["Dr Alice Chen"]);
  assert.equal(result.executionMode, "exact-only");
  assert.deepEqual(result.results.map((item) => item.mediaAssetId), ["identity-asset"]);
});

test("B7 rejects forged bindings, bare vectors, and research runtime inputs", async () => {
  const binding = visualEmbedding();
  const base = {
    userId: USER_ID,
    normalizedQuery: { visualQuery: binding.input.text, identityTerms: [], parseConfidence: "high" },
    repository: { searchMediaRetrievalSegments: async () => [] },
  };

  await assert.rejects(
    retrieveB7ProductBaseline({ ...base, queryEmbedding: { ...binding, textHash: "0".repeat(64) } }),
    /binding|input/i,
  );
  await assert.rejects(
    retrieveB7ProductBaseline({ ...base, queryVector: Array.from({ length: 1024 }, () => 0.1) }),
    /binding|vector/i,
  );
  assert.throws(
    () => retrieveB7ProductBaseline({ ...base, queryEmbedding: binding, snapshotId: "research-snapshot" }),
    /research runtime inputs/i,
  );
});
