import assert from "node:assert/strict";
import test from "node:test";

process.env.DEFAULT_ADMIN_PASSWORD ||= "test-only-password";

const {
  createMediaRetrievalUserService: createUserService,
  MediaRetrievalServiceError,
} = await import("../src/media-retrieval-user-service.js");
const { toPublicMediaRetrievalError } = await import("../src/media-retrieval-errors.js");

const createMediaRetrievalUserService = (input) => createUserService({
  getRuntimeStatus: async () => ({ routeEligibility: { canRouteNewRun: true } }),
  ...input,
});

test("media retrieval public errors always expose only code, message, and retryable", () => {
  const error = new MediaRetrievalServiceError("retrieval_service_unavailable");
  assert.deepEqual(toPublicMediaRetrievalError(error), {
    code: "retrieval_service_unavailable",
    message: "Media retrieval is temporarily unavailable.",
    retryable: true,
  });
  assert.deepEqual(toPublicMediaRetrievalError(new Error("database password=secret")), {
    code: "retrieval_service_unavailable",
    message: "Media retrieval is temporarily unavailable.",
    retryable: true,
  });
});

test("another user receives a safe not-found result for an Agent run and no events", async () => {
  let eventQueryCalled = false;
  const service = createMediaRetrievalUserService({
    repository: {
      getAgentRunForUser: async () => null,
      listAgentRunEventsForUser: async () => {
        eventQueryCalled = true;
        return [];
      },
    },
  });

  await assert.rejects(
    () => service.getAgentRunEvents({
      userId: "22222222-2222-4222-8222-222222222222",
      agentRunId: "11111111-1111-4111-8111-111111111111",
      afterSequence: 0,
    }),
    (error) => error.code === "run_not_found" && error.status === 404,
  );
  assert.equal(eventQueryCalled, false);
});

test("a disabled provider rejects a generic visual query instead of silently falling back to loose local matching", async () => {
  const createdInputs = [];
  let providerCalled = false;
  const service = createMediaRetrievalUserService({
    provider: {
      getRuntimeStatus: () => ({ configured: false, enabled: false, providerCallsEnabled: false }),
      parseRetrievalQuery: async () => {
        providerCalled = true;
      },
    },
    repository: {
      getMediaRetrievalProfile: async () => ({ indexState: "enabled", consentVersion: "media-retrieval-consent-v1" }),
      createOrGetMediaRetrievalRun: async (input) => {
        createdInputs.push(input);
        return { reused: false, run: { id: "33333333-3333-4333-8333-333333333333", traceId: "a".repeat(32) } };
      },
      transitionMediaRetrievalRun: async () => null,
      searchMediaRetrievalSegments: async () => {
        throw new Error("must not run a loose local fallback");
      },
    },
  });

  await assert.rejects(
    () => service.searchMediaRetrieval({
      userId: "11111111-1111-4111-8111-111111111111",
      query: "黄色连衣裙",
    }),
    (error) => error.code === "retrieval_service_unavailable",
  );
  assert.equal(providerCalled, false);
  assert.equal(JSON.stringify(createdInputs).includes("示例姓名"), false);
});

test("B7 keeps a raw identity query exact-only even when the parser would miss that identity", async () => {
  const embeddedTexts = [];
  const service = createMediaRetrievalUserService({
    provider: {
      getRuntimeStatus: () => ({ configured: true, enabled: true, providerCallsEnabled: true, userDailyRequestLimit: 3, globalDailyBudgetFen: 100 }),
      parseRetrievalQuery: async () => ({
        visualQuery: "Alice wearing a yellow dress",
        identityTerms: [],
        parseConfidence: "high",
      }),
      embedText: async ({ input }) => {
        embeddedTexts.push(input.text);
        return Array.from({ length: 1024 }, () => 0.1);
      },
    },
    repository: {
      getMediaRetrievalProfile: async () => ({ indexState: "enabled", consentVersion: "media-retrieval-consent-v1" }),
      createOrGetMediaRetrievalRun: async () => ({ reused: false, run: { id: "33333333-3333-4333-8333-333333333333", traceId: "a".repeat(32) } }),
      transitionMediaRetrievalRun: async () => null,
      reserveProviderBudget: async () => ({ reserved: true, reservationId: "reservation" }),
      settleProviderBudget: async () => null,
      searchMediaRetrievalSegments: async (input) => {
        assert.equal(input.identityTerms.includes("Alice"), true);
        assert.equal(input.vector, null);
        return [{
          mediaAssetId: "asset-a",
          kind: "image",
          matchedFrameTimestampMs: null,
          summary: "yellow dress",
          score: null,
          caption: "Alice",
          tags: ["yellow"],
          descriptor: { ocrText: [] },
          metadata: {},
        }];
      },
    },
  });

  const result = await service.searchMediaRetrieval({
    userId: "11111111-1111-4111-8111-111111111111",
    query: "celebrity Alice wearing a yellow dress",
  });

  assert.equal(embeddedTexts.length, 0);
  assert.deepEqual(result.results[0].matchReasons, ["identity-caption-exact"]);
});

