import assert from "node:assert/strict";
import test from "node:test";
import { resolveCalibrationImage, visualFixture } from "./helpers/media-retrieval-visual-fixture.js";
import {
  gradeMediaRetrievalCalibrationCases,
  runMediaRetrievalCalibration as runCalibration,
} from "../scripts/media-retrieval-calibrate.js";
const runMediaRetrievalCalibration = input => runCalibration({ resolveAssetImage: resolveCalibrationImage, ...input });

test("real calibration refuses implicit approval before any provider call", async () => {
  await assert.rejects(
    runMediaRetrievalCalibration({ provider: {}, maxCalls: 10, budgetFen: 10 }),
    /approval/
  );
});

test("held-out thresholds are validated before any provider call", async () => {
  let calls = 0;
  const dataset = {
    version: "invalid-thresholds",
    assets: [{ id: "asset", imageUrl: "https://synthetic.invalid" }],
    cases: [
      {
        id: "case",
        query: "bicycle",
        expectedAssetIds: ["asset"],
        tags: ["positive"],
      },
    ],
    acceptanceThresholds: { overallMinimum: 1.1 },
  };
  await assert.rejects(
    runMediaRetrievalCalibration({
      provider: {
        describeImage: async () => {
          calls += 1;
        },
      },
      dataset,
      allowPaid: true,
      maxCalls: 10,
      budgetFen: 10,
    }),
    /acceptance threshold/
  );
  assert.equal(calls, 0);
});

test("all image hashes are checked before the first provider dispatch", async () => {
  let calls = 0;
  const report = await runMediaRetrievalCalibration({
    provider: {
      describeImage: async () => {
        calls += 1;
      },
    },
    dataset: {
      version: "preflight-hashes",
      assets: [
        { id: "first", imageUrl: "https://synthetic.invalid/first.jpg" },
        {
          id: "second",
          imageUrl: "https://synthetic.invalid/second.jpg",
          sha256: "a".repeat(64),
        },
      ],
      cases: [
        {
          id: "case",
          query: "bicycle",
          expectedAssetIds: [],
          tags: ["negative"],
        },
      ],
    },
    resolveAssetImage: async (asset) => ({
      imageUrl: `data:image/jpeg;base64,${asset.id}`,
      sha256: "b".repeat(64),
    }),
    allowPaid: true,
    maxCalls: 10,
    budgetFen: 10,
  });
  assert.equal(report.providerCalls, 0);
  assert.equal(report.failure, "calibration_stopped");
  assert.equal(calls, 0);
});

test("held-out grader evaluates overall, positive, negative, and composition slices", () => {
  const cases = [
    ...Array.from({ length: 16 }, (_, index) => ({
      tags: ["positive"],
      passed: index !== 0,
    })),
    ...Array.from({ length: 8 }, () => ({
      tags: ["negative"],
      passed: true,
    })),
    ...Array.from({ length: 6 }, (_, index) => ({
      tags: ["negative", "composition"],
      passed: index !== 0,
    })),
  ];
  const thresholds = {
    overallMinimum: 0.9,
    positiveTop1Minimum: 0.9,
    negativeEmptyMinimum: 0.9,
    compositionNegativeMinimum: 0.83,
  };
  const result = gradeMediaRetrievalCalibrationCases(cases, thresholds);
  assert.equal(result.passed, true);
  assert.deepEqual(result.metrics, {
    overall: { passed: 28, total: 30 },
    positiveTop1: { passed: 15, total: 16 },
    negativeEmpty: { passed: 13, total: 14 },
    compositionNegative: { passed: 5, total: 6 },
  });
  const failed = gradeMediaRetrievalCalibrationCases(
    cases.map((item) =>
      item.tags.includes("composition") ? { ...item, passed: false } : item
    ),
    thresholds
  );
  assert.equal(failed.passed, false);
});

test("calibration enforces its call budget before dispatch and never retries a failed call", async () => {
  let calls = 0;
  const provider = {
    describeImage: async () => {
      calls += 1;
      return { summary: "synthetic" };
    },
    embedImage: async () => {
      calls += 1;
      throw new Error("private-provider-detail");
    },
  };
  const dataset = {
    version: "synthetic",
    assets: [{ id: "asset", imageUrl: "https://synthetic.invalid" }],
    cases: [],
  };
  const capped = await runMediaRetrievalCalibration({
    provider,
    dataset,
    allowPaid: true,
    maxCalls: 1,
    budgetFen: 1,
  });
  assert.equal(capped.providerCalls, 1);
  assert.equal(capped.passed, false);
  assert.equal(calls, 1);
  const failed = await runMediaRetrievalCalibration({
    provider,
    dataset,
    allowPaid: true,
    maxCalls: 10,
    budgetFen: 10,
  });
  assert.equal(failed.providerCalls, 2);
  assert.equal(failed.failure, "calibration_stopped");
  assert.equal(calls, 3);
  assert.equal(
    JSON.stringify(failed).includes("private-provider-detail"),
    false
  );
  assert.equal(failed.calls.at(-1).status, "failed-billing-unknown");
  assert.equal(failed.actualCostFen, null);
  assert.equal(failed.budgetKind, "reservation-estimate-not-actual-billing");
});

