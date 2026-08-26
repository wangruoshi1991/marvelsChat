import assert from "node:assert/strict";
import test from "node:test";

process.env.DEFAULT_ADMIN_PASSWORD ||= "test-only-password";

const { processMediaRetrievalJob } = await import("../src/media-retrieval-service.js");
const { runMediaRetrievalWorker } = await import("../src/media-retrieval-worker.js");
const {
  createDescriptorProvenance,
  createEmbeddingProvenance,
} = await import("../src/media-retrieval-provenance.js");

const USER_ID = "11111111-1111-4111-8111-111111111111";
const RUN_ID = "22222222-2222-4222-8222-222222222222";

function vector() {
  return Array.from({ length: 1024 }, () => 0.1);
}

function indexingProvenance() {
  return {
    descriptorProvenance: createDescriptorProvenance({
      modelId: "worker-caption-model",
      modelVersion: "v1",
      configuration: { provider: "worker-contract" },
    }),
    embeddingProvenance: createEmbeddingProvenance({
      modelId: "worker-embedding-model",
      modelVersion: "v1",
      dimension: 1024,
      normalization: "provider-native-dense-v1",
      configuration: { provider: "worker-contract", outputType: "dense" },
    }),
  };
}

test("an image indexing job produces one descriptor and one vector segment", async () => {
  const events = [];
  const persisted = [];
  const providerCalls = [];
  const repository = {
    getMediaRetrievalProfile: async () => ({ indexState: "enabled", consentVersion: "media-retrieval-consent-v1" }),
    getMediaRetrievalDispatchState: async () => ({ canDispatch: true }),
    getIndexableMediaAsset: async () => ({
      id: "33333333-3333-4333-8333-333333333333",
      userId: USER_ID,
      kind: "image",
      status: "uploaded",
      storageKey: "private/asset.jpg",
      mimeType: "image/jpeg",
    }),
    appendAgentRunEvent: async (event) => events.push(event),
    reserveProviderBudget: async () => ({ reserved: true, reservationId: `r-${providerCalls.length}` }),
    settleProviderBudget: async () => null,
    persistMediaRetrievalSegments: async (input) => persisted.push(...input.segments),
    completeMediaRetrievalJob: async () => ({ ok: true }),
    failMediaRetrievalJob: async (input) => {
      throw new Error(`unexpected failure ${input.failureCode}`);
    },
  };
  const media = {
    loadOwnedMediaBytes: async () => ({ bytes: Buffer.from("synthetic"), mimeType: "image/jpeg" }),
    normalizeImageForProvider: async () => ({ bytes: Buffer.from("normalized"), mimeType: "image/webp" }),
    createEphemeralProviderUrl: async () => ({ url: "https://temporary.example/image.webp", cleanup: async () => {} }),
  };
  const provider = {
    getIndexingProvenance: () => indexingProvenance(),
    describeImage: async () => {
      providerCalls.push("describe");
      return { summary: "黄色连衣裙", clothing: [{ type: "dress", color: "yellow" }], scene: [], actions: [], objects: [], ocrText: [], qualitySignals: [] };
    },
    embedImage: async () => {
      providerCalls.push("embed");
      return vector();
    },
  };

  await processMediaRetrievalJob({
    job: {
      id: "44444444-4444-4444-8444-444444444444",
      userId: USER_ID,
      agentRunId: RUN_ID,
      mediaAssetId: "33333333-3333-4333-8333-333333333333",
      jobType: "index",
      contentFingerprint: "a".repeat(64),
      processingVersion: "v1",
    },
    repository,
    provider,
    media,
    workerId: "worker-1",
  });

  assert.deepEqual(providerCalls, ["describe", "embed"]);
  assert.equal(persisted.length, 1);
  assert.equal(persisted[0].embedding.length, 1024);
  assert.deepEqual(events.map((event) => event.eventType), ["reading-asset", "describing", "embedding", "committing"]);
});

test("a disabled index or deleted source blocks before a provider call", async () => {
  let called = false;
  const failure = [];
  const repository = {
    getMediaRetrievalProfile: async () => ({ indexState: "disabled" }),
    appendAgentRunEvent: async () => null,
    failMediaRetrievalJob: async (input) => failure.push(input),
  };
  await processMediaRetrievalJob({
    job: { id: "job", userId: USER_ID, agentRunId: RUN_ID, jobType: "index" },
    repository,
    provider: { describeImage: async () => { called = true; } },
    media: {},
    workerId: "worker-1",
  });
  assert.equal(called, false);
  assert.equal(failure[0].lifecycleStatus, "blocked");
  assert.equal(failure[0].failureCode, "retrieval_not_enabled");
});

