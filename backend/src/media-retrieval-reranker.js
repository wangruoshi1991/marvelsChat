import crypto from "node:crypto";
import { z } from "zod";
import { MEDIA_RETRIEVAL_LIMITS } from "./media-retrieval-constants.js";

const imageUrlSchema = z.string().regex(/^data:image\/webp;base64,[A-Za-z0-9+/]+={0,2}$/u)
  .max(32 + Math.ceil(MEDIA_RETRIEVAL_LIMITS.rerankImageMaxBytes / 3) * 4);
const candidateSchema = z.object({
  candidateKey: z.literal("c0"),
  imageUrl: imageUrlSchema,
}).strict();

export const mediaRetrievalRerankResponseSchema = z.object({
  matches: z.array(z.object({
    candidateKey: z.literal("c0"),
    relevance: z.literal("high"),
    constraintEvidence: z.array(z.object({
      constraintIndex: z.number().int().nonnegative().max(11),
      citations: z.array(z.object({
        field: z.literal("image"),
        itemIndex: z.literal(0),
      }).strict()).length(1),
    }).strict()).min(1).max(12),
  }).strict()).max(MEDIA_RETRIEVAL_LIMITS.rerankBatchSize),
}).strict();

export const projectMediaRetrievalRerankCandidates = (values) => {
  if (!Array.isArray(values) || values.length > MEDIA_RETRIEVAL_LIMITS.rerankBatchSize) {
    throw new TypeError("Retrieval rerank candidates exceed the visual batch contract.");
  }
  return values.map((candidate, index) => {
    const parsed = candidateSchema.safeParse({ candidateKey: "c" + index, imageUrl: candidate?.imageUrl });
    if (!parsed.success) throw new TypeError("Retrieval rerank image failed validation.");
    const bytes = Buffer.from(parsed.data.imageUrl.split(",", 2)[1], "base64");
    if (!bytes.length || bytes.length > MEDIA_RETRIEVAL_LIMITS.rerankImageMaxBytes ||
      bytes.toString("base64") !== parsed.data.imageUrl.split(",", 2)[1] ||
      crypto.createHash("sha256").update(bytes).digest("hex") !== candidate.imageSha256) {
      throw new TypeError("Retrieval rerank image binding failed validation.");
    }
    return parsed.data;
  });
};

export const validateMediaRetrievalRerankResponse = (value, candidates, visualConstraints) => {
  if (!Array.isArray(candidates) || !Array.isArray(visualConstraints) ||
    !visualConstraints.length || visualConstraints.length > 12 ||
    visualConstraints.some(constraint => typeof constraint !== "string" || !constraint.trim() || constraint.length > 240)) return null;
  const parsed = mediaRetrievalRerankResponseSchema.safeParse(value);
  if (!parsed.success) return null;
  const allowed = new Set(candidates.map(candidate => candidate.candidateKey));
  const seen = new Set();
  for (const item of parsed.data.matches) {
    if (!allowed.has(item.candidateKey) || seen.has(item.candidateKey)) return null;
    const indices = new Set();
    for (const evidence of item.constraintEvidence) {
      if (evidence.constraintIndex >= visualConstraints.length || indices.has(evidence.constraintIndex)) return null;
      indices.add(evidence.constraintIndex);
    }
    if (indices.size !== visualConstraints.length) return null;
    seen.add(item.candidateKey);
  }
  return parsed.data.matches;
};

const frameKeyFor = value => JSON.stringify([value.mediaAssetId, value.matchedFrameTimestampMs ?? null]);
const bestPerAsset = values => {
  const byAsset = new Map();
  for (const candidate of values) {
    const existing = byAsset.get(candidate.mediaAssetId);
    if (!existing || candidate.score > existing.score) byAsset.set(candidate.mediaAssetId, candidate);
  }
  return [...byAsset.values()].sort((left, right) => right.score - left.score);
};

export const projectMediaRetrievalRerankedCandidates = (values, candidates, visualConstraints) => {
  if (!Array.isArray(values) || !Array.isArray(candidates) ||
    !validateMediaRetrievalRerankResponse({ matches: [] }, [], visualConstraints)) return null;
  let projectedCandidates;
  try { projectedCandidates = projectMediaRetrievalRerankCandidates(candidates); } catch { return null; }
  const allowed = new Map(candidates.map((candidate, index) => [frameKeyFor(candidate), { candidate, index }]));
  if (allowed.size !== candidates.length) return null;
  const seen = new Set();
  const projected = [];
  for (const value of values) {
    if (!value || typeof value !== "object" || Array.isArray(value) ||
      typeof value.mediaAssetId !== "string" || seen.has(frameKeyFor(value))) return null;
    const source = allowed.get(frameKeyFor(value));
    if (!source || value.score !== 0.8 ||
      !Array.isArray(value.matchReasons) || value.matchReasons.length !== 1 ||
      value.matchReasons[0] !== "semantic-match") return null;
    const evidence = validateMediaRetrievalRerankResponse({ matches: [{
      candidateKey: "c" + source.index, relevance: "high",
      constraintEvidence: value.constraintEvidence,
    }] }, projectedCandidates, visualConstraints);
    if (!evidence) return null;
    seen.add(frameKeyFor(value));
    // Raw media and model evidence never enter search results or events.
    const { imageUrl, imageSha256, descriptor, ...result } = source.candidate;
    projected.push({ ...result, matchReasons: ["semantic-match"], score: value.score });
  }
  return bestPerAsset(projected);
};

// Every batch must be authorized and accounted for by the caller. Failure of
// any batch rejects the search; earlier batches cannot become partial success.
export async function rerankMediaRetrievalVisualCandidates({ candidates, visualConstraints, invoke }) {
  if (!Array.isArray(candidates) || candidates.length > 20 || typeof invoke !== "function") {
    throw new TypeError("Invalid retrieval visual reranking request.");
  }
  const results = [];
  for (let offset = 0; offset < candidates.length; offset += MEDIA_RETRIEVAL_LIMITS.rerankBatchSize) {
    const batch = candidates.slice(offset, offset + MEDIA_RETRIEVAL_LIMITS.rerankBatchSize);
    const values = await invoke(batch);
    const verified = projectMediaRetrievalRerankedCandidates(values, batch, visualConstraints);
    if (!verified) {
      const error = new Error("Retrieval visual evidence failed verification.");
      error.code = "retrieval_policy_unverifiable";
      throw error;
    }
    results.push(...verified);
  }
  return bestPerAsset(results);
}