test("calibration keeps only allowlisted failure diagnostics and records explicit input transport", async () => {
  const error = Object.assign(new Error("private"), {
    code: "retrieval_policy_unverifiable",
    diagnostic: {
      operation: "image-description",
      stage: "descriptor-validation",
      httpStatus: 200,
      schemaPaths: ["summary", "private"],
      providerBody: "do-not-copy",
    },
  });
  const report = await runMediaRetrievalCalibration({
    provider: {
      describeImage: async ({ imageUrl }) => {
        assert.equal(imageUrl, "test-data-url");
        throw error;
      },
    },
    dataset: {
      version: "synthetic",
      assets: [
        { id: "asset", imageUrl: "https://synthetic.invalid/image.jpg" },
      ],
      cases: [],
    },
    allowPaid: true,
    maxCalls: 1,
    budgetFen: 1,
    resolveAssetImage: async () => ({
      imageUrl: "test-data-url",
      sha256: "a".repeat(64),
    }),
  });
  assert.equal(report.imageTransport, "explicit-jpeg-data-url");
  assert.deepEqual(report.diagnostic.schemaPaths, ["summary"]);
  assert.equal(JSON.stringify(report).includes("do-not-copy"), false);
  assert.deepEqual(report.assets, [{ id: "asset", sha256: "a".repeat(64) }]);
});

test("calibration checkpoints dispatch and billing-unknown outcomes", async () => {
  const checkpoints = [];
  const report = await runMediaRetrievalCalibration({
    provider: {
      describeImage: async () => {
        throw new Error("provider failure");
      },
    },
    dataset: {
      version: "checkpoint",
      assets: [
        { id: "asset", imageUrl: "https://synthetic.invalid/image.jpg" },
      ],
      cases: [],
    },
    allowPaid: true,
    maxCalls: 2,
    budgetFen: 2,
    onProgress: (progress) =>
      checkpoints.push(progress.calls.map(({ status }) => status)),
  });
  assert.deepEqual(checkpoints, [
    [],
    ["dispatched"],
    ["failed-billing-unknown"],
    ["failed-billing-unknown"],
  ]);
  assert.equal(report.calls[0].status, "failed-billing-unknown");
});

test("calibration includes a separately budgeted reranker call and scores reranked candidates", async () => {
  const calls = [];
  const vector = Array.from({ length: 1024 }, () => 0.1);
  const provider = {
    getIndexingProvenance: () => ({
      embeddingProvenance: {
        modelId: "fixture-model",
        modelVersion: "v1",
        dimension: 1024,
        normalization: "l2-v1",
        configurationHash: "fixture-config",
      },
    }),
    describeImage: async () => ({
      summary: "a red bicycle in a park",
      clothing: [],
      scene: ["park"],
      actions: [],
      objects: ["bicycle"],
      ocrText: [],
      qualitySignals: [],
    }),
    embedImage: async () => vector,
    parseRetrievalQuery: async ({ query }) => ({ spans: [{ text: query, role: "visual" }], parseConfidence: "high" }),
    embedText: async () => vector,
    rerankMediaCandidates: async ({ candidates, reservation }) => {
      calls.push({
        operation: reservation.reservationId,
        candidateCount: candidates.length,
      });
      return candidates.map((candidate) => ({
        ...candidate,
        matchReasons: ["semantic-match"],
        score: 0.8,
        constraintEvidence: [
          {
            constraintIndex: 0,
            citations: [{ field: "image", itemIndex: 0 }],
          },
        ],
      }));
    },
  };
  const report = await runMediaRetrievalCalibration({
    provider,
    dataset: {
      version: "semantic-test",
      assets: [{ id: "asset", imageUrl: "https://synthetic.invalid" }],
      cases: [
        {
          id: "query",
          query: "a bicycle outdoors",
          expectedAssetIds: ["asset"],
          tags: ["semantic"],
        },
      ],
    },
    allowPaid: true,
    maxCalls: 5,
    budgetFen: 5,
  });
  assert.equal(report.providerCalls, 5);
  assert.equal(report.calls.at(-1).operation, "query-rerank");
  assert.equal(report.cases[0].passed, true);
  assert.equal(calls[0].candidateCount, 1);
});

