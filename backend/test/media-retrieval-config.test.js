import assert from "node:assert/strict";
import test from "node:test";

process.env.DEFAULT_ADMIN_PASSWORD ||= "test-only-password";

const {
  createMediaRetrievalConfig,
  getMediaRetrievalConfigStatus,
} = await import("../src/config.js");

test("media retrieval configuration is disabled with zero cost defaults", () => {
  const retrieval = createMediaRetrievalConfig({});

  assert.equal(retrieval.enabled, false);
  assert.equal(retrieval.providerCallsEnabled, false);
  assert.equal(retrieval.userDailyRequestLimit, 0);
  assert.equal(retrieval.userMonthlyBudgetFen, 0);
  assert.equal(retrieval.globalDailyBudgetFen, 0);
  assert.equal(retrieval.captionModel, "qwen3.6-flash");
  assert.equal(retrieval.captionModelVersion, "qwen3.6-flash");
  assert.equal(retrieval.embeddingModel, "qwen3-vl-embedding");
  assert.equal(retrieval.embeddingModelVersion, "qwen3-vl-embedding");
  assert.equal(retrieval.embeddingDimension, 1024);
  assert.equal(retrieval.embeddingNormalization, "provider-native-dense-v1");
  assert.equal(retrieval.maxVideoFrames, 6);
  assert.equal(retrieval.workerPollMs, 5000);
});

test("media retrieval configuration rejects values outside the approved operating range", () => {
  assert.throws(() => createMediaRetrievalConfig({
    MEDIA_RETRIEVAL_EMBEDDING_DIMENSION: "768",
  }), /MEDIA_RETRIEVAL_EMBEDDING_DIMENSION must equal 1024/);
  assert.throws(() => createMediaRetrievalConfig({
    MEDIA_RETRIEVAL_MAX_VIDEO_FRAMES: "7",
  }), /MEDIA_RETRIEVAL_MAX_VIDEO_FRAMES must be between 1 and 6/);
  assert.throws(() => createMediaRetrievalConfig({
    MEDIA_RETRIEVAL_USER_DAILY_REQUEST_LIMIT: "1001",
  }), /MEDIA_RETRIEVAL_USER_DAILY_REQUEST_LIMIT must be between 0 and 1000/);
  assert.throws(() => createMediaRetrievalConfig({
    MEDIA_RETRIEVAL_GLOBAL_DAILY_BUDGET_FEN: "10000001",
  }), /MEDIA_RETRIEVAL_GLOBAL_DAILY_BUDGET_FEN must be between 0 and 10000000/);
  assert.throws(() => createMediaRetrievalConfig({
    MEDIA_RETRIEVAL_DASHSCOPE_API_BASE_URL: "http://localhost:8000",
  }), /MEDIA_RETRIEVAL_DASHSCOPE_API_BASE_URL must be an HTTPS .*\/api\/v1 URL/);
});

test("media retrieval deployment rails permit administrator-configured operating limits above the old fixed trial values", () => {
  const retrieval = createMediaRetrievalConfig({
    MEDIA_RETRIEVAL_USER_DAILY_REQUEST_LIMIT: "9",
    MEDIA_RETRIEVAL_USER_MONTHLY_BUDGET_FEN: "9000",
    MEDIA_RETRIEVAL_GLOBAL_DAILY_BUDGET_FEN: "5000",
    MEDIA_RETRIEVAL_CAPTION_RESERVE_FEN: "40",
    MEDIA_RETRIEVAL_EMBEDDING_RESERVE_FEN: "20",
  });

  assert.equal(retrieval.userDailyRequestLimit, 9);
  assert.equal(retrieval.userMonthlyBudgetFen, 9000);
  assert.equal(retrieval.globalDailyBudgetFen, 5000);
  assert.equal(retrieval.captionReserveFen, 40);
  assert.equal(retrieval.embeddingReserveFen, 20);
});

test("media retrieval safe runtime status never returns credentials or the API base URL", () => {
  const retrieval = createMediaRetrievalConfig({
    MEDIA_RETRIEVAL_ENABLED: "true",
    MEDIA_RETRIEVAL_PROVIDER_CALLS_ENABLED: "true",
    MEDIA_RETRIEVAL_DASHSCOPE_API_KEY: "private-test-key",
    MEDIA_RETRIEVAL_DASHSCOPE_API_BASE_URL: "https://dashscope.aliyuncs.com/api/v1",
    MEDIA_RETRIEVAL_USER_DAILY_REQUEST_LIMIT: "3",
    MEDIA_RETRIEVAL_GLOBAL_DAILY_BUDGET_FEN: "1000",
  });
  const status = getMediaRetrievalConfigStatus({ mediaRetrieval: retrieval });
  const serialized = JSON.stringify(status);

  assert.equal(status.configured, true);
  assert.equal(status.enabled, true);
  assert.equal(status.providerCallsEnabled, true);
  assert.equal(serialized.includes("private-test-key"), false);
  assert.equal(serialized.includes("dashscope.aliyuncs.com"), false);
  assert.equal(Object.hasOwn(status, "apiKey"), false);
  assert.equal(Object.hasOwn(status, "apiBaseUrl"), false);
  assert.equal(status.embeddingNormalization, "provider-native-dense-v1");
});
