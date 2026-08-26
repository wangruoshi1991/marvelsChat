import crypto from "node:crypto";
import {
  MEDIA_RETRIEVAL_VISUAL_ONTOLOGY_VERSION,
  MEDIA_RETRIEVAL_VISUAL_GRAMMAR_VERSION,
  MEDIA_RETRIEVAL_VISUAL_SERIALIZATION_VERSION,
  analyzeTypedVisualQuery,
  normalizeVisualRawQuery,
  serializeTypedVisualClauses,
  verifyTypedVisualRepresentation,
} from "./media-retrieval-visual-language.js";
import { validateMediaRetrievalParserResponse } from "./media-retrieval-parser-response.js";

export const MEDIA_RETRIEVAL_EMBEDDING_POLICY_VERSION = "media-retrieval-typed-visual-policy-v5";
export const MEDIA_RETRIEVAL_EMBEDDING_NORMALIZATION_VERSION = "nfkc-whitespace-v1";
export const MEDIA_RETRIEVAL_VISUAL_EMBEDDING_INPUT_KIND = "media-retrieval-typed-visual-embedding-v2";

const uniqueTerms = (values) =>
  Array.from(
    new Set(
      (Array.isArray(values) ? values : [])
        .map((value) => String(value || "").normalize("NFKC").trim().slice(0, 80))
        .filter(Boolean),
    ),
  ).slice(0, 12);

const normalizedComparisonText = (value) =>
  String(value || "").normalize("NFKC").trim().toLocaleLowerCase();

const isWordCharacter = (value) => Boolean(value) && /[\p{L}\p{N}]/u.test(value);

// Parser identity terms can only survive as a local exact-only constraint when
// their normalized text is demonstrably present in the normalized user query.
// Han text is intentionally matched as an exact contiguous span because a
// whitespace-style word boundary would reject valid adjacent Han characters.
const parserTermCoversRawQuerySpan = ({ rawQuery, term }) => {
  const normalizedRawQuery = normalizedComparisonText(normalizeVisualRawQuery(rawQuery));
  const normalizedTerm = normalizedComparisonText(term);
  if (!normalizedRawQuery || !normalizedTerm) return false;

  const containsHan = /\p{Script=Han}/u.test(normalizedTerm);
  let position = normalizedRawQuery.indexOf(normalizedTerm);
  while (position >= 0) {
    const end = position + normalizedTerm.length;
    if (
      containsHan ||
      (!isWordCharacter(normalizedRawQuery[position - 1]) && !isWordCharacter(normalizedRawQuery[end]))
    ) {
      return true;
    }
    position = normalizedRawQuery.indexOf(normalizedTerm, position + 1);
  }
  return false;
};

const hash = (value) => crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex");

const textHashFor = ({ policyVersion, ontologyVersion, grammarVersion, normalizationVersion, serializationVersion, coverageDigest, text }) =>
  hash({ policyVersion, ontologyVersion, grammarVersion, normalizationVersion, serializationVersion, coverageDigest, text });

const vectorHashFor = (vector) => hash(vector);

const normalizeString = (value, field) => {
  const normalized = String(value || "").trim().slice(0, 160);
  if (!normalized) throw new TypeError(`Visual embedding binding requires ${field}.`);
  return normalized;
};

const normalizeDimension = (value, vector = null) => {
  const dimension = Number(value ?? vector?.length);
  if (!Number.isInteger(dimension) || dimension !== 1024) {
    throw new TypeError("Visual embedding binding requires a 1024-dimensional embedding space.");
  }
  return dimension;
};

const isFiniteEmbeddingVector = (value, dimension = 1024) =>
  Array.isArray(value) &&
  value.length === dimension &&
  value.every((item) => Number.isFinite(item));

const embeddingSpaceFor = ({ modelId, modelVersion, dimension, embeddingNormalization, configurationHash }, vector = null) => ({
  modelId: normalizeString(modelId, "modelId"),
  modelVersion: normalizeString(modelVersion, "modelVersion"),
  dimension: normalizeDimension(dimension, vector),
  normalization: normalizeString(embeddingNormalization || "l2-v1", "embeddingNormalization"),
  configurationHash: normalizeString(configurationHash, "configurationHash"),
});

