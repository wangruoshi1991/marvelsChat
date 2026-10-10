import assert from "node:assert/strict";
import test from "node:test";

import fixture from "../../shared/media-retrieval-public-contract.fixture.json" with { type: "json" };
import {
  createMediaRetrievalUserService as createUserService,
  MediaRetrievalServiceError,
} from "../src/media-retrieval-user-service.js";

const USER_ID = "11111111-1111-4111-8111-111111111111";
const RUN_ID = "33333333-3333-4333-8333-333333333333";
const available = async () => ({ routeEligibility: { canRouteNewRun: true } });
const run = (overrides = {}) => ({
  id: RUN_ID,
  traceId: "a".repeat(32),
  lifecycleStatus: "accepted",
  failureCode: null,
  ...overrides,
});

test("enable and reindex runs finish immediately when they enqueue no new jobs", async () => {
  for (const action of ["enable", "reindex"]) {
    const transitions = [];
    const repository = {
      createOrGetMediaRetrievalRun: async () => ({ reused: false, run: run() }),
      transitionMediaRetrievalRun: async (input) => {
        transitions.push(input);
        return run({ lifecycleStatus: input.lifecycleStatus });
      },
      getMediaRetrievalProfile: async () => ({
        indexState: "enabled",
        consentVersion: "media-retrieval-consent-v1",
        indexEpoch: 1,
      }),
      enableMediaRetrievalProfile: async () => null,
      enqueueBackfillJobs: async () => ({ totalAssets: 0, enqueued: 0, reused: 0 }),
      enqueueReindexJobs: async () => ({ totalAssets: 3, enqueued: 0, reused: 3 }),
    };
    const service = createUserService({ repository, provider: {}, getRuntimeStatus: available });
    const result = action === "enable"
      ? await service.enableMediaRetrieval({
        userId: USER_ID,
        consentVersion: "media-retrieval-consent-v1",
        idempotencyKey: "enable-operation-0001",
      })
      : await service.requestMediaRetrievalReindex({
        userId: USER_ID,
        scope: "stale",
        mediaAssetIds: [],
        idempotencyKey: "reindex-operation-0001",
      });

    assert.equal(result.lifecycleStatus, "succeeded", action);
    assert.deepEqual(
      transitions.map(({ lifecycleStatus, eventType }) => ({ lifecycleStatus, eventType })),
      [{ lifecycleStatus: "succeeded", eventType: "completed" }],
      action,
    );
  }
});

test("a repeated search key replays the stored response without provider or budget work", async () => {
  let providerCalls = 0;
  let transitions = 0;
  const service = createUserService({
    getRuntimeStatus: available,
    provider: {
      getRuntimeStatus: () => ({ configured: true, enabled: true, providerCallsEnabled: true }),
      parseRetrievalQuery: async () => { providerCalls += 1; },
    },
    repository: {
      getMediaRetrievalProfile: async () => ({
        indexState: "enabled",
        consentVersion: "media-retrieval-consent-v1",
        indexEpoch: 1,
      }),
      createOrGetMediaRetrievalRun: async () => ({
        reused: true,
        run: run({ lifecycleStatus: "succeeded" }),
      }),
      getMediaRetrievalSearchResponse: async () => fixture.searchSuccess,
      transitionMediaRetrievalRun: async () => { transitions += 1; },
      reserveProviderBudget: async () => { throw new Error("budget must not be touched"); },
    },
  });

  const result = await service.searchMediaRetrieval({
    userId: USER_ID,
    query: "yellow dress",
    limit: 20,
    idempotencyKey: "search-operation-0001",
  });

  assert.deepEqual(result, fixture.searchSuccess);
  assert.equal(providerCalls, 0);
  assert.equal(transitions, 0);
});

test("a concurrent search replay reports an explicit retryable in-progress state", async () => {
  const service = createUserService({
    getRuntimeStatus: available,
    provider: {},
    repository: {
      getMediaRetrievalProfile: async () => ({
        indexState: "enabled",
        consentVersion: "media-retrieval-consent-v1",
        indexEpoch: 1,
      }),
      createOrGetMediaRetrievalRun: async () => ({
        reused: true,
        run: run({ lifecycleStatus: "running" }),
      }),
      getMediaRetrievalSearchResponse: async () => null,
    },
  });

  await assert.rejects(
    () => service.searchMediaRetrieval({
      userId: USER_ID,
      query: "yellow dress",
      limit: 20,
      idempotencyKey: "search-operation-0002",
    }),
    (error) =>
      error instanceof MediaRetrievalServiceError &&
      error.code === "retrieval_request_in_progress" &&
      error.status === 409 &&
      error.retryable === true,
  );
});

