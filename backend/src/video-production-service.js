import { replaceControlCharacters } from "./text-sanitization.js";

const minDurationSeconds = 10;
const maxDurationSeconds = 180;
const minShots = 3;
const maxShots = 12;
const shotRoles = ["开场钩子", "环境建立", "人物动作", "情绪推进", "细节特写", "信息补充", "节奏转折", "高潮画面", "回看总结", "结尾行动"];
const cameraPlan = ["wide", "medium", "close-up", "detail", "tracking", "over-shoulder", "top-down", "push-in", "handheld", "final-wide"];
const transitionPlan = ["cut", "match-cut", "dissolve", "cut", "whip-pan", "cut", "fade", "cut", "dissolve", "fade-out"];

const formatLabels = {
  "short-clip": "短视频",
  vlog: "Vlog",
  story: "故事片段",
  promo: "推广短片",
};

const sanitizeVideoText = (value, max = 800) =>
  replaceControlCharacters(value)
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\b(script|iframe|javascript:|onerror|onload|alert)\b/gi, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);

const normalizeFormat = (format) =>
  Object.prototype.hasOwnProperty.call(formatLabels, format) ? format : "short-clip";

const normalizeAspectRatio = (aspectRatio) =>
  ["9:16", "16:9", "1:1"].includes(aspectRatio) ? aspectRatio : "9:16";

const normalizeDurationSeconds = (value) => {
  const parsed = Number(value);
  if (!Number.isInteger(parsed)) return 45;
  return Math.min(Math.max(parsed, minDurationSeconds), maxDurationSeconds);
};

const compactTerms = (value) =>
  sanitizeVideoText(value, 1800)
    .toLowerCase()
    .split(/[^a-z0-9\u3400-\u9fff]+/i)
    .filter((item) => item.length >= 2)
    .slice(0, 60);

const mediaText = (asset = {}) =>
  [
    asset.kind,
    asset.originalFilename,
    asset.caption,
    ...(Array.isArray(asset.tags) ? asset.tags : []),
  ].filter(Boolean).join(" ");

const mediaLabel = (asset = {}) =>
  sanitizeVideoText(asset.caption, 90) ||
  sanitizeVideoText(asset.originalFilename, 90) ||
  `${asset.kind || "media"} 素材`;

function scoreMedia(asset, terms) {
  const text = mediaText(asset).toLowerCase();
  let score = 0;
  for (const term of terms) {
    if (!term) continue;
    if (text.includes(term)) score += 3;
    if ((asset.tags || []).some((tag) => String(tag).toLowerCase().includes(term))) score += 2;
    if (String(asset.caption || "").toLowerCase().includes(term)) score += 1;
  }
  if (score > 0 && asset.kind === "video") score += 1;
  return score;
}

function selectVideoSourceMedia({ mediaAssets = [], query = "", limit = 8 } = {}) {
  const safeLimit = Math.min(Math.max(Number(limit) || 8, 1), 40);
  const terms = compactTerms(query);
  return (Array.isArray(mediaAssets) ? mediaAssets : [])
    .map((asset, index) => ({ asset, index, score: scoreMedia(asset, terms) }))
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .slice(0, safeLimit)
    .map((item) => item.asset);
}

function splitBeats(text) {
  const safe = sanitizeVideoText(text, 4000);
  const sentences = safe
    .split(/(?<=[。！？!?；;.\n])\s+|[。！？!?；;\n]+/)
    .map((item) => sanitizeVideoText(item, 220))
    .filter(Boolean);
  if (sentences.length) return sentences.slice(0, maxShots);

  return (safe.match(/.{1,42}/g) || [])
    .map((item) => sanitizeVideoText(item, 220))
    .filter(Boolean)
    .slice(0, maxShots);
}

function fileContextText(file = {}) {
  const result = file.preprocessingResult || {};
  return [
    file.originalFilename,
    result.title,
    result.summary,
    result.textPreview,
    ...(Array.isArray(result.tags) ? result.tags : []),
  ].filter(Boolean).join(" ");
}

function comicContextText(comicDiary = null) {
  if (!comicDiary) return "";
  return [
    comicDiary.title,
    comicDiary.summary,
    ...(Array.isArray(comicDiary.frames)
      ? comicDiary.frames.flatMap((frame) => [frame.title, frame.scene, frame.caption, frame.dialogue])
      : []),
  ].filter(Boolean).join(" ");
}

function allocateDurations(totalSeconds, shotCount) {
  const base = Math.floor(totalSeconds / shotCount);
  let remainder = totalSeconds - base * shotCount;
  return Array.from({ length: shotCount }, () => {
    const extra = remainder > 0 ? 1 : 0;
    remainder -= extra;
    return base + extra;
  });
}

