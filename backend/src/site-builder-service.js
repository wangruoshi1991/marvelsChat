import { getModelRuntimeStatus, runAgent } from "./agent-runtime.js";
import { HttpError } from "./http-error.js";

const allowedThemes = new Set(["clean", "warm", "gallery", "portfolio"]);
const allowedLanguages = new Set(["zh", "en"]);
const allowedSectionTypes = new Set(["hero", "about", "gallery", "diary", "contact"]);
const maxSections = 8;

const sanitizeText = (value, max = 500) =>
  String(value || "")
    .replace(/<[^>]*>/g, "")
    .replace(/\b(script|iframe|javascript:|onerror|onload)\b/gi, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);

const sanitizeIdList = (items = [], max = 12) =>
  (Array.isArray(items) ? items : [])
    .map((item) => sanitizeText(item, 120))
    .filter(Boolean)
    .slice(0, max);

const normalizeActions = (actions = []) =>
  (Array.isArray(actions) ? actions : [])
    .map((action) => ({
      label: sanitizeText(action?.label, 40),
      kind: ["message", "follow", "link"].includes(action?.kind) ? action.kind : "message",
      href: sanitizeText(action?.href, 240),
    }))
    .filter((action) => action.label)
    .slice(0, 3);

const displayName = (profile, fallback = "我的") =>
  sanitizeText(profile?.nickname || fallback || "我的", 80) || "我的";

export function normalizeSiteDraft(rawDraft, { prompt = "", profile = {} } = {}) {
  const raw = rawDraft && typeof rawDraft === "object" ? rawDraft : {};
  const language = allowedLanguages.has(raw.language) ? raw.language : profile?.stationConfig?.language || "zh";
  const theme = allowedThemes.has(raw.theme) ? raw.theme : "clean";
  const title = sanitizeText(raw.title, 80) || `${displayName(profile)}的小站`;
  const summary = sanitizeText(raw.summary, 240) || sanitizeText(prompt, 180) || "根据当前资料生成的个人主页草稿。";
  const sections = (Array.isArray(raw.sections) ? raw.sections : [])
    .map((section) => {
      const type = allowedSectionTypes.has(section?.type) ? section.type : null;
      if (!type) return null;

      return {
        type,
        title: sanitizeText(section.title, 80) || defaultSectionTitle(type),
        subtitle: sanitizeText(section.subtitle, 180),
        body: sanitizeText(section.body, 900),
        assetIds: sanitizeIdList(section.assetIds, 12),
        diaryEntryIds: sanitizeIdList(section.diaryEntryIds, 8),
        actions: normalizeActions(section.actions),
      };
    })
    .filter(Boolean)
    .slice(0, maxSections);

  if (!sections.length) {
    throw new HttpError(502, "Site builder returned no valid sections.", {
      code: "SITE_BUILDER_INVALID_RESPONSE",
    });
  }

  return {
    version: 1,
    language,
    title,
    theme,
    summary,
    sections,
  };
}

function defaultSectionTitle(type) {
  return {
    hero: "首页",
    about: "关于我",
    gallery: "相册",
    diary: "日记",
    contact: "联系我",
  }[type] || "模块";
}

function parseJsonReply(reply) {
  const text = String(reply || "").trim();
  if (!text) throw new Error("site-builder returned an empty draft");

  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenced ? fenced[1].trim() : text;
  const start = candidate.indexOf("{");
  const end = candidate.lastIndexOf("}");
  if (start < 0 || end < start) {
    throw new Error("site-builder did not return a JSON object");
  }
  return JSON.parse(candidate.slice(start, end + 1));
}

export async function buildSiteDraftResponse({
  prompt,
  user,
  profile,
  stationContent = {},
  modelStatus = getModelRuntimeStatus(),
  runAgent: runAgentFn = runAgent,
} = {}) {
  if (!modelStatus.configured) {
    throw new HttpError(503, "Site builder is not configured.", {
      code: "SITE_BUILDER_UNAVAILABLE",
    });
  }

  try {
    const result = await runAgentFn({
      agentId: "site-builder",
      input: prompt,
      user,
      appContext: { profile, stationContent },
    });
    const draft = normalizeSiteDraft(parseJsonReply(result.reply), {
      prompt,
      profile,
    });

    return {
      source: "model",
      draft,
      model: {
        configured: true,
        missing: [],
        provider: result.provider || modelStatus.provider || "new-api",
        model: modelStatus.model || "",
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