test("an operator-disabled job stops before reading private media or creating a temporary provider URL", async () => {
  const failure = [];
  let mediaRead = false;
  let temporaryUrlCreated = false;
  const repository = {
    getMediaRetrievalProfile: async () => ({ indexState: "enabled" }),
    getMediaRetrievalDispatchState: async () => ({ canDispatch: false, reasonCode: "retrieval_not_enabled" }),
    appendAgentRunEvent: async () => null,
    failMediaRetrievalJob: async (input) => failure.push(input),
  };
  await processMediaRetrievalJob({
    job: { id: "job", userId: USER_ID, agentRunId: RUN_ID, jobType: "index" },
    repository,
    provider: {
      getRuntimeStatus: () => ({ configured: true, enabled: true, providerCallsEnabled: true, userDailyRequestLimit: 3, globalDailyBudgetFen: 100 }),
      describeImage: async () => { throw new Error("must not be called"); },
    },
    media: {
      loadOwnedMediaBytes: async () => { mediaRead = true; },
      createEphemeralProviderUrl: async () => { temporaryUrlCreated = true; },
    },
    workerId: "worker-1",
  });
  assert.equal(mediaRead, false);
  assert.equal(temporaryUrlCreated, false);
  assert.equal(failure[0].failureCode, "retrieval_not_enabled");
});

test("the worker prioritizes deletion outbox work before index jobs and stops cleanly", async () => {
  const controller = new AbortController();
  const states = [];
  const lifecycleCalls = [];
  let retentionRuns = 0;
  let indexClaimed = false;
  const repository = {
    heartbeatMediaRetrievalWorker: async ({ state }) => states.push(state),
    runMediaRetrievalRetentionSweep: async () => { retentionRuns += 1; },
    reclaimExpiredMediaRetrievalJobs: async () => lifecycleCalls.push("reclaim"),
    claimMediaRetrievalLifecycleOutbox: async () => {
      lifecycleCalls.push("outbox");
      return { id: "outbox-1" };
    },
    createAssetPurgeRunAndJob: async () => controller.abort(),
    claimNextMediaRetrievalJob: async () => { indexClaimed = true; return null; },
  };

  await runMediaRetrievalWorker({
    repository,
    provider: {},
    media: {},
    signal: controller.signal,
    workerId: "worker-test",
    now: () => 24 * 60 * 60 * 1000,
    pollMs: 1,
  });

  assert.equal(retentionRuns, 1);
  assert.equal(indexClaimed, false);
  assert.deepEqual(states, ["starting", "ready", "stopped"]);
  assert.deepEqual(lifecycleCalls, ["reclaim", "outbox"]);
});

test("the worker claims and retries durable temporary-object cleanup before new indexing work", async () => {
  const controller = new AbortController();
  const calls = [];
  const repository = {
    heartbeatMediaRetrievalWorker: async ({ state }) => calls.push(`heartbeat:${state}`),
    runMediaRetrievalRetentionSweep: async () => null,
    reclaimExpiredMediaRetrievalJobs: async () => null,
    claimMediaRetrievalTemporaryCleanup: async () => ({
      id: "cleanup-task",
      object_key: "users/test/media-retrieval-tmp/object.webp",
    }),
    completeMediaRetrievalTemporaryCleanup: async ({ cleanupTaskId, workerId }) => {
      calls.push(`complete:${cleanupTaskId}:${workerId}`);
      controller.abort();
      return true;
    },
    claimMediaRetrievalLifecycleOutbox: async () => {
      throw new Error("must not reach lifecycle outbox before cleanup");
    },
  };

  await runMediaRetrievalWorker({
    repository,
    provider: {},
    media: {
      deleteEphemeralProviderObject: async ({ objectKey }) => calls.push(`delete:${objectKey}`),
    },
    signal: controller.signal,
    workerId: "worker-cleanup",
    now: () => 24 * 60 * 60 * 1000,
    pollMs: 1,
  });

  assert.deepEqual(calls, [
    "heartbeat:starting",
    "heartbeat:ready",
    "delete:users/test/media-retrieval-tmp/object.webp",
    "complete:cleanup-task:worker-cleanup",
    "heartbeat:stopped",
  ]);
});