test("a non-routeable runtime blocks a new run before consent, query text, or provider work is touched", async () => {
  let repositoryCalled = false;
  const service = createMediaRetrievalUserService({
    getRuntimeStatus: async () => ({ routeEligibility: { canRouteNewRun: false } }),
    provider: { parseRetrievalQuery: async () => { throw new Error("must not be called"); } },
    repository: {
      getMediaRetrievalProfile: async () => { repositoryCalled = true; },
      createOrGetMediaRetrievalRun: async () => { repositoryCalled = true; },
    },
  });

  await assert.rejects(
    () => service.searchMediaRetrieval({
      userId: "11111111-1111-4111-8111-111111111111",
      query: "穿黄裙子的照片",
    }),
    (error) => error.code === "retrieval_service_unavailable" && error.status === 503,
  );
  assert.equal(repositoryCalled, false);
});

test("user status projects only safe public availability from the runtime", async () => {
  const service = createMediaRetrievalUserService({
    getRuntimeStatus: async () => ({
      publicAvailability: {
        state: "temporarily-unavailable",
        canStartRun: false,
        reasonCodes: ["not-ready"],
      },
      apiKey: "must-not-leak",
      apiBaseUrl: "https://must-not-leak.example",
    }),
    repository: {
      getMediaRetrievalStatusForUser: async () => ({
        profile: null,
        recentRuns: [],
        jobs: {},
        quota: {},
      }),
    },
  });

  const status = await service.getMediaRetrievalStatus({ userId: "11111111-1111-4111-8111-111111111111" });
  assert.deepEqual(status.availability, {
    state: "temporarily-unavailable",
    canStartRun: false,
    reasonCodes: ["not-ready"],
  });
  assert.equal(JSON.stringify(status).includes("must-not-leak"), false);
});

test("user status derives remaining quota from persisted operator controls instead of fixed product constants", async () => {
  const service = createMediaRetrievalUserService({
    repository: {
      getMediaRetrievalStatusForUser: async () => ({
        profile: { indexState: "enabled", consentVersion: "media-retrieval-consent-v1" },
        recentRuns: [],
        jobs: {},
        quota: { action_count: 2, monthly_committed_fen: 125 },
        limits: { userDailyRequestLimit: 9, userMonthlyBudgetFen: 900 },
      }),
    },
  });

  const status = await service.getMediaRetrievalStatus({ userId: "11111111-1111-4111-8111-111111111111" });

  assert.deepEqual(status.quota, { dailyRemaining: 7, monthlyRemainingFen: 775 });
});

test("upload indexing exposes a recoverable not-queued outcome instead of silently returning null", async () => {
  const service = createMediaRetrievalUserService({
    getRuntimeStatus: async () => ({ routeEligibility: { canRouteNewRun: true } }),
    provider: {
      getRuntimeStatus: () => ({ configured: false, enabled: false, providerCallsEnabled: false }),
    },
    repository: {},
  });

  const outcome = await service.enqueueUploadedMediaAsset({
    userId: "11111111-1111-4111-8111-111111111111",
    mediaAssetId: "22222222-2222-4222-8222-222222222222",
  });

  assert.deepEqual(outcome, { queued: false, reasonCode: "retrieval_not_enabled" });
});
