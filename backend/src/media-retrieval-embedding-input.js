import crypto from "node:crypto";
import {
  MEDIA_RETRIEVAL_VISUAL_ONTOLOGY_VERSION,
  MEDIA_RETRIEVAL_VISUAL_GRAMMAR_VERSION,
  analyzeVisualQuerySource,
  normalizeVisualRawQuery,
  verifyVisualQuerySource,
} from "./media-retrieval-visual-language.js";
import { validateMediaRetrievalParserResponse } from "./media-retrieval-parser-response.js";

export const MEDIA_RETRIEVAL_EMBEDDING_POLICY_VERSION = "media-retrieval-semantic-visual-policy-v13";
const MEDIA_RETRIEVAL_EMBEDDING_NORMALIZATION_VERSION = "nfkc-whitespace-v1";
const MEDIA_RETRIEVAL_VISUAL_EMBEDDING_INPUT_KIND = "media-retrieval-source-visual-embedding-v3";
const MEDIA_RETRIEVAL_SEMANTIC_SERIALIZATION_VERSION = "semantic-v2";

const hash = value => crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex");
const uniqueTerms = values => [...new Set(values.map(value => value.normalize("NFKC").trim()))];
const uniqueConstraints = values => [...new Set(values.map(normalizeSemanticText).filter(Boolean))];
const textHashFor = ({ policyVersion, ontologyVersion, grammarVersion, normalizationVersion, serializationVersion, coverageDigest, text, visualConstraints }) =>
  hash({ policyVersion, ontologyVersion, grammarVersion, normalizationVersion, serializationVersion, coverageDigest, text, visualConstraints });
const vectorHashFor = vector => hash(vector);

const normalizeString = (value, field) => {
  if (typeof value !== "string" || !value.trim() || value.trim().length > 160) {
    throw new TypeError(`Visual embedding binding requires ${field}.`);
  }
  return value.trim();
};
const normalizeDimension = (value, vector = null) => {
  const dimension = Number(value ?? vector?.length);
  if (!Number.isInteger(dimension) || dimension !== 1024) throw new TypeError("Visual embedding binding requires a 1024-dimensional embedding space.");
  return dimension;
};
const isFiniteEmbeddingVector = (value, dimension = 1024) => Array.isArray(value) && value.length === dimension && value.every(Number.isFinite);
const embeddingSpaceFor = ({ modelId, modelVersion, dimension, embeddingNormalization, configurationHash }, vector = null) => ({
  modelId: normalizeString(modelId, "modelId"),
  modelVersion: normalizeString(modelVersion, "modelVersion"),
  dimension: normalizeDimension(dimension, vector),
  normalization: normalizeString(embeddingNormalization || "l2-v1", "embeddingNormalization"),
  configurationHash: normalizeString(configurationHash, "configurationHash"),
});
const bindingHashFor = ({ input, vectorHash, embeddingSpace }) => hash({
  kind: "media-retrieval-visual-embedding-binding-v3", textHash: input.textHash,
  policyVersion: input.policyVersion, ontologyVersion: input.ontologyVersion, grammarVersion: input.grammarVersion,
  normalizationVersion: input.normalizationVersion, serializationVersion: input.serializationVersion,
  coverageDigest: input.coverageDigest, rawQueryHash: input.rawQueryHash,
  identityTerms: uniqueTerms(input.identityTerms), visualConstraints: uniqueConstraints(input.visualConstraints),
  vectorHash, embeddingSpace,
});
const normalizeSemanticText = value => value.normalize("NFKC").replace(/\p{Cc}/gu, " ").replace(/\s+/gu, " ").trim();

const baseInput = (source, mode = "blocked", reasonCode = null) => {
  const input = {
    kind: MEDIA_RETRIEVAL_VISUAL_EMBEDDING_INPUT_KIND,
    policyVersion: MEDIA_RETRIEVAL_EMBEDDING_POLICY_VERSION,
    ontologyVersion: MEDIA_RETRIEVAL_VISUAL_ONTOLOGY_VERSION,
    grammarVersion: MEDIA_RETRIEVAL_VISUAL_GRAMMAR_VERSION,
    normalizationVersion: MEDIA_RETRIEVAL_EMBEDDING_NORMALIZATION_VERSION,
    serializationVersion: MEDIA_RETRIEVAL_SEMANTIC_SERIALIZATION_VERSION,
    ...source, visualConstraints: [], text: "", identityTerms: [], mode, reasonCode,
  };
  return { ...input, textHash: textHashFor({ ...input, text: "" }) };
};

