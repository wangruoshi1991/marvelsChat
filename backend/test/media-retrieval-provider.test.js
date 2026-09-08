import assert from "node:assert/strict";
import test from "node:test";

process.env.DEFAULT_ADMIN_PASSWORD ||= "test-only-password";

const { createMediaRetrievalProvider } = await import("../src/media-retrieval-provider.js");
const { buildVisualEmbeddingInput } = await import("../src/media-retrieval-embedding-input.js");

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

const approvedReservation = { reserved: true, reservationId: "reservation-123" };

function responseJson(payload, ok = true, status = 200) {
  return {
    ok,
    status,
    json: async () => payload,
  };
}

test("provider uses documented Model Studio endpoints and never adds identity text to an embedding request", async () => {
  const requests = [];
  const provider = createMediaRetrievalProvider({
    config: configuredRuntime,
    fetchImpl: async (url, options) => {
      requests.push({ url, options });
      if (String(url).includes("multimodal-generation")) {
        return responseJson({
          output: {
            choices: [{
              message: {
                content: [{ text: JSON.stringify({
                  visualQuery: "黄色连衣裙 户外",
                  identityTerms: ["示例姓名"],
                  parseConfidence: "high",
                }) }],
              },
            }],
          },
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
  assert.equal(query.visualQuery.includes("示例姓名"), false);
  assert.equal(query.parseConfidence, "high");

  const parserIdentityInput = buildVisualEmbeddingInput({
    rawQuery: "黄色连衣裙户外",
    candidate: query,
  });
  assert.equal(parserIdentityInput.mode, "exact-only");
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
      candidate: { visualQuery: "untrusted", identityTerms: [], parseConfidence: "high" },
    }),
    traceId: "b".repeat(32),
    reservation: approvedReservation,
  });
  assert.equal(vector.length, 1024);
  assert.match(requests[0].url, /\/services\/aigc\/multimodal-generation\/generation$/);
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
        candidate: { visualQuery: "黄色连衣裙", identityTerms: [], parseConfidence: "high" },
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
        candidate: { visualQuery: "黄色衣服", identityTerms: [], parseConfidence: "high" },
      }),
      reservation: approvedReservation,
    }),
    (error) => error.code === "retrieval_not_enabled",
  );
  const status = provider.getRuntimeStatus();
  assert.equal(JSON.stringify(status).includes("test-key-not-for-network"), false);
  assert.equal(JSON.stringify(status).includes("workspace.cn-beijing"), false);
});
