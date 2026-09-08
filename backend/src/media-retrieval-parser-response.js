import { z } from "zod";

export const MEDIA_RETRIEVAL_PARSER_RESPONSE_SCHEMA_VERSION = "media-retrieval-parser-response-v1";

const MAX_VISUAL_QUERY_LENGTH = 240;
const MAX_IDENTITY_TERM_LENGTH = 80;
const MAX_IDENTITY_TERMS = 12;

const isPlainObject = (value) =>
  Boolean(value) &&
  typeof value === "object" &&
  !Array.isArray(value) &&
  Object.getPrototypeOf(value) === Object.prototype;

const hasBoundedNormalizedTerm = (value) => {
  if (typeof value !== "string" || value.length > MAX_IDENTITY_TERM_LENGTH) return false;
  const normalized = value.normalize("NFKC").trim();
  return normalized.length > 0 && normalized.length <= MAX_IDENTITY_TERM_LENGTH;
};

const parserIdentityTermSchema = z.string().refine(hasBoundedNormalizedTerm, {
  message: "Parser identity terms must be bounded non-empty strings.",
});

export const mediaRetrievalParserResponseSchema = z
  .object({
    visualQuery: z.string().max(MAX_VISUAL_QUERY_LENGTH),
    identityTerms: z.array(parserIdentityTermSchema).max(MAX_IDENTITY_TERMS),
    parseConfidence: z.enum(["high", "low"]),
  })
  .strict();

// This validator deliberately does not coerce malformed parser output into a
// harmless-looking empty candidate. The Provider and final embedding boundary
// both use it so an invalid parser response remains fail-closed if either
// layer is invoked directly.
export const validateMediaRetrievalParserResponse = (candidate) => {
  if (!isPlainObject(candidate)) {
    return { ok: false, reasonCode: "parser-candidate-unverifiable" };
  }
  const parsed = mediaRetrievalParserResponseSchema.safeParse(candidate);
  if (!parsed.success) {
    return { ok: false, reasonCode: "parser-candidate-unverifiable" };
  }
  return {
    ok: true,
    candidate: parsed.data,
    schemaVersion: MEDIA_RETRIEVAL_PARSER_RESPONSE_SCHEMA_VERSION,
  };
};
