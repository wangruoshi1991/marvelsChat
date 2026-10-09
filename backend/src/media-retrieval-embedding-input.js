import crypto from "node:crypto";
import {
  MEDIA_RETRIEVAL_VISUAL_ONTOLOGY_VERSION,
  MEDIA_RETRIEVAL_VISUAL_GRAMMAR_VERSION,
  MEDIA_RETRIEVAL_VISUAL_SERIALIZATION_VERSION,
  analyzeTypedVisualQuery,
  normalizeVisualRawQuery,
  serializeTypedVisualClauses,
  visualTermAliases,
  verifySemanticVisualRepresentation,
  verifyTypedVisualRepresentation,
} from "./media-retrieval-visual-language.js";
import { validateMediaRetrievalParserResponse } from "./media-retrieval-parser-response.js";

export const MEDIA_RETRIEVAL_EMBEDDING_POLICY_VERSION = "media-retrieval-semantic-visual-policy-v10";
export const MEDIA_RETRIEVAL_EMBEDDING_NORMALIZATION_VERSION = "nfkc-whitespace-v1";
export const MEDIA_RETRIEVAL_VISUAL_EMBEDDING_INPUT_KIND = "media-retrieval-typed-visual-embedding-v2";
export const MEDIA_RETRIEVAL_SEMANTIC_SERIALIZATION_VERSION = "semantic-v1";

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
    identityTerms: uniqueTerms(input.identityTerms),
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
    semanticRoleUnproved: analysis.semanticRoleUnproved,
  };
};

const normalizeSemanticText = (value) => String(value || "")
  .normalize("NFKC")
  .split("")
  .map((character) => character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127 ? " " : character)
  .join("")
  .replace(/\s+/gu, " ")
  .trim()
  .slice(0, 240);

const semanticTextContainsIdentity = ({ text, identityTerms }) => identityTerms.some((term) => {
  const normalizedText = normalizedComparisonText(text);
  const normalizedTerm = normalizedComparisonText(term);
  if (!normalizedText || !normalizedTerm) return false;
  if (/\p{Script=Han}/u.test(normalizedTerm)) return normalizedText.includes(normalizedTerm);
  const escaped = normalizedTerm.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(?:^|[^\\p{L}\\p{N}])${escaped}(?:$|[^\\p{L}\\p{N}])`, "u").test(normalizedText);
});

const isIdentityContextTerm = (value) => /^(?:wear|wearing|worn|with|by|穿|穿着)$/iu.test(String(value || "").trim());

const termCoveredAsIdentity = ({ term, identityTerms }) => identityTerms.some((identityTerm) => {
  const normalizedTerm = normalizedComparisonText(term);
  const normalizedIdentity = normalizedComparisonText(identityTerm);
  return normalizedTerm === normalizedIdentity || normalizedIdentity.includes(normalizedTerm);
});

const termCoveredAsVisual = ({ term, text }) => {
  const normalizedTerm = normalizedComparisonText(term);
  const normalizedText = normalizedComparisonText(text);
  if (!normalizedTerm || !normalizedText) return false;
  if (/\p{Script=Han}/u.test(normalizedTerm)) return normalizedText.includes(normalizedTerm);
  const escaped = normalizedTerm.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(?:^|[^\\p{L}\\p{N}])${escaped}(?:$|[^\\p{L}\\p{N}])`, "u").test(normalizedText);
};

const semanticSourceText = (rawQuery, identityTerms) => {
  let source = normalizeVisualRawQuery(rawQuery);
  for (const term of identityTerms) {
    const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const pattern = /\p{Script=Han}/u.test(term)
      ? escaped
      : `(?<![\\p{L}\\p{N}])${escaped}(?![\\p{L}\\p{N}])`;
    source = source.replace(new RegExp(pattern, "giu"), " ");
  }
  return source;
};

const comparisonCharacters = (value) => [...normalizedComparisonText(value)]
  .filter((character) => /[\p{L}\p{N}]/u.test(character));

