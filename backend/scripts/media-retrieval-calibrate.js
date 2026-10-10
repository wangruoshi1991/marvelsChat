import crypto from "node:crypto";
import { constants as fsConstants } from "node:fs";
import { parseArgs } from "node:util";
import { pathToFileURL } from "node:url";
import { open, readFile, rename, unlink } from "node:fs/promises";
import path from "node:path";
import suite from "../../agents/media-retrieval/calibration-suite.json" with { type: "json" };
import videoSuite from "../../agents/media-retrieval/calibration-video-suite.json" with { type: "json" };
import { createMediaRetrievalProvider } from "../src/media-retrieval-provider.js";
import { projectMediaRetrievalDiagnostic } from "../src/media-retrieval-errors.js";
import { extractRepresentativeFrames, normalizeImageForProvider, normalizeImageForReranking } from "../src/media-retrieval-media.js";
import { rerankMediaRetrievalVisualCandidates } from "../src/media-retrieval-reranker.js";
import {
  buildVisualEmbeddingInput,
  MEDIA_RETRIEVAL_EMBEDDING_POLICY_VERSION,
  createVisualEmbeddingBinding,
  toProviderVisualEmbeddingInput,
} from "../src/media-retrieval-embedding-input.js";
import { retrieveB7ProductBaseline } from "../src/media-retrieval-b7-service.js";
import { QUERY_PROMPT_VERSION, RERANK_PROMPT_VERSION, RERANK_TEMPERATURE } from "../src/media-retrieval-prompts.js";
import { MEDIA_RETRIEVAL_PARSER_RESPONSE_SCHEMA_VERSION } from "../src/media-retrieval-parser-response.js";
import { MEDIA_RETRIEVAL_LIMITS } from "../src/media-retrieval-constants.js";

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

const CALIBRATION_THRESHOLD_KEYS = [
  "overallMinimum",
  "positiveTop1Minimum",
  "negativeEmptyMinimum",
  "compositionNegativeMinimum",
];

function validateCalibrationDataset(dataset) {
  if (
    !dataset || typeof dataset.version !== "string" ||
    !dataset.version || !Array.isArray(dataset.assets) || dataset.assets.length === 0 ||
    dataset.assets.length > 50 || !Array.isArray(dataset.cases) || dataset.cases.length > 200
  ) {
    throw new Error("Invalid calibration dataset.");
  }
  if (dataset.acceptanceThresholds) {
    if (Object.keys(dataset.acceptanceThresholds).length !== CALIBRATION_THRESHOLD_KEYS.length) {
      throw new Error("Invalid calibration acceptance threshold.");
    }
    for (const key of CALIBRATION_THRESHOLD_KEYS) {
      const value = dataset.acceptanceThresholds[key];
      if (typeof value !== "number" || value < 0 || value > 1) {
        throw new Error("Invalid calibration acceptance threshold.");
      }
    }
  }
  const assetIds = new Set();
  for (const asset of dataset.assets) {
    if (!asset || typeof asset.id !== "string" ||
      !/^[A-Za-z0-9][A-Za-z0-9._-]{0,79}$/.test(asset.id) || assetIds.has(asset.id)) {
      throw new Error("Invalid or duplicate calibration asset.");
    }
    assetIds.add(asset.id);
    if (asset.kind === "video") continue;
    if (asset.kind && asset.kind !== "image") {
      throw new Error("Invalid calibration asset kind.");
    }
    let imageUrl;
    try {
      imageUrl = new URL(asset.imageUrl);
    } catch {
      throw new Error("Invalid calibration image URL.");
    }
    if (imageUrl.protocol !== "https:" || imageUrl.username || imageUrl.password) {
      throw new Error("Calibration image URLs must use HTTPS without credentials.");
    }
    if (asset.sha256 && !/^[a-f0-9]{64}$/.test(asset.sha256)) {
      throw new Error("Invalid calibration asset SHA-256.");
    }
  }
  const caseIds = new Set();
  for (const item of dataset.cases) {
    if (!item || typeof item.id !== "string" || !item.id || caseIds.has(item.id) ||
      typeof item.query !== "string" || !item.query.trim() || item.query.length > 1000 ||
      !Array.isArray(item.expectedAssetIds) || !Array.isArray(item.tags) ||
      item.tags.some((tag) => typeof tag !== "string" || !tag) ||
      item.expectedAssetIds.some((id) => !assetIds.has(id))) {
      throw new Error("Invalid calibration case.");
    }
    caseIds.add(item.id);
  }
}

