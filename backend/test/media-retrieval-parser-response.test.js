import assert from "node:assert/strict";
import test from "node:test";

process.env.DEFAULT_ADMIN_PASSWORD ||= "test-only-password";

const { createMediaRetrievalProvider } = await import("../src/media-retrieval-provider.js");
const {
  createMediaRetrievalUserService,
  MediaRetrievalServiceError,
} = await import("../src/media-retrieval-user-service.js");
const { toPublicMediaRetrievalError } = await import("../src/media-retrieval-errors.js");

const USER_ID = "11111111-1111-4111-8111-111111111111";
const configuredRuntime = {
  mediaRetrieval: {
    enabled: true,
    providerCallsEnabled: true,
    dashscopeApiKey: "test-key-not-for-network",
    dashscopeApiBaseUrl: "https://workspace.cn-beijing.maas.aliyuncs.com/api/v1",
    captionModel: "qwen3.6-flash",
    embeddingModel: "qwen3-vl-embedding",
    embeddingDimension: 1024,
    maxVideoFrames: 6,
    userDailyRequestLimit: 3,
    globalDailyBudgetFen: 1000,
  },
};

const approvedReservation = { reserved: true, reservationId: "reservation-123", amountFen: 1 };

const responseJson = (payload, ok = true, status = 200) => ({
  ok,
  status,
  json: async () => payload,
});

const providerPayload = (candidate) => ({
  output: {
    choices: [{
      message: { content: [{ text: JSON.stringify(candidate) }] },
    }],
  },
});

const requestKind = (url) => String(url).includes("multimodal-generation") ? "parse" : "embedding";

const repositoryForSearch = (transitions) => ({
  getMediaRetrievalProfile: async () => ({ indexState: "enabled", consentVersion: "media-retrieval-consent-v1" }),
  createOrGetMediaRetrievalRun: async () => ({
    reused: false,
    run: { id: "33333333-3333-4333-8333-333333333333", traceId: "a".repeat(32) },
  }),
  transitionMediaRetrievalRun: async (input) => { transitions.push(input); return null; },
  reserveProviderBudget: async () => approvedReservation,
  settleProviderBudget: async () => null,
  searchMediaRetrievalSegments: async () => {
    throw new Error("malformed parser candidate must not reach retrieval");
  },
});

const malformedCases = [
  {
    label: "string identityTerms",
    marker: "Summer",
    candidate: { visualQuery: "provider-body-string-marker", identityTerms: "Summer", parseConfidence: "high" },
  },
  {
    label: "missing identityTerms",
    marker: "provider-body-missing-marker",
    candidate: { visualQuery: "provider-body-missing-marker", parseConfidence: "high" },
  },
  {
    label: "missing visualQuery",
    marker: "provider-body-missing-visual-marker",
    candidate: { identityTerms: ["provider-body-missing-visual-marker"], parseConfidence: "high" },
  },
  {
    label: "missing parseConfidence",
    marker: "provider-body-missing-confidence-marker",
    candidate: { visualQuery: "provider-body-missing-confidence-marker", identityTerms: [] },
  },
  {
    label: "null identityTerms",
    marker: "provider-body-null-marker",
    candidate: { visualQuery: "provider-body-null-marker", identityTerms: null, parseConfidence: "high" },
  },
  {
    label: "object identityTerms",
    marker: "provider-body-object-marker",
    candidate: { visualQuery: "provider-body-object-marker", identityTerms: { value: "Summer" }, parseConfidence: "high" },
  },
  {
    label: "mixed-type identityTerms",
    marker: "provider-body-mixed-marker",
    candidate: { visualQuery: "provider-body-mixed-marker", identityTerms: ["Summer", 7], parseConfidence: "high" },
  },
  {
    label: "overlong identity term",
    marker: "overlong-provider-marker",
    candidate: { visualQuery: "overlong-provider-marker", identityTerms: ["overlong-provider-marker".repeat(4)], parseConfidence: "high" },
  },
  {
    label: "too many identity terms",
    marker: "overflow-provider-marker-0",
    candidate: {
      visualQuery: "provider-body-overflow-marker",
      identityTerms: Array.from({ length: 13 }, (_, index) => `overflow-provider-marker-${index}`),
      parseConfidence: "high",
    },
  },
  {
    label: "unsupported parse confidence",
    marker: "provider-body-confidence-marker",
    candidate: { visualQuery: "provider-body-confidence-marker", identityTerms: [], parseConfidence: "unsupported" },
  },
  {
    label: "non-string visualQuery",
    marker: "provider-body-visual-marker",
    candidate: { visualQuery: { marker: "provider-body-visual-marker" }, identityTerms: [], parseConfidence: "high" },
  },
];

test("production parser schema rejects every malformed response before retrieval or embedding", async () => {
  for (const scenario of malformedCases) {
    const requests = [];
    const transitions = [];
    const provider = createMediaRetrievalProvider({
      config: configuredRuntime,
      fetchImpl: async (url, options) => {
        requests.push({ kind: requestKind(url), url, options });
        if (requestKind(url) === "parse") return responseJson(providerPayload(scenario.candidate));
        throw new Error("embedding request must not occur");
      },
    });

    await assert.rejects(
      () => provider.parseRetrievalQuery({
        query: "yellow dress on a beach",
        reservation: approvedReservation,
      }),
      (error) => {
        assert.equal(error.code, "retrieval_policy_unverifiable", scenario.label);
        assert.equal(error.status, 422, scenario.label);
        assert.equal(String(error.message).includes(scenario.marker), false, scenario.label);
        return true;
      },
    );
    assert.deepEqual(requests.map((request) => request.kind), ["parse"], scenario.label);

    requests.length = 0;
    const service = createMediaRetrievalUserService({
      provider,
      repository: repositoryForSearch(transitions),
    });
    let serviceError = null;
    await assert.rejects(
      () => service.searchMediaRetrieval({ userId: USER_ID, query: "yellow dress on a beach" }),
      (error) => {
        serviceError = error;
        return error instanceof MediaRetrievalServiceError && error.code === "retrieval_policy_unverifiable";
      },
    );

    assert.deepEqual(requests.map((request) => request.kind), ["parse"], scenario.label);
    assert.equal(requests.filter((request) => request.kind === "embedding").length, 0, scenario.label);
    assert.equal(transitions.at(-1)?.failureCode, "retrieval_policy_unverifiable", scenario.label);
    const publicError = toPublicMediaRetrievalError(serviceError);
    assert.deepEqual(Object.keys(publicError).sort(), ["code", "message", "retryable"], scenario.label);
    assert.equal(publicError.code, "retrieval_policy_unverifiable", scenario.label);
    const safeOutput = JSON.stringify({ publicError, transitions, error: {
      code: serviceError.code,
      message: serviceError.message,
    } });
    assert.equal(safeOutput.includes(JSON.stringify(scenario.candidate)), false, scenario.label);
    assert.equal(safeOutput.includes(scenario.marker), false, scenario.label);
  }
});