test("a purge job only succeeds after physical derived-artifact deletion reports zero residue", async () => {
  const calls = [];
  const repository = {
    appendAgentRunEvent: async (event) => calls.push({ type: "event", event }),
    purgeMediaRetrievalArtifacts: async (input) => {
      calls.push({ type: "purge", input });
      return { deletedSegments: 2, residueCount: 0 };
    },
    completeMediaRetrievalJob: async (input) => calls.push({ type: "complete", input }),
    failMediaRetrievalJob: async (input) => calls.push({ type: "fail", input }),
  };

  const result = await processMediaRetrievalJob({
    job: { id: "purge-job", userId: USER_ID, agentRunId: RUN_ID, jobType: "purge-user" },
    repository,
    provider: {},
    media: {},
    workerId: "worker-1",
  });

  assert.deepEqual(result, { status: "succeeded" });
  assert.equal(calls.filter((call) => call.type === "purge").length, 1);
  assert.equal(calls.filter((call) => call.type === "complete").length, 1);
  assert.equal(calls.filter((call) => call.type === "fail").length, 0);
});

test("a purge job fails closed when the repository cannot prove zero derived-artifact residue", async () => {
  const calls = [];
  const repository = {
    appendAgentRunEvent: async () => null,
    purgeMediaRetrievalArtifacts: async () => ({ deletedSegments: 0, residueCount: 1 }),
    completeMediaRetrievalJob: async () => calls.push("complete"),
    failMediaRetrievalJob: async (input) => calls.push(input),
  };

  const result = await processMediaRetrievalJob({
    job: { id: "purge-job", userId: USER_ID, agentRunId: RUN_ID, jobType: "purge-asset", mediaAssetId: "asset-a" },
    repository,
    provider: {},
    media: {},
    workerId: "worker-1",
  });

  assert.deepEqual(result, { status: "failed", failureCode: "retrieval_purge_incomplete" });
  assert.deepEqual(calls, [{
    jobId: "purge-job",
    workerId: "worker-1",
    lifecycleStatus: "failed",
    failureCode: "retrieval_purge_incomplete",
  }]);
});

test("an invalidated final segment commit cannot resurrect an asset after deletion", async () => {
  const completed = [];
  const failures = [];
  const repository = {
    getMediaRetrievalProfile: async () => ({ indexState: "enabled", consentVersion: "media-retrieval-consent-v1" }),
    getMediaRetrievalDispatchState: async () => ({ canDispatch: true }),
    getIndexableMediaAsset: async () => ({
      id: "asset-a",
      userId: USER_ID,
      kind: "image",
      status: "uploaded",
      storageKey: "private/asset.jpg",
      mimeType: "image/jpeg",
    }),
    appendAgentRunEvent: async () => null,
    reserveProviderBudget: async () => ({ reserved: true, reservationId: "reservation" }),
    settleProviderBudget: async () => null,
    persistMediaRetrievalSegments: async () => ({ status: "invalidated", reasonCode: "asset_not_indexable" }),
    completeMediaRetrievalJob: async (input) => completed.push(input),
    failMediaRetrievalJob: async (input) => failures.push(input),
  };
  const media = {
    loadOwnedMediaBytes: async () => ({ bytes: Buffer.from("synthetic"), mimeType: "image/jpeg" }),
    normalizeImageForProvider: async () => ({ bytes: Buffer.from("normalized"), mimeType: "image/webp" }),
    createEphemeralProviderUrl: async () => ({ url: "https://temporary.example/image.webp", cleanup: async () => {} }),
  };
  const provider = {
    getIndexingProvenance: () => indexingProvenance(),
    getRuntimeStatus: () => ({ configured: true, enabled: true, providerCallsEnabled: true, userDailyRequestLimit: 1, globalDailyBudgetFen: 1 }),
    describeImage: async () => ({ summary: "黄色连衣裙", clothing: [], scene: [], actions: [], objects: [], ocrText: [], qualitySignals: [] }),
    embedImage: async () => vector(),
  };

  const result = await processMediaRetrievalJob({
    job: {
      id: "index-job",
      userId: USER_ID,
      agentRunId: RUN_ID,
      mediaAssetId: "asset-a",
      jobType: "index",
      contentFingerprint: "a".repeat(64),
      processingVersion: "v1",
    },
    repository,
    provider,
    media,
    workerId: "worker-1",
  });

  assert.deepEqual(result, { status: "blocked", failureCode: "asset_not_indexable" });
  assert.equal(completed.length, 0);
  assert.equal(failures.length, 1);
  assert.equal(failures[0].failureCode, "asset_not_indexable");
});

