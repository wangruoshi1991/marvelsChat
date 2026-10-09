import assert from "node:assert/strict";
import test from "node:test";
import { runMediaRetrievalCalibration } from "../scripts/media-retrieval-calibrate.js";

test("real calibration refuses implicit approval before any provider call", async () => {
  await assert.rejects(runMediaRetrievalCalibration({ provider: {}, maxCalls: 10, budgetFen: 10 }), /approval/);
});

test("calibration enforces its call budget before dispatch and never retries a failed call", async () => {
  let calls = 0;
  const provider = {
    describeImage: async () => { calls += 1; return { summary: "synthetic" }; },
    embedImage: async () => { calls += 1; throw new Error("private-provider-detail"); },
  };
  const dataset = { version: "synthetic", assets: [{ id: "asset", imageUrl: "https://synthetic.invalid" }], cases: [] };
  const capped = await runMediaRetrievalCalibration({ provider, dataset, allowPaid: true, maxCalls: 1, budgetFen: 1 });
  assert.equal(capped.providerCalls, 1);
  assert.equal(capped.passed, false);
  assert.equal(calls, 1);
  const failed = await runMediaRetrievalCalibration({ provider, dataset, allowPaid: true, maxCalls: 10, budgetFen: 10 });
  assert.equal(failed.providerCalls, 2);
  assert.equal(failed.failure, "calibration_stopped");
  assert.equal(calls, 3);
  assert.equal(JSON.stringify(failed).includes("private-provider-detail"), false);
  assert.equal(failed.calls.at(-1).status, "failed-billing-unknown");
  assert.equal(failed.actualCostFen, null);
  assert.equal(failed.budgetKind, "reservation-estimate-not-actual-billing");
});

test("calibration keeps only allowlisted failure diagnostics and records explicit input transport", async () => {
  const error = Object.assign(new Error("private"), {
    code: "retrieval_policy_unverifiable",
    diagnostic: { operation: "image-description", stage: "descriptor-validation", httpStatus: 200,
      schemaPaths: ["summary", "private"], providerBody: "do-not-copy" },
  });
  const report = await runMediaRetrievalCalibration({
    provider: { describeImage: async ({ imageUrl }) => { assert.equal(imageUrl, "test-data-url"); throw error; } },
    dataset: { version: "synthetic", assets: [{ id: "asset", imageUrl: "do-not-use" }], cases: [] },
    allowPaid: true, maxCalls: 1, budgetFen: 1,
    resolveAssetImage: async () => ({ imageUrl: "test-data-url", sha256: "a".repeat(64) }),
  });
  assert.equal(report.imageTransport, "explicit-local-jpeg-data-url");
  assert.deepEqual(report.diagnostic.schemaPaths, ["summary"]);
  assert.equal(JSON.stringify(report).includes("do-not-copy"), false);
  assert.deepEqual(report.assets, [{ id: "asset", sha256: "a".repeat(64) }]);
});

test("calibration includes a separately budgeted reranker call and scores reranked candidates", async () => {
  const calls = [];
  const vector = Array.from({ length: 1024 }, () => 0.1);
  const provider = {
    getIndexingProvenance: () => ({ embeddingProvenance: {
      modelId: "fixture-model", modelVersion: "v1", dimension: 1024,
      normalization: "l2-v1", configurationHash: "fixture-config",
    } }),
    describeImage: async () => ({ summary: "a red bicycle in a park", clothing: [], scene: ["park"], actions: [], objects: ["bicycle"], ocrText: [], qualitySignals: [] }),
    embedImage: async () => vector,
    parseRetrievalQuery: async ({ query }) => ({ visualQuery: query, identityTerms: [], parseConfidence: "high" }),
    embedText: async () => vector,
    rerankMediaCandidates: async ({ candidates, reservation }) => {
      calls.push({ operation: reservation.reservationId, candidateCount: candidates.length });
      return candidates.map((candidate) => ({ ...candidate, matchReasons: ["semantic-match"], score: 0.8 }));
    },
  };
  const report = await runMediaRetrievalCalibration({
    provider,
    dataset: { version: "semantic-test", assets: [{ id: "asset", imageUrl: "https://synthetic.invalid" }],
      cases: [{ id: "query", query: "a bicycle outdoors", expectedAssetIds: ["asset"], tags: ["semantic"] }] },
    allowPaid: true,
    maxCalls: 5,
    budgetFen: 5,
  });
  assert.equal(report.providerCalls, 5);
  assert.equal(report.calls.at(-1).operation, "query-rerank");
  assert.equal(report.cases[0].passed, true);
  assert.equal(calls[0].candidateCount, 1);
});

test("video calibration keeps frames through judging and rejects a correct asset at the wrong time", async () => {
  const vector = Array(1024).fill(0.1);
  let selectedTime = 4000;
  const provider = {
    getIndexingProvenance: () => ({ embeddingProvenance: {
      modelId: "fixture-model", modelVersion: "v1", dimension: 1024,
      normalization: "l2-v1", configurationHash: "fixture-config",
    } }),
    describeImage: async () => ({ summary: "bicycle", clothing: [], scene: [], actions: [], objects: ["bicycle"], ocrText: [], qualitySignals: [] }),
    embedImage: async () => vector,
    parseRetrievalQuery: async ({ query }) => ({ visualQuery: query, identityTerms: [], parseConfidence: "high" }),
    embedText: async () => vector,
    rerankMediaCandidates: async ({ candidates }) => {
      assert.deepEqual(candidates.map((item) => item.matchedFrameTimestampMs), [0, 4000]);
      return [{ ...candidates.find((item) => item.matchedFrameTimestampMs === selectedTime),
        matchReasons: ["semantic-match"], score: 0.8 }];
    },
  };
  const input = {
    provider,
    dataset: { version: "video-test", assets: [{ id: "video", kind: "video" }],
      cases: [{ id: "query", query: "a bicycle outdoors", expectedAssetIds: ["video"], tags: ["video"],
        expectedTimestampRangesMs: [{ assetId: "video", startMs: 3000, endMs: 6000 }] }] },
    resolveAssetSegments: async () => ({ sha256: "a".repeat(64), frames: [
      { imageUrl: "frame-0", timestampMs: 0, sha256: "b".repeat(64) },
      { imageUrl: "frame-1", timestampMs: 4000, sha256: "c".repeat(64) },
    ] }),
    allowPaid: true, maxCalls: 7, budgetFen: 7,
  };
  const passed = await runMediaRetrievalCalibration(input);
  assert.equal(passed.passed, true);
  assert.equal(passed.providerCalls, 7);
  assert.deepEqual(passed.cases[0].resultFrames, [{ assetId: "video", timestampMs: 4000 }]);
  selectedTime = 0;
  const failed = await runMediaRetrievalCalibration(input);
  assert.equal(failed.passed, false);
  assert.equal(failed.cases[0].passed, false);
});

test("invalid video frame timestamps stop calibration before paid dispatch", async () => {
  for (const timestamps of [[0, 0], [-1], [1.5]]) {
    const report = await runMediaRetrievalCalibration({
      provider: { describeImage: async () => { throw new Error("must not dispatch"); } },
      dataset: { version: "invalid-video", assets: [{ id: "video", kind: "video" }], cases: [] },
      resolveAssetSegments: async () => ({ frames: timestamps.map((timestampMs) => ({ timestampMs, imageUrl: "fixture" })) }),
      allowPaid: true, maxCalls: 10, budgetFen: 10,
    });
    assert.equal(report.passed, false);
    assert.equal(report.providerCalls, 0);
  }
});