const MAX_CALIBRATION_IMAGE_BYTES = 2 * 1024 * 1024;
const MAX_CALIBRATION_VIDEO_BYTES = 50 * 1024 * 1024;

async function readBoundedRegularFile(filePath, maximumBytes) {
  const handle = await open(filePath, fsConstants.O_RDONLY | fsConstants.O_NOFOLLOW);
  try {
    const metadata = await handle.stat();
    if (!metadata.isFile() || metadata.size > maximumBytes) {
      throw new Error("Calibration fixture is not a bounded regular file.");
    }
    return await handle.readFile();
  } finally {
    await handle.close();
  }
}

function validateCalibrationImageBytes(bytes) {
  if (bytes.length > MAX_CALIBRATION_IMAGE_BYTES || bytes[0] !== 0xff || bytes[1] !== 0xd8) {
    throw new Error("Calibration requires bounded JPEG images.");
  }
  return crypto.createHash("sha256").update(bytes).digest("hex");
}

export function gradeMediaRetrievalCalibrationCases(cases, thresholds) {
  const accuracy = (predicate) => {
    const selected = cases.filter(predicate);
    return {
      passed: selected.filter((item) => item.passed).length,
      total: selected.length,
    };
  };
  const metrics = {
    overall: accuracy(() => true),
    positiveTop1: accuracy((item) => item.tags.includes("positive")),
    negativeEmpty: accuracy((item) => item.tags.includes("negative")),
    compositionNegative: accuracy((item) => item.tags.includes("composition")),
  };
  const meets = (metric, minimum) => metric.total > 0 && metric.passed / metric.total >= minimum;
  return {
    passed: meets(metrics.overall, thresholds.overallMinimum)
      && meets(metrics.positiveTop1, thresholds.positiveTop1Minimum)
      && meets(metrics.negativeEmpty, thresholds.negativeEmptyMinimum)
      && meets(metrics.compositionNegative, thresholds.compositionNegativeMinimum),
    metrics,
    thresholds,
  };
}

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
  onProgress = null,
}) {
  if (!allowPaid)
    throw new Error("Calibration requires explicit paid-call approval.");
  validateCalibrationDataset(dataset);
  const limit = positiveInteger(maxCalls, Number.MAX_SAFE_INTEGER);
  const budget = positiveInteger(budgetFen, Number.MAX_SAFE_INTEGER);
  const reservationAmount = positiveInteger(reserveFen, budget);
  const report = {
    retrievalConfiguration: {
      queryParsingProvenance: provider.getQueryParsingProvenance?.() || null,
      queryPromptVersion: QUERY_PROMPT_VERSION,
      rerankPromptVersion: RERANK_PROMPT_VERSION,
      rerankTemperature: RERANK_TEMPERATURE,
      rerankBatchSize: MEDIA_RETRIEVAL_LIMITS.rerankBatchSize,
      queryPolicyVersion: MEDIA_RETRIEVAL_EMBEDDING_POLICY_VERSION,
      parserSchemaVersion: MEDIA_RETRIEVAL_PARSER_RESPONSE_SCHEMA_VERSION,
      candidateLimit: 20,
    },
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
      : "explicit-jpeg-data-url",
    calls: [],
    assets: [],
    cases: [],
    failure: null,
    passed: false,
  };
  const checkpoint = async () => {
    if (onProgress) await onProgress(report);
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
    await checkpoint();
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
      if (entry.status !== "succeeded") entry.status = "failed-billing-unknown";
      throw error;
    } finally {
      entry.latencyMs = Date.now() - callStarted;
      await checkpoint();
    }
  };
  const started = Date.now();
  try {
    const segments = [];
    const preparedAssets = [];
    for (const asset of dataset.assets) {
      const resolved = resolveAssetSegments ? await resolveAssetSegments(asset) : resolveAssetImage
        ? await resolveAssetImage(asset)
        : { imageUrl: asset.imageUrl, sha256: null };
      const frames = calibrationSegments(asset, resolved);
      if (asset.sha256 && resolved.sha256 !== asset.sha256) {
        throw new Error("Calibration asset SHA-256 does not match the dataset.");
      }
      preparedAssets.push({ asset, resolved, frames });
    }
    await checkpoint();
    for (const { asset, resolved, frames } of preparedAssets) {
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
        if (!/^data:image\/(?:jpeg|png|webp);base64,[A-Za-z0-9+/]+={0,2}$/u.test(frame.imageUrl)) {
          throw new Error("Calibration reranking requires explicit local image bytes.");
        }
        const normalized = await normalizeImageForReranking({
          bytes: Buffer.from(frame.imageUrl.split(",", 2)[1], "base64"),
        });
        segments.push({ ...asset, descriptor, vector, matchedFrameTimestampMs: frame.timestampMs,
          rerankImageUrl: "data:image/webp;base64," + normalized.bytes.toString("base64"),
          rerankImageSha256: crypto.createHash("sha256").update(normalized.bytes).digest("hex"),
        });
      }
    }
    for (const definition of dataset.cases) {
      const caseStarted = Date.now();
      try {
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
        if (input.mode !== "semantic" || input.identityTerms.length) {
          report.cases.push({
            id: definition.id,
            tags: definition.tags,
            passed: false,
            expectedAssetIds: definition.expectedAssetIds,
            resultAssetIds: [],
            failure: input.identityTerms.length ? "unexpected-identity-classification" : input.reasonCode || "visual-input-unverifiable",
            latencyMs: Date.now() - caseStarted,
          });
          await checkpoint();
          continue;
        }
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
        const visuals = baseline.semanticCandidates.map(candidate => {
          const source = segments.find(asset => asset.id === candidate.mediaAssetId &&
            asset.matchedFrameTimestampMs === candidate.matchedFrameTimestampMs);
          return { ...candidate, imageUrl: source.rerankImageUrl, imageSha256: source.rerankImageSha256 };
        });
        const finalCandidates = await rerankMediaRetrievalVisualCandidates({
          candidates: visuals, visualConstraints: input.visualConstraints,
          invoke: candidates => call("query-rerank", definition.id, reservation =>
            provider.rerankMediaCandidates({
              query: input.semanticText, visualConstraints: input.visualConstraints, candidates, reservation,
            })),
        });
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
        await checkpoint();
      } catch (error) {
        const diagnostic = projectMediaRetrievalDiagnostic(error?.diagnostic);
        // Completed query validation failures count against quality. Continue
        // independent cases, never retry this dispatch or treat it as a match.
        // Transport failures and incomplete asset indexing still stop the run.
        if (error?.code !== "retrieval_policy_unverifiable" || diagnostic?.httpStatus !== 200 ||
          !["query-validation", "rerank-validation"].includes(diagnostic?.stage)) throw error;
        report.cases.push({ id: definition.id, tags: definition.tags, passed: false,
          expectedAssetIds: definition.expectedAssetIds, resultAssetIds: [],
          failure: error.code, diagnostic, latencyMs: Date.now() - caseStarted });
        await checkpoint();
      }
    }
    const complete = report.cases.length === dataset.cases.length;
    if (dataset.acceptanceThresholds) {
      report.quality = gradeMediaRetrievalCalibrationCases(
        report.cases,
        dataset.acceptanceThresholds,
      );
      report.passed = complete && report.quality.passed;
    } else {
      report.passed = complete && report.cases.every((item) => item.passed);
    }
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
  await checkpoint();
  return report;
}