test("an unverifiable query is recorded as a failed case while later cases continue", async () => {
  const vector = Array(1024).fill(0.1);
  const provider = {
    getIndexingProvenance: () => ({
      embeddingProvenance: {
        modelId: "fixture-model",
        modelVersion: "v1",
        dimension: 1024,
        normalization: "l2-v1",
        configurationHash: "fixture-config",
      },
    }),
    describeImage: async () => ({
      summary: "a bicycle outdoors",
      clothing: [],
      scene: ["outdoors"],
      actions: [],
      objects: ["bicycle"],
      ocrText: [],
      qualitySignals: [],
    }),
    embedImage: async () => vector,
    parseRetrievalQuery: async ({ query }) =>
      query === "unverifiable query"
        ? { spans: [], parseConfidence: "low" }
        : { spans: [{ text: query, role: "visual" }], parseConfidence: "high" },
    embedText: async () => vector,
    rerankMediaCandidates: async ({ candidates }) =>
      candidates.map((candidate) => ({
        ...candidate,
        matchReasons: ["semantic-match"],
        score: 0.8,
        constraintEvidence: [
          {
            constraintIndex: 0,
            citations: [{ field: "image", itemIndex: 0 }],
          },
        ],
      })),
  };
  const report = await runMediaRetrievalCalibration({
    provider,
    dataset: {
      version: "continue-after-query-veto",
      assets: [{ id: "asset", imageUrl: "https://synthetic.invalid" }],
      cases: [
        {
          id: "vetoed",
          query: "unverifiable query",
          expectedAssetIds: ["asset"],
          tags: ["positive"],
        },
        {
          id: "valid",
          query: "a bicycle outdoors",
          expectedAssetIds: ["asset"],
          tags: ["positive"],
        },
      ],
    },
    allowPaid: true,
    maxCalls: 10,
    budgetFen: 10,
  });

  assert.equal(report.cases.length, 2);
  assert.deepEqual(
    report.cases.map(({ id, passed }) => ({ id, passed })),
    [
      { id: "vetoed", passed: false },
      { id: "valid", passed: true },
    ]
  );
  assert.equal(report.cases[0].failure, "parser-confidence-unverifiable");
  assert.equal(report.failure, null);
  assert.equal(report.providerCalls, 6);
});

test("calibration accepts a 30-case held-out run within the explicit call ceiling", async () => {
  const vector = Array(1024).fill(0.1);
  const provider = {
    getIndexingProvenance: () => ({
      embeddingProvenance: {
        modelId: "fixture-model",
        modelVersion: "v1",
        dimension: 1024,
        normalization: "l2-v1",
        configurationHash: "fixture-config",
      },
    }),
    describeImage: async () => ({
      summary: "bicycle",
      clothing: [],
      scene: [],
      actions: [],
      objects: ["bicycle"],
      ocrText: [],
      qualitySignals: [],
    }),
    embedImage: async () => vector,
    parseRetrievalQuery: async ({ query }) => ({ spans: [{ text: query, role: "visual" }], parseConfidence: "high" }),
    embedText: async () => vector,
    rerankMediaCandidates: async ({ candidates }) =>
      candidates.map((candidate) => ({
        ...candidate,
        matchReasons: ["semantic-match"],
        score: 0.8,
        constraintEvidence: [
          {
            constraintIndex: 0,
            citations: [{ field: "image", itemIndex: 0 }],
          },
        ],
      })),
  };
  const report = await runMediaRetrievalCalibration({
    provider,
    dataset: {
      version: "heldout-limit-test",
      assets: [{ id: "asset", imageUrl: "https://synthetic.invalid" }],
      cases: Array.from({ length: 30 }, (_, index) => ({
        id: `case-${index}`,
        query: "a bicycle outdoors",
        expectedAssetIds: ["asset"],
        tags: ["held-out"],
      })),
    },
    allowPaid: true,
    maxCalls: 110,
    budgetFen: 110,
  });
  assert.equal(report.cases.length, 30);
  assert.equal(report.providerCalls, 92);
  assert.equal(report.passed, true);
});

