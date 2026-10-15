import { getModelRuntimeStatus, runAgent } from "./agent-runtime.js";
import { HttpError } from "./http-error.js";
import { z } from "zod";
import { assertSiteDocumentContent, collectSiteDocumentReferences, SiteDocumentValidationError } from "../../shared/site-document.js";

export function validateSiteDraftContent(rawDraft) {
  try {
    assertSiteDocumentContent(rawDraft);
  } catch (error) {
    if (!(error instanceof SiteDocumentValidationError)) throw error;
    throw new HttpError(502, "Site builder returned an invalid document structure.", {
      code: "SITE_BUILDER_INVALID_RESPONSE", path: error.path,
    });
  }
  return rawDraft;
}

function parseJsonReply(reply) {
  if (typeof reply !== "string" || !reply.trim()) throw new Error("site-builder returned an empty draft");
  return JSON.parse(reply);
}

export async function buildSiteDraftResponse({
  prompt,
  user,
  profile,
  stationContent = {},
  textHandoffs = [],
  modelStatus = getModelRuntimeStatus({ role: "planning" }),
  beforeModelCall = null,
  afterModelCall = null,
  runAgent: runAgentFn = runAgent,
} = {}) {
  if (!modelStatus.configured) {
    throw new HttpError(503, "Site builder is not configured.", {
      code: "SITE_BUILDER_UNAVAILABLE",
    });
  }

  try {
    const checkedHandoffs = z.array(z.object({ kind: z.literal("text_result"), title: z.string().trim().min(1).max(160),
      content: z.string().trim().min(1).max(16000) }).strict()).max(26).safeParse(textHandoffs);
    if (!checkedHandoffs.success) throw new HttpError(422, "Site builder received an invalid text handoff.", { code: "SITE_BUILDER_INVALID_HANDOFF" });
    let result;
    try {
      result = await runAgentFn({
        agentId: "site-builder",
        input: prompt,
        user,
        appContext: { profile, stationContent, textHandoffs: checkedHandoffs.data },
        beforeModelCall, afterModelCall,
      });
    } catch (error) {
      // fetch can lose the connection after the provider has accepted/billed
      // the request. Preserve that uncertainty through draft validation.
      if (error?.name === "TypeError") {
        throw new HttpError(504, "Model provider response was interrupted; the result is unknown.", {
          code: "AI_PROVIDER_RESULT_UNKNOWN",
        });
      }
      throw error;
    }
    const draft = validateSiteDraftContent(parseJsonReply(result.reply));
    const availableMedia = new Set((stationContent.mediaAssets || []).map(item => item.id));
    const availableDiaries = new Set((stationContent.diaryEntries || []).map(item => item.id));
    const references = collectSiteDocumentReferences(draft);
    if (references.assetIds.some(id => !availableMedia.has(id)) ||
      references.diaryEntryIds.some(id => !availableDiaries.has(id))) {
      throw new HttpError(502, "Site builder referenced unavailable resources.", { code: "SITE_BUILDER_INVALID_REFERENCES" });
    }

    return {
      source: "model",
      draft,
      model: {
        configured: true,
        missing: [],
        provider: result.provider || modelStatus.provider || "new-api",
        model: result.model || modelStatus.model || "",
        servedModel: result.servedModel ?? null,
        error: "",
        tokenUsage: result.tokenUsage || null,
        latencyMs: result.latencyMs ?? null,
      },
    };
  } catch (error) {
    if (error instanceof HttpError) throw error;
    throw new HttpError(502, "Site builder could not create a valid draft.", {
      code: "SITE_BUILDER_FAILED",
    });
  }
}
