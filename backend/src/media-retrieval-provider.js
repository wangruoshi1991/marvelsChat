import { getMediaRetrievalConfigStatus } from "./config.js";
import {
  MEDIA_RETRIEVAL_LIMITS,
  MEDIA_RETRIEVAL_PROVIDER_PATHS,
} from "./media-retrieval-constants.js";
import { normalizeDescriptor, normalizeRetrievalQuery } from "./media-retrieval-policy.js";
import { verifyVisualEmbeddingInput } from "./media-retrieval-embedding-input.js";
import {
  createDescriptorProvenance,
  createEmbeddingProvenance,
} from "./media-retrieval-provenance.js";

const REQUEST_TIMEOUT_MS = 30_000;

export class MediaRetrievalProviderError extends Error {
  constructor(code, message = "Media retrieval service is unavailable.", status = 503) {
    super(message);
    this.name = "MediaRetrievalProviderError";
    this.code = code;
    this.status = status;
  }
}

const getRetrievalConfig = (runtimeConfig) => runtimeConfig?.mediaRetrieval || runtimeConfig || {};

const extractText = (payload) => {
  const content = payload?.output?.choices?.[0]?.message?.content;
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    const text = content.find((item) => typeof item?.text === "string")?.text;
    if (text) return text;
  }
  if (typeof payload?.output?.text === "string") return payload.output.text;
  return "";
};

const parseJsonObject = (value) => {
  if (value && typeof value === "object") return value;
  if (typeof value !== "string") return null;
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
};

const readEmbedding = (payload) => {
  const vector = payload?.output?.embeddings?.[0]?.embedding || payload?.embeddings?.[0]?.embedding;
  if (
    !Array.isArray(vector) ||
    vector.length !== MEDIA_RETRIEVAL_LIMITS.embeddingDimension ||
    vector.some((value) => !Number.isFinite(value))
  ) {
    throw new MediaRetrievalProviderError("retrieval_service_unavailable");
  }
  return vector;
};

const querySystemPrompt = [
  "Return one JSON object with visualQuery, identityTerms, and parseConfidence.",
  "Identify name-like, celebrity-like, nickname-like, role-like, or character-like wording as identityTerms.",
  "visualQuery must contain only visual traits such as clothing, color, scene, action, and objects.",
  "Do not infer identity, age, gender, race, nationality, health, religion, politics, or personality.",
].join(" ");

const descriptorSystemPrompt = [
  "Return one JSON object with only summary, clothing, scene, actions, objects, ocrText, and qualitySignals.",
  "Use concrete visible visual details only. Each clothing item must contain type and color.",
  "Do not state or infer identity, names, celebrities, age, gender, race, nationality, health, religion, politics, personality, or face attributes.",
].join(" ");

