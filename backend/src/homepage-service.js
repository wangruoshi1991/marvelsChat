import crypto from "crypto";
import { HttpError } from "./http-error.js";
import { homepageDraftContentSchema } from "./schemas.js";

const allowedSectionTypes = new Set(["hero", "about", "gallery", "diary", "contact"]);

const sanitizeText = (value, max) =>
  String(value || "")
    .replace(/<[^>]*>/g, "")
    .replace(/\b(script|iframe|javascript:|onerror|onload)\b/gi, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);

const unique = (items) => Array.from(new Set(items));

export function selectExplicitHomepageMedia({ mediaAssetIds = [], mediaAssets = [] } = {}) {
  const byId = new Map(mediaAssets.map((asset) => [asset.id, asset]));
  return mediaAssetIds.map((id) => {
    const asset = byId.get(id);
    if (!asset || asset.status !== "uploaded" || !asset.storageKey) {
      throw new HttpError(409, "Selected photo is not ready for homepage generation.");
    }
    if (!String(asset.mimeType || "").toLowerCase().startsWith("image/")) {
      throw new HttpError(400, "Homepage generation currently supports photos only.");
    }
    return asset;
  });
}

const section = ({
  id,
  type,
  title,
  subtitle = "",
  body = "",
  assetIds = [],
  hidden = false,
}) => ({
  id,
  type,
  title,
  subtitle,
  body,
  assetIds,
  diaryEntryIds: [],
  actions: [],
  hidden: Boolean(hidden),
});

export function createHomepageFallbackDraft({ prompt = "", profile = {}, mediaAssets = [] } = {}) {
  const nickname = sanitizeText(profile.nickname || "我", 80) || "我";
  const cleanPrompt = sanitizeText(prompt, 240);
  const bio = sanitizeText(profile.bio, 500);
  const assetIds = mediaAssets.map((asset) => asset.id).filter(Boolean).slice(0, 9);
  const cleanThemeRequested = /简洁|极简|档案|clean|minimal/i.test(cleanPrompt);

  return homepageDraftContentSchema.parse({
    version: 2,
    language: profile?.stationConfig?.language === "en" ? "en" : "zh",
    title: `${nickname}的主页`,
    theme: cleanThemeRequested ? "clean" : "gallery",
    summary: cleanPrompt || "用喜欢的照片记录当下。",
    sections: [
      section({
        id: "hero",
        type: "hero",
        title: `${nickname}的主页`,
        subtitle: cleanPrompt || "欢迎来到我的个人空间",
        assetIds: assetIds.slice(0, 1),
      }),
      section({
        id: "about",
        type: "about",
        title: "关于我",
        body: bio || "我正在用照片记录自己的生活。",
      }),
      section({
        id: "gallery",
        type: "gallery",
        title: "我的照片",
        subtitle: "这些内容由我亲自选择。",
        assetIds,
      }),
    ],
  });
}

const safeSectionId = (value, type, index, usedIds) => {
  const base = sanitizeText(value || type || `section-${index + 1}`, 80)
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "") || `section-${index + 1}`;
  let candidate = base;
  let suffix = 2;
  while (usedIds.has(candidate)) {
    candidate = `${base}-${suffix}`;
    suffix += 1;
  }
  usedIds.add(candidate);
  return candidate;
};

