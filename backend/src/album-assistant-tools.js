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
    description: "调用检索 Agent 在当前用户已上传的图片和视频中查找。根据对话补全查询；相册范围只使用 list_albums 返回的 ID。searchScope 是本次检索范围，accountIndexCoverage 始终是全账号索引状态，不是所选相册计数。matchedQuery 是本次实际执行的查询，found 结果已满足该查询，视频带匹配时间；只用 results 数量说明本次返回数量，不能据此推算范围内素材总数。当前结果优先于历史回复中的猜测，不再判定画面或推断额外细节。空结果不代表整个相册不存在相关内容。",
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

export function createAlbumAssistantTools({ userId, operationKey, service, listAlbums, assertAccess,
  allowedAlbumIds = null, beforeRetrievalCall = null, afterRetrievalCall = null }) {
  if (typeof operationKey !== "string" || !operationKey || operationKey.length > 140) throw new TypeError("Album tools require an explicit operation key");
  if (allowedAlbumIds !== null && (!Array.isArray(allowedAlbumIds) || !allowedAlbumIds.length ||
    new Set(allowedAlbumIds).size !== allowedAlbumIds.length || allowedAlbumIds.some(id => !z.string().uuid().safeParse(id).success))) {
    throw new TypeError("Album tools require an explicit nonempty scoped album list");
  }
  const retrievalRunIds = [];
  let searched = false;
  let outcome = null;
  let albums = null;
  let searchResults = [];
  return {
    definitions: albumAssistantToolDefinitions,
    metadata: () => ({ version: 1, retrievalRunIds: [...retrievalRunIds], outcome }),
    results: () => searchResults.map(item => ({ ...item })),
    async execute(name, rawArguments) {
      await assertAccess();
      if (name === "list_albums") {
        const { name } = z.object({ name: z.string().trim().max(120).optional() }).strict().parse(rawArguments);
        const matching = await listAlbums(userId, name);
        const scoped = allowedAlbumIds === null ? matching : matching.filter(album => allowedAlbumIds.includes(album.id));
        albums = scoped.slice(0, 50);
        return { albums: albums.map(({ id, title }) => ({ id, title })), truncated: scoped.length > 50 };
      }
      if (name !== "search_media" || searched) throw new Error("Agent tool call is not allowed");
      searched = true;
      const args = mediaRetrievalSearchSchema.strict().parse(rawArguments);
      if (allowedAlbumIds !== null && (!args.albumId || !allowedAlbumIds.includes(args.albumId))) {
        throw new Error("Agent album scope is not allowed");
      }
      if (args.albumId && allowedAlbumIds === null) {
        if (!albums?.some(album => album.id === args.albumId)) throw new Error("Agent album scope is not allowed");
      }
      const searchScope = args.albumId ? { kind: "album", albumId: args.albumId } : { kind: "account" };
      if (searchLimiter.check(userId).limited) {
        outcome = "rate-limited";
        return { state: "error", code: outcome, message: "检索请求过于频繁，请稍后再试。", results: [], searchScope };
      }
      try {
        const status = await service.getMediaRetrievalStatus({ userId });
        if (!status.enabled) throw new MediaRetrievalServiceError("retrieval_consent_required");
        if (!status.availability.canStartRun) throw new MediaRetrievalServiceError("retrieval_service_unavailable");
        const { indexedAssets, skippedAssets, totalAssets } = status.backfill;
        const accountIndexCoverage = {
          indexedAssets,
          unavailableAssets: skippedAssets,
          pendingAssets: totalAssets - indexedAssets - skippedAssets,
          totalAssets,
        };
        if (indexedAssets === 0) {
          outcome = totalAssets === 0 ? "no-media"
            : accountIndexCoverage.pendingAssets > 0 ? "index-pending" : "index-unavailable";
          return { state: outcome, results: [], searchScope, accountIndexCoverage };
        }
        const response = await service.searchMediaRetrieval({
          userId, ...args, limit: Math.min(args.limit, 10),
          idempotencyKey: `${operationKey}:search`,
          ...(beforeRetrievalCall ? { beforeModelCall: beforeRetrievalCall } : {}),
          ...(afterRetrievalCall ? { afterModelCall: afterRetrievalCall } : {}),
        });
        await assertAccess();
        retrievalRunIds.push(response.agentRunId);
        searchResults = response.results.map(({ mediaAssetId, kind, matchedFrameTimestampMs }) => ({
          mediaAssetId, kind, matchedFrameTimestampMs,
        }));
        outcome = searchResults.length ? "found" : "empty";
        return {
          state: outcome,
          matchedQuery: args.query,
          results: searchResults.map(item => ({ ...item })),
          searchScope,
          accountIndexCoverage,
        };
      } catch (error) {
        if (!(error instanceof MediaRetrievalServiceError)) throw error;
        outcome = error.code;
        return { state: "error", code: error.code, message: error.message, results: [], searchScope };
      }
    },
  };
}