export function createMediaRetrievalProvider({
  config,
  fetchImpl = globalThis.fetch,
  now = () => Date.now(),
  timeoutMs = REQUEST_TIMEOUT_MS,
} = {}) {
  const retrieval = getRetrievalConfig(config);
  const indexingProvenance = Object.freeze({
    descriptorProvenance: createDescriptorProvenance({
      modelId: retrieval.captionModel || "qwen3.6-flash",
      modelVersion: retrieval.captionModelVersion || retrieval.captionModel || "qwen3.6-flash",
      configuration: {
        provider: "dashscope-compatible-v1",
        apiBaseUrl: retrieval.dashscopeApiBaseUrl || "not-configured",
        endpoint: MEDIA_RETRIEVAL_PROVIDER_PATHS.multimodalGeneration,
        responseFormat: "json_object",
        promptVersion: "media-retrieval-descriptor-prompt-v1",
      },
    }),
    embeddingProvenance: createEmbeddingProvenance({
      modelId: retrieval.embeddingModel || "qwen3-vl-embedding",
      modelVersion: retrieval.embeddingModelVersion || retrieval.embeddingModel || "qwen3-vl-embedding",
      dimension: retrieval.embeddingDimension || MEDIA_RETRIEVAL_LIMITS.embeddingDimension,
      normalization: retrieval.embeddingNormalization || "provider-native-dense-v1",
      configuration: {
        provider: "dashscope-compatible-v1",
        apiBaseUrl: retrieval.dashscopeApiBaseUrl || "not-configured",
        endpoint: MEDIA_RETRIEVAL_PROVIDER_PATHS.multimodalEmbedding,
        outputType: "dense",
      },
    }),
  });

  const assertEligible = (reservation) => {
    if (!retrieval.enabled || !retrieval.providerCallsEnabled) {
      throw new MediaRetrievalProviderError("retrieval_not_enabled", "Media retrieval is not enabled.", 503);
    }
    if (!retrieval.dashscopeApiKey || !retrieval.dashscopeApiBaseUrl) {
      throw new MediaRetrievalProviderError("retrieval_service_unavailable");
    }
    if (!reservation?.reserved) {
      throw new MediaRetrievalProviderError("retrieval_budget_exhausted", "Media retrieval budget is unavailable.", 503);
    }
  };

  const request = async ({ path, body, reservation }) => {
    assertEligible(reservation);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetchImpl(`${retrieval.dashscopeApiBaseUrl}${path}`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${retrieval.dashscopeApiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
      if (!response?.ok) {
        throw new MediaRetrievalProviderError("retrieval_service_unavailable");
      }
      try {
        return await response.json();
      } catch {
        throw new MediaRetrievalProviderError("retrieval_service_unavailable");
      }
    } catch (error) {
      if (error instanceof MediaRetrievalProviderError) throw error;
      throw new MediaRetrievalProviderError("retrieval_service_unavailable");
    } finally {
      clearTimeout(timer);
      void now();
    }
  };

  const callGeneration = async ({ systemPrompt, content, reservation }) =>
    request({
      path: MEDIA_RETRIEVAL_PROVIDER_PATHS.multimodalGeneration,
      reservation,
      body: {
        model: retrieval.captionModel,
        input: {
          messages: [
            { role: "system", content: [{ text: systemPrompt }] },
            { role: "user", content },
          ],
        },
        parameters: {
          result_format: "message",
          response_format: { type: "json_object" },
        },
      },
    });

  const callEmbedding = async ({ contents, reservation }) => {
    const payload = await request({
      path: MEDIA_RETRIEVAL_PROVIDER_PATHS.multimodalEmbedding,
      reservation,
      body: {
        model: retrieval.embeddingModel,
        input: { contents },
        parameters: {
          dimension: MEDIA_RETRIEVAL_LIMITS.embeddingDimension,
          output_type: "dense",
        },
      },
    });
    return readEmbedding(payload);
  };

  return {
    async parseRetrievalQuery({ query, reservation }) {
      const payload = await callGeneration({
        systemPrompt: querySystemPrompt,
        content: [{ text: String(query || "").slice(0, 240) }],
        reservation,
      });
      const normalized = normalizeRetrievalQuery(parseJsonObject(extractText(payload)));
      if (!normalized) {
        throw new MediaRetrievalProviderError(
          "retrieval_policy_unverifiable",
          "Media retrieval output could not be verified.",
          422,
        );
      }
      return normalized;
    },

    async describeImage({ imageUrl, reservation }) {
      const payload = await callGeneration({
        systemPrompt: descriptorSystemPrompt,
        content: [{ image: String(imageUrl || "") }, { text: "Describe the visible scene." }],
        reservation,
      });
      const descriptor = normalizeDescriptor(parseJsonObject(extractText(payload)));
      if (!descriptor) {
        throw new MediaRetrievalProviderError("retrieval_policy_unverifiable", "Media retrieval output could not be verified.", 422);
      }
      return descriptor;
    },

    async embedImage({ imageUrl, reservation }) {
      return callEmbedding({ contents: [{ image: String(imageUrl || "") }], reservation });
    },

    async embedText({ input, reservation }) {
      const verified = verifyVisualEmbeddingInput(input);
      return callEmbedding({ contents: [{ text: verified.text }], reservation });
    },

    getIndexingProvenance() {
      return indexingProvenance;
    },

    getRuntimeStatus() {
      return getMediaRetrievalConfigStatus({ mediaRetrieval: retrieval });
    },
  };
}
