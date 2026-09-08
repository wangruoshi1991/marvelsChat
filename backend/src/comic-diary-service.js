import { replaceControlCharacters } from "./text-sanitization.js";
import { getModelRuntimeStatus, runAgent } from "./agent-runtime.js";
import { HttpError } from "./http-error.js";

const maxFrames = 8;
const minFrames = 2;
const cameraPlan = ["wide", "medium", "close-up", "detail", "over-shoulder", "top-down", "low-angle", "final-wide"];
const frameRoles = ["开场", "推进", "转折", "收束", "补充", "特写", "回望", "结尾"];

const styleLabels = {
  "slice-of-life": "生活四格",
  cute: "可爱漫画",
  manga: "黑白漫画",
  storyboard: "分镜草稿",
};

const sanitizeComicText = (value, max = 600) =>
  replaceControlCharacters(value)
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\b(script|iframe|javascript:|onerror|onload|alert)\b/gi, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);

const normalizeFrameCount = (value) => {
  const parsed = Number(value);
  if (!Number.isInteger(parsed)) return 4;
  return Math.min(Math.max(parsed, minFrames), maxFrames);
};

const normalizeStyle = (style) =>
  Object.prototype.hasOwnProperty.call(styleLabels, style) ? style : "slice-of-life";

const compactWords = (value) =>
  sanitizeComicText(value, 1200)
    .toLowerCase()
    .split(/[^a-z0-9\u3400-\u9fff]+/i)
    .filter((item) => item.length >= 2)
    .slice(0, 40);

const mediaSearchText = (asset = {}) =>
  [
    asset.kind,
    asset.originalFilename,
    asset.caption,
    ...(Array.isArray(asset.tags) ? asset.tags : []),
  ].filter(Boolean).join(" ");

const mediaSummary = (asset = {}) => {
  const caption = sanitizeComicText(asset.caption, 80);
  if (caption) return caption;
  const filename = sanitizeComicText(asset.originalFilename, 80);
  return filename || `${asset.kind || "media"} 素材`;
};

const splitStoryBeats = (text) => {
  const safe = sanitizeComicText(text, 3000);
  const sentences = safe
    .split(/(?<=[。！？!?；;.\n])\s+|[。！？!?；;\n]+/)
    .map((item) => sanitizeComicText(item, 220))
    .filter(Boolean);
  if (sentences.length) return sentences.slice(0, maxFrames);

  const chunks = safe.match(/.{1,42}/g) || [];
  return chunks.map((item) => sanitizeComicText(item, 220)).filter(Boolean).slice(0, maxFrames);
};

const fileContextText = (file = {}) => {
  const result = file.preprocessingResult || {};
  return [
    file.originalFilename,
    result.title,
    result.summary,
    result.textPreview,
    ...(Array.isArray(result.tags) ? result.tags : []),
  ].filter(Boolean).join(" ");
};

function scoreMedia(asset, terms) {
  const text = mediaSearchText(asset).toLowerCase();
  let score = 0;
  for (const term of terms) {
    if (!term) continue;
    if (text.includes(term)) score += 3;
    if ((asset.tags || []).some((tag) => String(tag).toLowerCase().includes(term))) score += 2;
    if (String(asset.caption || "").toLowerCase().includes(term)) score += 1;
  }
  return score;
}

function selectComicSourceMedia({ mediaAssets = [], query = "", limit = 6 } = {}) {
  const safeLimit = Math.min(Math.max(Number(limit) || 6, 1), 20);
  const terms = compactWords(query);
  return (Array.isArray(mediaAssets) ? mediaAssets : [])
    .map((asset, index) => ({ asset, index, score: scoreMedia(asset, terms) }))
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .slice(0, safeLimit)
    .map((item) => item.asset);
}

function buildFrame({ index, beat, style, mood, mediaAsset }) {
  const scene = sanitizeComicText(beat, 180) || "记录这一刻的生活片段";
  const mediaText = mediaAsset ? `参考素材：${mediaSummary(mediaAsset)}。` : "";
  const role = frameRoles[index - 1] || `第 ${index} 幕`;
  return {
    index,
    title: `${role} · ${scene.slice(0, 18)}`,
    scene,
    caption: sanitizeComicText(`${styleLabels[style]}画面：${scene} ${mediaText}`, 220),
    dialogue: sanitizeComicText(mood ? `今天的心情是${mood}。` : "把这一刻留在我的小站里。", 120),
    mood: sanitizeComicText(mood || "日常", 40),
    camera: cameraPlan[index - 1] || "medium",
    mediaAssetIds: mediaAsset?.id ? [mediaAsset.id] : [],
  };
}

