import { getMediaRetrievalConfigStatus } from "./config.js";
import {
  MEDIA_RETRIEVAL_LIMITS,
  MEDIA_RETRIEVAL_PROVIDER_PATHS,
} from "./media-retrieval-constants.js";
import { descriptorSchema, normalizeDescriptor, normalizeRetrievalQuery, MEDIA_RETRIEVAL_VISUAL_DESCRIPTOR_PROJECTION_VERSION } from "./media-retrieval-policy.js";
import { mediaRetrievalParserResponseSchema } from "./media-retrieval-parser-response.js";
import { projectMediaRetrievalDiagnostic } from "./media-retrieval-errors.js";
import { recordMediaRetrievalDiagnostic } from "./media-retrieval-diagnostics.js";
import { DESCRIPTOR_PROMPT_VERSION, descriptorSystemPrompt, querySystemPrompt, rerankSystemPrompt } from "./media-retrieval-prompts.js";
import { verifyVisualEmbeddingInput } from "./media-retrieval-embedding-input.js";
import {
  createDescriptorProvenance,
  createEmbeddingProvenance,
} from "./media-retrieval-provenance.js";
import { mediaRetrievalRerankResponseSchema, projectMediaRetrievalRerankCandidates, validateMediaRetrievalRerankResponse } from "./media-retrieval-reranker.js";

const REQUEST_TIMEOUT_MS = 30_000;

export class MediaRetrievalProviderError extends Error {
  constructor(code, message = "Media retrieval service is unavailable.", status = 503, diagnostic = null) {
    super(message);
    this.name = "MediaRetrievalProviderError";
    this.code = code;
    this.status = status;
    this.diagnostic = projectMediaRetrievalDiagnostic(diagnostic);
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

const schemaPathsFor = (schema, candidate) => {
  const result = schema.safeParse(candidate);
  if (result.success) return ["response.policy"];
  return result.error.issues.map((issue) => issue.path.reduce((path, part) =>
    typeof part === "number" ? `${path}[]` : `${path}${path ? "." : ""}${part}`, "") || "response");
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

export function createMediaRetrievalProvider({
  config,
  fetchImpl = globalThis.fetch,
  now = () => Date.now(),
  timeoutMs = REQUEST_TIMEOUT_MS,
  recordDiagnostic = recordMediaRetrievalDiagnostic,
  recordUsage = null,
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
        promptVersion: DESCRIPTOR_PROMPT_VERSION,
        enableThinking: false,
        visualProjectionVersion: MEDIA_RETRIEVAL_VISUAL_DESCRIPTOR_PROJECTION_VERSION,
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

  const failure = (operation, stage, details = {}) => new MediaRetrievalProviderError(
    "retrieval_service_unavailable", "Media retrieval service is unavailable.", 503,
    { operation, stage, ...details },
  );

  const readBoundedJson = async (response, operation) => {
    const contentLength = response?.headers?.get?.("content-length");
    if (/^\d+$/.test(contentLength || "") && Number(contentLength) > MEDIA_RETRIEVAL_LIMITS.providerResponseMaxBytes) {
      throw failure(operation, "response-json", { httpStatus: response?.status, schemaPaths: ["response"] });
    }
    if (!response?.body || typeof response.body.getReader !== "function") {
      throw failure(operation, "response-json", { httpStatus: response?.status, schemaPaths: ["response"] });
    }
    const reader = response.body.getReader();
    const chunks = [];
    let byteLength = 0;
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        byteLength += value.byteLength;
        if (byteLength > MEDIA_RETRIEVAL_LIMITS.providerResponseMaxBytes) {
          await reader.cancel().catch(() => {});
          throw failure(operation, "response-json", { httpStatus: response.status, schemaPaths: ["response"] });
        }
        chunks.push(Buffer.from(value));
      }
      return JSON.parse(Buffer.concat(chunks, byteLength).toString("utf8"));
    } catch (error) {
      if (error instanceof MediaRetrievalProviderError) throw error;
      throw failure(operation, "response-json", { httpStatus: response?.status, schemaPaths: ["response"] });
    }
  };

  const withDiagnostic = async ({ operation, reservation }, invoke) => {
    try {
      return await invoke();
    } catch (error) {
      if (error instanceof MediaRetrievalProviderError && error.diagnostic) {
        try {
          await recordDiagnostic({ reservationId: reservation?.reservationId, failureCode: error.code, diagnostic: error.diagnostic });
        } catch {
          // A failed audit write is an explicit failure. Keep only the bounded
          // diagnostic in service logs; never serialize the database exception.
          console.error(JSON.stringify({ type: "media_retrieval_diagnostic_write_failed", operation, diagnostic: error.diagnostic }));
          throw new MediaRetrievalProviderError("retrieval_repository_write_failed");
        }
      }
      throw error;
    }
  };

  const request = async ({ path, body, reservation, operation }) => {
    assertEligible(reservation);
    const controller = new AbortController();
    const requestTimeoutMs = operation === "image-description" ? retrieval.captionTimeoutMs ?? timeoutMs : timeoutMs;
    const timer = setTimeout(() => controller.abort(), requestTimeoutMs);
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
        let payload;
        try { payload = await readBoundedJson(response, operation); } catch { /* No provider body is retained. */ }
        throw failure(operation, "http-response", { httpStatus: response?.status, providerCode: payload?.code });
      }
      const payload = await readBoundedJson(response, operation);
      if (typeof recordUsage === "function") {
        const usage = Object.fromEntries(["input_tokens", "output_tokens", "image_tokens", "total_tokens"].map((key) => [
          key, Number.isSafeInteger(payload?.usage?.[key]) && payload.usage[key] >= 0 ? payload.usage[key] : null,
        ]));
        await recordUsage({ operation, usage });
      }
      return payload;
    } catch (error) {
      if (error instanceof MediaRetrievalProviderError) throw error;
      throw failure(operation, error?.name === "AbortError" ? "timeout" : "transport");
    } finally {
      clearTimeout(timer);
      void now();
    }
  };

