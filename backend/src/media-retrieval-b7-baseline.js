import { buildVisualEmbeddingInput } from "./media-retrieval-embedding-input.js";

export const B7_PRODUCT_BASELINE_METHOD = "b7-product-baseline";
export const B7_PRODUCT_BASELINE_CONFIGURATION = Object.freeze({
  method: B7_PRODUCT_BASELINE_METHOD,
  retrievalMethod: B7_PRODUCT_BASELINE_METHOD,
  localRanker: "b7-local-rank-v1",
  queryBinding: "typed-visual-binding-v2",
  candidateLimitMultiplier: 8,
  allowLocalLexical: true,
});

export const assertB7ProductBaselineConfiguration = (configuration) => {
  if (!configuration || typeof configuration !== "object" || Array.isArray(configuration)) {
    throw new TypeError("B7 product configuration must be an object.");
  }
  const expectedKeys = Object.keys(B7_PRODUCT_BASELINE_CONFIGURATION).sort();
  const suppliedKeys = Object.keys(configuration).sort();
  if (
    expectedKeys.length !== suppliedKeys.length ||
    expectedKeys.some((key, index) => key !== suppliedKeys[index]) ||
    expectedKeys.some((key) => configuration[key] !== B7_PRODUCT_BASELINE_CONFIGURATION[key])
  ) {
    throw new TypeError("B7 configuration does not match the product baseline.");
  }
  return { ...B7_PRODUCT_BASELINE_CONFIGURATION };
};

const normalizeText = (value) => String(value || "").trim().toLocaleLowerCase();

const uniqueStrings = (values, maximum = 12) =>
  Array.from(
    new Set(
      (Array.isArray(values) ? values : [])
        .map((value) => String(value || "").trim())
        .filter(Boolean),
    ),
  ).slice(0, maximum);

export const b7LocalTerms = (visualQuery) =>
  uniqueStrings(
    String(visualQuery || "")
      .split(/[\s,，。！？!?.、/]+/u)
      .map((value) => value.trim())
      .filter((value) => value.length > 1),
    6,
  );

const descriptorOcrValues = (descriptor) => uniqueStrings(descriptor?.ocrText);

const metadataValues = (value, depth = 0) => {
  if (depth > 2 || value === null || value === undefined) return [];
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return [String(value)];
  }
  if (Array.isArray(value)) return value.flatMap((item) => metadataValues(item, depth + 1));
  if (typeof value === "object") return Object.values(value).flatMap((item) => metadataValues(item, depth + 1));
  return [];
};

const hasExactTerm = (values, term) => values.some((value) => normalizeText(value) === normalizeText(term));
const hasVisualTerm = (values, term) => values.some((value) => normalizeText(value).includes(normalizeText(term)));

const b7EvidenceForCandidate = ({ candidate, visualTerms, identityTerms }) => {
  const caption = String(candidate.caption || "");
  const tags = uniqueStrings(candidate.tags);
  const ocr = descriptorOcrValues(candidate.descriptor);
  const metadata = metadataValues(candidate.metadata);
  const reasons = [];
  const hasVectorScore = candidate.score !== null && candidate.score !== undefined && Number.isFinite(Number(candidate.score));
  let localScore = hasVectorScore ? Math.max(0, Number(candidate.score)) : 0;

  if (hasVectorScore) {
    reasons.push("visual-vector");
  }

  const identitySatisfied = identityTerms.every((term) =>
    hasExactTerm([caption], term) || hasExactTerm(tags, term) || hasExactTerm(ocr, term),
  );
  if (identityTerms.length && !identitySatisfied) return null;
  if (identityTerms.length) {
    if (identityTerms.some((term) => hasExactTerm([caption], term))) reasons.push("identity-caption-exact");
    if (identityTerms.some((term) => hasExactTerm(tags, term))) reasons.push("identity-tag-exact");
    if (identityTerms.some((term) => hasExactTerm(ocr, term))) reasons.push("identity-ocr-exact");
    localScore += 0.2;
  }

  if (visualTerms.some((term) => hasVisualTerm([caption], term))) {
    reasons.push("caption-match");
    localScore += 0.08;
  }
  if (visualTerms.some((term) => hasVisualTerm(tags, term))) {
    reasons.push("tag-match");
    localScore += 0.08;
  }
  if (visualTerms.some((term) => hasVisualTerm(ocr, term))) {
    reasons.push("ocr-match");
    localScore += 0.08;
  }
  if (visualTerms.some((term) => hasVisualTerm(metadata, term))) {
    reasons.push("metadata-match");
    localScore += 0.05;
  }

  return { localScore, matchReasons: reasons };
};