test("video indexing records a per-frame checkpoint after each completed segment", async () => {
  const checkpoints = [];
  const repository = {
    getMediaRetrievalProfile: async () => ({ indexState: "enabled", consentVersion: "media-retrieval-consent-v1" }),
    getMediaRetrievalDispatchState: async () => ({ canDispatch: true }),
    getIndexableMediaAsset: async () => ({
      id: "asset-video",
      userId: USER_ID,
      kind: "video",
      status: "uploaded",
      storageKey: "private/video.mp4",
      mimeType: "video/mp4",
    }),
    appendAgentRunEvent: async () => null,
    reserveProviderBudget: async () => ({ reserved: true, reservationId: "reservation" }),
    settleProviderBudget: async () => null,
    checkpointMediaRetrievalJob: async (input) => checkpoints.push(input),
    persistMediaRetrievalSegments: async () => ({ status: "persisted", persistedCount: 2 }),
    completeMediaRetrievalJob: async () => null,
    failMediaRetrievalJob: async (input) => { throw new Error(`unexpected failure ${input.failureCode}`); },
  };
  const media = {
    loadOwnedMediaBytes: async () => ({ bytes: Buffer.from("video"), mimeType: "video/mp4" }),
    extractRepresentativeFrames: async () => [
      { bytes: Buffer.from("frame-0"), mimeType: "image/jpeg", timestampMs: 0 },
      { bytes: Buffer.from("frame-1"), mimeType: "image/jpeg", timestampMs: 1000 },
    ],
    normalizeImageForProvider: async ({ bytes }) => ({ bytes, mimeType: "image/webp" }),
    createEphemeralProviderUrl: async () => ({ url: "https://temporary.example/image.webp", cleanup: async () => {} }),
  };
  const provider = {
    getIndexingProvenance: () => indexingProvenance(),
    getRuntimeStatus: () => ({ configured: true, enabled: true, providerCallsEnabled: true, userDailyRequestLimit: 1, globalDailyBudgetFen: 1 }),
    describeImage: async () => ({ summary: "场景", clothing: [], scene: [], actions: [], objects: [], ocrText: [], qualitySignals: [] }),
    embedImage: async () => vector(),
  };

  await processMediaRetrievalJob({
    job: {
      id: "video-job",
      userId: USER_ID,
      agentRunId: RUN_ID,
      mediaAssetId: "asset-video",
      jobType: "index",
      contentFingerprint: "b".repeat(64),
      processingVersion: "v1",
    },
    repository,
    provider,
    media,
    workerId: "worker-1",
  });

  assert.deepEqual(
    checkpoints.map((checkpoint) => checkpoint.checkpoint.completedSegmentIndexes),
    [[0], [0, 1]],
  );
});

