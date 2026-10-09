import assert from "node:assert/strict";
import test from "node:test";

process.env.DEFAULT_ADMIN_PASSWORD ||= "test-only-password";

const {
  createMediaRetrievalUserService: createUserService,
  MediaRetrievalServiceError,
} = await import("../src/media-retrieval-user-service.js");
const { toPublicMediaRetrievalError } = await import("../src/media-retrieval-errors.js");
const { createEmbeddingProvenance } = await import("../src/media-retrieval-provenance.js");

const USER_ID = "11111111-1111-4111-8111-111111111111";
const VECTOR = Array.from({ length: 1024 }, () => 0.1);
const TEST_EMBEDDING_PROVENANCE = createEmbeddingProvenance({
  modelId: "synthetic-test-embedding",
  modelVersion: "1",
  dimension: 1024,
  normalization: "synthetic-test-normalization",
  configuration: { fixture: "media-retrieval-search-boundary" },
});
const getTestIndexingProvenance = () => ({ embeddingProvenance: TEST_EMBEDDING_PROVENANCE });
const createMediaRetrievalUserService = (input) => createUserService({
  getRuntimeStatus: async () => ({ routeEligibility: { canRouteNewRun: true } }),
  ...input,
});

const enabledProfile = () => ({
  indexState: "enabled",
  consentVersion: "media-retrieval-consent-v1",
  indexEpoch: 1,
});

function repositoryForSearch({ searched = [], transitions = [] } = {}) {
  return {
    getMediaRetrievalProfile: async () => enabledProfile(),
    createOrGetMediaRetrievalRun: async () => ({
      reused: false,
      run: { id: "33333333-3333-4333-8333-333333333333", traceId: "a".repeat(32) },
    }),
    transitionMediaRetrievalRun: async (input) => {
      transitions.push(input);
      return null;
    },
    reserveProviderBudget: async () => ({ reserved: true, reservationId: "reservation", amountFen: 1 }),
    settleProviderBudget: async () => null,
    searchMediaRetrievalSegments: async (input) => {
      searched.push(input);
      return [];
    },
  };
}

test("an unverifiable index epoch blocks a search before any run or provider work", async () => {
  for (const indexEpoch of [undefined, null, 0, -1, 1.5, Number.MAX_SAFE_INTEGER + 1]) {
    const service = createMediaRetrievalUserService({
      repository: {
        getMediaRetrievalProfile: async () => ({ ...enabledProfile(), indexEpoch }),
        createOrGetMediaRetrievalRun: async () => assert.fail("must not create a run"),
      },
      provider: {},
    });
    await assert.rejects(service.searchMediaRetrieval({ userId: USER_ID, query: "a bicycle" }),
      (error) => error.code === "retrieval_policy_unverifiable");
  }
});

test("actual object search binds bilingual queries and forwards the current vector provenance", async () => {
  const searched = [];
  const embedded = [];
  const service = createMediaRetrievalUserService({
    repository: repositoryForSearch({ searched }),
    provider: {
      getRuntimeStatus: () => ({ configured: true, enabled: true, providerCallsEnabled: true }),
      getIndexingProvenance: getTestIndexingProvenance,
      parseRetrievalQuery: async ({ query }) => ({
        visualQuery: query,
        identityTerms: [],
        parseConfidence: "high",
      }),
      embedText: async ({ input }) => {
        embedded.push(input.text);
        return VECTOR;
      },
    },
  });
  for (const query of ["自行车的照片", "photos of a car", "公园里的自行车"]) {
    const response = await service.searchMediaRetrieval({ userId: USER_ID, query });
    assert.deepEqual(response.results, []);
  }
  assert.deepEqual(embedded, ["semantic-v1 自行车的照片", "semantic-v1 photos of a car", "semantic-v1 公园里的自行车"]);
  assert.ok(searched.some((input) => input.vector));
  for (const input of searched.filter((item) => item.vector)) {
    assert.deepEqual(input.embeddingProvenance, TEST_EMBEDDING_PROVENANCE);
    assert.equal(input.userId, USER_ID);
  }
});