const bindingHashFor = ({ input, vectorHash, embeddingSpace }) =>
  hash({
    kind: "media-retrieval-visual-embedding-binding-v2",
    textHash: input.textHash,
    policyVersion: input.policyVersion,
    ontologyVersion: input.ontologyVersion,
    grammarVersion: input.grammarVersion,
    normalizationVersion: input.normalizationVersion,
    serializationVersion: input.serializationVersion,
    coverageDigest: input.coverageDigest,
    rawQueryHash: input.rawQueryHash,
    vectorHash,
    embeddingSpace,
  });

const baseInput = ({ analysis, mode, reasonCode, exactOnlyIdentityTerms = analysis.unclassifiedTerms }) => {
  const policyVersion = MEDIA_RETRIEVAL_EMBEDDING_POLICY_VERSION;
  const ontologyVersion = MEDIA_RETRIEVAL_VISUAL_ONTOLOGY_VERSION;
  const grammarVersion = MEDIA_RETRIEVAL_VISUAL_GRAMMAR_VERSION;
  const normalizationVersion = MEDIA_RETRIEVAL_EMBEDDING_NORMALIZATION_VERSION;
  const serializationVersion = MEDIA_RETRIEVAL_VISUAL_SERIALIZATION_VERSION;
  const text = mode === "visual" ? serializeTypedVisualClauses(analysis.typedClauses) : "";
  const coverageDigest = analysis.coverageDigest;
  return {
    kind: MEDIA_RETRIEVAL_VISUAL_EMBEDDING_INPUT_KIND,
    policyVersion,
    ontologyVersion,
    grammarVersion,
    normalizationVersion,
    serializationVersion,
    rawQueryHash: analysis.rawQueryHash,
    rawLength: analysis.rawLength,
    typedClauses: analysis.typedClauses,
    coverage: analysis.coverage,
    coverageDigest,
    text,
    textHash: textHashFor({ policyVersion, ontologyVersion, grammarVersion, normalizationVersion, serializationVersion, coverageDigest, text }),
    identityTerms: mode === "visual" ? [] : uniqueTerms(exactOnlyIdentityTerms),
    mode,
    reasonCode,
  };
};

// The candidate parser is intentionally not an authority for the external
// embedding request. Only deterministic coverage of the original query can
// produce this representation; candidate free text is ignored at this boundary.
// A parser-provided identity term is an additive veto: it can force exact-only
// retrieval, but it can never permit a visual embedding.
export function buildVisualEmbeddingInput(request = {}) {
  const supplied = request && typeof request === "object" && !Array.isArray(request) ? request : {};
  const { rawQuery, candidate } = supplied;
  const analysis = analyzeTypedVisualQuery(rawQuery);
  const candidateWasProvided = Object.hasOwn(supplied, "candidate");
  const validatedCandidate = candidateWasProvided
    ? validateMediaRetrievalParserResponse(candidate)
    : null;
  if (candidateWasProvided && !validatedCandidate.ok) {
    return baseInput({
      analysis,
      mode: "exact-only",
      exactOnlyIdentityTerms: [],
      reasonCode: "parser-candidate-unverifiable",
    });
  }
  const parserIdentityTerms = uniqueTerms(validatedCandidate?.candidate.identityTerms);
  if (parserIdentityTerms.length) {
    const allTermsCoverRawQuery = parserIdentityTerms.every((term) =>
      parserTermCoversRawQuerySpan({ rawQuery, term }),
    );
    return baseInput({
      analysis,
      mode: "exact-only",
      // An unprovable parser term is not allowed to become a local retrieval
      // constraint. Returning no exact terms makes the caller fail closed.
      exactOnlyIdentityTerms: allTermsCoverRawQuery ? parserIdentityTerms : [],
      reasonCode: allTermsCoverRawQuery
        ? "parser-identity-veto"
        : "parser-identity-unverifiable",
    });
  }
  if (!analysis.complete) {
    return baseInput({
      analysis,
      mode: "exact-only",
      reasonCode: analysis.unclassifiedTerms.length
        ? "unclassified-semantic-span"
        : analysis.semanticRoleUnproved
          ? "semantic-role-unproved"
          : "visual-clause-missing",
    });
  }
  if (!analysis.typedClauses.length) {
    return baseInput({ analysis, mode: "exact-only", reasonCode: "visual-clause-missing" });
  }
  return baseInput({ analysis, mode: "visual", reasonCode: null });
}