// Permit deletions of search filler and identity terms, never model-added or
// translated details. Cross-language matching belongs to embeddings/reranking;
// the embedding query remains tied to the user's original description.
const isSourcePreservingText = (text, source) => {
  const requested = comparisonCharacters(text);
  const original = comparisonCharacters(source);
  let cursor = 0;
  for (const character of original) {
    if (character === requested[cursor]) cursor += 1;
  }
  return requested.length > 0 && cursor === requested.length;
};

const semanticInput = ({ rawQuery, analysis, candidate, identityTerms }) => {
  const text = normalizeSemanticText(candidate?.visualQuery);
  if (!text || (analysis.semanticRoleUnproved && !identityTerms.length) || semanticTextContainsIdentity({ text, identityTerms })) return null;
  const source = semanticSourceText(rawQuery, identityTerms);
  if (!isSourcePreservingText(text, source)) return null;
  const typedCovered = analysis.typedClauses.every((clause) => {
    const aliases = visualTermAliases(clause.value);
    return aliases.some((term) => termCoveredAsVisual({ term, text })) ||
      aliases.some((term) => termCoveredAsIdentity({ term, identityTerms }));
  });
  if (!typedCovered) return null;
  const unclassifiedCovered = analysis.unclassifiedTerms.every((term) =>
    isIdentityContextTerm(term) ||
    termCoveredAsIdentity({ term, identityTerms }) ||
    termCoveredAsVisual({ term, text }),
  );
  if (!unclassifiedCovered) return null;
  const input = baseInput({ analysis, mode: "semantic", reasonCode: null, exactOnlyIdentityTerms: [] });
  return {
    ...input,
    kind: MEDIA_RETRIEVAL_VISUAL_EMBEDDING_INPUT_KIND,
    serializationVersion: MEDIA_RETRIEVAL_SEMANTIC_SERIALIZATION_VERSION,
    semanticSerializationVersion: MEDIA_RETRIEVAL_SEMANTIC_SERIALIZATION_VERSION,
    semanticText: text,
    text: `${MEDIA_RETRIEVAL_SEMANTIC_SERIALIZATION_VERSION} ${text}`,
    textHash: textHashFor({
      policyVersion: input.policyVersion,
      ontologyVersion: input.ontologyVersion,
      grammarVersion: input.grammarVersion,
      normalizationVersion: input.normalizationVersion,
      serializationVersion: MEDIA_RETRIEVAL_SEMANTIC_SERIALIZATION_VERSION,
      coverageDigest: input.coverageDigest,
      text,
    }),
    identityTerms: [],
  };
};