  const callGeneration = async ({ systemPrompt, content, reservation, operation }) =>
    request({
      path: MEDIA_RETRIEVAL_PROVIDER_PATHS.multimodalGeneration,
      reservation,
      operation,
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
          enable_thinking: false,
        },
      },
    });

  const callEmbedding = async ({ contents, reservation, operation }) => {
    const payload = await request({
      path: MEDIA_RETRIEVAL_PROVIDER_PATHS.multimodalEmbedding,
      reservation,
      operation,
      body: {
        model: retrieval.embeddingModel,
        input: { contents },
        parameters: {
          dimension: MEDIA_RETRIEVAL_LIMITS.embeddingDimension,
          output_type: "dense",
        },
      },
    });
    try {
      return readEmbedding(payload);
    } catch {
      throw failure(operation, "embedding-validation", { httpStatus: 200, schemaPaths: ["embedding"] });
    }
  };

  return {
    async parseRetrievalQuery({ query, reservation }) {
      const operation = "query-parse";
      return withDiagnostic({ operation, reservation }, async () => {
        const payload = await callGeneration({
          systemPrompt: querySystemPrompt,
          content: [{ text: String(query || "").slice(0, 240) }],
          reservation,
          operation,
        });
        const candidate = parseJsonObject(extractText(payload));
        const normalized = normalizeRetrievalQuery(candidate);
        if (!normalized) {
          throw new MediaRetrievalProviderError(
            "retrieval_policy_unverifiable",
            "Media retrieval output could not be verified.",
            422,
            { operation, stage: "query-validation", httpStatus: 200, schemaPaths: schemaPathsFor(mediaRetrievalParserResponseSchema, candidate) },
          );
        }
        return normalized;
      });
    },

    async rerankMediaCandidates({ query, candidates, reservation }) {
      const operation = "query-rerank";
      return withDiagnostic({ operation, reservation }, async () => {
        const normalizedCandidates = projectMediaRetrievalRerankCandidates(candidates);
        const payload = await callGeneration({
          systemPrompt: rerankSystemPrompt,
          content: [{ text: JSON.stringify({
            query: String(query || "").slice(0, 240),
            candidates: normalizedCandidates,
          }) }],
          reservation,
          operation,
        });
        const candidate = parseJsonObject(extractText(payload));
        const validated = validateMediaRetrievalRerankResponse(candidate, normalizedCandidates);
        if (!validated) {
          const schemaPaths = schemaPathsFor(mediaRetrievalRerankResponseSchema, candidate);
          throw new MediaRetrievalProviderError("retrieval_policy_unverifiable", "Media retrieval output could not be verified.", 422,
            { operation, stage: "rerank-validation", httpStatus: 200,
              schemaPaths: schemaPaths.length === 1 && schemaPaths[0] === "response.policy"
                ? ["matches[].candidateKey"] : schemaPaths });
        }
        return validated.map((match) => {
          const sourceCandidate = candidates[Number(match.candidateKey.slice(1))];
          return {
            ...sourceCandidate,
            matchReasons: ["semantic-match"],
            score: match.relevance === "high" ? 0.8 : 0.6,
          };
        });
      });
    },

    async describeImage({ imageUrl, reservation }) {
      const operation = "image-description";
      return withDiagnostic({ operation, reservation }, async () => {
        const payload = await callGeneration({
          systemPrompt: descriptorSystemPrompt,
          content: [{ image: String(imageUrl || "") }, { text: "Describe the visible scene." }],
          reservation,
          operation,
        });
        const candidate = parseJsonObject(extractText(payload));
        const descriptor = normalizeDescriptor(candidate);
        if (!descriptor) {
          throw new MediaRetrievalProviderError("retrieval_policy_unverifiable", "Media retrieval output could not be verified.", 422,
            { operation, stage: "descriptor-validation", httpStatus: 200, schemaPaths: schemaPathsFor(descriptorSchema, candidate) });
        }
        return descriptor;
      });
    },

    async embedImage({ imageUrl, reservation }) {
      const operation = "image-embedding";
      return withDiagnostic({ operation, reservation }, () => callEmbedding({ contents: [{ image: String(imageUrl || "") }], reservation, operation }));
    },

    async embedText({ input, reservation }) {
      const verified = verifyVisualEmbeddingInput(input);
      const operation = "query-embedding";
      return withDiagnostic({ operation, reservation }, () => callEmbedding({ contents: [{ text: verified.semanticText || verified.text }], reservation, operation }));
    },

    getIndexingProvenance() {
      return indexingProvenance;
    },

    getRuntimeStatus() {
      return getMediaRetrievalConfigStatus({ mediaRetrieval: retrieval });
    },
  };
}
