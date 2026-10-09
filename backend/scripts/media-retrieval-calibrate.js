import crypto from "node:crypto";
import { parseArgs } from "node:util";
import { pathToFileURL } from "node:url";
import { readFile } from "node:fs/promises";
import path from "node:path";
import suite from "../../agents/media-retrieval/calibration-suite.json" with { type: "json" };
import videoSuite from "../../agents/media-retrieval/calibration-video-suite.json" with { type: "json" };
import { createMediaRetrievalProvider } from "../src/media-retrieval-provider.js";
import { projectMediaRetrievalDiagnostic } from "../src/media-retrieval-errors.js";
import { extractRepresentativeFrames, normalizeImageForProvider } from "../src/media-retrieval-media.js";
import { projectMediaRetrievalRerankedCandidates } from "../src/media-retrieval-reranker.js";
import {
  buildVisualEmbeddingInput,
  createVisualEmbeddingBinding,
  toProviderVisualEmbeddingInput,
} from "../src/media-retrieval-embedding-input.js";
import { retrieveB7ProductBaseline } from "../src/media-retrieval-b7-service.js";

const positiveInteger = (value, maximum) => {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > maximum)
    throw new Error("Invalid calibration limit.");
  return parsed;
};

const cosine = (left, right) => {
  const dot = left.reduce(
    (total, value, index) => total + value * right[index],
    0,
  );
  const magnitude = Math.sqrt(
    left.reduce((total, value) => total + value * value, 0) *
      right.reduce((total, value) => total + value * value, 0),
  );
  if (!Number.isFinite(dot) || !Number.isFinite(magnitude) || magnitude <= 0)
    throw new Error("Invalid calibration vector.");
  return dot / magnitude;
};

// Use the same bounded extractor and image normalization as the indexing
// worker. Local data URLs avoid OSS writes during public-fixture calibration.
export async function prepareCalibrationVideoAsset({ bytes }) {
  const frames = await extractRepresentativeFrames({ bytes, mimeType: "video/mp4", maxFrames: 6 });
  return {
    sha256: crypto.createHash("sha256").update(bytes).digest("hex"),
    frames: await Promise.all(frames.map(async (frame) => {
      const normalized = await normalizeImageForProvider({ bytes: frame.bytes });
      return {
        imageUrl: `data:${normalized.mimeType};base64,${normalized.bytes.toString("base64")}`,
        timestampMs: frame.timestampMs,
        sha256: crypto.createHash("sha256").update(normalized.bytes).digest("hex"),
      };
    })),
  };
}

const calibrationSegments = (asset, resolved) => {
  if (asset.kind !== "video") return [{ ...resolved, timestampMs: null }];
  const frames = resolved?.frames;
  if (!Array.isArray(frames) || !frames.length || frames.length > 6)
    throw new Error("Invalid calibration frames.");
  const seen = new Set();
  for (const frame of frames) {
    if (!Number.isSafeInteger(frame.timestampMs) || frame.timestampMs < 0 ||
      seen.has(frame.timestampMs) || typeof frame.imageUrl !== "string")
      throw new Error("Invalid calibration frame timestamp.");
    seen.add(frame.timestampMs);
  }
  return frames;
};