// The parser may normalize open-vocabulary visual language, but every unknown
// source span must survive as visual text or become an owner-scoped exact filter.
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
  const allTermsCoverRawQuery = parserIdentityTerms.every((term) =>
    parserTermCoversRawQuerySpan({ rawQuery, term }),
  );
  if (!allTermsCoverRawQuery) {
    return baseInput({
      analysis,
      mode: "exact-only",
      exactOnlyIdentityTerms: [],
      reasonCode: "parser-identity-unverifiable",
    });
  }
  if (candidateWasProvided && validatedCandidate.candidate.parseConfidence !== "high") {
    return baseInput({
      analysis,
      mode: "exact-only",
      exactOnlyIdentityTerms: parserIdentityTerms,
      reasonCode: parserIdentityTerms.length ? "parser-identity-veto" : "parser-confidence-unverifiable",
    });
  }
  if (
    validatedCandidate?.candidate.parseConfidence === "high" &&
    validatedCandidate.candidate.visualQuery
  ) {
    const semantic = semanticInput({ rawQuery, analysis, candidate: validatedCandidate.candidate, identityTerms: parserIdentityTerms });
    if (semantic) return { ...semantic, identityTerms: parserIdentityTerms };
    return baseInput({ analysis, mode: "exact-only", exactOnlyIdentityTerms: parserIdentityTerms.length
      ? parserIdentityTerms : analysis.semanticRoleUnproved ? analysis.unclassifiedTerms : [],
      reasonCode: "parser-visual-unverifiable" });
  }
  if (parserIdentityTerms.length) {
    return baseInput({
      analysis,
      mode: "exact-only",
      exactOnlyIdentityTerms: parserIdentityTerms,
      reasonCode: "parser-identity-veto",
    });
  }
  if (candidateWasProvided) {
    return baseInput({ analysis, mode: "exact-only", exactOnlyIdentityTerms: [],
      reasonCode: "parser-visual-unverifiable" });
  }
  if (analysis.complete && analysis.typedClauses.length) {
    return baseInput({ analysis, mode: "visual", reasonCode: null });
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
    !["visual", "semantic"].includes(value.mode) ||
    value.serializationVersion !== (value.mode === "semantic" ? MEDIA_RETRIEVAL_SEMANTIC_SERIALIZATION_VERSION : MEDIA_RETRIEVAL_VISUAL_SERIALIZATION_VERSION) ||
    value.reasonCode !== null ||
    !String(value.text || "") ||
    !/^[a-f0-9]{64}$/i.test(String(value.textHash || "")) ||
    !/^[a-f0-9]{64}$/i.test(String(value.coverageDigest || "")) ||
    !/^[a-f0-9]{64}$/i.test(String(value.rawQueryHash || "")) ||
    !Array.isArray(value.identityTerms) || value.identityTerms.some((term) => typeof term !== "string") ||
    (value.mode === "visual" && value.identityTerms.length)
  ) {
    throw new TypeError("Visual embedding input is not visual-safe.");
  }
  if (typeof value.semanticRoleUnproved !== "boolean") {
    throw new TypeError("Visual embedding input lacks semantic role verification.");
  }
  const identityTerms = uniqueTerms(value.identityTerms);
  const representation = value.mode === "visual"
    ? verifyTypedVisualRepresentation(value)
    : verifySemanticVisualRepresentation(value);
  const text = value.mode === "visual" ? serializeTypedVisualClauses(representation.typedClauses) : normalizeSemanticText(value.semanticText);
  if (value.mode === "semantic" && (
    value.semanticSerializationVersion !== MEDIA_RETRIEVAL_SEMANTIC_SERIALIZATION_VERSION ||
    !text || semanticTextContainsIdentity({ text, identityTerms })
  )) {
    throw new TypeError("Semantic visual embedding input is invalid.");
  }
  const expectedTextHash = textHashFor({
    policyVersion: value.policyVersion,
    ontologyVersion: value.ontologyVersion,
    grammarVersion: value.grammarVersion,
    normalizationVersion: value.normalizationVersion,
    serializationVersion: value.mode === "semantic" ? MEDIA_RETRIEVAL_SEMANTIC_SERIALIZATION_VERSION : value.serializationVersion,
    coverageDigest: representation.coverageDigest,
    text,
  });
  const serializedText = value.mode === "semantic" ? `${MEDIA_RETRIEVAL_SEMANTIC_SERIALIZATION_VERSION} ${text}` : text;
  if (value.text !== serializedText || value.textHash !== expectedTextHash) {
    throw new TypeError("Visual embedding input does not match its safe serialization.");
  }
  return {
    kind: value.kind,
    policyVersion: value.policyVersion,
    ontologyVersion: value.ontologyVersion,
    grammarVersion: value.grammarVersion,
    normalizationVersion: value.normalizationVersion,
    serializationVersion: value.mode === "semantic" ? MEDIA_RETRIEVAL_SEMANTIC_SERIALIZATION_VERSION : value.serializationVersion,
    ...representation,
    text: serializedText,
    ...(value.mode === "semantic" ? { semanticSerializationVersion: MEDIA_RETRIEVAL_SEMANTIC_SERIALIZATION_VERSION, semanticText: text } : {}),
    textHash: expectedTextHash,
    identityTerms,
    mode: value.mode,
    reasonCode: null,
    semanticRoleUnproved: Boolean(value.semanticRoleUnproved),
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
    ...(verified.mode === "semantic" ? { semanticText: verified.semanticText, semanticSerializationVersion: verified.semanticSerializationVersion } : {}),
    textHash: verified.textHash,
    identityTerms: [],
    mode: verified.mode,
    reasonCode: verified.reasonCode,
    semanticRoleUnproved: verified.semanticRoleUnproved,
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
    verified.serializationVersion !== expected.serializationVersion ||
    JSON.stringify(uniqueTerms(verified.identityTerms)) !== JSON.stringify(uniqueTerms(expected.identityTerms))
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