test("consent revocation after a video frame prevents every later provider call, commit, and temporary-object residue", async () => {
  let revoked = false;
  let describeCalls = 0;
  let embedCalls = 0;
  let persistedCalls = 0;
  let temporaryCreated = 0;
  let temporaryCleaned = 0;
  const failures = [];
  const repository = {
    getMediaRetrievalProfile: async () => ({ indexState: "enabled", consentVersion: "media-retrieval-consent-v1" }),
    getMediaRetrievalDispatchState: async () => ({ canDispatch: true }),
    getIndexableMediaAsset: async () => ({
      id: "asset-video",
      userId: USER_ID,
      kind: "video",
      status: "uploaded",
      storageKey: "private/video.mp4",
      mimeType: "video/mp4",
    }),
    verifyMediaRetrievalJobDispatch: async () => revoked
      ? { allowed: false, reasonCode: "retrieval_not_enabled" }
      : { allowed: true },
    appendAgentRunEvent: async () => null,
    reserveProviderBudget: async () => ({ reserved: true, reservationId: "reservation" }),
    settleProviderBudget: async () => null,
    checkpointMediaRetrievalJob: async () => {
      revoked = true;
      return { id: "video-job" };
    },
    persistMediaRetrievalSegments: async () => { persistedCalls += 1; return { status: "persisted", persistedCount: 2 }; },
    completeMediaRetrievalJob: async () => null,
    failMediaRetrievalJob: async (input) => failures.push(input),
  };
  const media = {
    loadOwnedMediaBytes: async () => ({ bytes: Buffer.from("video"), mimeType: "video/mp4" }),
    extractRepresentativeFrames: async () => [
      { bytes: Buffer.from("frame-0"), mimeType: "image/jpeg", timestampMs: 0 },
      { bytes: Buffer.from("frame-1"), mimeType: "image/jpeg", timestampMs: 1000 },
    ],
    normalizeImageForProvider: async ({ bytes }) => ({ bytes, mimeType: "image/webp" }),
    createEphemeralProviderUrl: async () => {
      temporaryCreated += 1;
      return { url: "https://temporary.example/image.webp", cleanup: async () => { temporaryCleaned += 1; } };
    },
  };
  const provider = {
    getIndexingProvenance: () => indexingProvenance(),
    getRuntimeStatus: () => ({ configured: true, enabled: true, providerCallsEnabled: true }),
    describeImage: async () => {
      describeCalls += 1;
      return { summary: "scene", clothing: [], scene: [], actions: [], objects: [], ocrText: [], qualitySignals: [] };
    },
    embedImage: async () => {
      embedCalls += 1;
      return vector();
    },
  };

  const result = await processMediaRetrievalJob({
    job: {
      id: "video-job",
      userId: USER_ID,
      agentRunId: RUN_ID,
      mediaAssetId: "asset-video",
      jobType: "index",
      contentFingerprint: "c".repeat(64),
      processingVersion: "v1",
      profileEpoch: 1,
    },
    repository,
    provider,
    media,
    workerId: "worker-1",
  });

  assert.deepEqual(result, { status: "blocked", failureCode: "retrieval_not_enabled" });
  assert.equal(describeCalls, 1);
  assert.equal(embedCalls, 1);
  assert.equal(persistedCalls, 0);
  assert.equal(temporaryCreated, 1);
  assert.equal(temporaryCleaned, 1);
  assert.equal(failures[0].failureCode, "retrieval_not_enabled");
});

test("a temporary-object cleanup failure is durably queued and blocks commit until it can be retried", async () => {
  const cleanupTasks = [];
  const failures = [];
  let persisted = false;
  const repository = {
    getMediaRetrievalProfile: async () => ({ indexState: "enabled", consentVersion: "media-retrieval-consent-v1" }),
    getMediaRetrievalDispatchState: async () => ({ canDispatch: true }),
    getIndexableMediaAsset: async () => ({
      id: "asset-cleanup",
      userId: USER_ID,
      kind: "image",
      status: "uploaded",
      storageKey: "private/image.jpg",
      mimeType: "image/jpeg",
    }),
    verifyMediaRetrievalJobDispatch: async () => ({ allowed: true }),
    appendAgentRunEvent: async () => null,
    reserveProviderBudget: async () => ({ reserved: true, reservationId: "reservation" }),
    settleProviderBudget: async () => null,
    enqueueMediaRetrievalTemporaryCleanup: async (input) => { cleanupTasks.push(input); return { queued: true }; },
    persistMediaRetrievalSegments: async () => { persisted = true; return { status: "persisted", persistedCount: 1 }; },
    completeMediaRetrievalJob: async () => null,
    failMediaRetrievalJob: async (input) => failures.push(input),
  };
  const result = await processMediaRetrievalJob({
    job: {
      id: "cleanup-job",
      userId: USER_ID,
      agentRunId: RUN_ID,
      mediaAssetId: "asset-cleanup",
      jobType: "index",
      contentFingerprint: "d".repeat(64),
      processingVersion: "v1",
      profileEpoch: 1,
    },
    repository,
    provider: {
      getIndexingProvenance: () => indexingProvenance(),
      getRuntimeStatus: () => ({ configured: true, enabled: true, providerCallsEnabled: true }),
      describeImage: async () => ({ summary: "scene", clothing: [], scene: [], actions: [], objects: [], ocrText: [], qualitySignals: [] }),
      embedImage: async () => vector(),
    },
    media: {
      loadOwnedMediaBytes: async () => ({ bytes: Buffer.from("image"), mimeType: "image/jpeg" }),
      normalizeImageForProvider: async () => ({ bytes: Buffer.from("image"), mimeType: "image/webp" }),
      createEphemeralProviderUrl: async () => ({
        url: "https://temporary.example/image.webp",
        objectKey: "users/test/media-retrieval-tmp/object.webp",
        cleanup: async () => {
          const error = new Error("synthetic cleanup failure");
          error.cleanupObjectKey = "users/test/media-retrieval-tmp/object.webp";
          throw error;
        },
      }),
    },
    workerId: "worker-1",
  });

  assert.deepEqual(result, { status: "blocked", failureCode: "retrieval_temporary_cleanup_pending" });
  assert.equal(persisted, false);
  assert.deepEqual(cleanupTasks, [{
    userId: USER_ID,
    jobId: "cleanup-job",
    objectKey: "users/test/media-retrieval-tmp/object.webp",
  }]);
  assert.equal(failures[0].failureCode, "retrieval_temporary_cleanup_pending");
});