export function buildComicDiaryDraft({
  prompt = "",
  diaryEntry = null,
  mediaAssets = [],
  fileAssets = [],
  style = "slice-of-life",
  frameCount = 4,
} = {}) {
  const normalizedStyle = normalizeStyle(style);
  const count = normalizeFrameCount(frameCount);
  const safePrompt = sanitizeComicText(prompt, 1200);
  const safeDiaryTitle = sanitizeComicText(diaryEntry?.title, 120);
  const safeDiaryBody = sanitizeComicText(diaryEntry?.body, 2000);
  const safeMood = sanitizeComicText(diaryEntry?.mood, 40);
  const fileTexts = (Array.isArray(fileAssets) ? fileAssets : [])
    .map(fileContextText)
    .map((item) => sanitizeComicText(item, 500))
    .filter(Boolean);
  const sourceText = [
    safePrompt,
    safeDiaryTitle,
    safeDiaryBody,
    safeMood,
    ...fileTexts,
  ].filter(Boolean).join(" ");
  const selectedMedia = selectComicSourceMedia({
    mediaAssets,
    query: sourceText,
    limit: Math.max(count, 4),
  });
  const beats = splitStoryBeats(sourceText);
  const fallbackBeat = safePrompt || safeDiaryTitle || "把今天的生活片段改编成漫画日记";
  const frames = Array.from({ length: count }, (_, offset) => buildFrame({
    index: offset + 1,
    beat: beats[offset] || beats[beats.length - 1] || fallbackBeat,
    style: normalizedStyle,
    mood: safeMood,
    mediaAsset: selectedMedia.length ? selectedMedia[offset % selectedMedia.length] : null,
  }));
  const title = safeDiaryTitle || sanitizeComicText(safePrompt, 80) || "漫画日记";
  const summary = sanitizeComicText(
    safeDiaryBody || safePrompt || fileTexts[0] || "根据当前小站素材生成漫画分镜草稿。",
    280,
  );

  return {
    version: 1,
    title,
    style: normalizedStyle,
    source: "deterministic-storyboard",
    summary,
    frames,
    sourceRefs: {
      diaryEntryId: diaryEntry?.id || null,
      mediaAssetIds: selectedMedia.map((asset) => asset.id).filter(Boolean),
      fileAssetIds: (Array.isArray(fileAssets) ? fileAssets : []).map((asset) => asset.id).filter(Boolean),
    },
  };
}

const parseJsonReply = (reply) => {
  const text = String(reply || "").trim();
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenced ? fenced[1].trim() : text;
  const start = candidate.indexOf("{");
  const end = candidate.lastIndexOf("}");
  if (start < 0 || end < start) {
    throw new Error("comic-diary did not return a JSON object");
  }
  return JSON.parse(candidate.slice(start, end + 1));
};

const normalizeAgentFrame = (frame, index, allowedMediaIds) => ({
  index: index + 1,
  title: sanitizeComicText(frame?.title, 80) || `第 ${index + 1} 格`,
  scene: sanitizeComicText(frame?.scene, 220),
  caption: sanitizeComicText(frame?.caption, 220),
  dialogue: sanitizeComicText(frame?.dialogue, 160),
  mood: sanitizeComicText(frame?.mood, 40),
  camera: sanitizeComicText(frame?.camera, 40),
  mediaAssetIds: Array.from(new Set(Array.isArray(frame?.mediaAssetIds) ? frame.mediaAssetIds : []))
    .filter((id) => allowedMediaIds.has(id))
    .slice(0, 4),
});

export function normalizeComicDiaryAgentDraft(
  rawDraft,
  { diaryEntry, mediaAssets = [], fileAssets = [], style, frameCount },
) {
  const count = normalizeFrameCount(frameCount);
  const allowedMediaIds = new Set(mediaAssets.map((asset) => asset.id).filter(Boolean));
  const rawFrames = Array.isArray(rawDraft?.frames) ? rawDraft.frames : [];
  if (rawFrames.length !== count) {
    throw new HttpError(502, "Comic diary Agent returned an invalid frame count.", {
      code: "COMIC_DIARY_INVALID_RESPONSE",
    });
  }
  const frames = rawFrames.map((frame, index) =>
    normalizeAgentFrame(frame, index, allowedMediaIds),
  );
  if (frames.some((frame) => !frame.scene && !frame.caption && !frame.dialogue)) {
    throw new HttpError(502, "Comic diary Agent returned an empty frame.", {
      code: "COMIC_DIARY_INVALID_RESPONSE",
    });
  }
  return {
    version: 2,
    title:
      sanitizeComicText(rawDraft?.title, 120) ||
      sanitizeComicText(diaryEntry?.title, 120) ||
      "漫画日记",
    style: normalizeStyle(style),
    source: "comic-diary-agent",
    summary: sanitizeComicText(rawDraft?.summary, 280),
    frames,
    sourceRefs: {
      diaryEntryId: diaryEntry?.id || null,
      mediaAssetIds: Array.from(
        new Set(frames.flatMap((frame) => frame.mediaAssetIds)),
      ),
      fileAssetIds: fileAssets.map((asset) => asset.id).filter(Boolean),
    },
  };
}

export async function buildComicDiaryAgentResponse({
  prompt,
  user,
  diaryEntry,
  mediaAssets = [],
  fileAssets = [],
  style = "slice-of-life",
  frameCount = 4,
  modelStatus = getModelRuntimeStatus(),
  runAgent: runAgentFn = runAgent,
} = {}) {
  if (!modelStatus.configured) {
    throw new HttpError(503, "Comic diary Agent is not configured.", {
      code: "COMIC_DIARY_UNAVAILABLE",
    });
  }
  try {
    const result = await runAgentFn({
      agentId: "comic-diary",
      input: [
        `生成 ${normalizeFrameCount(frameCount)} 格${styleLabels[normalizeStyle(style)]}分镜。`,
        prompt,
      ].filter(Boolean).join("\n"),
      user,
      appContext: {
        stationContent: {
          diaryEntries: diaryEntry ? [diaryEntry] : [],
          mediaAssets,
          fileAssets,
        },
      },
    });
    return {
      draft: normalizeComicDiaryAgentDraft(parseJsonReply(result.reply), {
        diaryEntry,
        mediaAssets,
        fileAssets,
        style,
        frameCount,
      }),
      model: {
        provider: result.provider,
        model: modelStatus.model || "",
        tokenUsage: result.tokenUsage || null,
        latencyMs: result.latencyMs ?? null,
      },
    };
  } catch (error) {
    if (error instanceof HttpError) throw error;
    throw new HttpError(502, "Comic diary Agent could not create a valid storyboard.", {
      code: "COMIC_DIARY_FAILED",
    });
  }
}
