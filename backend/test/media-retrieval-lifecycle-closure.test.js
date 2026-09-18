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
