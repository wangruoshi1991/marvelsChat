export const MEDIA_RETRIEVAL_CONSENT_VERSION = "media-retrieval-consent-v1";

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
]);

export const MEDIA_RETRIEVAL_JOB_TYPES = Object.freeze([
  "index",
  "purge-asset",
  "purge-user",
]);

export const MEDIA_RETRIEVAL_SEGMENT_STATES = Object.freeze([
  "ready",
  "superseded",
  "purged",
]);

export const MEDIA_RETRIEVAL_SAFE_ERROR_CODES = Object.freeze([
  "retrieval_not_enabled",
  "retrieval_consent_required",
  "retrieval_budget_exhausted",
  "retrieval_service_unavailable",
  "asset_not_indexable",
  "run_not_found",
  "retrieval_policy_unverifiable",
  "retrieval_request_invalid",
  "retrieval_provider_transport_unavailable",
  "retrieval_purge_incomplete",
  "retrieval_unknown_charge_no_retry",
  "retrieval_index_enqueue_failed",
]);

export const MEDIA_RETRIEVAL_PROVIDER_PATHS = Object.freeze({
  multimodalGeneration: "/services/aigc/multimodal-generation/generation",
  multimodalEmbedding: "/services/embeddings/multimodal-embedding/multimodal-embedding",
});

export const MEDIA_RETRIEVAL_LIMITS = Object.freeze({
  embeddingDimension: 1024,
  maxVideoFrames: 6,
  sourceImageMaxBytes: 25 * 1024 * 1024,
  sourceVideoMaxBytes: 250 * 1024 * 1024,
  decodedImageMaxPixels: 40_000_000,
  normalizedImageLongestEdge: 3072,
  normalizedImageMaxBytes: 8 * 1024 * 1024,
  videoMaxDurationSeconds: 600,
  mediaToolTimeoutMs: 60_000,
  maxDescriptorSummaryLength: 160,
  maxDescriptorArrayItems: 12,
  runEventRetentionDays: 180,
  aggregateCostRetentionDays: 730,
  signedUrlMaxTtlSeconds: 600,
});

export const MEDIA_RETRIEVAL_RUNTIME_LIMITS = Object.freeze({
  maxUserDailyRequestLimit: 1000,
  maxUserMonthlyBudgetFen: 1_000_000,
  maxGlobalDailyBudgetFen: 10_000_000,
  maxProviderCallReservationFen: 1_000_000,
  minWorkerPollMs: 1000,
  maxWorkerPollMs: 60_000,
});
