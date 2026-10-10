import assert from "node:assert/strict";
import test from "node:test";
import { visualFixture } from "./helpers/media-retrieval-visual-fixture.js";

process.env.DEFAULT_ADMIN_PASSWORD ||= "test-only-password";

const { createMediaRetrievalProvider: createProvider } = await import("../src/media-retrieval-provider.js");
const createMediaRetrievalProvider = (input) => createProvider({ recordDiagnostic: async () => {}, ...input });
const { buildVisualEmbeddingInput } = await import("../src/media-retrieval-embedding-input.js");

const configuredRuntime = {
  newApi: { baseUrl: "https://query-model.example/chat/completions", apiKey: "test-query-key", model: "test-dialogue-model" },
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

const approvedReservation = { reserved: true, reservationId: "reservation-123" };

function responseJson(payload, ok = true, status = 200) {
  return new Response(JSON.stringify(payload), { status: ok ? status : Math.max(400, status) });
}

test("provider uses documented Model Studio endpoints and never adds identity text to an embedding request", async () => {
  const requests = [];
  const provider = createMediaRetrievalProvider({
    config: configuredRuntime,
    fetchImpl: async (url, options) => {
      requests.push({ url, options });
      if (String(url).includes("query-model.example")) {
        return responseJson({
          choices: [{
              message: {
                content: JSON.stringify({
                  spans: [{ text: "示例姓名", role: "identity" }, { text: " 穿黄色连衣裙的户外", role: "visual" }, { text: "照片", role: "syntax" }],
                  parseConfidence: "high",
                }),
              },
          }],
        });
      }
      return responseJson({ output: { embeddings: [{ embedding: Array.from({ length: 1024 }, () => 0.1) }] } });
    },
  });

  const query = await provider.parseRetrievalQuery({
    query: "示例姓名 穿黄色连衣裙的户外照片",
    traceId: "a".repeat(32),
    reservation: approvedReservation,
  });
  assert.equal(query.spans[0].role, "identity");
  assert.equal(query.parseConfidence, "high");

  const parserIdentityInput = buildVisualEmbeddingInput({
    rawQuery: "黄色连衣裙户外",
    candidate: query,
  });
  assert.equal(parserIdentityInput.mode, "blocked");
  await assert.rejects(
    () => provider.embedText({
      input: parserIdentityInput,
      traceId: "b".repeat(32),
      reservation: approvedReservation,
    }),
    /embedding input is not visual-safe/i,
  );
  assert.equal(requests.length, 1);

  const vector = await provider.embedText({
    input: buildVisualEmbeddingInput({
      rawQuery: "黄色连衣裙户外",
      candidate: { spans: [{ text: "黄色连衣裙户外", role: "visual" }], parseConfidence: "high" },
    }),
    traceId: "b".repeat(32),
    reservation: approvedReservation,
  });
  assert.equal(vector.length, 1024);
  assert.equal(requests[0].url, configuredRuntime.newApi.baseUrl);
  assert.equal(JSON.parse(requests[0].options.body).model, configuredRuntime.newApi.model);
  assert.equal(requests[0].options.headers.Authorization, "Bearer test-query-key");
  assert.match(requests[1].url, /\/services\/embeddings\/multimodal-embedding\/multimodal-embedding$/);
  const embeddingBody = JSON.parse(requests[1].options.body);
  assert.deepEqual(embeddingBody.parameters, { dimension: 1024, output_type: "dense" });
  assert.equal(JSON.stringify(embeddingBody).includes("示例姓名"), false);
  assert.equal(requests[1].options.headers.Authorization.includes("test-key-not-for-network"), true);
  const provenance = provider.getIndexingProvenance();
  assert.equal(provenance.descriptorProvenance.modelId, "qwen3.6-flash");
  assert.equal(provenance.embeddingProvenance.dimension, 1024);
  assert.equal(JSON.stringify(provenance).includes("test-key-not-for-network"), false);
});

test("provider maps a timeout to a safe error without provider body, URL, or credential", async () => {
  const provider = createMediaRetrievalProvider({
    config: configuredRuntime,
    fetchImpl: async () => {
      const error = new Error("gateway https://internal.example/error secret=test-key-not-for-network");
      error.name = "AbortError";
      throw error;
    },
  });

  await assert.rejects(
    () => provider.embedText({
      input: buildVisualEmbeddingInput({
        rawQuery: "黄色连衣裙",
        candidate: { spans: [{ text: "黄色连衣裙", role: "visual" }], parseConfidence: "high" },
      }),
      traceId: "c".repeat(32),
      reservation: approvedReservation,
    }),
    (error) => {
      assert.equal(error.code, "retrieval_service_unavailable");
      assert.equal(String(error.message).includes("internal.example"), false);
      assert.equal(String(error.message).includes("test-key-not-for-network"), false);
      return true;
    },
  );
});

test("undocumented embedding and generation envelopes cannot activate a legacy response path", async () => {
  const vector = Array(1024).fill(0.1);
  for (const payload of [{ embeddings: [{ embedding: vector }] },
    { output: { embeddings: [{ embedding: vector }, { embedding: vector }] } }]) {
    const provider = createMediaRetrievalProvider({ config: configuredRuntime, fetchImpl: async () => responseJson(payload) });
    await assert.rejects(provider.embedImage({ imageUrl: visualFixture.imageUrl, reservation: approvedReservation }),
      error => error.code === "retrieval_service_unavailable");
  }
  const provider = createMediaRetrievalProvider({ config: configuredRuntime,
    fetchImpl: async () => responseJson({ output: { text: '{"matches":[]}' } }),
  });
  await assert.rejects(provider.rerankMediaCandidates({ query: "a ceramic vessel", visualConstraints: ["a ceramic vessel"],
    candidates: [{ ...visualFixture }], reservation: approvedReservation }),
    error => error.code === "retrieval_policy_unverifiable");
});

test("provider remains unavailable without an explicit enabled configuration and approved reservation", async () => {
  const provider = createMediaRetrievalProvider({
    config: { mediaRetrieval: { ...configuredRuntime.mediaRetrieval, enabled: false } },
    fetchImpl: async () => {
      throw new Error("must not be called");
    },
  });
  await assert.rejects(
    () => provider.embedText({
      input: buildVisualEmbeddingInput({
        rawQuery: "黄色衣服",
        candidate: { spans: [{ text: "黄色衣服", role: "visual" }], parseConfidence: "high" },
      }),
      reservation: approvedReservation,
    }),
    (error) => error.code === "retrieval_not_enabled",
  );
  const status = provider.getRuntimeStatus();
  assert.equal(JSON.stringify(status).includes("test-key-not-for-network"), false);
  assert.equal(JSON.stringify(status).includes("workspace.cn-beijing"), false);
});

test("provider rejects declared and streamed responses above the hard byte limit", async () => {
  const oversized = "x".repeat(512 * 1024 + 1);
  for (const response of [
    new Response("{}", { headers: { "Content-Length": String(512 * 1024 + 1) } }),
    new Response(oversized),
  ]) {
    const provider = createMediaRetrievalProvider({
      config: configuredRuntime,
      fetchImpl: async () => response,
    });
    await assert.rejects(
      () => provider.parseRetrievalQuery({ query: "yellow dress", reservation: approvedReservation }),
      (error) =>
        error.code === "retrieval_service_unavailable" &&
        error.diagnostic?.stage === "response-json" &&
        error.diagnostic?.schemaPaths?.includes("response"),
    );
  }
});

test("optional calibration usage records bounded token counts without copying provider content", async () => {
  const usage = [];
  const provider = createMediaRetrievalProvider({
    config: configuredRuntime,
    recordUsage: (value) => usage.push(value),
    fetchImpl: async () => responseJson({
      output: { embeddings: [{ embedding: Array.from({ length: 1024 }, () => 0.1) }] },
      usage: { input_tokens: 20, output_tokens: -1, image_tokens: "private", total_tokens: 20, secret: "do-not-copy" },
    }),
  });
  await provider.embedText({ input: buildVisualEmbeddingInput({ rawQuery: "photos of a bicycle", candidate: { spans: [{ text: "photos of a bicycle", role: "visual" }], parseConfidence: "high" } }), reservation: approvedReservation });
  assert.deepEqual(usage, [{ operation: "query-embedding",
    usage: { input_tokens: 20, output_tokens: null, image_tokens: null, total_tokens: 20 } }]);
});

test("reranking sends bound images without captions, descriptors, IDs or OCR and validates candidate keys", async () => {
  const requests = [];
  const provider = createMediaRetrievalProvider({
    config: configuredRuntime,
    fetchImpl: async (url, options) => {
      requests.push({ url, options });
      return responseJson({ output: { choices: [{ message: { content: [{ text: JSON.stringify({ matches: [
        { candidateKey: "c0", relevance: "high", constraintEvidence: [
          { constraintIndex: 0, citations: [{ field: "image", itemIndex: 0 }] },
          { constraintIndex: 1, citations: [{ field: "image", itemIndex: 0 }] },
        ] },
      ] }) }] } }] } });
    },
  });
  const candidates = [{
    ...visualFixture,
    mediaAssetId: "asset-safe",
    kind: "image",
    matchedFrameTimestampMs: null,
    summary: "private owner caption Alice",
    caption: "Alice",
    descriptor: { clothing: [{ type: "dress", color: "yellow" }], scene: ["beach"], actions: ["Alice standing"], objects: ["Alice label"], ocrText: ["Alice"] },
  }];
  const result = await provider.rerankMediaCandidates({
    query: "a yellow dress by the ocean",
    visualConstraints: ["a yellow dress", "by the ocean"],
    candidates,
    reservation: approvedReservation,
  });
  assert.equal(result.length, 1);
  assert.equal(result[0].mediaAssetId, "asset-safe");
  const requestBody = JSON.parse(requests[0].options.body);
  assert.equal(requestBody.parameters.temperature, 0);
  const promptPayload = requestBody.input.messages.at(-1).content[0].text;
  const sentData = JSON.parse(promptPayload);
  assert.deepEqual(sentData.visualConstraints, [{ constraintIndex: 0, text: "a yellow dress" }, { constraintIndex: 1, text: "by the ocean" }]);
  assert.equal(Object.hasOwn(sentData, "candidates"), false);
  assert.deepEqual(requestBody.input.messages.at(-1).content.slice(1), [
    { text: JSON.stringify({ candidateKey: "c0", imageItemIndex: 0 }) },
    { image: visualFixture.imageUrl },
  ]);
  assert.equal(promptPayload.includes("Alice"), false);
  assert.equal(promptPayload.includes("private owner caption"), false);
  assert.equal(promptPayload.includes("asset-safe"), false);

  const forgedProvider = createMediaRetrievalProvider({
    config: configuredRuntime,
    fetchImpl: async () => responseJson({ output: { choices: [{ message: { content: [{ text: JSON.stringify({ matches: [
      { candidateKey: "c99", relevance: "high" },
    ] }) }] } }] } }),
  });
  await assert.rejects(() => forgedProvider.rerankMediaCandidates({
    query: "dress",
    visualConstraints: ["dress"],
    candidates,
    reservation: approvedReservation,
  }), (error) => error.code === "retrieval_policy_unverifiable");
});

test("rerank constraints cannot be absent, unbound or oversized before a paid dispatch", async () => {
  let calls = 0;
  const provider = createMediaRetrievalProvider({ config: configuredRuntime, fetchImpl: async () => {
    calls += 1;
    throw new Error("invalid requirements must not reach network");
  } });
  for (const visualConstraints of [undefined, [], ["invented setting"], ["a".repeat(241)]]) {
    await assert.rejects(() => provider.rerankMediaCandidates({
      query: "a cat", visualConstraints, candidates: [], reservation: approvedReservation,
    }), error => error.code === "retrieval_policy_unverifiable");
  }
  assert.equal(calls, 0);
});

test("query parsing requires its own configured dialogue model and never falls back to the visual provider", async () => {
  let calls = 0;
  const provider = createMediaRetrievalProvider({
    config: { mediaRetrieval: configuredRuntime.mediaRetrieval },
    fetchImpl: async () => { calls += 1; throw new Error("must not dispatch"); },
  });
  assert.equal(provider.getRuntimeStatus().configured, false);
  assert.equal(provider.getRuntimeStatus().missing.includes("query-model-not-configured"), true);
  await assert.rejects(provider.parseRetrievalQuery({ query: "a bowl", reservation: approvedReservation }),
    error => error.code === "retrieval_service_unavailable");
  assert.equal(calls, 0);
});

test("Anthropic query transport uses the selected dialogue configuration and the same strict source schema", async () => {
  const requests = [];
  const provider = createMediaRetrievalProvider({
    config: { ...configuredRuntime, newApi: { baseUrl: "https://query-model.example/anthropic", apiKey: "test-query-key", model: "test-dialogue-model" } },
    fetchImpl: async (url, options) => {
      requests.push({ url, body: JSON.parse(options.body), headers: options.headers });
      return responseJson({ content: [{ type: "text", text: JSON.stringify({
        spans: [{ text: "a bowl", role: "visual" }], parseConfidence: "high",
      }) }] });
    },
  });
  const result = await provider.parseRetrievalQuery({ query: "a bowl", reservation: approvedReservation });
  assert.equal(result.spans[0].text, "a bowl");
  assert.equal(requests[0].url, "https://query-model.example/anthropic/v1/messages");
  assert.equal(requests[0].headers["x-api-key"], "test-query-key");
  assert.deepEqual(requests[0].body.messages, [{ role: "user", content: "a bowl" }]);
  assert.equal(requests[0].body.model, "test-dialogue-model");
  assert.equal(JSON.stringify(provider.getQueryParsingProvenance()).includes("test-query-key"), false);
});