test("B7 service keeps parser-missed identity spans out of semantic embedding and uses semantic retrieval for open queries", async () => {
  const embeddedInputs = [];
  const searched = [];
  let parseCalls = 0;
  const service = createMediaRetrievalUserService({
    provider: {
      getRuntimeStatus: () => ({ configured: true, enabled: true, providerCallsEnabled: true }),
      getIndexingProvenance: getTestIndexingProvenance,
      parseRetrievalQuery: async ({ query }) => {
        parseCalls += 1;
        return {
          visualQuery: query,
          identityTerms: [],
          parseConfidence: "high",
        };
      },
      embedText: async ({ input }) => {
        embeddedInputs.push(input);
        return VECTOR;
      },
    },
    repository: repositoryForSearch({ searched }),
  });

  for (const query of [
    "Alice wearing a yellow dress",
    "celebrity Taylor Swift wearing yellow",
    "周杰伦穿黄色衣服",
    "叫周杰伦的人穿黄色衣服",
    "a photo of Taylor Swift wearing yellow",
    "find the yellow dress with Alice",
    "yellow dress worn by Alice",
    "照片里周杰伦穿黄色衣服",
    "find taylor swift wearing yellow",
    "a photo of alice wearing yellow",
    "照片里小明穿黄色衣服",
    "照片里欧阳娜娜穿黄色衣服",
    "黄色衣服的周杰伦",
    "find TAYLOR Swift wearing yellow",
    "find 张三 wearing yellow dress",
    // Parser reports a high-confidence empty identity list for every one of
    // these. Their identity position, rather than a name blacklist, must keep
    // homonymous visual lexemes out of the embedding request.
    "Summer wearing yellow",
    "summer wearing yellow",
    "Brown wearing yellow dress",
    "BROWN wearing yellow dress",
    "Park wearing yellow",
    "park wearing yellow",
    "Standing wearing yellow dress",
    "Dress wearing yellow",
    "夏天穿黄色衣服",
    "yellow dress on a beach",
  ]) {
    await service.searchMediaRetrieval({ userId: USER_ID, query });
  }

  assert.equal(parseCalls, 25);
  assert.deepEqual(
    embeddedInputs.map((input) => input.text),
    ["semantic-v1 yellow dress on a beach"],
  );
  assert.equal(embeddedInputs[0].kind, "media-retrieval-typed-visual-embedding-v2");
  assert.match(embeddedInputs[0].coverageDigest, /^[a-f0-9]{64}$/);
  assert.match(embeddedInputs[0].textHash, /^[a-f0-9]{64}$/);
  assert.equal(JSON.stringify(embeddedInputs).includes("Alice"), false);
  assert.equal(JSON.stringify(embeddedInputs).includes("Taylor Swift"), false);
  assert.equal(JSON.stringify(embeddedInputs).includes("周杰伦"), false);
  assert.equal(JSON.stringify(embeddedInputs).includes("小明"), false);
  assert.equal(JSON.stringify(embeddedInputs).includes("欧阳娜娜"), false);
  for (const input of searched.filter((item) => item.identityTerms.length)) {
    assert.equal(input.lexicalTerms.some((term) => /Alice|Taylor Swift|周杰伦/u.test(term)), false);
  }
});