export function verifyVisualEmbeddingInput(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new TypeError("Visual embedding input is invalid.");
  }
  if (
    value.kind !== MEDIA_RETRIEVAL_VISUAL_EMBEDDING_INPUT_KIND ||
    value.policyVersion !== MEDIA_RETRIEVAL_EMBEDDING_POLICY_VERSION ||
    value.ontologyVersion !== MEDIA_RETRIEVAL_VISUAL_ONTOLOGY_VERSION ||
    value.grammarVersion !== MEDIA_RETRIEVAL_VISUAL_GRAMMAR_VERSION ||
    value.normalizationVersion !== MEDIA_RETRIEVAL_EMBEDDING_NORMALIZATION_VERSION ||
    value.serializationVersion !== MEDIA_RETRIEVAL_VISUAL_SERIALIZATION_VERSION ||
    value.mode !== "visual" ||
    value.reasonCode !== null ||
    !String(value.text || "") ||
    !/^[a-f0-9]{64}$/i.test(String(value.textHash || "")) ||
    !/^[a-f0-9]{64}$/i.test(String(value.coverageDigest || "")) ||
    !/^[a-f0-9]{64}$/i.test(String(value.rawQueryHash || "")) ||
    (Array.isArray(value.identityTerms) && value.identityTerms.length)
  ) {
    throw new TypeError("Visual embedding input is not visual-safe.");
  }
  const representation = verifyTypedVisualRepresentation(value);
  const text = serializeTypedVisualClauses(representation.typedClauses);
  const expectedTextHash = textHashFor({
    policyVersion: value.policyVersion,
    ontologyVersion: value.ontologyVersion,
    grammarVersion: value.grammarVersion,
    normalizationVersion: value.normalizationVersion,
    serializationVersion: value.serializationVersion,
    coverageDigest: representation.coverageDigest,
    text,
  });
  if (value.text !== text || value.textHash !== expectedTextHash) {
    throw new TypeError("Visual embedding input does not match its safe serialization.");
  }
  return {
    kind: value.kind,
    policyVersion: value.policyVersion,
    ontologyVersion: value.ontologyVersion,
    grammarVersion: value.grammarVersion,
    normalizationVersion: value.normalizationVersion,
    serializationVersion: value.serializationVersion,
    ...representation,
    text,
    textHash: expectedTextHash,
    identityTerms: [],
    mode: "visual",
    reasonCode: null,
  };
}

// Provider adapters receive the complete attestation, but their outbound API
// request uses only `text`. No raw query or unclassified span is serialized.
export function toProviderVisualEmbeddingInput(value) {
  const verified = verifyVisualEmbeddingInput(value);
  return {
    kind: verified.kind,
    policyVersion: verified.policyVersion,
    ontologyVersion: verified.ontologyVersion,
    grammarVersion: verified.grammarVersion,
    normalizationVersion: verified.normalizationVersion,
    serializationVersion: verified.serializationVersion,
    rawQueryHash: verified.rawQueryHash,
    rawLength: verified.rawLength,
    typedClauses: verified.typedClauses,
    coverage: verified.coverage,
    coverageDigest: verified.coverageDigest,
    text: verified.text,
    textHash: verified.textHash,
    identityTerms: [],
    mode: verified.mode,
    reasonCode: verified.reasonCode,
  };
}

