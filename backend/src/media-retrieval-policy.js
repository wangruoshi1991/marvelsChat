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
  return parsed.success ? parsed.data : null;
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
