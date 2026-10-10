import { z } from "zod";

export const MEDIA_RETRIEVAL_PARSER_RESPONSE_SCHEMA_VERSION = "media-retrieval-parser-response-v3";

// The ordered spans must reproduce the normalized original query exactly.
// The compiler, not a model rewrite, constructs all downstream model inputs.
export const mediaRetrievalParserResponseSchema = z.object({
  spans: z.array(z.object({
    text: z.string().min(1).max(240),
    role: z.enum(["visual", "identity", "syntax"]),
  }).strict()).max(36),
  parseConfidence: z.enum(["high", "low"]),
}).strict();

export const validateMediaRetrievalParserResponse = (candidate) => {
  if (!candidate || typeof candidate !== "object" || Array.isArray(candidate) ||
    Object.getPrototypeOf(candidate) !== Object.prototype) {
    return { ok: false, reasonCode: "parser-candidate-unverifiable" };
  }
  const parsed = mediaRetrievalParserResponseSchema.safeParse(candidate);
  if (!parsed.success) return { ok: false, reasonCode: "parser-candidate-unverifiable" };
  return { ok: true, candidate: parsed.data, schemaVersion: MEDIA_RETRIEVAL_PARSER_RESPONSE_SCHEMA_VERSION };
};