export function createVisualEmbeddingBinding({
  input,
  vector,
  modelId,
  modelVersion,
  dimension,
  embeddingNormalization,
  configurationHash,
} = {}) {
  const verified = verifyVisualEmbeddingInput(input);
  const embeddingSpace = embeddingSpaceFor({
    modelId,
    modelVersion,
    dimension,
    embeddingNormalization,
    configurationHash,
  }, vector);
  if (!isFiniteEmbeddingVector(vector, embeddingSpace.dimension)) {
    throw new TypeError("Visual embedding binding requires a finite vector in its declared embedding space.");
  }
  const vectorHash = vectorHashFor(vector);
  return {
    vector: [...vector],
    input: verified,
    textHash: verified.textHash,
    policyVersion: verified.policyVersion,
    ontologyVersion: verified.ontologyVersion,
    grammarVersion: verified.grammarVersion,
    normalizationVersion: verified.normalizationVersion,
    serializationVersion: verified.serializationVersion,
    coverageDigest: verified.coverageDigest,
    rawQueryHash: verified.rawQueryHash,
    ...embeddingSpace,
    vectorHash,
    bindingHash: bindingHashFor({ input: verified, vectorHash, embeddingSpace }),
  };
}

const assertMatchingEmbeddingSpace = (actual, expected) => {
  if (!expected) return;
  const normalizedExpected = embeddingSpaceFor({
    modelId: expected.modelId,
    modelVersion: expected.modelVersion,
    dimension: expected.dimension,
    embeddingNormalization: expected.normalization || expected.embeddingNormalization,
    configurationHash: expected.configurationHash,
  });
  if (
    actual.modelId !== normalizedExpected.modelId ||
    actual.modelVersion !== normalizedExpected.modelVersion ||
    actual.dimension !== normalizedExpected.dimension ||
    actual.normalization !== normalizedExpected.normalization ||
    actual.configurationHash !== normalizedExpected.configurationHash
  ) {
    throw new TypeError("Visual embedding binding does not match the frozen embedding space.");
  }
};

export function verifyVisualEmbeddingBinding(value, { expectedInput, expectedEmbeddingSpace } = {}) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new TypeError("Visual embedding binding is invalid.");
  }
  const verified = verifyVisualEmbeddingInput(value.input);
  const expected = expectedInput ? verifyVisualEmbeddingInput(expectedInput) : verified;
  if (
    verified.textHash !== expected.textHash ||
    verified.coverageDigest !== expected.coverageDigest ||
    verified.policyVersion !== expected.policyVersion ||
    verified.ontologyVersion !== expected.ontologyVersion ||
    verified.grammarVersion !== expected.grammarVersion ||
    verified.normalizationVersion !== expected.normalizationVersion ||
    verified.serializationVersion !== expected.serializationVersion
  ) {
    throw new TypeError("Visual embedding binding does not match the verified input.");
  }
  const embeddingSpace = embeddingSpaceFor({
    modelId: value.modelId,
    modelVersion: value.modelVersion,
    dimension: value.dimension,
    embeddingNormalization: value.normalization,
    configurationHash: value.configurationHash,
  }, value.vector);
  if (!isFiniteEmbeddingVector(value.vector, embeddingSpace.dimension)) {
    throw new TypeError("Visual embedding binding requires a finite vector in its declared embedding space.");
  }
  const vectorHash = vectorHashFor(value.vector);
  if (
    value.textHash !== verified.textHash ||
    value.policyVersion !== verified.policyVersion ||
    value.ontologyVersion !== verified.ontologyVersion ||
    value.grammarVersion !== verified.grammarVersion ||
    value.normalizationVersion !== verified.normalizationVersion ||
    value.serializationVersion !== verified.serializationVersion ||
    value.coverageDigest !== verified.coverageDigest ||
    value.rawQueryHash !== verified.rawQueryHash ||
    value.vectorHash !== vectorHash ||
    value.bindingHash !== bindingHashFor({ input: verified, vectorHash, embeddingSpace })
  ) {
    throw new TypeError("Visual embedding binding does not match the verified input.");
  }
  assertMatchingEmbeddingSpace(embeddingSpace, expectedEmbeddingSpace);
  return {
    vector: [...value.vector],
    input: verified,
    textHash: verified.textHash,
    policyVersion: verified.policyVersion,
    ontologyVersion: verified.ontologyVersion,
    grammarVersion: verified.grammarVersion,
    normalizationVersion: verified.normalizationVersion,
    serializationVersion: verified.serializationVersion,
    coverageDigest: verified.coverageDigest,
    rawQueryHash: verified.rawQueryHash,
    ...embeddingSpace,
    vectorHash,
    bindingHash: value.bindingHash,
  };
}
