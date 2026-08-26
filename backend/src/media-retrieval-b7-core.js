import {
  B7_PRODUCT_BASELINE_METHOD,
  b7LocalTerms,
  inspectB7ProductBaselineCandidates,
} from "./media-retrieval-b7-baseline.js";
import {
  buildVisualEmbeddingInput,
  verifyVisualEmbeddingBinding,
} from "./media-retrieval-embedding-input.js";

const boundedLimit = (value, fallback = 10) => {
  const parsed = Number(value);
  return Math.min(20, Math.max(1, Number.isInteger(parsed) ? parsed : fallback));
};

const candidateLimitFor = (limit) => Math.min(160, Math.max(20, boundedLimit(limit) * 8));

const uniqueIdentityTerms = (values) => Array.from(new Set(
  (Array.isArray(values) ? values : [])
    .map((value) => String(value || "").normalize("NFKC").trim().slice(0, 80))
    .filter(Boolean),
)).slice(0, 12);

const verifyB7VisualEmbedding = (binding, options = {}) => {
  try {
    return verifyVisualEmbeddingBinding(binding, options);
  } catch (cause) {
    const error = new TypeError("B7 visual embedding binding does not match the product embedding space.");
    error.code = "b7_embedding_space_mismatch";
    error.cause = cause;
    throw error;
  }
};

const executionModeFor = ({ vectorStageUsed, exactIdentityStageUsed, localLexicalStageUsed }) => {
  if (vectorStageUsed && exactIdentityStageUsed) return "visual-vector-exact-local";
  if (vectorStageUsed && localLexicalStageUsed) return "visual-vector-local";
  if (exactIdentityStageUsed && localLexicalStageUsed) return "exact-visual-local";
  if (exactIdentityStageUsed) return "exact-only";
  if (vectorStageUsed) return "visual-vector";
  if (localLexicalStageUsed) return "visual-local";
  return "no-executable-stage";
};

// B7 is the online product baseline. It executes only owner-scoped product
// repository stages and intentionally has no snapshot or evaluator inputs.
export async function retrieveB7ProductBaselineCore({
  repository,
  userId,
  normalizedQuery,
  queryEmbedding = null,
  queryVector = null,
  expectedEmbeddingConfigurationHash = null,
  expectedEmbeddingSpace = null,
  kind = null,
  albumId = null,
  limit = 10,
  allowLocalLexical = true,
} = {}) {
  if (!repository || typeof repository.searchMediaRetrievalSegments !== "function") {
    throw new TypeError("B7 retrieval requires the product media retrieval repository.");
  }
  if (queryVector !== null && queryVector !== undefined) {
    throw new TypeError("B7 retrieval requires a verified visual embedding binding, not a bare vector.");
  }

  const suppliedVisualQuery = String(normalizedQuery?.visualQuery || "").trim().slice(0, 240);
  const suppliedIdentityTerms = uniqueIdentityTerms(normalizedQuery?.identityTerms);
  if (!suppliedVisualQuery && !suppliedIdentityTerms.length) {
    throw new TypeError("B7 retrieval requires a visual query or an exact identity constraint.");
  }
  if (suppliedVisualQuery && !suppliedIdentityTerms.length && !queryEmbedding) {
    const error = new TypeError("B7 visual-only retrieval requires a verified visual embedding binding.");
    error.code = "b7_visual_embedding_required";
    throw error;
  }

  const boundInput = queryEmbedding?.input || null;
  const visualInput = boundInput
    ? verifyB7VisualEmbedding(queryEmbedding).input
    : buildVisualEmbeddingInput({ rawQuery: suppliedVisualQuery });
  if (boundInput && (suppliedVisualQuery !== visualInput.text || suppliedIdentityTerms.length)) {
    throw new TypeError("B7 normalized query does not match its verified visual embedding binding.");
  }

  const identityTerms = boundInput
    ? []
    : suppliedIdentityTerms.length
      ? suppliedIdentityTerms
      : uniqueIdentityTerms(visualInput.identityTerms);
  const visualQuery = visualInput.mode === "visual"
    ? visualInput.typedClauses.map((clause) => clause.value).join(" ")
    : "";
  const verifiedEmbedding = queryEmbedding
    ? verifyB7VisualEmbedding(queryEmbedding, { expectedInput: visualInput, expectedEmbeddingSpace })
    : null;
  if (
    verifiedEmbedding &&
    expectedEmbeddingConfigurationHash !== null &&
    expectedEmbeddingConfigurationHash !== undefined &&
    verifiedEmbedding.configurationHash !== String(expectedEmbeddingConfigurationHash)
  ) {
    throw new TypeError("B7 embedding binding configuration does not match the product index.");
  }

  const resolvedLimit = boundedLimit(limit);
  const candidateLimit = candidateLimitFor(resolvedLimit);
  const localTerms = b7LocalTerms(visualQuery);
  const useVectorStage = Boolean(verifiedEmbedding?.vector);
  const useExactIdentityStage = identityTerms.length > 0;
  const useLocalLexicalStage = Boolean(allowLocalLexical && visualInput.mode === "visual" && localTerms.length);
  if (visualQuery && !useLocalLexicalStage) {
    throw new TypeError("B7 visual retrieval requires its local lexical stage.");
  }

  const stages = [];
  const runStage = async (stage, input) => {
    const rows = await repository.searchMediaRetrievalSegments(input);
    if (!Array.isArray(rows)) throw new TypeError("B7 product repository stage must return an array.");
    stages.push({ stage, rowCount: rows.length });
    return rows;
  };
  const candidates = [];

  if (useVectorStage) {
    candidates.push(...await runStage("vector", {
      userId,
      vector: verifiedEmbedding.vector,
      lexicalTerms: [],
      identityTerms: [],
      kind,
      albumId,
      limit: candidateLimit,
    }));
  }
  if (useExactIdentityStage) {
    candidates.push(...await runStage("exact-identity", {
      userId,
      vector: null,
      lexicalTerms: [],
      identityTerms,
      kind,
      albumId,
      limit: candidateLimit,
    }));
  }
  if (useLocalLexicalStage) {
    candidates.push(...await runStage("local-lexical", {
      userId,
      vector: null,
      lexicalTerms: localTerms,
      identityTerms,
      kind,
      albumId,
      limit: candidateLimit,
    }));
  }

  const diagnostics = inspectB7ProductBaselineCandidates({
    candidates,
    visualQuery,
    identityTerms,
    limit: resolvedLimit,
  });
  const execution = Object.freeze({
    vectorStageUsed: useVectorStage,
    exactIdentityStageUsed: useExactIdentityStage,
    localLexicalStageUsed: useLocalLexicalStage,
  });

  return {
    method: B7_PRODUCT_BASELINE_METHOD,
    executionMode: executionModeFor(execution),
    execution,
    stages,
    results: diagnostics.results,
    diagnostics,
  };
}