test("identity terms are exact owner filters and never enter query embeddings", async () => {
  const cases = [
    {
      label: "high-confidence season homonym",
      query: "Summer yellow dress",
      candidate: { visualQuery: "yellow dress", identityTerms: ["Summer"], parseConfidence: "high" },
      expectedIdentityTerms: ["Summer"],
    },
    {
      label: "high-confidence color homonym",
      query: "Brown yellow dress",
      candidate: { visualQuery: "yellow dress", identityTerms: ["Brown"], parseConfidence: "high" },
      expectedIdentityTerms: ["Brown"],
    },
    {
      label: "low-confidence arbitrary parser identity term",
      query: "yellow dress on a beach",
      candidate: { visualQuery: "yellow dress on a beach", identityTerms: ["yellow"], parseConfidence: "low" },
      expectedIdentityTerms: ["yellow"],
    },
  ];

  for (const scenario of cases) {
    const embeddedInputs = [];
    const searched = [];
    let parseCalls = 0;
    const service = createMediaRetrievalUserService({
      provider: {
        getRuntimeStatus: () => ({ configured: true, enabled: true, providerCallsEnabled: true }),
        getIndexingProvenance: getTestIndexingProvenance,
        parseRetrievalQuery: async () => {
          parseCalls += 1;
          return scenario.candidate;
        },
        embedText: async ({ input }) => {
          embeddedInputs.push(input);
          return VECTOR;
        },
      },
      repository: repositoryForSearch({ searched }),
    });

    await service.searchMediaRetrieval({ userId: USER_ID, query: scenario.query });

    assert.equal(parseCalls, 1, scenario.label);
    assert.equal(embeddedInputs.length, scenario.candidate.parseConfidence === "high" ? 1 : 0, scenario.label);
    assert.ok(searched.length >= 1, scenario.label);
    assert.ok(
      searched.every((stage) => JSON.stringify(stage.identityTerms) === JSON.stringify(scenario.expectedIdentityTerms)),
      scenario.label,
    );
    assert.ok(
      searched.every((stage) => stage.lexicalTerms.length === 0),
      scenario.label,
    );
    if (embeddedInputs.length) {
      assert.deepEqual(embeddedInputs[0].identityTerms, []);
      assert.equal(JSON.stringify(embeddedInputs[0]).includes(scenario.expectedIdentityTerms[0]), false);
    }
  }
});

test("parser-missed identity contexts remain out of embeddings even when the parser is called", async () => {
  for (const query of [
    "Summer wearing yellow",
    "Brown wearing yellow dress",
    "Park wearing yellow",
    "夏天穿黄色衣服",
  ]) {
    const embeddedInputs = [];
    let parseCalls = 0;
    const service = createMediaRetrievalUserService({
      provider: {
        getRuntimeStatus: () => ({ configured: true, enabled: true, providerCallsEnabled: true }),
        parseRetrievalQuery: async () => {
          parseCalls += 1;
          return { visualQuery: "untrusted", identityTerms: [], parseConfidence: "high" };
        },
        embedText: async ({ input }) => {
          embeddedInputs.push(input);
          return VECTOR;
        },
      },
      repository: repositoryForSearch(),
    });

    await service.searchMediaRetrieval({ userId: USER_ID, query });

    assert.equal(parseCalls, 1, query);
    assert.equal(embeddedInputs.length, 0, query);
  }
});

test("actual search service fails closed when a low-confidence parser supplies an unverifiable identity term", async () => {
  const embeddedInputs = [];
  let parseCalls = 0;
  const service = createMediaRetrievalUserService({
    provider: {
      getRuntimeStatus: () => ({ configured: true, enabled: true, providerCallsEnabled: true }),
      parseRetrievalQuery: async () => {
        parseCalls += 1;
        return {
          visualQuery: "yellow dress on a beach",
          identityTerms: ["Not in this query"],
          parseConfidence: "low",
        };
      },
      embedText: async ({ input }) => {
        embeddedInputs.push(input);
        return VECTOR;
      },
    },
    repository: repositoryForSearch(),
  });

  await assert.rejects(
    () => service.searchMediaRetrieval({ userId: USER_ID, query: "yellow dress on a beach" }),
    (error) => error instanceof MediaRetrievalServiceError && error.code === "retrieval_policy_unverifiable",
  );
  assert.equal(parseCalls, 1);
  assert.equal(embeddedInputs.length, 0);
});