export async function runMediaRetrievalCalibration({
  provider,
  allowPaid = false,
  maxCalls,
  budgetFen,
  reserveFen = 1,
  dataset = suite,
  resolveAssetImage = null,
  resolveAssetSegments = null,
}) {
  if (!allowPaid)
    throw new Error("Calibration requires explicit paid-call approval.");
  const limit = positiveInteger(maxCalls, 50);
  const budget = positiveInteger(budgetFen, 500);
  const reservationAmount = positiveInteger(reserveFen, budget);
  const report = {
    datasetVersion: dataset.version,
    datasetHash: crypto
      .createHash("sha256")
      .update(JSON.stringify(dataset))
      .digest("hex"),
    evidenceScope: dataset.assets.some((asset) => asset.kind === "video")
      ? "small-public-video-frame-calibration" : "small-public-photo-calibration",
    providerCalls: 0,
    reservedEstimateFen: 0,
    actualCostFen: null,
    budgetKind: "reservation-estimate-not-actual-billing",
    imageTransport: resolveAssetSegments ? "explicit-local-frame-data-url"
      : resolveAssetImage ? "explicit-local-jpeg-data-url" : "dataset-https-url",
    calls: [],
    assets: [],
    cases: [],
    failure: null,
    passed: false,
  };
  const call = async (operation, caseId, invoke) => {
    if (
      report.providerCalls >= limit ||
      report.reservedEstimateFen + reservationAmount > budget
    ) {
      throw new Error("Calibration budget or call limit reached.");
    }
    report.providerCalls += 1;
    report.reservedEstimateFen += reservationAmount;
    const entry = { operation, caseId, status: "dispatched", latencyMs: null };
    report.calls.push(entry);
    const callStarted = Date.now();
    try {
      const value = await invoke({
        reserved: true,
        amountFen: reservationAmount,
        reservationId: `calibration-${report.providerCalls}`,
      });
      entry.status = "succeeded";
      return value;
    } catch (error) {
      entry.status = "failed-billing-unknown";
      throw error;
    } finally {
      entry.latencyMs = Date.now() - callStarted;
    }
  };
  const started = Date.now();
  try {
    const segments = [];
    for (const asset of dataset.assets) {
      const resolved = resolveAssetSegments ? await resolveAssetSegments(asset) : resolveAssetImage
        ? await resolveAssetImage(asset)
        : { imageUrl: asset.imageUrl, sha256: null };
      const frames = calibrationSegments(asset, resolved);
      report.assets.push({ id: asset.id, sha256: resolved.sha256,
        ...(asset.kind === "video" ? { frames: frames.map((frame) => ({
          timestampMs: frame.timestampMs, sha256: frame.sha256,
        })) } : {}) });
      for (const frame of frames) {
        const caseId = asset.kind === "video" ? `${asset.id}@${frame.timestampMs}` : asset.id;
        const descriptor = await call("image-description", caseId, (reservation) =>
          provider.describeImage({ imageUrl: frame.imageUrl, reservation }));
        const vector = await call("image-embedding", caseId, (reservation) =>
          provider.embedImage({ imageUrl: frame.imageUrl, reservation }));
        segments.push({ ...asset, descriptor, vector, matchedFrameTimestampMs: frame.timestampMs });
      }
    }
    for (const definition of dataset.cases) {
      const caseStarted = Date.now();
      const candidate = await call(
        "query-parse",
        definition.id,
        (reservation) =>
          provider.parseRetrievalQuery({
            query: definition.query,
            reservation,
          }),
      );
      const input = buildVisualEmbeddingInput({
        rawQuery: definition.query,
        candidate,
      });
      if (!["visual", "semantic"].includes(input.mode))
        throw new Error("Calibration query failed the visual boundary.");
      const vector = await call(
        "query-embedding",
        definition.id,
        (reservation) =>
          provider.embedText({
            input: toProviderVisualEmbeddingInput(input),
            reservation,
          }),
      );
      const space = provider.getIndexingProvenance().embeddingProvenance;
      const binding = createVisualEmbeddingBinding({
        input,
        vector,
        ...space,
        embeddingNormalization: space.normalization,
      });
      const candidates = segments.map((asset) => ({
        mediaAssetId: asset.id,
        kind: asset.kind || "image",
        matchedFrameTimestampMs: asset.matchedFrameTimestampMs,
        caption: "",
        tags: [],
        metadata: {},
        descriptor: asset.descriptor,
        summary: asset.descriptor.summary,
        score: cosine(vector, asset.vector),
      }));
      const baseline = await retrieveB7ProductBaseline({
        repository: {
          searchMediaRetrievalSegments: async ({ vector: requested }) =>
            requested ? candidates : [],
        },
        userId: "public-calibration-only",
        normalizedQuery: {
          visualQuery: input.text,
          identityTerms: [],
          parseConfidence: "high",
        },
        queryEmbedding: binding,
      });
      const rankedCandidates =
        input.mode === "semantic"
          ? baseline.semanticCandidates.length
            ? await call("query-rerank", definition.id, (reservation) =>
                provider.rerankMediaCandidates({
                  query: input.semanticText || input.text,
                  candidates: baseline.semanticCandidates,
                  reservation,
                }),
              )
            : []
          : baseline.results;
      const finalCandidates = input.mode === "semantic"
        ? projectMediaRetrievalRerankedCandidates(rankedCandidates, baseline.semanticCandidates)
        : rankedCandidates;
      if (!finalCandidates) throw new Error("Calibration reranker output failed validation.");
      const expected = definition.expectedAssetIds;
      const ids = Array.isArray(finalCandidates)
        ? finalCandidates.map((item) => item.mediaAssetId)
        : [];
      const assetMatch = expected.length
        ? expected.includes(ids[0]) && ids.every((id) => expected.includes(id))
        : ids.length === 0;
      const timestampMatch = !definition.expectedTimestampRangesMs || finalCandidates.every((item) =>
        definition.expectedTimestampRangesMs.some((range) => range.assetId === item.mediaAssetId &&
          Number.isSafeInteger(item.matchedFrameTimestampMs) &&
          item.matchedFrameTimestampMs >= range.startMs && item.matchedFrameTimestampMs < range.endMs));
      report.cases.push({
        id: definition.id,
        tags: definition.tags,
        passed: assetMatch && timestampMatch,
        expectedAssetIds: expected,
        resultAssetIds: ids,
        ...(definition.expectedTimestampRangesMs ? {
          expectedTimestampRangesMs: definition.expectedTimestampRangesMs,
          resultFrames: finalCandidates.map((item) => ({ assetId: item.mediaAssetId,
            timestampMs: item.matchedFrameTimestampMs })),
        } : {}),
        latencyMs: Date.now() - caseStarted,
        cosineScores: candidates.map((item) => ({
          assetId: item.mediaAssetId,
          ...(item.kind === "video" ? { timestampMs: item.matchedFrameTimestampMs } : {}),
          score: item.score,
        })),
      });
    }
    report.passed =
      report.cases.length === dataset.cases.length &&
      report.cases.every((item) => item.passed);
  } catch (error) {
    // No retry and no raw provider payload, query, URL, vector, or secret in the report.
    report.failure =
      typeof error?.code === "string" &&
      /^retrieval_[a-z_]{1,80}$/.test(error.code)
        ? error.code
        : "calibration_stopped";
    report.diagnostic = projectMediaRetrievalDiagnostic(error?.diagnostic);
  }
  report.latencyMs = Date.now() - started;
  return report;
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  try {
    const { values } = parseArgs({
      options: {
        "allow-paid": { type: "boolean", default: false },
        "max-calls": { type: "string" },
        "budget-fen": { type: "string" },
        "reserve-fen": { type: "string", default: "1" },
        "image-directory": { type: "string" },
        "video-directory": { type: "string" },
      },
    });
    const { config } = await import("../src/config.js");
    const usage = [];
    const provider = createMediaRetrievalProvider({
      config,
      recordDiagnostic: async () => {},
      recordUsage: (entry) => usage.push(entry),
    });
    const report = await runMediaRetrievalCalibration({
      provider,
      allowPaid: values["allow-paid"],
      maxCalls: values["max-calls"],
      budgetFen: values["budget-fen"],
      reserveFen: values["reserve-fen"],
      dataset: values["video-directory"] ? videoSuite : suite,
      resolveAssetSegments: values["video-directory"] ? async (asset) => {
        if (!/^public-[a-z-]{1,60}$/.test(asset.id) || asset.kind !== "video")
          throw new Error("Invalid public video ID.");
        return prepareCalibrationVideoAsset({ bytes: await readFile(
          path.join(values["video-directory"], `${asset.id}.mp4`)) });
      } : null,
      resolveAssetImage: values["image-directory"]
        ? async (asset) => {
            if (!/^public-[a-z-]{1,60}$/.test(asset.id))
              throw new Error("Invalid public asset ID.");
            const bytes = await readFile(
              path.join(values["image-directory"], `${asset.id}.jpg`),
            );
            if (
              bytes.length > 2 * 1024 * 1024 ||
              bytes[0] !== 0xff ||
              bytes[1] !== 0xd8
            ) {
              throw new Error("Calibration requires bounded JPEG files.");
            }
            return {
              imageUrl: `data:image/jpeg;base64,${bytes.toString("base64")}`,
              sha256: crypto.createHash("sha256").update(bytes).digest("hex"),
            };
          }
        : null,
    });
    report.providerConfiguration = provider.getIndexingProvenance();
    report.usage = usage;
    console.log(JSON.stringify(report));
    process.exitCode = report.passed ? 0 : 2;
  } catch {
    console.error(
      "Calibration requires explicit approval, valid limits, and configured test credentials.",
    );
    process.exitCode = 1;
  }
}
