import crypto from "crypto";
import {
  MEDIA_RETRIEVAL_LIFECYCLE_STATUSES,
} from "./media-retrieval-constants.js";
import { parseJson, toIso } from "./repository-mappers.js";

export const MEDIA_RETRIEVAL_AGENT_KEY = "media-retrieval";
export const TERMINAL_LIFECYCLE_STATUSES = new Set(["succeeded", "failed", "cancelled", "blocked"]);
export const CLIENT_EVENT_VISIBILITY = "client";

export const defaultIdFactory = () => crypto.randomUUID();
export const defaultTraceIdFactory = () => crypto.randomBytes(16).toString("hex");

export const toInteger = (value, fallback = 0) => {
  const parsed = Number(value);
  return Number.isInteger(parsed) ? parsed : fallback;
};

export const toNonNegativeInteger = (value, fallback = 0) => Math.max(0, toInteger(value, fallback));

export const mapRun = (row = {}) => ({
  id: row.id,
  agentId: row.agent_id,
  runType: row.run_type || "chat",
  status: row.status,
  lifecycleStatus: row.lifecycle_status || (row.status === "error" ? "failed" : "succeeded"),
  traceId: row.trace_id || null,
  attempt: toInteger(row.attempt, 1),
  failureCode: row.failure_code || null,
  createdAt: toIso(row.created_at),
  finishedAt: toIso(row.finished_at),
});

export const mapEvent = (row = {}) => ({
  id: row.id,
  sequence: toInteger(row.sequence),
  lifecycleStatus: row.lifecycle_status,
  eventType: row.event_type,
  visibility: row.visibility,
  payload: parseJson(row.payload, {}),
  createdAt: toIso(row.created_at),
});

export const mapProfile = (row = {}) => ({
  userId: row.user_id,
  consentVersion: row.consent_version || null,
  consentGrantedAt: toIso(row.consent_granted_at),
  indexState: row.index_state || "disabled",
  indexEpoch: toNonNegativeInteger(row.index_epoch, 1),
  indexedAt: toIso(row.indexed_at),
  disabledAt: toIso(row.disabled_at),
  purgeRequestedAt: toIso(row.purge_requested_at),
  updatedAt: toIso(row.updated_at),
});

export const mapJob = (row = {}) => ({
  id: row.id,
  userId: row.user_id,
  agentRunId: row.agent_run_id || null,
  mediaAssetId: row.media_asset_id || null,
  jobType: row.job_type,
  status: row.status,
  source: row.source,
  contentFingerprint: row.content_fingerprint || null,
  processingVersion: row.processing_version,
  profileEpoch: toNonNegativeInteger(row.profile_epoch, 1),
  attempt: toInteger(row.attempt, 1),
  progress: toNonNegativeInteger(row.progress),
  checkpoint: parseJson(row.checkpoint, {}),
  availableAt: toIso(row.available_at),
  claimedAt: toIso(row.claimed_at),
  claimedBy: row.claimed_by || null,
  leaseExpiresAt: toIso(row.lease_expires_at),
  heartbeatAt: toIso(row.heartbeat_at),
  finishedAt: toIso(row.finished_at),
  failureCode: row.failure_code || null,
  createdAt: toIso(row.created_at),
  updatedAt: toIso(row.updated_at),
});

export const mapSegment = (row = {}) => {
  const descriptor = parseJson(row.descriptor, {});
  const tags = parseJson(row.tags, []);
  const metadata = parseJson(row.metadata, {});
  const matchReasons = parseJson(row.match_reasons, []);
  return {
    mediaAssetId: row.media_asset_id,
    kind: row.kind,
    matchedFrameTimestampMs:
      row.frame_timestamp_ms === null || row.frame_timestamp_ms === undefined
        ? null
        : toNonNegativeInteger(row.frame_timestamp_ms),
    summary: String(descriptor.summary || "").slice(0, 160),
    matchReasons: Array.isArray(matchReasons)
      ? matchReasons.slice(0, 4).map((value) => String(value).slice(0, 64))
      : [],
    score: row.score !== null && row.score !== undefined && Number.isFinite(Number(row.score)) ? Number(row.score) : null,
    // Internal-only B7 fields. The user service projects a safe public shape.
    caption: String(row.caption || "").slice(0, 240),
    tags: Array.isArray(tags) ? tags.slice(0, 24).map((value) => String(value).slice(0, 80)) : [],
    descriptor: descriptor && typeof descriptor === "object" ? descriptor : {},
    metadata: metadata && typeof metadata === "object" && !Array.isArray(metadata) ? metadata : {},
  };
};

export const isSafeLifecycleStatus = (value) => MEDIA_RETRIEVAL_LIFECYCLE_STATUSES.includes(value);

export const fingerprintAsset = (asset) =>
  crypto
    .createHash("sha256")
    .update(
      JSON.stringify({
        id: asset.id,
        storageKey: asset.storage_key || "",
        byteSize: toNonNegativeInteger(asset.byte_size),
        updatedAt: toIso(asset.updated_at),
      }),
    )
    .digest("hex");

export const redactInputSummary = (input = {}) => {
  const summary = {};
  for (const key of ["assetCount", "requestedAssetCount", "scope", "kind", "source", "operation"]) {
    const value = input[key];
    if (typeof value === "number" && Number.isFinite(value)) {
      summary[key] = Math.max(0, Math.trunc(value));
    } else if (typeof value === "string" && /^[a-z0-9._-]{1,40}$/i.test(value)) {
      summary[key] = value;
    }
  }
  return summary;
};

export const safeEventPayload = (payload = {}) => {
  const safe = {};
  for (const key of [
    "indexedAssets",
    "skippedAssets",
    "totalAssets",
    "progress",
    "succeededCount",
    "failedCount",
    "blockedCount",
    "cancelledCount",
    "totalJobs",
    "estimatedFen",
    "unknownFen",
    "reasonCode",
    "jobType",
  ]) {
    const value = payload[key];
    if (typeof value === "number" && Number.isFinite(value)) {
      safe[key] = Math.max(0, Math.trunc(value));
    } else if (typeof value === "string" && /^[a-z0-9._-]{1,100}$/i.test(value)) {
      safe[key] = value;
    }
  }
  return safe;
};

export const vectorLiteral = (vector) => {
  if (!Array.isArray(vector) || vector.length !== 1024 || vector.some((value) => !Number.isFinite(value))) {
    return null;
  }
  return `[${vector.join(",")}]`;
};

export const statusForLifecycle = (lifecycleStatus) => {
  if (lifecycleStatus === "succeeded") return "success";
  if (TERMINAL_LIFECYCLE_STATUSES.has(lifecycleStatus)) return "error";
  return "pending";
};
