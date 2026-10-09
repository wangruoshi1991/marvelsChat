import { z } from "zod";
import { isolateMediaRetrievalDescriptorOcr } from "./media-retrieval-policy.js";

const candidateSchema = z.object({
  candidateKey: z.string().regex(/^c(?:0|[1-9]\d?)$/u),
  kind: z.enum(["image", "video"]),
  matchedFrameTimestampMs: z.number().int().nonnegative().nullable(),
  descriptor: z.object({
    clothing: z.array(z.object({ type: z.string().max(80), color: z.string().max(80) })).max(12).default([]),
    scene: z.array(z.string().max(80)).max(12).default([]),
    actions: z.array(z.string().max(80)).max(12).default([]),
    objects: z.array(z.string().max(80)).max(12).default([]),
  }).strict(),
}).strict();

export const mediaRetrievalRerankResponseSchema = z.object({
  matches: z.array(z.object({
    candidateKey: z.string().regex(/^c(?:0|[1-9]\d?)$/u),
    relevance: z.enum(["high", "medium"]),
  }).strict()).max(20),
}).strict();

export const projectMediaRetrievalRerankCandidates = (values) => {
  if (!Array.isArray(values)) throw new TypeError("Retrieval rerank candidates must be an array.");
  if (values.length > 20) throw new TypeError("Retrieval rerank candidate limit exceeded.");
  return values.map((candidate, index) => {
    const visualDescriptor = isolateMediaRetrievalDescriptorOcr(candidate?.descriptor);
    const parsed = candidateSchema.safeParse({
      candidateKey: `c${index}`,
      kind: candidate?.kind,
      matchedFrameTimestampMs: candidate?.matchedFrameTimestampMs ?? null,
      descriptor: {
        clothing: visualDescriptor.clothing.slice(0, 12),
        scene: visualDescriptor.scene.slice(0, 12),
        actions: visualDescriptor.actions.slice(0, 12),
        objects: visualDescriptor.objects.slice(0, 12),
      },
    });
    if (!parsed.success) throw new TypeError("Retrieval rerank candidate failed validation.");
    return parsed.data;
  });
};

export const validateMediaRetrievalRerankResponse = (value, candidates) => {
  const parsed = mediaRetrievalRerankResponseSchema.safeParse(value);
  if (!parsed.success) return null;
  const allowed = new Map(candidates.map((candidate, index) => [candidate.candidateKey, index]));
  const seen = new Set();
  const matches = [];
  for (const item of parsed.data.matches) {
    if (!allowed.has(item.candidateKey) || seen.has(item.candidateKey)) return null;
    seen.add(item.candidateKey);
    matches.push(item);
  }
  return matches;
};

export const projectMediaRetrievalRerankedCandidates = (values, candidates) => {
  if (!Array.isArray(values) || values.length > 20 || !Array.isArray(candidates)) return null;
  const frameKeyFor = (value) => JSON.stringify([value.mediaAssetId, value.matchedFrameTimestampMs ?? null]);
  const allowed = new Map(candidates.map((candidate) => [frameKeyFor(candidate), candidate]));
  const seen = new Set();
  const projected = [];
  for (const value of values) {
    if (!value || typeof value !== "object" || Array.isArray(value) || typeof value.mediaAssetId !== "string" || seen.has(frameKeyFor(value))) {
      return null;
    }
    const candidate = allowed.get(frameKeyFor(value));
    if (!candidate || ![0.8, 0.6].includes(value.score) ||
      !Array.isArray(value.matchReasons) || value.matchReasons.length !== 1 || value.matchReasons[0] !== "semantic-match") {
      return null;
    }
    seen.add(frameKeyFor(value));
    projected.push({ ...candidate, matchReasons: ["semantic-match"], score: value.score });
  }
  // Judge each frame before selecting one result per asset; otherwise the
  // nearest vector frame can hide a different frame that satisfies the query.
  const byAsset = new Map();
  for (const candidate of projected) {
    const existing = byAsset.get(candidate.mediaAssetId);
    if (!existing || candidate.score > existing.score) byAsset.set(candidate.mediaAssetId, candidate);
  }
  return [...byAsset.values()];
};