export function normalizeB7ProductBaselineQuery(request = {}) {
  const supplied = request && typeof request === "object" && !Array.isArray(request) ? request : {};
  const input = buildVisualEmbeddingInput({
    rawQuery: supplied.rawQuery,
    ...(Object.hasOwn(supplied, "candidate") ? { candidate: supplied.candidate } : {}),
  });
  return {
    method: B7_PRODUCT_BASELINE_METHOD,
    visualQuery: input.mode === "visual" ? input.text : "",
    identityTerms: uniqueStrings(input.identityTerms),
    parseConfidence: input.mode === "visual" ? "high" : "low",
  };
}

export function inspectB7ProductBaselineCandidates({
  candidates = [],
  visualQuery = "",
  identityTerms = [],
  limit = 10,
} = {}) {
  const visualTerms = b7LocalTerms(visualQuery);
  const normalizedIdentityTerms = uniqueStrings(identityTerms);
  const byAssetId = new Map();
  const sourceRows = Array.isArray(candidates) ? candidates : [];

  for (const candidate of sourceRows) {
    if (!candidate?.mediaAssetId) continue;
    const evidence = b7EvidenceForCandidate({
      candidate,
      visualTerms,
      identityTerms: normalizedIdentityTerms,
    });
    if (!evidence) continue;
    const ranked = {
      mediaAssetId: candidate.mediaAssetId,
      kind: candidate.kind,
      matchedFrameTimestampMs: candidate.matchedFrameTimestampMs ?? null,
      summary: String(candidate.summary || "").slice(0, 160),
      matchReasons: Array.from(new Set(evidence.matchReasons)).slice(0, 6),
      score: evidence.localScore,
    };
    const existing = byAssetId.get(ranked.mediaAssetId);
    if (
      !existing ||
      ranked.score > existing.score ||
      (ranked.score === existing.score && Number(ranked.matchedFrameTimestampMs ?? Number.MAX_SAFE_INTEGER) < Number(existing.matchedFrameTimestampMs ?? Number.MAX_SAFE_INTEGER))
    ) {
      byAssetId.set(ranked.mediaAssetId, ranked);
    }
  }

  const candidatePool = Array.from(byAssetId.values());
  const rankedPool = [...candidatePool]
    .sort((left, right) => right.score - left.score || String(left.mediaAssetId).localeCompare(String(right.mediaAssetId)))
  const results = rankedPool.slice(0, Math.min(20, Math.max(1, Number(limit) || 10)));
  return {
    // This is intentionally the raw repository row count. It is not inferred
    // from the final result's reasons, which would under-report deduped rows.
    rawSourceRowCount: sourceRows.length,
    sourceEvidenceCount: sourceRows.length,
    candidatePoolIds: candidatePool
      .map((candidate) => candidate.mediaAssetId)
      .sort((left, right) => String(left).localeCompare(String(right))),
    rankedPoolIds: rankedPool.map((candidate) => candidate.mediaAssetId),
    results,
  };
}

export function rankB7ProductBaselineCandidates(input = {}) {
  return inspectB7ProductBaselineCandidates(input).results;
}
