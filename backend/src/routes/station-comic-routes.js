import { buildComicDiaryDraft } from "../comic-diary-service.js";
import { createRateLimitMiddleware } from "../rate-limit-service.js";
import { createUsageEvent, hashRequestIp } from "../repositories.js";
import {
  createStationComicDiary,
  deleteStationComicDiaryForUser,
  getStationDiaryEntryForUser,
  listFileAssetsByIdsForUser,
  listFileAssetsForUser,
  listStationComicDiariesForUser,
  listStationMediaAssetsByIdsForUser,
  listStationMediaAssetsForUser,
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

export function registerStationComicRoutes(app, { authenticate, asyncHandler }) {
  app.get(
    "/api/station/comic-diaries",
    authenticate,
    asyncHandler(async (req, res) => {
      const { limit } = limitSchema.parse(req.query);
      res.json({ data: await listStationComicDiariesForUser(req.user.id, limit) });
    }),
  );

  app.post(
    "/api/station/comic-diaries",
    authenticate,
    comicDiaryCreateLimit,
    asyncHandler(async (req, res) => {
      const body = stationComicDiaryRequestSchema.parse(req.body);
      const uniqueMediaIds = Array.from(new Set(body.mediaAssetIds));
      const uniqueFileIds = Array.from(new Set(body.fileAssetIds));
      const [diaryEntry, mediaAssets, fileAssets] = await Promise.all([
        body.diaryEntryId
          ? getStationDiaryEntryForUser({ userId: req.user.id, diaryEntryId: body.diaryEntryId })
          : Promise.resolve(null),
        uniqueMediaIds.length
          ? listStationMediaAssetsByIdsForUser({ userId: req.user.id, mediaAssetIds: uniqueMediaIds })
          : listStationMediaAssetsForUser(req.user.id, 40),
        uniqueFileIds.length
          ? listFileAssetsByIdsForUser({ userId: req.user.id, fileAssetIds: uniqueFileIds })
          : listFileAssetsForUser(req.user.id, 10),
      ]);

      if (body.diaryEntryId && !diaryEntry) {
        res.status(404).json({ error: { message: "Diary entry not found" } });
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

      const draft = buildComicDiaryDraft({
        prompt: body.prompt,
        diaryEntry,
        mediaAssets,
        fileAssets,
        style: body.style,
        frameCount: body.frameCount,
      });
      const comicDiary = await createStationComicDiary({
        userId: req.user.id,
        title: draft.title,
        prompt: body.prompt,
        style: draft.style,
        sourceDiaryEntryId: draft.sourceRefs.diaryEntryId,
        sourceMediaAssetIds: draft.sourceRefs.mediaAssetIds,
        sourceFileAssetIds: draft.sourceRefs.fileAssetIds,
        frames: draft.frames,
        summary: draft.summary,
        metadata: {
          version: draft.version,
          source: draft.source,
          frameCount: draft.frames.length,
          requestedMediaAssetIds: uniqueMediaIds,
          requestedFileAssetIds: uniqueFileIds,
        },
      });

      await createUsageEvent({
        userId: req.user.id,
        eventType: "station.comic_diary.create",
        targetType: "station_comic_diary",
        targetId: comicDiary.id,
        payload: {
          style: comicDiary.style,
          frameCount: comicDiary.frames.length,
          mediaCount: comicDiary.sourceMediaAssetIds.length,
          fileCount: comicDiary.sourceFileAssetIds.length,
          hasDiaryEntry: Boolean(comicDiary.sourceDiaryEntryId),
        },
        ipHash: hashRequestIp(req.ip),
        userAgent: req.get("user-agent") || "",
      });

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

      await createUsageEvent({
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