async function writeCalibrationReport(reportPath, report) {
  const temporaryPath = `${reportPath}.${process.pid}.${crypto.randomUUID()}.tmp`;
  try {
    const handle = await open(temporaryPath, "wx", 0o600);
    try {
      await handle.writeFile(`${JSON.stringify(report)}\n`, "utf8");
      await handle.sync();
    } finally {
      await handle.close();
    }
    await rename(temporaryPath, reportPath);
  } catch (error) {
    await unlink(temporaryPath).catch(() => {});
    throw error;
  }
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
        dataset: { type: "string" },
        report: { type: "string" },
      },
    });
    if (!values["allow-paid"]) {
      throw new Error("Calibration requires explicit paid-call approval.");
    }
    if (values["allow-paid"] && !values.report) {
      throw new Error("Paid calibration requires a durable --report path.");
    }
    const reportPath = values.report ? path.resolve(values.report) : null;
    const { config } = await import("../src/config.js");
    const usage = [];
    const provider = createMediaRetrievalProvider({
      config,
      recordDiagnostic: async () => {},
      recordUsage: (entry) => usage.push(entry),
    });
    const dataset = values.dataset
      ? JSON.parse(await readFile(path.resolve(values.dataset), "utf8"))
      : values["video-directory"] ? videoSuite : suite;
    validateCalibrationDataset(dataset);
    if (dataset.cases.length === 0) {
      throw new Error("Calibration dataset must contain at least one query case.");
    }
    if (dataset.assets.some((asset) => asset.kind !== "video") && !values["image-directory"]) {
      throw new Error("Image calibration requires a local fixture directory for SHA-256 validation.");
    }
    if (values["video-directory"] && dataset.assets.some((asset) => asset.kind !== "video")) {
      throw new Error("Video calibration datasets may contain only video assets.");
    }
    if (dataset.assets.some((asset) => asset.kind === "video") && !values["video-directory"]) {
      throw new Error("Video calibration requires a local fixture directory.");
    }
    if (values["image-directory"] && dataset.assets.some((asset) => asset.kind === "video")) {
      throw new Error("Image calibration datasets may contain only image assets.");
    }
    if (reportPath) {
      const reservation = await open(reportPath, "wx", 0o600);
      await reservation.close();
    }
    const report = await runMediaRetrievalCalibration({
      provider,
      allowPaid: values["allow-paid"],
      maxCalls: values["max-calls"],
      budgetFen: values["budget-fen"],
      reserveFen: values["reserve-fen"],
      dataset,
      resolveAssetSegments: values["video-directory"] ? async (asset) => {
        if (!/^public-[a-z-]{1,60}$/.test(asset.id) || asset.kind !== "video")
          throw new Error("Invalid public video ID.");
        return prepareCalibrationVideoAsset({ bytes: await readBoundedRegularFile(
          path.join(values["video-directory"], `${asset.id}.mp4`), MAX_CALIBRATION_VIDEO_BYTES) });
      } : null,
      resolveAssetImage: values["image-directory"]
        ? async (asset) => {
            if (!/^public-[a-z-]{1,60}$/.test(asset.id))
              throw new Error("Invalid public asset ID.");
            const bytes = await readBoundedRegularFile(
              path.join(values["image-directory"], `${asset.id}.jpg`),
              MAX_CALIBRATION_IMAGE_BYTES,
            );
            const sha256 = validateCalibrationImageBytes(bytes);
            if (asset.sha256 && asset.sha256 !== sha256) {
              throw new Error("Calibration image SHA-256 does not match the dataset.");
            }
            return {
              imageUrl: `data:image/jpeg;base64,${bytes.toString("base64")}`,
              sha256,
            };
          }
        : null,
      onProgress: reportPath ? (progress) => writeCalibrationReport(reportPath, {
        ...progress,
        providerConfiguration: provider.getIndexingProvenance(),
        usage,
      }) : null,
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