export function normalizeHomepageDraft(rawDraft, { prompt = "", profile = {}, mediaAssets = [] } = {}) {
  const raw = rawDraft && typeof rawDraft === "object" ? rawDraft : {};
  const allowedAssetIds = new Set(mediaAssets.map((asset) => asset.id));
  const usedIds = new Set();
  const sections = (Array.isArray(raw.sections) ? raw.sections : [])
    .map((item, index) => {
      const type = allowedSectionTypes.has(item?.type) ? item.type : null;
      if (!type) return null;
      return section({
        id: safeSectionId(item?.id, type, index, usedIds),
        type,
        title: sanitizeText(item?.title, 80) || defaultSectionTitle(type),
        subtitle: sanitizeText(item?.subtitle, 180),
        body: sanitizeText(item?.body, 900),
        assetIds: unique(Array.isArray(item?.assetIds) ? item.assetIds : [])
          .filter((id) => allowedAssetIds.has(id))
          .slice(0, 9),
        hidden: item?.hidden,
      });
    })
    .filter(Boolean)
    .slice(0, 8);

  if (!sections.length) {
    return createHomepageFallbackDraft({ prompt, profile, mediaAssets });
  }

  return homepageDraftContentSchema.parse({
    version: 2,
    language: raw.language === "en" ? "en" : "zh",
    title: sanitizeText(raw.title, 80) || `${sanitizeText(profile.nickname || "我", 80)}的主页`,
    theme: raw.theme === "gallery" ? "gallery" : "clean",
    summary: sanitizeText(raw.summary, 240) || sanitizeText(prompt, 240),
    sections,
  });
}

function defaultSectionTitle(type) {
  return {
    hero: "主页",
    about: "关于我",
    gallery: "我的照片",
    diary: "生活记录",
    contact: "联系我",
  }[type] || "主页模块";
}

export async function generateHomepageDraft({
  prompt,
  profile,
  mediaAssets,
  runModel,
  deadlineMs = 20_000,
} = {}) {
  const fallback = () => createHomepageFallbackDraft({ prompt, profile, mediaAssets });
  let timer;
  const deadline = new Promise((resolve) => {
    timer = setTimeout(() => resolve({ deadline: true }), Math.max(1, deadlineMs));
  });

  try {
    const result = await Promise.race([
      Promise.resolve().then(() => runModel({ prompt, profile, mediaAssets })),
      deadline,
    ]);
    if (result?.deadline) {
      return { source: "fallback", reason: "deadline", draft: fallback() };
    }
    return {
      source: result?.source === "model" ? "model" : "fallback",
      reason: result?.source === "model" ? null : "model_unavailable",
      draft: normalizeHomepageDraft(result?.draft, { prompt, profile, mediaAssets }),
    };
  } catch {
    return { source: "fallback", reason: "model_error", draft: fallback() };
  } finally {
    clearTimeout(timer);
  }
}

export function buildHomepagePageView({
  mode,
  profile = {},
  draft,
  mediaAssets = [],
  visibility = "private",
  publishedAt = null,
  mediaUrl,
} = {}) {
  const referencedIds = unique(
    (draft?.sections || []).flatMap((item) => Array.isArray(item.assetIds) ? item.assetIds : []),
  );
  const byId = new Map(mediaAssets.map((asset) => [asset.id, asset]));
  const media = referencedIds
    .map((id) => byId.get(id))
    .filter((asset) => asset?.status === "uploaded" && asset.storageKey)
    .map((asset) => ({
      id: asset.id,
      url: mediaUrl(asset),
      mimeType: asset.mimeType || "image/jpeg",
      width: Number(asset.width || 0) || null,
      height: Number(asset.height || 0) || null,
      alt: sanitizeText(asset.caption, 160) || "个人主页照片",
    }));

  return {
    mode: mode === "share" ? "share" : "preview",
    owner: {
      nickname: sanitizeText(profile.nickname, 80),
      avatarText: sanitizeText(profile.avatarText, 8),
      bio: sanitizeText(profile.bio, 500),
    },
    page: homepageDraftContentSchema.parse(draft),
    media,
    visibility: visibility === "link" ? "link" : "private",
    publishedAt,
  };
}

export function hashHomepageAccessToken(token) {
  return crypto.createHash("sha256").update(String(token || "")).digest("hex");
}

export function createHomepageAccessToken() {
  const token = crypto.randomBytes(32).toString("base64url");
  return { token, hash: hashHomepageAccessToken(token) };
}

export function assertHomepageRevision(actualRevision, expectedRevision) {
  if (Number(actualRevision) !== Number(expectedRevision)) {
    throw new HttpError(409, "Homepage draft changed on another device.", {
      code: "homepage_revision_conflict",
      actualRevision: Number(actualRevision),
    });
  }
}