test("a cleanup task persistence failure becomes an auditable repository failure instead of a false cleanup-pending state", async () => {
  const failures = [];
  const events = [];
  let persisted = false;
  const repository = {
    getMediaRetrievalProfile: async () => ({ indexState: "enabled", consentVersion: "media-retrieval-consent-v1" }),
    getMediaRetrievalDispatchState: async () => ({ canDispatch: true }),
    getIndexableMediaAsset: async () => ({
      id: "asset-cleanup-write-failure",
      userId: USER_ID,
      kind: "image",
      status: "uploaded",
      storageKey: "private/image.jpg",
      mimeType: "image/jpeg",
    }),
    verifyMediaRetrievalJobDispatch: async () => ({ allowed: true }),
    appendAgentRunEvent: async (event) => events.push(event),
    reserveProviderBudget: async () => ({ reserved: true, reservationId: "reservation" }),
    settleProviderBudget: async () => null,
    enqueueMediaRetrievalTemporaryCleanup: async () => ({ queued: false }),
    persistMediaRetrievalSegments: async () => { persisted = true; return { status: "persisted", persistedCount: 1 }; },
    completeMediaRetrievalJob: async () => null,
    failMediaRetrievalJob: async (input) => failures.push(input),
  };

  const result = await processMediaRetrievalJob({
    job: {
      id: "cleanup-write-failure-job",
      userId: USER_ID,
      agentRunId: RUN_ID,
      mediaAssetId: "asset-cleanup-write-failure",
      jobType: "index",
      contentFingerprint: "e".repeat(64),
      processingVersion: "v1",
      profileEpoch: 1,
    },
    repository,
    provider: {
      getIndexingProvenance: () => indexingProvenance(),
      getRuntimeStatus: () => ({ configured: true, enabled: true, providerCallsEnabled: true }),
      describeImage: async () => ({ summary: "scene", clothing: [], scene: [], actions: [], objects: [], ocrText: [], qualitySignals: [] }),
      embedImage: async () => vector(),
    },
    media: {
      loadOwnedMediaBytes: async () => ({ bytes: Buffer.from("image"), mimeType: "image/jpeg" }),
      normalizeImageForProvider: async () => ({ bytes: Buffer.from("image"), mimeType: "image/webp" }),
      createEphemeralProviderUrl: async () => ({
        url: "https://temporary.example/image.webp",
        objectKey: "users/test/media-retrieval-tmp/object.webp",
        cleanup: async () => {
          const error = new Error("synthetic cleanup failure");
          error.cleanupObjectKey = "users/test/media-retrieval-tmp/object.webp";
          throw error;
        },
      }),
    },
    workerId: "worker-1",
  });

  assert.deepEqual(result, { status: "failed", failureCode: "retrieval_repository_write_failed" });
  assert.equal(persisted, false);
  assert.equal(failures[0].failureCode, "retrieval_repository_write_failed");
  assert.equal(events.some((event) => event.eventType === "temporary-cleanup-queue-failed"), true);
  assert.equal(JSON.stringify(events).includes("media-retrieval-tmp"), false);
});