test("search repository failures become terminal and replay never reruns the provider", async () => {
  const transitions = [];
  let savedRun = run();
  let searches = 0;
  let parses = 0;
  const repository = {
    getMediaRetrievalProfile: async () => ({
      indexState: "enabled", consentVersion: "media-retrieval-consent-v1", indexEpoch: 1,
    }),
    createOrGetMediaRetrievalRun: async () => ({ run: savedRun, reused: searches > 0 }),
    transitionMediaRetrievalRun: async (input) => {
      transitions.push(input);
      savedRun = { ...savedRun, ...input };
    },
    searchMediaRetrievalSegments: async () => {
      searches += 1;
      throw new Error("private database detail must not escape");
    },
    getMediaRetrievalSearchResponse: async () => null,
    reserveProviderBudget: async () => ({ reserved: true, reservationId: "fixture-reservation", amountFen: 1 }),
    settleProviderBudget: async () => null,
  };
  const service = createUserService({ repository, provider: {
    getRuntimeStatus: () => ({ configured: true, enabled: true, providerCallsEnabled: true }),
    parseRetrievalQuery: async () => {
      parses += 1;
      return { spans: [{ text: "Alice", role: "identity" }], parseConfidence: "high" };
    },
  }, getRuntimeStatus: available });
  const input = { userId: USER_ID, query: "Alice", idempotencyKey: "failed-search-0001" };
  for (let attempt = 0; attempt < 2; attempt += 1) {
    await assert.rejects(service.searchMediaRetrieval(input), (error) =>
      error.code === "retrieval_repository_write_failed" && !error.message.includes("private"),
    );
  }
  assert.deepEqual(transitions.map((item) => item.lifecycleStatus), ["running", "failed"]);
  assert.equal(savedRun.failureCode, "retrieval_repository_write_failed");
  assert.equal(searches, 1);
  assert.equal(parses, 1);
});

test("status tracks an active reindex before a newer completed index", async () => {
  const active = { ...run({ lifecycleStatus: "running" }), runType: "media-reindex" };
  const service = createUserService({
    repository: {
      getMediaRetrievalStatusForUser: async () => ({
        profile: { indexState: "enabled" },
        recentRuns: [
          { ...run({ id: "completed", lifecycleStatus: "succeeded" }), runType: "media-index" },
          active,
        ],
        jobs: { succeeded: 2, queued: 1, failed: 1 },
        quota: {},
      }),
    },
    getRuntimeStatus: available,
  });
  const status = await service.getMediaRetrievalStatus({ userId: USER_ID });
  assert.equal(status.backfill.agentRunId, active.id);
  assert.equal(status.backfill.lifecycleStatus, "running");
  assert.equal(status.backfill.totalAssets, 4);
  assert.equal(status.backfill.indexedAssets, 2);
});

test("lifecycle write failures terminate enable, reindex and purge runs without leaking internals", async () => {
  for (const action of ["enable", "reindex", "purge"]) {
    const transitions = [];
    const repository = {
      createOrGetMediaRetrievalRun: async () => ({ reused: false, run: run() }),
      getMediaRetrievalProfile: async () => ({ indexState: "enabled", consentVersion: "media-retrieval-consent-v1" }),
      enableMediaRetrievalProfile: async () => {},
      enqueueBackfillJobs: async () => { throw new Error("private SQL detail"); },
      enqueueReindexJobs: async () => { throw new Error("private SQL detail"); },
      beginIndexPurge: async () => ({ jobType: "purge" }),
      appendAgentRunEvent: async () => { throw new Error("private SQL detail"); },
      transitionMediaRetrievalRun: async (input) => { transitions.push(input); },
    };
    const service = createUserService({ repository, provider: {}, getRuntimeStatus: available });
    const common = { userId: USER_ID, idempotencyKey: `failed-${action}-operation-0001` };
    const request = action === "enable"
      ? service.enableMediaRetrieval({ ...common, consentVersion: "media-retrieval-consent-v1" })
      : action === "reindex"
        ? service.requestMediaRetrievalReindex({ ...common, scope: "all", mediaAssetIds: [] })
        : service.deleteMediaRetrievalIndex(common);
    await assert.rejects(request, (error) => error.code === "retrieval_repository_write_failed" && !error.message.includes("private"));
    assert.deepEqual(transitions.map(({ lifecycleStatus, failureCode }) => ({ lifecycleStatus, failureCode })), [
      { lifecycleStatus: "failed", failureCode: "retrieval_repository_write_failed" },
    ], action);
  }
});

test("enable during purge reports its canonical conflict and never queues new indexing", async () => {
  const transitions = [];
  const service = createUserService({
    getRuntimeStatus: available,
    provider: {},
    repository: {
      createOrGetMediaRetrievalRun: async () => ({ reused: false, run: run() }),
      enableMediaRetrievalProfile: async () => { throw new MediaRetrievalServiceError("retrieval_purge_incomplete"); },
      enqueueBackfillJobs: async () => { assert.fail("must not enqueue during purge"); },
      transitionMediaRetrievalRun: async (input) => { transitions.push(input); },
    },
  });
  await assert.rejects(service.enableMediaRetrieval({ userId: USER_ID,
    consentVersion: "media-retrieval-consent-v1", idempotencyKey: "purging-enable-operation-0001" }),
  (error) => error.code === "retrieval_purge_incomplete" && error.status === 503 && error.retryable);
  assert.equal(transitions[0].failureCode, "retrieval_purge_incomplete");
});
