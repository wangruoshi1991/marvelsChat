import crypto from "node:crypto";

// Semantics belong to the parser model. This module binds its classifications
// to the complete original text; it contains no language or object vocabulary.
export const MEDIA_RETRIEVAL_VISUAL_ONTOLOGY_VERSION = "media-retrieval-source-classification-v1";
export const MEDIA_RETRIEVAL_VISUAL_GRAMMAR_VERSION = "media-retrieval-source-coverage-v1";
const hash = (value) => crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex");

export const normalizeVisualRawQuery = (value) => typeof value === "string" ? value.normalize("NFKC").trim() : "";

const coveragePayload = ({ rawQueryHash, rawLength, coverage }) => ({
  ontologyVersion: MEDIA_RETRIEVAL_VISUAL_ONTOLOGY_VERSION,
  grammarVersion: MEDIA_RETRIEVAL_VISUAL_GRAMMAR_VERSION,
  rawQueryHash, rawLength, coverage,
});

export const analyzeVisualQuerySource = (rawQuery) => {
  const raw = normalizeVisualRawQuery(rawQuery);
  const rawQueryHash = hash(raw);
  const coverage = raw ? [{ start: 0, end: raw.length, classification: "source-text", tokenHash: rawQueryHash }] : [];
  const representation = { rawQueryHash, rawLength: raw.length, coverage };
  return { ...representation, coverageDigest: hash(coveragePayload(representation)) };
};

export const verifyVisualQuerySource = ({ rawQueryHash, rawLength, coverage, coverageDigest } = {}) => {
  if (!/^[a-f0-9]{64}$/u.test(String(rawQueryHash || "")) ||
    !Number.isInteger(rawLength) || rawLength < 1 || rawLength > 240 ||
    !Array.isArray(coverage) || coverage.length !== 1) {
    throw new TypeError("Visual representation has invalid source coverage.");
  }
  const span = coverage[0];
  if (!span || span.start !== 0 || span.end !== rawLength ||
    span.classification !== "source-text" || span.tokenHash !== rawQueryHash) {
    throw new TypeError("Visual representation coverage is incomplete.");
  }
  const representation = { rawQueryHash, rawLength, coverage };
  if (coverageDigest !== hash(coveragePayload(representation))) {
    throw new TypeError("Visual representation coverage digest mismatch.");
  }
  return { ...representation, coverageDigest };
};
