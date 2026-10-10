import { replaceControlCharacters } from "./text-sanitization.js";
import { getModelRuntimeStatus, runAgent } from "./agent-runtime.js";
import { HttpError } from "./http-error.js";

const maxFrames = 8;
const minFrames = 2;

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
