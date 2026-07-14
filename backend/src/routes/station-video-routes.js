import { createRateLimitMiddleware } from "../rate-limit-service.js";
import { createUsageEvent, hashRequestIp } from "../repositories.js";
import {
  getStationComicDiaryForUser,
  getStationDiaryEntryForUser,
  createStationVideoDraft,
  listFileAssetsByIdsForUser,
  listFileAssetsForUser,
  listStationMediaAssetsByIdsForUser,
  listStationMediaAssetsForUser,
  listStationVideoDraftsForUser,
} from "../station-repository.js";
import { buildVideoDraft } from "../video-production-service.js";
import {
  limitSchema,
  stationVideoDraftRequestSchema,
} from "../schemas.js";

const hour = 60 * 60 * 1000;
const videoDraftCreateLimit = createRateLimitMiddleware({
  action: "station.video_draft.create",
  limit: 30,
  windowMs: hour,
  message: "视频草稿生成请求过于频繁，请稍后再试。",
});

export function registerStationVideoRoutes(app, { authenticate, asyncHandler }) {
  app.get(
    "/api/station/video-drafts",
    authenticate,
    asyncHandler(async (req, res) => {
      const { limit } = limitSchema.parse(req.query);
      res.json({ data: await listStationVideoDraftsForUser(req.user.id, limit) });
    }),
  );

  app.post(
    "/api/station/video-drafts",
    authenticate,
    videoDraftCreateLimit,
    asyncHandler(async (req, res) => {
      const body = stationVideoDraftRequestSchema.parse(req.body);
      const uniqueMediaIds = Array.from(new Set(body.mediaAssetIds));
      const uniqueFileIds = Array.from(new Set(body.fileAssetIds));
      const [diaryEntry, comicDiary, mediaAssets, fileAssets] = await Promise.all([
        body.diaryEntryId
          ? getStationDiaryEntryForUser({ userId: req.user.id, diaryEntryId: body.diaryEntryId })
          : Promise.resolve(null),
        body.comicDiaryId
          ? getStationComicDiaryForUser({ userId: req.user.id, comicDiaryId: body.comicDiaryId })
          : Promise.resolve(null),
        uniqueMediaIds.length
          ? listStationMediaAssetsByIdsForUser({ userId: req.user.id, mediaAssetIds: uniqueMediaIds })
          : listStationMediaAssetsForUser(req.user.id, 60),
        uniqueFileIds.length
          ? listFileAssetsByIdsForUser({ userId: req.user.id, fileAssetIds: uniqueFileIds })
          : listFileAssetsForUser(req.user.id, 10),
      ]);

      if (body.diaryEntryId && !diaryEntry) {
        res.status(404).json({ error: { message: "Diary entry not found" } });
        return;
      }
      if (body.comicDiaryId && !comicDiary) {
        res.status(404).json({ error: { message: "Comic diary not found" } });
        return;
      }
      if (uniqueMediaIds.length && mediaAssets.length !== uniqueMediaIds.length) {
        res.status(404).json({ error: { message: "Media asset not found" } });
        return;
      }
      if (uniqueFileIds.length && fileAssets.length !== uniqueFileIds.length) {
        res.status(404).json({ error: { message: "File asset not found" } });
        return;
      }

      const draft = buildVideoDraft({
        prompt: body.prompt,
        diaryEntry,
        comicDiary,
        mediaAssets,
        fileAssets,
        format: body.format,
        aspectRatio: body.aspectRatio,
        durationSeconds: body.durationSeconds,
      });
      const videoDraft = await createStationVideoDraft({
        userId: req.user.id,
        title: draft.title,
        prompt: body.prompt,
        format: draft.format,
        aspectRatio: draft.aspectRatio,
        durationSeconds: draft.durationSeconds,
        sourceDiaryEntryId: draft.sourceRefs.diaryEntryId,
        sourceComicDiaryId: draft.sourceRefs.comicDiaryId,
        sourceMediaAssetIds: draft.sourceRefs.mediaAssetIds,
        sourceFileAssetIds: draft.sourceRefs.fileAssetIds,
        script: draft.script,
        shots: draft.shots,
        summary: draft.summary,
        metadata: {
          version: draft.version,
          source: draft.source,
          shotCount: draft.shots.length,
          requestedMediaAssetIds: uniqueMediaIds,
          requestedFileAssetIds: uniqueFileIds,
        },
      });

      await createUsageEvent({
        userId: req.user.id,
        eventType: "station.video_draft.create",
        targetType: "station_video_draft",
        targetId: videoDraft.id,
        payload: {
          format: videoDraft.format,
          aspectRatio: videoDraft.aspectRatio,
          durationSeconds: videoDraft.durationSeconds,
          shotCount: videoDraft.shots.length,
          mediaCount: videoDraft.sourceMediaAssetIds.length,
          fileCount: videoDraft.sourceFileAssetIds.length,
          hasDiaryEntry: Boolean(videoDraft.sourceDiaryEntryId),
          hasComicDiary: Boolean(videoDraft.sourceComicDiaryId),
        },
        ipHash: hashRequestIp(req.ip),
        userAgent: req.get("user-agent") || "",
      });

      res.status(201).json({ data: videoDraft });
    }),
  );
}