const semanticTextContainsIdentity = ({ text, identityTerms }) => identityTerms.some(term => {
  const normalized = term.normalize("NFKC").toLocaleLowerCase();
  const compared = text.normalize("NFKC").toLocaleLowerCase();
  if (/\p{Script=Han}/u.test(normalized)) return compared.includes(normalized);
  const escaped = normalized.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(?:^|[^\\p{L}\\p{N}])${escaped}(?:$|[^\\p{L}\\p{N}])`, "u").test(compared);
});

// There is one semantic extraction path. Missing, uncertain, malformed or
// source-incomplete parsing cannot switch to a vocabulary or exact-search mode.
// Identity-only search is an explicitly classified request, never a fallback.
export function buildVisualEmbeddingInput({ rawQuery, candidate } = {}) {
  const raw = normalizeVisualRawQuery(rawQuery);
  const source = analyzeVisualQuerySource(raw);
  const blocked = reason => baseInput(source, "blocked", reason);
  if (!raw || raw.length > 240) return blocked("query-source-unverifiable");
  const parsed = validateMediaRetrievalParserResponse(candidate);
  if (!parsed.ok) return blocked(parsed.reasonCode);
  if (parsed.candidate.parseConfidence !== "high") return blocked("parser-confidence-unverifiable");
  const spans = parsed.candidate.spans;
  if (!spans.length || spans.map(span => span.text).join("") !== raw) return blocked("parser-source-unverifiable");
  const identities = spans.filter(span => span.role === "identity").map(span => span.text.trim());
  const visual = spans.filter(span => span.role === "visual").map(span => span.text);
  if (identities.some(term => !term || term.length > 80) || identities.length > 12 || visual.length > 11) {
    return blocked("parser-source-unverifiable");
  }
  const identityTerms = uniqueTerms(identities);
  const text = normalizeSemanticText(visual.join(" "));
  if (!text) return identityTerms.length ? { ...baseInput(source, "exact-only"), identityTerms } : blocked("visual-clause-missing");
  const visualConstraints = uniqueConstraints([...visual, text]);
  if (!visualConstraints.length || visualConstraints.length > 12 || text.length > 240 ||
    semanticTextContainsIdentity({ text, identityTerms })) return blocked("parser-visual-unverifiable");
  const input = {
    ...baseInput(source, "semantic"), identityTerms, visualConstraints,
    semanticSerializationVersion: MEDIA_RETRIEVAL_SEMANTIC_SERIALIZATION_VERSION,
    semanticText: text, text: `${MEDIA_RETRIEVAL_SEMANTIC_SERIALIZATION_VERSION} ${text}`,
  };
  return { ...input, textHash: textHashFor({ ...input, text }) };
}

export function verifyVisualEmbeddingInput(value) {
  if (!value || typeof value !== "object" || Array.isArray(value) ||
    value.kind !== MEDIA_RETRIEVAL_VISUAL_EMBEDDING_INPUT_KIND ||
    value.policyVersion !== MEDIA_RETRIEVAL_EMBEDDING_POLICY_VERSION ||
    value.ontologyVersion !== MEDIA_RETRIEVAL_VISUAL_ONTOLOGY_VERSION ||
    value.grammarVersion !== MEDIA_RETRIEVAL_VISUAL_GRAMMAR_VERSION ||
    value.normalizationVersion !== MEDIA_RETRIEVAL_EMBEDDING_NORMALIZATION_VERSION ||
    value.mode !== "semantic" || value.reasonCode !== null ||
    value.serializationVersion !== MEDIA_RETRIEVAL_SEMANTIC_SERIALIZATION_VERSION ||
    value.semanticSerializationVersion !== MEDIA_RETRIEVAL_SEMANTIC_SERIALIZATION_VERSION ||
    typeof value.semanticText !== "string" || !Array.isArray(value.identityTerms) ||
    value.identityTerms.length > 12 || value.identityTerms.some(term => typeof term !== "string" || !term.trim() || term.length > 80) ||
    !Array.isArray(value.visualConstraints) || !value.visualConstraints.length || value.visualConstraints.length > 12 ||
    value.visualConstraints.some(term => typeof term !== "string" || !term.trim() || term.length > 240)) {
    throw new TypeError("Visual embedding input is not visual-safe.");
  }
  const representation = verifyVisualQuerySource(value);
  const text = normalizeSemanticText(value.semanticText);
  const identityTerms = uniqueTerms(value.identityTerms);
  const visualConstraints = uniqueConstraints(value.visualConstraints);
  if (!text || text.length > 240 || value.semanticText !== text ||
    semanticTextContainsIdentity({ text, identityTerms }) ||
    visualConstraints.length !== value.visualConstraints.length || !visualConstraints.includes(text) ||
    visualConstraints.some(constraint => !text.includes(constraint))) {
    throw new TypeError("Semantic visual embedding input is invalid.");
  }
  const expectedTextHash = textHashFor({ ...value, text, visualConstraints });
  if (value.text !== `${MEDIA_RETRIEVAL_SEMANTIC_SERIALIZATION_VERSION} ${text}` || value.textHash !== expectedTextHash) {
    throw new TypeError("Visual embedding input does not match its safe serialization.");
  }
  return {
    kind: value.kind, policyVersion: value.policyVersion, ontologyVersion: value.ontologyVersion,
    grammarVersion: value.grammarVersion, normalizationVersion: value.normalizationVersion,
    serializationVersion: value.serializationVersion, ...representation,
    semanticSerializationVersion: value.semanticSerializationVersion,
    semanticText: text, text: value.text, textHash: expectedTextHash,
    identityTerms, visualConstraints, mode: "semantic", reasonCode: null,
  };
}

// Identity text stays in local filters. Only the classified visual text is
// serialized into the supplier's embedding request.
export function toProviderVisualEmbeddingInput(value) {
  return { ...verifyVisualEmbeddingInput(value), identityTerms: [] };
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
    verified.serializationVersion !== expected.serializationVersion ||
    JSON.stringify(uniqueTerms(verified.identityTerms)) !== JSON.stringify(uniqueTerms(expected.identityTerms)) ||
    JSON.stringify(verified.visualConstraints) !== JSON.stringify(expected.visualConstraints)
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
