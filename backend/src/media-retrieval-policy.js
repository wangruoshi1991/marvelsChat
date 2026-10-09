import { z } from "zod";
import { MEDIA_RETRIEVAL_LIMITS } from "./media-retrieval-constants.js";
import { validateMediaRetrievalParserResponse } from "./media-retrieval-parser-response.js";

const descriptorString = z.string().trim().min(1).max(160);
const descriptorListItem = z.string().trim().min(1).max(80);
const forbiddenDescriptorKeys = new Set([
  "age",
  "celebrity",
  "demographic",
  "ethnicity",
  "face",
  "gender",
  "health",
  "identity",
  "name",
  "nationality",
  "personname",
  "personality",
  "politics",
  "race",
  "religion",
]);

const normalizeKey = (key) => String(key || "").replace(/[^a-z]/gi, "").toLowerCase();
const normalizeList = (values, maximum = MEDIA_RETRIEVAL_LIMITS.maxDescriptorArrayItems) =>
  Array.from(
    new Set(
      (Array.isArray(values) ? values : [])
        .map((value) => String(value || "").trim())
        .filter(Boolean),
    ),
  ).slice(0, maximum);

export const MEDIA_RETRIEVAL_VISUAL_DESCRIPTOR_PROJECTION_VERSION = "ocr-isolation-v1";
const graphemeSegmenter = new Intl.Segmenter("und", { granularity: "grapheme" });

// OCR is retained for owner-scoped exact matching. A model can accidentally
// repeat it inside visual fields, so also strip those copies deterministically
// at persistence and when projecting older indexed descriptors for reranking.
export const isolateMediaRetrievalDescriptorOcr = (descriptor = {}) => {
  descriptor ??= {};
  const tokens = Array.from(new Set((Array.isArray(descriptor.ocrText) ? descriptor.ocrText : [])
    .flatMap((text) => String(text).normalize("NFKC").match(/[\p{L}\p{N}]+/gu) || [])))
    .sort((left, right) => right.length - left.length);
  const patterns = tokens.map((token) => {
    const escaped = token.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    return new RegExp(/\p{Script=Han}/u.test(token) ? escaped : `(?<![\\p{L}\\p{N}])${escaped}(?![\\p{L}\\p{N}])`, "giu");
  });
  const strip = (value) => {
    const original = String(value || "");
    const spans = [];
    let normalized = "";
    // Match in normalized text, but map each match back to its original
    // graphemes so unrelated punctuation, accents and fullwidth text survive.
    for (const { segment, index } of graphemeSegmenter.segment(original)) {
      const text = segment.normalize("NFKC");
      normalized += text;
      for (let offset = 0; offset < text.length; offset += 1) {
        spans.push({ start: index, end: index + segment.length });
      }
    }
    const ranges = patterns.flatMap((pattern) => Array.from(normalized.matchAll(pattern), (match) => ({
      start: spans[match.index].start,
      end: spans[match.index + match[0].length - 1].end,
    }))).sort((left, right) => left.start - right.start);
    if (!ranges.length) return original;
    let result = "";
    let offset = 0;
    for (const range of ranges) {
      if (range.end <= offset) continue;
      result += original.slice(offset, Math.max(offset, range.start)) + " ";
      offset = range.end;
    }
    return (result + original.slice(offset)).replace(/\s+/gu, " ").trim();
  };
  return {
    ...descriptor,
    ...(typeof descriptor.summary === "string" ? { summary: strip(descriptor.summary) } : {}),
    clothing: (Array.isArray(descriptor.clothing) ? descriptor.clothing : [])
      .map((garment) => ({ type: strip(garment?.type), color: strip(garment?.color) }))
      .filter((garment) => garment.type && garment.color),
    ...Object.fromEntries(["scene", "actions", "objects", "qualitySignals"].map((field) => [field,
      (Array.isArray(descriptor[field]) ? descriptor[field] : []).map(strip).filter(Boolean)])),
  };
};

export const descriptorSchema = z
  .object({
    summary: descriptorString,
    clothing: z
      .array(
        z
          .object({
            type: descriptorListItem,
            color: descriptorListItem,
          })
          .strip(),
      )
      .max(MEDIA_RETRIEVAL_LIMITS.maxDescriptorArrayItems)
      .default([]),
    scene: z.array(descriptorListItem).max(MEDIA_RETRIEVAL_LIMITS.maxDescriptorArrayItems).default([]),
    actions: z.array(descriptorListItem).max(MEDIA_RETRIEVAL_LIMITS.maxDescriptorArrayItems).default([]),
    objects: z.array(descriptorListItem).max(MEDIA_RETRIEVAL_LIMITS.maxDescriptorArrayItems).default([]),
    ocrText: z.array(descriptorListItem).max(MEDIA_RETRIEVAL_LIMITS.maxDescriptorArrayItems).default([]),
    qualitySignals: z.array(descriptorListItem).max(MEDIA_RETRIEVAL_LIMITS.maxDescriptorArrayItems).default([]),
  })
  .strip()
  .transform((value) => ({
    summary: value.summary.slice(0, MEDIA_RETRIEVAL_LIMITS.maxDescriptorSummaryLength),
    clothing: value.clothing.slice(0, MEDIA_RETRIEVAL_LIMITS.maxDescriptorArrayItems),
    scene: normalizeList(value.scene),
    actions: normalizeList(value.actions),
    objects: normalizeList(value.objects),
    ocrText: normalizeList(value.ocrText),
    qualitySignals: normalizeList(value.qualitySignals),
  }));

export const normalizeDescriptor = (candidate) => {
  if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) return null;
  if (Object.keys(candidate).some((key) => forbiddenDescriptorKeys.has(normalizeKey(key)))) return null;
  const parsed = descriptorSchema.safeParse(candidate);
  if (!parsed.success) return null;
  const isolated = isolateMediaRetrievalDescriptorOcr(parsed.data);
  // A descriptor consisting only of visible text has no verified visual
  // summary; keep it as an explicit policy failure rather than inventing one.
  return isolated.summary ? isolated : null;
};

const normalizeIdentityTerms = (candidate) =>
  Array.from(
    new Set(
      candidate
        .map((value) => value.trim())
        .filter(Boolean),
    ),
  ).slice(0, 12);

const escapeRegExp = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const removeIdentityTerms = (visualQuery, identityTerms) => {
  let result = String(visualQuery || "").trim();
  for (const term of identityTerms) {
    result = result.replace(new RegExp(escapeRegExp(term), "gi"), " ");
  }
  return result.replace(/\s+/g, " ").trim().slice(0, 240);
};

export const normalizeRetrievalQuery = (candidate) => {
  const validated = validateMediaRetrievalParserResponse(candidate);
  if (!validated.ok) return null;
  const identityTerms = normalizeIdentityTerms(validated.candidate.identityTerms);
  const parseConfidence = validated.candidate.parseConfidence;
  if (parseConfidence !== "high") {
    return { visualQuery: "", identityTerms, parseConfidence: "low" };
  }
  const visualQuery = removeIdentityTerms(validated.candidate.visualQuery, identityTerms);
  return {
    visualQuery,
    identityTerms,
    parseConfidence: visualQuery ? "high" : "low",
  };
};