test("actual service rejects parser replacement text before embedding or retrieval", async () => {
  const embeddedInputs = [];
  let parseCalls = 0;
  const service = createMediaRetrievalUserService({
    provider: {
      getRuntimeStatus: () => ({ configured: true, enabled: true, providerCallsEnabled: true }),
      getIndexingProvenance: getTestIndexingProvenance,
      parseRetrievalQuery: async () => {
        parseCalls += 1;
        return {
          visualQuery: "untrusted replacement text",
          identityTerms: [],
          parseConfidence: "high",
        };
      },
      embedText: async ({ input }) => {
        embeddedInputs.push(input);
        return VECTOR;
      },
    },
    repository: repositoryForSearch(),
  });

  await assert.rejects(service.searchMediaRetrieval({ userId: USER_ID, query: "yellow dress on a beach" }),
    (error) => error.code === "retrieval_policy_unverifiable");

  assert.equal(parseCalls, 1);
  assert.equal(embeddedInputs.length, 0);
});

test("search service rejects reranker IDs outside the current owner's candidate set", async () => {
  const transitions = [];
  const searched = [];
  const service = createMediaRetrievalUserService({
    repository: {
      ...repositoryForSearch({ searched, transitions }),
      searchMediaRetrievalSegments: async (input) => {
        searched.push(input);
        return input.vector
          ? [
              {
                mediaAssetId: "owner-asset",
                kind: "image",
                matchedFrameTimestampMs: null,
                summary: "yellow dress at dusk",
                descriptor: {
                  clothing: [{ type: "dress", color: "yellow" }],
                  scene: ["outdoors"],
                  actions: [],
                  objects: [],
                },
                score: 0.91,
                caption: "",
                tags: [],
                metadata: {},
              },
            ]
          : [];
      },
    },
    provider: {
      getRuntimeStatus: () => ({ configured: true, enabled: true, providerCallsEnabled: true }),
      getIndexingProvenance: getTestIndexingProvenance,
      parseRetrievalQuery: async () => ({
        visualQuery: "a yellow dress at dusk",
        identityTerms: [],
        parseConfidence: "high",
      }),
      embedText: async () => VECTOR,
      rerankMediaCandidates: async () => [
        {
          mediaAssetId: "other-owner-asset",
          matchReasons: ["semantic-match"],
          score: 0.8,
        },
      ],
    },
  });

  await assert.rejects(
    () =>
      service.searchMediaRetrieval({
        userId: USER_ID,
        query: "a yellow dress at dusk",
      }),
    (error) => error instanceof MediaRetrievalServiceError && error.code === "retrieval_policy_unverifiable",
  );
  assert.equal(searched.length, 1);
  assert.equal(transitions.at(-1).lifecycleStatus, "blocked");
});

test("a disabled provider does not disguise a generic visual search as local lexical success", async () => {
  let searched = false;
  const service = createMediaRetrievalUserService({
    provider: {
      getRuntimeStatus: () => ({ configured: false, enabled: false, providerCallsEnabled: false }),
    },
    repository: {
      ...repositoryForSearch(),
      searchMediaRetrievalSegments: async () => { searched = true; return []; },
    },
  });

  await assert.rejects(
    () => service.searchMediaRetrieval({ userId: USER_ID, query: "yellow dress on a beach" }),
    (error) => error instanceof MediaRetrievalServiceError && error.code === "retrieval_service_unavailable",
  );
  assert.equal(searched, false);
});

test("a parser failure blocks identity and visual queries without switching to local retrieval", async () => {
  const searched = [];
  const service = createMediaRetrievalUserService({
    provider: {
      getRuntimeStatus: () => ({ configured: true, enabled: true, providerCallsEnabled: true }),
      parseRetrievalQuery: async () => { throw new Error("synthetic parse failure"); },
    },
    repository: repositoryForSearch({ searched }),
  });

  for (const query of ["Alice wearing a yellow dress", "yellow dress on a beach"]) {
    await assert.rejects(() => service.searchMediaRetrieval({ userId: USER_ID, query }),
      (error) => error.code === "retrieval_service_unavailable");
  }
  assert.equal(searched.length, 0);
});

