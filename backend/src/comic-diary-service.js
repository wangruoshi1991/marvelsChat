import { z } from "zod";
import { comicDiaryOptionsSchema } from "./schemas.js";
import { getModelRuntimeStatus, runAgent } from "./agent-runtime.js";
import { HttpError } from "./http-error.js";

const styleLabels = {
  "slice-of-life": "生活漫画",
  cute: "可爱漫画",
  manga: "黑白漫画",
  storyboard: "分镜草稿",
};

// Rendered as plain text. Invalid markup, hidden controls and oversized output
// are rejected rather than stripped or truncated into an apparently valid draft.
const comicText = max => z.string().refine(
  // eslint-disable-next-line no-control-regex -- Reject hidden controls rather than silently stripping them.
  value => !/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(value) && !/<\/?[a-z][^>]*>/i.test(value),
  "Comic text must be plain text without hidden control characters.",
).transform(value => value.trim()).pipe(z.string().max(max));
const frameSchema = z.object({
  title: comicText(80).refine(value => value.length > 0),
  scene: comicText(220),
  caption: comicText(220),
  dialogue: comicText(160),
  mood: comicText(40),
  camera: comicText(40),
  mediaAssetIds: z.array(z.string().min(1)).max(4).refine(ids => new Set(ids).size === ids.length),
}).strict().refine(frame => Boolean(frame.scene || frame.caption || frame.dialogue), "A storyboard frame needs content.");
const draftSchema = z.object({
  title: comicText(120).refine(value => value.length > 0),
  summary: comicText(280).refine(value => value.length > 0),
  frames: z.array(frameSchema).min(2).max(8),
}).strict();

function comicOptions(style, frameCount) {
  const checked = comicDiaryOptionsSchema.safeParse({ style, frameCount });
  if (!checked.success) throw new HttpError(400, "漫画风格或分镜数量无效，请重新选择。", { code: "COMIC_DIARY_INVALID_OPTIONS" });
  return checked.data;
}

function invalidDraft() {
  return new HttpError(502, "漫画助手未返回完整有效的分镜，请重新提出需求。", { code: "COMIC_DIARY_INVALID_RESPONSE" });
}

function parseJsonReply(reply) {
  if (typeof reply !== "string" || !reply.trim()) throw invalidDraft();
  try { return JSON.parse(reply); }
  catch { throw invalidDraft(); }
}

export function normalizeComicDiaryAgentDraft(
  rawDraft,
  { diaryEntry, mediaAssets = [], style, frameCount },
) {
  const options = comicOptions(style, frameCount);
  const checked = draftSchema.safeParse(rawDraft);
  if (!checked.success || checked.data.frames.length !== options.frameCount) throw invalidDraft();
  const allowedMediaIds = new Set(mediaAssets.map(asset => asset.id));
  if (checked.data.frames.some(frame => frame.mediaAssetIds.some(id => !allowedMediaIds.has(id)))) throw invalidDraft();
  const frames = checked.data.frames.map((frame, index) => ({ index: index + 1, ...frame }));
  return {
    version: 2,
    title: checked.data.title,
    style: options.style,
    source: "comic-diary-agent",
    summary: checked.data.summary,
    frames,
    sourceRefs: {
      diaryEntryId: diaryEntry?.id || null,
      mediaAssetIds: [...new Set(frames.flatMap(frame => frame.mediaAssetIds))],
    },
  };
}

export async function buildComicDiaryAgentResponse({
  prompt,
  user,
  diaryEntry,
  mediaAssets = [],
  style,
  frameCount,
  beforeModelCall,
  modelStatus = getModelRuntimeStatus({ role: "planning" }),
  runAgent: runAgentFn = runAgent,
} = {}) {
  const options = comicOptions(style, frameCount);
  if (!modelStatus.configured) {
    throw new HttpError(503, "Comic diary Agent is not configured.", {
      code: "COMIC_DIARY_UNAVAILABLE",
    });
  }
  try {
    const result = await runAgentFn({
      agentId: "comic-diary",
      mode: "plan",
      input: [
        `生成 ${options.frameCount} 格${styleLabels[options.style]}分镜。`,
        prompt,
      ]
        .filter(Boolean)
        .join("\n"),
      user,
      beforeModelCall,
      appContext: {
        stationContent: {
          diaryEntries: diaryEntry ? [diaryEntry] : [],
          mediaAssets,
        },
      },
    });
    return {
      draft: normalizeComicDiaryAgentDraft(parseJsonReply(result.reply), {
        diaryEntry,
        mediaAssets,
        ...options,
      }),
      model: {
        provider: result.provider,
        model: result.model || modelStatus.model || "",
        servedModel: result.servedModel ?? null,
        tokenUsage: result.tokenUsage || null,
        latencyMs: result.latencyMs ?? null,
      },
    };
  } catch (error) {
    if (error instanceof HttpError) throw error;
    throw new HttpError(
      502,
      "Comic diary Agent could not create a valid storyboard.",
      {
        code: "COMIC_DIARY_FAILED",
      },
    );
  }
}