function buildShot({ index, beat, durationSeconds, format, aspectRatio, mediaAsset }) {
  const scene = sanitizeVideoText(beat, 180) || "记录这一刻的生活片段";
  const role = shotRoles[index - 1] || `镜头 ${index}`;
  const media = mediaAsset ? `参考素材：${mediaLabel(mediaAsset)}。` : "";
  return {
    index,
    title: `${role} · ${scene.slice(0, 18)}`,
    scene,
    narration: sanitizeVideoText(`${scene}`, 180),
    visualPrompt: sanitizeVideoText(`${formatLabels[format]} ${aspectRatio} 画面，${scene} ${media}`, 240),
    durationSeconds,
    camera: cameraPlan[index - 1] || "medium",
    transition: transitionPlan[index - 1] || "cut",
    audioCue: index === 1 ? "轻快开场音乐" : "保持自然环境声与轻音乐",
    mediaAssetIds: mediaAsset?.id ? [mediaAsset.id] : [],
  };
}

export function buildVideoDraft({
  prompt = "",
  diaryEntry = null,
  comicDiary = null,
  mediaAssets = [],
  fileAssets = [],
  format = "short-clip",
  aspectRatio = "9:16",
  durationSeconds = 45,
} = {}) {
  const normalizedFormat = normalizeFormat(format);
  const normalizedAspectRatio = normalizeAspectRatio(aspectRatio);
  const normalizedDuration = normalizeDurationSeconds(durationSeconds);
  const safePrompt = sanitizeVideoText(prompt, 1200);
  const safeDiaryTitle = sanitizeVideoText(diaryEntry?.title, 120);
  const safeDiaryBody = sanitizeVideoText(diaryEntry?.body, 2200);
  const safeMood = sanitizeVideoText(diaryEntry?.mood, 40);
  const safeComicText = comicContextText(comicDiary);
  const fileTexts = (Array.isArray(fileAssets) ? fileAssets : [])
    .map(fileContextText)
    .map((item) => sanitizeVideoText(item, 600))
    .filter(Boolean);
  const sourceText = [
    safePrompt,
    safeDiaryTitle,
    safeDiaryBody,
    safeMood,
    safeComicText,
    ...fileTexts,
  ].filter(Boolean).join(" ");
  const selectedMedia = selectVideoSourceMedia({
    mediaAssets,
    query: sourceText,
    limit: 10,
  });
  const beats = splitBeats(sourceText);
  const shotCount = Math.min(
    maxShots,
    Math.max(minShots, beats.length || Math.ceil(normalizedDuration / 9)),
  );
  const durations = allocateDurations(normalizedDuration, shotCount);
  const fallbackBeat = safePrompt || safeDiaryTitle || safeComicText || "把当前小站素材剪成一支短视频";
  const shots = Array.from({ length: shotCount }, (_, offset) => buildShot({
    index: offset + 1,
    beat: beats[offset] || beats[beats.length - 1] || fallbackBeat,
    durationSeconds: durations[offset],
    format: normalizedFormat,
    aspectRatio: normalizedAspectRatio,
    mediaAsset: selectedMedia.length ? selectedMedia[offset % selectedMedia.length] : null,
  }));
  const narration = shots.map((shot) => shot.narration);
  const title = safeDiaryTitle || sanitizeVideoText(comicDiary?.title, 120) || sanitizeVideoText(safePrompt, 80) || "视频草稿";
  const summary = sanitizeVideoText(
    safeDiaryBody || safeComicText || safePrompt || fileTexts[0] || "根据当前小站素材生成的视频脚本草稿。",
    320,
  );

  return {
    version: 1,
    title,
    format: normalizedFormat,
    aspectRatio: normalizedAspectRatio,
    durationSeconds: normalizedDuration,
    source: "deterministic-script",
    summary,
    script: {
      hook: sanitizeVideoText(narration[0] || fallbackBeat, 120),
      narration,
      captions: shots.map((shot) => sanitizeVideoText(shot.scene, 80)),
      callToAction: "保存这支视频草稿，后续接入视频生成模型后可继续渲染。",
      styleNotes: [
        `${formatLabels[normalizedFormat]}节奏`,
        `${normalizedAspectRatio} 构图`,
        safeMood ? `${safeMood}情绪` : "自然生活感",
      ],
    },
    shots,
    sourceRefs: {
      diaryEntryId: diaryEntry?.id || null,
      comicDiaryId: comicDiary?.id || null,
      mediaAssetIds: selectedMedia.map((asset) => asset.id).filter(Boolean),
      fileAssetIds: (Array.isArray(fileAssets) ? fileAssets : []).map((asset) => asset.id).filter(Boolean),
    },
  };
}