test("actual search service blocks every explicit falsy or non-object parser candidate at the final boundary", async () => {
  const cases = [
    { label: "null", candidate: null },
    { label: "undefined", candidate: undefined },
    { label: "false", candidate: false },
    { label: "empty string", candidate: "" },
    { label: "zero", candidate: 0 },
    { label: "array", candidate: [] },
    { label: "empty object", candidate: {} },
  ];

  for (const scenario of cases) {
    const embeddedInputs = [];
    const searched = [];
    const transitions = [];
    let parseCalls = 0;
    const service = createMediaRetrievalUserService({
      provider: {
        getRuntimeStatus: () => ({ configured: true, enabled: true, providerCallsEnabled: true }),
        parseRetrievalQuery: async () => {
          parseCalls += 1;
          return scenario.candidate;
        },
        embedText: async ({ input }) => {
          embeddedInputs.push(input);
          return VECTOR;
        },
      },
      repository: repositoryForSearch({ searched, transitions }),
    });

    await assert.rejects(
      () => service.searchMediaRetrieval({ userId: USER_ID, query: "yellow dress on a beach" }),
      (error) => error instanceof MediaRetrievalServiceError && error.code === "retrieval_policy_unverifiable",
      scenario.label,
    );
    assert.equal(parseCalls, 1, scenario.label);
    assert.equal(embeddedInputs.length, 0, scenario.label);
    assert.equal(searched.length, 0, scenario.label);
    assert.deepEqual(transitions.map((transition) => transition.lifecycleStatus), ["running", "blocked"], scenario.label);
    assert.equal(transitions.at(-1)?.failureCode, "retrieval_policy_unverifiable", scenario.label);
  }
});

test("falsy parser candidates cannot serialize Summer or Brown visual homonyms", async () => {
  const cases = [
    { label: "Summer", query: "Summer yellow dress", candidate: null, forbiddenVisual: "season=summer" },
    { label: "Brown", query: "Brown yellow dress", candidate: undefined, forbiddenVisual: "color=brown" },
  ];

  for (const scenario of cases) {
    const embeddedInputs = [];
    const transitions = [];
    let parseCalls = 0;
    const service = createMediaRetrievalUserService({
      provider: {
        getRuntimeStatus: () => ({ configured: true, enabled: true, providerCallsEnabled: true }),
        parseRetrievalQuery: async () => {
          parseCalls += 1;
          return scenario.candidate;
        },
        embedText: async ({ input }) => {
          embeddedInputs.push(input);
          return VECTOR;
        },
      },
      repository: repositoryForSearch({ transitions }),
    });

    let serviceError = null;
    await assert.rejects(
      () => service.searchMediaRetrieval({ userId: USER_ID, query: scenario.query }),
      (error) => {
        serviceError = error;
        return error instanceof MediaRetrievalServiceError && error.code === "retrieval_policy_unverifiable";
      },
      scenario.label,
    );
    const safeOutput = JSON.stringify({
      embeddedInputs,
      transitions,
      error: { code: serviceError.code, message: serviceError.message },
    });
    assert.equal(parseCalls, 1, scenario.label);
    assert.equal(embeddedInputs.length, 0, scenario.label);
    assert.equal(safeOutput.includes(scenario.forbiddenVisual), false, scenario.label);
    assert.equal(safeOutput.includes(scenario.label), false, scenario.label);
  }
});

