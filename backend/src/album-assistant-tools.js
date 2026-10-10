import { z } from "zod";
import { mediaRetrievalSearchSchema } from "./schemas.js";
import { MediaRetrievalServiceError } from "./media-retrieval-user-service.js";
import { createInMemoryRateLimiter } from "./rate-limit-service.js";

const searchLimiter = createInMemoryRateLimiter({ limit: 30, windowMs: 60000 });

const albumAssistantToolDefinitions = [
  {
    name: "list_albums",
    description: "按名称查找当前用户的相册及 ID，用于确定相册范围；名称可留空列出前 50 个。结果截断时需进一步限定名称。",
    parameters: { type: "object", properties: { name: { type: "string", maxLength: 120 } }, additionalProperties: false },
  },
  {
    name: "search_media",
    description: "调用检索 Agent 在当前用户已上传的图片和视频中查找。根据对话补全查询；相册范围只使用 list_albums 返回的 ID。matchedQuery 是本次实际执行的查询，found 结果已满足该查询，视频带匹配时间；当前结果优先于历史回复中的猜测。不要再判定画面或推断额外细节。空结果不代表整个相册不存在相关内容。",
    parameters: {
      type: "object",
      properties: {
        query: { type: "string", minLength: 1, maxLength: 240 },
        kind: { type: ["string", "null"], enum: ["image", "video", null] },
        albumId: { type: ["string", "null"] },
        limit: { type: "integer", minimum: 1, maximum: 10 },
      },
      required: ["query"],
      additionalProperties: false,
    },
  },
];

export function createAlbumAssistantTools({ userId, inputMessageId, service, listAlbums, assertAccess }) {
  const retrievalRunIds = [];
  let searched = false;
  let outcome = null;
  let albums = null;
  return {
    definitions: albumAssistantToolDefinitions,
    metadata: () => ({ version: 1, retrievalRunIds, outcome }),
    async execute(name, rawArguments) {
      await assertAccess();
      if (name === "list_albums") {
        const { name } = z.object({ name: z.string().trim().max(120).optional() }).strict().parse(rawArguments);
        const matching = await listAlbums(userId, name);
        albums = matching.slice(0, 50);
        return { albums: albums.map(({ id, title }) => ({ id, title })), truncated: matching.length > 50 };
      }
      if (name !== "search_media" || searched) throw new Error("Agent tool call is not allowed");
      searched = true;
      const args = mediaRetrievalSearchSchema.strict().parse(rawArguments);
      if (args.albumId) {
        if (!albums?.some(album => album.id === args.albumId)) throw new Error("Agent album scope is not allowed");
      }
      if (searchLimiter.check(userId).limited) {
        outcome = "rate-limited";
        return { state: "error", code: outcome, message: "检索请求过于频繁，请稍后再试。", results: [] };
      }
      try {
        const status = await service.getMediaRetrievalStatus({ userId });
        if (!status.enabled) throw new MediaRetrievalServiceError("retrieval_consent_required");
        if (!status.availability.canStartRun) throw new MediaRetrievalServiceError("retrieval_service_unavailable");
        if (status.backfill.indexedAssets === 0) {
          outcome = status.backfill.totalAssets === 0 ? "no-media" : "index-pending";
          return { state: outcome, results: [] };
        }
        const response = await service.searchMediaRetrieval({
          userId, ...args, limit: Math.min(args.limit, 10),
          idempotencyKey: `album-chat:${inputMessageId}:search`,
        });
        await assertAccess();
        retrievalRunIds.push(response.agentRunId);
        outcome = response.results.length ? "found" : "empty";
        return {
          state: outcome,
          matchedQuery: args.query,
          results: response.results.map(({ mediaAssetId, kind, matchedFrameTimestampMs }) => ({
            mediaAssetId, kind, matchedFrameTimestampMs,
          })),
          partiallyIndexed: status.backfill.indexedAssets < status.backfill.totalAssets,
        };
      } catch (error) {
        if (!(error instanceof MediaRetrievalServiceError)) throw error;
        outcome = error.code;
        return { state: "error", code: error.code, message: error.message, results: [] };
      }
    },
  };
}