test("video calibration keeps frames through judging and rejects a correct asset at the wrong time", async () => {
  const vector = Array(1024).fill(0.1);
  let selectedTime = 4000;
  const provider = {
    getIndexingProvenance: () => ({
      embeddingProvenance: {
        modelId: "fixture-model",
        modelVersion: "v1",
        dimension: 1024,
        normalization: "l2-v1",
        configurationHash: "fixture-config",
      },
    }),
    describeImage: async () => ({
      summary: "bicycle",
      clothing: [],
      scene: [],
      actions: [],
      objects: ["bicycle"],
      ocrText: [],
      qualitySignals: [],
    }),
    embedImage: async () => vector,
    parseRetrievalQuery: async ({ query }) => ({ spans: [{ text: query, role: "visual" }], parseConfidence: "high" }),
    embedText: async () => vector,
    rerankMediaCandidates: async ({ candidates }) => {
      assert.equal(candidates.length, 1);
      if (candidates[0].matchedFrameTimestampMs !== selectedTime) return [];
      return [
        {
          ...candidates.find(
            (item) => item.matchedFrameTimestampMs === selectedTime
          ),
          matchReasons: ["semantic-match"],
          score: 0.8,
          constraintEvidence: [
            {
              constraintIndex: 0,
              citations: [{ field: "image", itemIndex: 0 }],
            },
          ],
        },
      ];
    },
  };
  const input = {
    provider,
    dataset: {
      version: "video-test",
      assets: [{ id: "video", kind: "video" }],
      cases: [
        {
          id: "query",
          query: "a bicycle outdoors",
          expectedAssetIds: ["video"],
          tags: ["video"],
          expectedTimestampRangesMs: [
            { assetId: "video", startMs: 3000, endMs: 6000 },
          ],
        },
      ],
    },
    resolveAssetSegments: async () => ({
      sha256: "a".repeat(64),
      frames: [
        { imageUrl: visualFixture.imageUrl, timestampMs: 0, sha256: visualFixture.imageSha256 },
        { imageUrl: visualFixture.imageUrl, timestampMs: 4000, sha256: visualFixture.imageSha256 },
      ],
    }),
    allowPaid: true,
    maxCalls: 8,
    budgetFen: 8,
  };
  const passed = await runMediaRetrievalCalibration(input);
  assert.equal(passed.passed, true);
  assert.equal(passed.providerCalls, 8);
  assert.deepEqual(passed.cases[0].resultFrames, [
    { assetId: "video", timestampMs: 4000 },
  ]);
  selectedTime = 0;
  const failed = await runMediaRetrievalCalibration(input);
  assert.equal(failed.passed, false);
  assert.equal(failed.cases[0].passed, false);
});

test("invalid video frame timestamps stop calibration before paid dispatch", async () => {
  for (const timestamps of [[0, 0], [-1], [1.5]]) {
    const report = await runMediaRetrievalCalibration({
      provider: {
        describeImage: async () => {
          throw new Error("must not dispatch");
        },
      },
      dataset: {
        version: "invalid-video",
        assets: [{ id: "video", kind: "video" }],
        cases: [],
      },
      resolveAssetSegments: async () => ({
        frames: timestamps.map((timestampMs) => ({
          timestampMs,
          imageUrl: "fixture",
        })),
      }),
      allowPaid: true,
      maxCalls: 10,
      budgetFen: 10,
    });
    assert.equal(report.passed, false);
    assert.equal(report.providerCalls, 0);
  }
});

test("completed rerank validation failures count against quality and do not retry or hide later cases", async () => {
  const vector = Array(1024).fill(0.1);
  let judged = 0;
  const report = await runMediaRetrievalCalibration({
    provider: {
      getIndexingProvenance: () => ({
        embeddingProvenance: {
          modelId: "fixture-model",
          modelVersion: "v1",
          dimension: 1024,
          normalization: "l2-v1",
          configurationHash: "fixture-config",
        },
      }),
      describeImage: async () => ({ summary: "bicycle", objects: ["bicycle"] }),
      embedImage: async () => vector,
      parseRetrievalQuery: async ({ query }) => ({ spans: [{ text: query, role: "visual" }], parseConfidence: "high" }),
      embedText: async () => vector,
      rerankMediaCandidates: async ({ candidates }) => {
        judged += 1;
        if (judged === 1)
          throw Object.assign(new Error("private-provider-marker"), {
            code: "retrieval_policy_unverifiable",
            diagnostic: {
              operation: "query-rerank",
              stage: "rerank-validation",
              httpStatus: 200,
              schemaPaths: ["matches[].constraintEvidence"],
            },
          });
        return candidates.map((candidate) => ({
          ...candidate,
          score: 0.8,
          matchReasons: ["semantic-match"],
          constraintEvidence: [
            {
              constraintIndex: 0,
              citations: [{ field: "image", itemIndex: 0 }],
            },
          ],
        }));
      },
    },
    dataset: {
      version: "validation-failures",
      assets: [{ id: "asset", imageUrl: "https://synthetic.invalid" }],
      cases: ["invalid", "valid"].map((id) => ({
        id,
        query: "bicycle",
        expectedAssetIds: ["asset"],
        tags: ["positive"],
      })),
    },
    allowPaid: true,
    maxCalls: 8,
    budgetFen: 8,
  });
  assert.equal(report.failure, null);
  assert.equal(report.passed, false);
  assert.deepEqual(
    report.cases.map((item) => item.passed),
    [false, true]
  );
  assert.equal(report.calls[4].status, "failed-billing-unknown");
  assert.equal(report.providerCalls, 8);
  assert.equal(judged, 2);
  assert.equal(
    JSON.stringify(report).includes("private-provider-marker"),
    false
  );
});