test("revocation during a search stops subsequent model dispatch and result persistence", async () => {
  for (const revokeAt of ["query-parse", "query-embedding", "recall", "query-rerank", "reservation"]) {
    let revoked = false;
    const calls = [];
    const transitions = [];
    const settlements = [];
    const asset = {
      mediaAssetId: "owner-asset",
      kind: "image",
      matchedFrameTimestampMs: null,
      summary: "a yellow dress outdoors",
      score: 0.8,
      descriptor: {
        clothing: [{ type: "dress", color: "yellow" }],
        scene: ["outdoors"],
        actions: [],
        objects: [],
      },
    };
    const dispatch = (operation) => {
      calls.push(operation);
      if (revokeAt === operation) revoked = true;
    };
    const service = createMediaRetrievalUserService({
      repository: {
        ...repositoryForSearch({ transitions }),
        getMediaRetrievalProfile: async () => ({
          ...enabledProfile(),
          indexEpoch: revoked ? 2 : 1,
          indexState: revoked ? "purging" : "enabled",
        }),
        reserveProviderBudget: async () => {
          if (revokeAt === "reservation") revoked = true;
          return { reserved: true, reservationId: "reservation", amountFen: 1 };
        },
        settleProviderBudget: async (value) => settlements.push(value),
        searchMediaRetrievalSegments: async () => {
          dispatch("recall");
          return [asset];
        },
      },
      provider: {
        getRuntimeStatus: () => ({ configured: true, enabled: true, providerCallsEnabled: true }),
        getIndexingProvenance: getTestIndexingProvenance,
        parseRetrievalQuery: async () => {
          dispatch("query-parse");
          return {
            visualQuery: "a yellow dress outdoors",
            identityTerms: [],
            parseConfidence: "high",
          };
        },
        embedText: async () => {
          dispatch("query-embedding");
          return VECTOR;
        },
        rerankMediaCandidates: async () => {
          dispatch("query-rerank");
          return [{ ...asset, matchReasons: ["semantic-match"] }];
        },
      },
    });
    await assert.rejects(
      service.searchMediaRetrieval({
        userId: USER_ID,
        query: "a yellow dress outdoors",
      }),
      (error) => error.code === "retrieval_consent_required",
      revokeAt,
    );
    const expectedCalls = ["query-parse", "query-embedding", "recall", "query-rerank"];
    assert.deepEqual(calls, revokeAt === "reservation" ? [] : expectedCalls.slice(0, expectedCalls.indexOf(revokeAt) + 1));
    assert.equal(transitions.at(-1).lifecycleStatus, "failed");
    assert.equal(
      transitions.some((value) => value.payload?.searchResponse),
      false,
    );
    if (revokeAt === "reservation")
      assert.deepEqual(settlements, [
        {
          reservationId: "reservation",
          disposition: "released",
          amountFen: 0,
        },
      ]);
  }
});

test("a cleared and re-enabled epoch invalidates an in-flight search", async () => {
  let epoch = 1;
  const transitions = [];
  let embedded = false;
  const service = createMediaRetrievalUserService({
    repository: {
      ...repositoryForSearch({ transitions }),
      getMediaRetrievalProfile: async () => ({
        ...enabledProfile(),
        indexEpoch: epoch,
      }),
    },
    provider: {
      getRuntimeStatus: () => ({ configured: true, enabled: true, providerCallsEnabled: true }),
      parseRetrievalQuery: async () => {
        epoch = 3;
        return {
          visualQuery: "a yellow dress outdoors",
          identityTerms: [],
          parseConfidence: "high",
        };
      },
      embedText: async () => {
        embedded = true;
        return VECTOR;
      },
    },
  });
  await assert.rejects(
    service.searchMediaRetrieval({
      userId: USER_ID,
      query: "a yellow dress outdoors",
    }),
    (error) => error.code === "retrieval_purge_incomplete",
  );
  assert.equal(embedded, false);
  assert.equal(transitions.at(-1).failureCode, "retrieval_purge_incomplete");
});

