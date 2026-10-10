export const MEDIA_RETRIEVAL_CONSENT_VERSION = "media-retrieval-consent-v1";
export const MEDIA_RETRIEVAL_MINIMUM_APP_BUILD = 45;

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
  maxDescriptorItemLength: 160,
  maxDescriptorArrayItems: 12,
  providerResponseMaxBytes: 512 * 1024,
  rerankImageLongestEdge: 1024,
  rerankImageMaxBytes: 512 * 1024,
  rerankBatchSize: 1,
  runEventRetentionDays: 180,
  aggregateCostRetentionDays: 730,
  signedUrlMaxTtlSeconds: 600,
});

export const MEDIA_RETRIEVAL_RUNTIME_LIMITS = Object.freeze({
  maxUserDailyRequestLimit: Number.MAX_SAFE_INTEGER,
  maxUserMonthlyBudgetFen: Number.MAX_SAFE_INTEGER,
  maxGlobalDailyBudgetFen: Number.MAX_SAFE_INTEGER,
  maxProviderCallReservationFen: Number.MAX_SAFE_INTEGER,
  minWorkerPollMs: 1000,
  maxWorkerPollMs: 60_000,
});
