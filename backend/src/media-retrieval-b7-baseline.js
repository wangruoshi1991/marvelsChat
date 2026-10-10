export const B7_PRODUCT_BASELINE_METHOD = "b7-product-baseline";
export const B7_PRODUCT_BASELINE_CONFIGURATION = Object.freeze({
  method: B7_PRODUCT_BASELINE_METHOD,
  retrievalMethod: B7_PRODUCT_BASELINE_METHOD,
  localRanker: "owner-exact-identity-v1",
  queryBinding: "source-visual-binding-v3",
  candidateLimitMultiplier: 8,
});

export const assertB7ProductBaselineConfiguration = configuration => {
  const expected = Object.keys(B7_PRODUCT_BASELINE_CONFIGURATION).sort();
  if (!configuration || typeof configuration !== "object" || Array.isArray(configuration) ||
    JSON.stringify(Object.keys(configuration).sort()) !== JSON.stringify(expected) ||
    expected.some(key => configuration[key] !== B7_PRODUCT_BASELINE_CONFIGURATION[key])) {
    throw new TypeError("B7 configuration does not match the product baseline.");
  }
  return { ...B7_PRODUCT_BASELINE_CONFIGURATION };
};

const normalizeText = value => typeof value === "string" ? value.normalize("NFKC").trim().toLocaleLowerCase() : "";
const exactValues = candidate => [
  candidate.caption, ...(candidate.tags || []), ...(candidate.descriptor?.ocrText || []),
];

// An explicitly classified identity-only request uses exact owner-authored
// text. Visual candidates are judged by the model, never by local word scores.
export const inspectB7ProductBaselineCandidates = ({ candidates = [], identityTerms = [], limit = 10 } = {}) => {
  const byAsset = new Map();
  for (const candidate of candidates) {
    if (!candidate?.mediaAssetId || !identityTerms.length) continue;
    if (!identityTerms.every(term => exactValues(candidate).some(value => normalizeText(value) === normalizeText(term)))) continue;
    const matchReasons = [];
    if (identityTerms.some(term => normalizeText(candidate.caption) === normalizeText(term))) matchReasons.push("identity-caption-exact");
    if (identityTerms.some(term => (candidate.tags || []).some(value => normalizeText(value) === normalizeText(term)))) matchReasons.push("identity-tag-exact");
    if (identityTerms.some(term => (candidate.descriptor?.ocrText || []).some(value => normalizeText(value) === normalizeText(term)))) matchReasons.push("identity-ocr-exact");
    const result = {
      mediaAssetId: candidate.mediaAssetId, kind: candidate.kind,
      matchedFrameTimestampMs: candidate.matchedFrameTimestampMs ?? null,
      summary: String(candidate.summary || "").slice(0, 160), matchReasons, score: 0.2,
    };
    const previous = byAsset.get(result.mediaAssetId);
    if (!previous || (result.matchedFrameTimestampMs ?? 0) < (previous.matchedFrameTimestampMs ?? 0)) byAsset.set(result.mediaAssetId, result);
  }
  const ranked = [...byAsset.values()].sort((a, b) => String(a.mediaAssetId).localeCompare(String(b.mediaAssetId)));
  return {
    rawSourceRowCount: candidates.length, sourceEvidenceCount: candidates.length,
    candidatePoolIds: ranked.map(candidate => candidate.mediaAssetId),
    rankedPoolIds: ranked.map(candidate => candidate.mediaAssetId),
    results: ranked.slice(0, limit),
  };
};
