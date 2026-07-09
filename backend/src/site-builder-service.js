import { getModelRuntimeStatus, runAgent } from "./agent-runtime.js";

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

const inferTheme = (prompt) => {
  const text = String(prompt || "").toLowerCase();
  if (/摄影|照片|相册|photo|gallery|image/.test(text)) return "gallery";
  if (/作品|项目|portfolio|简历|resume|case/.test(text)) return "portfolio";
  if (/温暖|生活|治愈|warm|cozy|柔和/.test(text)) return "warm";
  return "clean";
};

const displayName = (profile, fallback = "我的") =>
  sanitizeText(profile?.nickname || fallback || "我的", 80) || "我的";

const profileLocation = (profile) =>
  [profile?.community, profile?.activityArea]
    .map((item) => sanitizeText(item, 80))
    .filter(Boolean)
    .join(" · ");

export function normalizeSiteDraft(rawDraft, { prompt = "", profile = {}, stationContent = {} } = {}) {
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

  return {
    version: 1,
    language,
    title,
    theme,
    summary,
    sections: sections.length ? sections : createFallbackSiteDraft({ prompt, profile, stationContent }).sections,
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

export function createFallbackSiteDraft({ prompt = "", profile = {}, stationContent = {} } = {}) {
  const name = displayName(profile);
  const location = profileLocation(profile);
  const mediaAssets = (stationContent.mediaAssets || []).slice(0, 6);
  const diaryEntries = (stationContent.diaryEntries || []).slice(0, 4);
  const title = `${name}的小站`;
  const aboutBody = [
    sanitizeText(profile?.bio, 300),
    location ? `常在 ${location} 活动。` : "",
  ].filter(Boolean).join(" ");
  const sections = [
    {
      type: "hero",
      title,
      subtitle: sanitizeText(prompt, 120) || "欢迎来到我的妙讯主页。",
      body: aboutBody || "这里会展示我的资料、相册、日记和近期动态。",
      assetIds: mediaAssets.slice(0, 1).map((asset) => asset.id),
      diaryEntryIds: [],
      actions: [{ label: "给我发消息", kind: "message", href: "" }],
    },
    {
      type: "about",
      title: "关于我",
      subtitle: location,
      body: aboutBody || "我正在完善自己的个人介绍。",
      assetIds: [],
      diaryEntryIds: [],
      actions: [],
    },
    {
      type: "gallery",
      title: "精选相册",
      subtitle: mediaAssets.length ? "从当前小站素材中挑选展示。" : "上传照片后这里会自动展示精选内容。",
      body: "",
      assetIds: mediaAssets.map((asset) => asset.id),
      diaryEntryIds: [],
      actions: [],
    },
  ];

  if (diaryEntries.length) {
    sections.push({
      type: "diary",
      title: "最近日记",
      subtitle: "保留生活片段和灵感。",
      body: "",
      assetIds: [],
      diaryEntryIds: diaryEntries.map((entry) => entry.id),
      actions: [],
    });
  }

  sections.push({
    type: "contact",
    title: "联系我",
    subtitle: "通过妙讯继续交流。",
    body: "如果你对我的小站内容感兴趣，可以直接给我发消息。",
    assetIds: [],
    diaryEntryIds: [],
    actions: [{ label: "发起会话", kind: "message", href: "" }],
  });

  return normalizeSiteDraft({
    version: 1,
    language: profile?.stationConfig?.language || "zh",
    title,
    theme: inferTheme(prompt),
    summary: sanitizeText(prompt, 180) || "根据当前资料生成的个人主页草稿。",
    sections,
  }, { prompt, profile, stationContent });
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

const fallbackModel = (status, error = null) => ({
  configured: Boolean(status?.configured),
  missing: Array.isArray(status?.missing) ? status.missing : [],
  provider: status?.provider || "not-configured",
  model: status?.model || "",
  error: error ? sanitizeText(error.message || error, 240) : "",
});

export async function buildSiteDraftResponse({
  prompt,
  user,
  profile,
  stationContent = {},
  modelStatus = getModelRuntimeStatus(),
  runAgent: runAgentFn = runAgent,
} = {}) {
  if (!modelStatus.configured) {
    return {
      source: "fallback",
      draft: createFallbackSiteDraft({ prompt, profile, stationContent }),
      model: fallbackModel(modelStatus),
    };
  }

  try {
    const result = await runAgentFn({
      agentId: "site-builder",
      input: prompt,
      user,
      appContext: { profile, stationContent },
    });
    const draft = normalizeSiteDraft(parseJsonReply(result.reply), { prompt, profile, stationContent });

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
    return {
      source: "fallback",
      draft: createFallbackSiteDraft({ prompt, profile, stationContent }),
      model: fallbackModel(modelStatus, error),
    };
  }
}
