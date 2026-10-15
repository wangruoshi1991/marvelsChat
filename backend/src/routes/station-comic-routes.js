import crypto from "node:crypto";
import { getAgent } from "../../../agents/registry.js";
import { assertCurrentAgentAccess } from "../ai-agent-access.js";
import { buildComicDiaryAgentResponse } from "../comic-diary-service.js";
import { withTransaction } from "../db.js";
import { HttpError } from "../http-error.js";
import { createRateLimitMiddleware } from "../rate-limit-service.js";
import {
  createAgentRun,
  createUsageEvent,
  hashRequestIp,
} from "../repositories.js";
import {
  createStationComicDiary,
  deleteStationComicDiaryForUser,
  listStationComicDiariesForUser,
} from "../station-repository.js";
import {
  limitSchema,
  stationComicDiaryParamsSchema,
  stationComicDiaryRequestSchema,
} from "../schemas.js";

const hour = 60 * 60 * 1000;
const comicDiaryCreateLimit = createRateLimitMiddleware({
  action: "station.comic_diary.create",
  limit: 30,
  windowMs: hour,
  message: "漫画日记生成请求过于频繁，请稍后再试。",
});

export function registerStationComicRoutes(
  app,
  {
    authenticate,
    asyncHandler,
    transaction = withTransaction,
    loadAgent = getAgent,
    generateComic = buildComicDiaryAgentResponse,
    saveComic = createStationComicDiary,
    recordAgentRun = createAgentRun,
    recordUsageEvent = createUsageEvent,
  },
) {
  async function readSelectedSources(connection, userId, body, expectedHash) {
    const agent = await loadAgent("comic-diary");
    if (!agent) throw new HttpError(404, "漫画日记 Agent 尚未注册。");
    const queryFn = connection.query.bind(connection);
    await assertCurrentAgentAccess({
      userId,
      agent,
      grantedScopes: agent.permissions,
      contextRefs: [],
      queryFn,
      lock: true,
    });
    const requiredScopes = [
      "diary:write",
      "station:write",
      ...(body.diaryEntryId ? ["diary:read", "station:read"] : []),
      ...(body.mediaAssetIds.length ? ["album:read"] : []),
    ];
    if (requiredScopes.some((scope) => !agent.permissions.includes(scope))) {
      throw new HttpError(
        403,
        "漫画日记 Agent 未声明本次分镜所需的读取或保存权限。",
        { code: "COMIC_DIARY_SCOPE_REQUIRED" },
      );
    }
    // Read only explicit selections, with the same row locks as the final save.
    // No storage URLs, full account library or file content enters this model.
    const diaryRows = body.diaryEntryId
      ? await queryFn(
          `SELECT id, title, body, mood
      FROM station_diary_entries WHERE id = ? AND user_id = ? AND deleted_at IS NULL FOR SHARE`,
          [body.diaryEntryId, userId],
        )
      : [];
    const mediaIds = [...new Set(body.mediaAssetIds)].sort();
    const mediaAssets = mediaIds.length
      ? await queryFn(
          `SELECT id, kind, caption,
      original_filename AS "originalFilename", tags, content_revision_at::text AS "contentRevision"
      FROM station_media_assets WHERE user_id = ? AND id = ANY(?::text[])
      AND status = 'uploaded' AND deleted_at IS NULL ORDER BY id FOR SHARE`,
          [userId, mediaIds],
        )
      : [];
    if (
      (body.diaryEntryId && !diaryRows.length) ||
      mediaAssets.length !== mediaIds.length
    ) {
      throw new HttpError(404, "所选日记或相册素材已删除或不可访问。", {
        code: "COMIC_DIARY_SOURCE_NOT_FOUND",
      });
    }
    const sources = { diaryEntry: diaryRows[0] || null, mediaAssets };
    const hash = crypto
      .createHash("sha256")
      .update(
        JSON.stringify({
          agent: {
            key: agent.key,
            version: agent.version,
            permissions: [...agent.permissions].sort(),
          },
          ...sources,
        }),
      )
      .digest("hex");
    if (expectedHash && expectedHash !== hash) {
      throw new HttpError(409, "Agent 或所选素材已变化，请重新生成分镜。", {
        code: "COMIC_DIARY_SOURCE_CHANGED",
      });
    }
    return { ...sources, hash };
  }

  app.get(
    "/api/station/comic-diaries",
    authenticate,
    asyncHandler(async (req, res) => {
      const { limit } = limitSchema.parse(req.query);
      res.json({
        data: await listStationComicDiariesForUser(req.user.id, limit),
      });
    }),
  );

  app.post(
    "/api/station/comic-diaries",
    authenticate,
    comicDiaryCreateLimit,
    asyncHandler(async (req, res) => {
      const body = stationComicDiaryRequestSchema.parse(req.body);
      const uniqueMediaIds = Array.from(new Set(body.mediaAssetIds));
      if (body.fileAssetIds.length) {
        throw new HttpError(
          403,
          "漫画日记 Agent 未声明文件读取权限，不能使用文件来源。",
          { code: "COMIC_DIARY_FILE_SOURCE_UNSUPPORTED" },
        );
      }
      const sources = await transaction((connection) =>
        readSelectedSources(connection, req.user.id, body),
      );

      const startedAt = Date.now();
      let generation;
      let comicDiary;
      try {
        generation = await generateComic({
          prompt: body.prompt,
          user: req.user,
          diaryEntry: sources.diaryEntry,
          mediaAssets: sources.mediaAssets,
          style: body.style,
          frameCount: body.frameCount,
          beforeModelCall: () =>
            transaction((connection) =>
              readSelectedSources(connection, req.user.id, body, sources.hash),
            ),
        });
        comicDiary = await transaction(async (connection) => {
          await readSelectedSources(
            connection,
            req.user.id,
            body,
            sources.hash,
          );
          const draft = generation.draft;
          const queryFn = connection.query.bind(connection);
          const saved = await saveComic(
            {
              userId: req.user.id,
              title: draft.title,
              prompt: body.prompt,
              style: draft.style,
              sourceDiaryEntryId: draft.sourceRefs.diaryEntryId,
              sourceMediaAssetIds: draft.sourceRefs.mediaAssetIds,
              frames: draft.frames,
              summary: draft.summary,
              metadata: {
                version: draft.version,
                source: draft.source,
                frameCount: draft.frames.length,
                requestedMediaAssetIds: uniqueMediaIds,
                model: generation.model,
              },
            },
            queryFn,
          );
          await recordAgentRun(
            {
              userId: req.user.id,
              agentId: "comic-diary",
              threadId: null,
              inputMessageId: null,
              outputMessageId: null,
              status: "success",
              provider: generation.model.provider,
              latencyMs: generation.model.latencyMs,
              tokenPrompt: generation.model.tokenUsage?.prompt ?? null,
              tokenCompletion: generation.model.tokenUsage?.completion ?? null,
              tokenTotal: generation.model.tokenUsage?.total ?? null,
            },
            queryFn,
          );
          await recordUsageEvent(
            {
              userId: req.user.id,
              eventType: "station.comic_diary.create",
              targetType: "station_comic_diary",
              targetId: saved.id,
              payload: {
                style: saved.style,
                frameCount: saved.frames.length,
                mediaCount: saved.sourceMediaAssetIds.length,
                hasDiaryEntry: Boolean(saved.sourceDiaryEntryId),
              },
              ipHash: hashRequestIp(req.ip),
              userAgent: req.get("user-agent") || "",
            },
            queryFn,
          );
          return saved;
        });
      } catch (error) {
        await recordAgentRun({
          userId: req.user.id,
          agentId: "comic-diary",
          threadId: null,
          inputMessageId: null,
          outputMessageId: null,
          status: "error",
          provider: generation?.model.provider || "runtime-error",
          latencyMs: generation?.model.latencyMs ?? Date.now() - startedAt,
          tokenPrompt: generation?.model.tokenUsage?.prompt ?? null,
          tokenCompletion: generation?.model.tokenUsage?.completion ?? null,
          tokenTotal: generation?.model.tokenUsage?.total ?? null,
          errorMessage:
            error instanceof Error ? error.message : "Comic diary Agent failed",
        });
        throw error;
      }

      res.status(201).json({ data: comicDiary });
    }),
  );

  app.delete(
    "/api/station/comic-diaries/:comicDiaryId",
    authenticate,
    asyncHandler(async (req, res) => {
      const { comicDiaryId } = stationComicDiaryParamsSchema.parse(req.params);
      const comicDiary = await deleteStationComicDiaryForUser({
        userId: req.user.id,
        comicDiaryId,
      });

      await recordUsageEvent({
        userId: req.user.id,
        eventType: "station.comic_diary.delete",
        targetType: "station_comic_diary",
        targetId: comicDiary.id,
        payload: { sourceDiaryEntryId: comicDiary.sourceDiaryEntryId },
        ipHash: hashRequestIp(req.ip),
        userAgent: req.get("user-agent") || "",
      });

      res.status(204).send();
    }),
  );
}