test("an empty recall skips paid reranking while rerank failure cannot become empty success", async () => {
  for (const hasCandidate of [false, true]) {
    let reranks = 0;
    const transitions = [];
    const service = createMediaRetrievalUserService({
      repository: {
        ...repositoryForSearch({ transitions }),
        searchMediaRetrievalSegments: async () =>
          hasCandidate
            ? [
                {
                  mediaAssetId: "owner-asset",
                  kind: "image",
                  score: 0.8,
                  descriptor: {
                    clothing: [],
                    scene: ["outdoors"],
                    actions: [],
                    objects: ["bicycle"],
                  },
                },
              ]
            : [],
      },
      provider: {
        getRuntimeStatus: () => ({ configured: true, enabled: true, providerCallsEnabled: true }),
        getIndexingProvenance: getTestIndexingProvenance,
        parseRetrievalQuery: async () => ({
          visualQuery: "a bicycle outdoors",
          identityTerms: [],
          parseConfidence: "high",
        }),
        embedText: async () => VECTOR,
        rerankMediaCandidates: async () => {
          reranks += 1;
          throw new Error("private failure");
        },
      },
    });
    const request = service.searchMediaRetrieval({
      userId: USER_ID,
      query: "a bicycle outdoors",
    });
    if (hasCandidate) {
      await assert.rejects(request, (error) => error.code === "retrieval_service_unavailable");
      assert.equal(transitions.at(-1).lifecycleStatus, "blocked");
    } else {
      assert.deepEqual((await request).results, []);
      assert.equal(transitions.at(-1).lifecycleStatus, "succeeded");
    }
    assert.equal(reranks, hasCandidate ? 1 : 0);
  }
});

test("actual search service persists provider failures only through the canonical error allowlist", async () => {
  const rawMarker = "provider-body-Summer-secret";
  const cases = [
    {
      label: "unknown code",
      code: rawMarker,
      expectedCode: "retrieval_service_unavailable",
      expectedStatus: 503,
      expectedRetryable: true,
    },
    {
      label: "empty code",
      code: "",
      expectedCode: "retrieval_service_unavailable",
      expectedStatus: 503,
      expectedRetryable: true,
    },
    {
      label: "non-string code",
      code: 7,
      expectedCode: "retrieval_service_unavailable",
      expectedStatus: 503,
      expectedRetryable: true,
    },
    {
      label: "overlong code",
      code: "x".repeat(121),
      expectedCode: "retrieval_service_unavailable",
      expectedStatus: 503,
      expectedRetryable: true,
    },
    {
      label: "known policy code",
      code: "retrieval_policy_unverifiable",
      expectedCode: "retrieval_policy_unverifiable",
      expectedStatus: 422,
      expectedRetryable: false,
    },
  ];

  for (const scenario of cases) {
    const transitions = [];
    const searched = [];
    let parseCalls = 0;
    let embedTextCalls = 0;
    const providerMessage = `raw provider message ${rawMarker}`;
    const service = createMediaRetrievalUserService({
      provider: {
        getRuntimeStatus: () => ({ configured: true, enabled: true, providerCallsEnabled: true }),
        parseRetrievalQuery: async () => {
          parseCalls += 1;
          throw Object.assign(new Error(providerMessage), { code: scenario.code });
        },
        embedText: async () => {
          embedTextCalls += 1;
          return VECTOR;
        },
      },
      repository: repositoryForSearch({ searched, transitions }),
    });

    let serviceError = null;
    await assert.rejects(
      () => service.searchMediaRetrieval({ userId: USER_ID, query: "yellow dress on a beach" }),
      (error) => {
        serviceError = error;
        return error instanceof MediaRetrievalServiceError &&
          error.code === scenario.expectedCode &&
          error.status === scenario.expectedStatus &&
          error.retryable === scenario.expectedRetryable;
      },
      scenario.label,
    );
    const publicError = toPublicMediaRetrievalError(serviceError);
    const safeOutput = JSON.stringify({
      error: { code: serviceError.code, message: serviceError.message, status: serviceError.status, retryable: serviceError.retryable },
      publicError,
      transitions,
    });
    assert.equal(parseCalls, 1, scenario.label);
    assert.equal(embedTextCalls, 0, scenario.label);
    assert.equal(searched.length, 0, scenario.label);
    assert.equal(transitions.at(-1)?.failureCode, scenario.expectedCode, scenario.label);
    assert.equal(publicError.code, scenario.expectedCode, scenario.label);
    assert.equal(safeOutput.includes(rawMarker), false, scenario.label);
    assert.equal(safeOutput.includes(providerMessage), false, scenario.label);
  }
});
