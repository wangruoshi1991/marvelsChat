// Public contract shared by the API and the isolated Web pilot. It contains
// only user-safe fields: never Provider configuration, descriptor internals,
// object keys, or raw errors.
export const MEDIA_RETRIEVAL_LIFECYCLE_STATUSES = Object.freeze([
  "accepted",
  "queued",
  "running",
  "awaiting_user",
  "purging",
  "succeeded",
  "failed",
  "cancelled",
  "blocked",
  "idle",
]);

export const MEDIA_RETRIEVAL_ERROR_CONTRACTS = Object.freeze({
  retrieval_not_enabled: { status: 503, message: "Media retrieval is not enabled.", retryable: false },
  retrieval_consent_required: { status: 409, message: "Media retrieval consent is required.", retryable: false },
  retrieval_budget_exhausted: { status: 503, message: "Media retrieval budget is unavailable.", retryable: true },
  retrieval_service_unavailable: { status: 503, message: "Media retrieval is temporarily unavailable.", retryable: true },
  retrieval_request_invalid: { status: 400, message: "The media retrieval request is invalid.", retryable: false },
  asset_not_indexable: { status: 409, message: "The selected media is not available for retrieval.", retryable: false },
  run_not_found: { status: 404, message: "Agent run not found.", retryable: false },
  retrieval_policy_unverifiable: { status: 422, message: "The retrieval request could not be safely verified.", retryable: false },
  retrieval_provider_transport_unavailable: { status: 503, message: "Media retrieval is temporarily unavailable.", retryable: true },
  retrieval_purge_incomplete: { status: 503, message: "Media retrieval deletion is still being verified.", retryable: true },
  retrieval_unknown_charge_no_retry: { status: 409, message: "The previous retrieval task requires review before it can continue.", retryable: false },
  retrieval_temporary_cleanup_pending: { status: 503, message: "Temporary media cleanup is being retried.", retryable: true },
  retrieval_index_enqueue_failed: { status: 503, message: "Media indexing could not be queued.", retryable: true },
  retrieval_repository_write_failed: { status: 503, message: "Media retrieval could not record its state.", retryable: true },
  retrieval_job_lease_lost: { status: 409, message: "The retrieval task is no longer owned by this worker.", retryable: true },
  retrieval_staging_missing: { status: 503, message: "Media retrieval recovery data is unavailable.", retryable: true },
});

export const getMediaRetrievalPublicError = (code) =>
  MEDIA_RETRIEVAL_ERROR_CONTRACTS[code] || MEDIA_RETRIEVAL_ERROR_CONTRACTS.retrieval_service_unavailable;

export const MEDIA_RETRIEVAL_SEARCH_RESPONSE_SCHEMA_ID =
  "https://miaoxun.local/schemas/media-retrieval-search-response.schema.json";
export const MEDIA_RETRIEVAL_PUBLIC_ERROR_SCHEMA_ID =
  "https://miaoxun.local/schemas/media-retrieval-public-error.schema.json";

const safeString = (value, maximum) => String(value ?? "").slice(0, maximum);
const isPlainObject = (value) => Boolean(value && typeof value === "object" && !Array.isArray(value));

const assertExactKeys = (value, keys, label) => {
  if (!isPlainObject(value)) throw new TypeError(`Invalid media retrieval ${label} contract.`);
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  if (actual.length !== expected.length || actual.some((key, index) => key !== expected[index])) {
    throw new TypeError(`Invalid media retrieval ${label} contract.`);
  }
};

const assertString = (value, maximum, label, { nonEmpty = false } = {}) => {
  if (typeof value !== "string" || value.length > maximum || (nonEmpty && !value.length)) {
    throw new TypeError(`Invalid media retrieval ${label} contract.`);
  }
};

const assertSearchResult = (result) => {
  assertExactKeys(
    result,
    ["mediaAssetId", "kind", "matchedFrameTimestampMs", "summary", "matchReasons", "scoreBucket"],
    "search result",
  );
  assertString(result.mediaAssetId, 64, "search result", { nonEmpty: true });
  if (!["image", "video"].includes(result.kind)) throw new TypeError("Invalid media retrieval search result contract.");
  if (result.matchedFrameTimestampMs !== null && (!Number.isInteger(result.matchedFrameTimestampMs) || result.matchedFrameTimestampMs < 0)) {
    throw new TypeError("Invalid media retrieval search result contract.");
  }
  assertString(result.summary, 160, "search result");
  if (!Array.isArray(result.matchReasons) || result.matchReasons.length > 6) {
    throw new TypeError("Invalid media retrieval search result contract.");
  }
  for (const reason of result.matchReasons) assertString(reason, 64, "search result");
  if (!["high", "medium", "low"].includes(result.scoreBucket)) {
    throw new TypeError("Invalid media retrieval search result contract.");
  }
};

export const projectMediaRetrievalSearchResult = (result = {}) => ({
  mediaAssetId: safeString(result.mediaAssetId, 64),
  kind: result.kind === "video" ? "video" : "image",
  matchedFrameTimestampMs: result.matchedFrameTimestampMs !== null && result.matchedFrameTimestampMs !== undefined && Number.isInteger(Number(result.matchedFrameTimestampMs))
    ? Math.max(0, Number(result.matchedFrameTimestampMs))
    : null,
  summary: safeString(result.summary, 160),
  matchReasons: Array.isArray(result.matchReasons)
    ? result.matchReasons.slice(0, 6).map((reason) => safeString(reason, 64))
    : [],
  scoreBucket: ["high", "medium", "low"].includes(result.scoreBucket) ? result.scoreBucket : "low",
});

export const assertMediaRetrievalSearchResponse = (value) => {
  assertExactKeys(value, ["agentRunId", "lifecycleStatus", "method", "results"], "search response");
  assertString(value.agentRunId, 128, "search response", { nonEmpty: true });
  if (!MEDIA_RETRIEVAL_LIFECYCLE_STATUSES.includes(value.lifecycleStatus)) {
    throw new TypeError("Invalid media retrieval search response contract.");
  }
  assertString(value.method, 120, "search response", { nonEmpty: true });
  if (!Array.isArray(value.results) || value.results.length > 20) {
    throw new TypeError("Invalid media retrieval search response contract.");
  }
  for (const result of value.results) assertSearchResult(result);
  return value;
};

export const projectMediaRetrievalSearchResponse = ({
  agentRunId,
  lifecycleStatus,
  method,
  results = [],
} = {}) =>
  assertMediaRetrievalSearchResponse({
    agentRunId: safeString(agentRunId, 128),
    lifecycleStatus,
    method: safeString(method, 120),
    results: Array.isArray(results)
      ? results.slice(0, 20).map((result) => projectMediaRetrievalSearchResult(result))
      : [],
  });

export const assertMediaRetrievalPublicError = (value, { status } = {}) => {
  assertExactKeys(value, ["code", "message", "retryable"], "public error");
  const contract = MEDIA_RETRIEVAL_ERROR_CONTRACTS[value.code];
  if (!contract || value.message !== contract.message || value.retryable !== contract.retryable) {
    throw new TypeError("Invalid media retrieval public error contract.");
  }
  if (status !== undefined && status !== contract.status) {
    throw new TypeError("Invalid media retrieval public error contract.");
  }
  return value;
};
