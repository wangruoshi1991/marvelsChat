import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { resolveLocation } from "../location-service.js";
import { HttpError } from "../http-error.js";
import {
  buildStationMediaObjectKey,
  createOssPutSignedUrl,
  fetchOssObject,
  inspectOssObject,
} from "../oss-service.js";
import {
  getOssRuntimeStatus,
  persistProviderModelAssets,
} from "../asset-storage-service.js";
import {
  buildAlbumSuggestions,
  buildMediaSearchMatcher,
  normalizeMediaTags,
  suggestTagsForMediaAsset,
} from "../album-management-service.js";
import {
  buildComicDiaryDraft,
} from "../comic-diary-service.js";
import {
  buildVideoDraft,
} from "../video-production-service.js";
import {
  applyStationSiteDraft,
  createStationComicDiary,
  deleteStationComicDiaryForUser,
  createFileAsset,
  createGenerationJob,
  createStationAlbum,
  createStationDiaryEntry,
  createStationMediaAsset,
  createStationOutfit,
  createStationSiteDraft,
  createStationVideoDraft,
  deleteStationAlbum,
  deleteStationDiaryEntry,
  deleteStationMediaAsset,
  getFileAssetForUser,
  getGenerationJobForUser,
  getProfileForUser,
  getProfileVisibility,
  getStationComicDiaryForUser,
  getStationDiaryEntryForUser,
  getStationContentForUser,
  getStationMediaAssetForUser,
  listFileAssetsByIdsForUser,
  listFileAssetsForUser,
  listGenerationJobsForUser,
  listStationComicDiariesForUser,
  listStationMediaAssetsByIdsForUser,
  listStationMediaAssetsForUser,
  listStationSiteDraftsForUser,
  listStationVideoDraftsForUser,
  moveMediaAssetsToAlbum,
  markStationMediaAssetUploaded,
  prepareStationMediaAssetUpload,
  updateFileAssetPreprocessing,
  updateStationAlbum,
  updateStationDiaryEntry,
  updateStationMediaAsset,
  updateStationMediaAssetTags,
  updateProfileVisibility,
  updateGenerationJob,
  updateUserProfile,
  updateUserStationConfig,
  upsertStationModelAsset,
} from "../station-repository.js";
import {
  fetchMeshyModelJob,
  getMeshyRuntimeStatus,
  submitMeshyModelJob,
} from "../model-generation-service.js";
import { preprocessFileContent } from "../file-preprocessing-service.js";
import { buildSiteDraftResponse } from "../site-builder-service.js";
import { createRateLimitMiddleware } from "../rate-limit-service.js";
import {
  createUsageEvent,
  hashRequestIp,
} from "../repositories.js";
import {
  fileAssetParamsSchema,
  generationJobParamsSchema,
  limitSchema,
  locationResolveSchema,
  profileSelfSchema,
  profileVisibilitySchema,
  stationAlbumParamsSchema,
  stationAlbumSchema,
  stationAlbumSuggestionApplySchema,
  stationAlbumUpdateSchema,
  stationConfigSchema,
  stationComicDiaryRequestSchema,
  stationComicDiaryParamsSchema,
  stationDiaryParamsSchema,
  stationDiarySchema,
  stationDiaryUpdateSchema,
  stationFileAssetSchema,
  stationMediaAssetSchema,
  stationMediaAssetParamsSchema,
  stationMediaAssetRouteParamsSchema,
  stationMediaAssetUpdateSchema,
  stationMediaUploadCompleteSchema,
  stationMediaUploadUrlSchema,
  stationMediaSearchSchema,
  stationMediaTagsSchema,
  stationModelJobRequestSchema,
  stationOutfitSchema,
  stationSiteDraftParamsSchema,
  stationSiteDraftRequestSchema,
  stationVideoDraftRequestSchema,
} from "../schemas.js";

const hour = 60 * 60 * 1000;
const siteDraftCreateLimit = createRateLimitMiddleware({
  action: "station.site_draft.create",
  limit: 20,
  windowMs: hour,
  message: "主页生成请求过于频繁，请稍后再试。",
});
const modelJobCreateLimit = createRateLimitMiddleware({
  action: "station.model_job.create",
  limit: 10,
  windowMs: hour,
  message: "3D 生成请求过于频繁，请稍后再试。",
});
const fileAssetCreateLimit = createRateLimitMiddleware({
  action: "station.file_asset.create",
  limit: 60,
  windowMs: hour,
  message: "文件处理请求过于频繁，请稍后再试。",
});
const fileAssetPreprocessLimit = createRateLimitMiddleware({
  action: "station.file_asset.preprocess",
  limit: 60,
  windowMs: hour,
  message: "文件预处理请求过于频繁，请稍后再试。",
});
const albumSuggestionLimit = createRateLimitMiddleware({
  action: "station.album_suggestion.generate",
  limit: 60,
  windowMs: hour,
  message: "相册整理请求过于频繁，请稍后再试。",
});
const comicDiaryCreateLimit = createRateLimitMiddleware({
  action: "station.comic_diary.create",
  limit: 30,
  windowMs: hour,
  message: "漫画日记生成请求过于频繁，请稍后再试。",
});
const videoDraftCreateLimit = createRateLimitMiddleware({
  action: "station.video_draft.create",
  limit: 30,
  windowMs: hour,
  message: "视频草稿生成请求过于频繁，请稍后再试。",
});
const mediaUploadLimit = createRateLimitMiddleware({
  action: "station.media.upload",
  limit: 120,
  windowMs: hour,
  message: "媒体上传请求过于频繁，请稍后再试。",
});

const assertMediaKindMatchesMime = ({ kind, mimeType, status = 400 }) => {
  if (!mimeType.startsWith(`${kind}/`)) {
    throw new HttpError(status, "Media type does not match the asset kind.");
  }
};

const parseSingleByteRange = (value) => {
  const range = String(value || "").trim();
  if (range && !/^bytes=(?:\d+-\d*|-\d+)$/.test(range)) {
    throw new HttpError(416, "Invalid media byte range.");
  }
  return range;
};

export function registerStationRoutes(app, { authenticate, asyncHandler }) {
  app.patch(
    "/api/me/station-config",
    authenticate,
    asyncHandler(async (req, res) => {
      const body = stationConfigSchema.parse(req.body);
      const profile = await updateUserStationConfig(req.user.id, body);
      res.json({ data: profile });
    }),
  );

  app.patch(
    "/api/me/profile",
    authenticate,
    asyncHandler(async (req, res) => {
      const body = profileSelfSchema.parse(req.body);
      const profile = await updateUserProfile({
        userId: req.user.id,
        ...body,
      });
      await createUsageEvent({
        userId: req.user.id,
        eventType: "profile.update",
        targetType: "user",
        targetId: req.user.id,
        payload: {
          hasCommunity: Boolean(body.community),
          hasActivityArea: Boolean(body.activityArea),
          avatarVersion: body.avatarConfig.version,
          avatarBody: body.avatarConfig.body,
        },
        ipHash: hashRequestIp(req.ip),
        userAgent: req.get("user-agent") || "",
      });
      res.json({ data: profile });
    }),
  );

  app.get(
    "/api/me/profile-visibility",
    authenticate,
    asyncHandler(async (req, res) => {
      res.json({ data: await getProfileVisibility(req.user.id) });
    }),
  );

  app.patch(
    "/api/me/profile-visibility",
    authenticate,
    asyncHandler(async (req, res) => {
      const body = profileVisibilitySchema.parse(req.body);
      res.json({ data: await updateProfileVisibility(req.user.id, body) });
    }),
  );

  app.get(
    "/api/station/content",
    authenticate,
    asyncHandler(async (req, res) => {
      const content = await getStationContentForUser(req.user.id);
      res.json({ data: content });
    }),
  );

  app.get(
    "/api/station/site-drafts",
    authenticate,
    asyncHandler(async (req, res) => {
      const { limit } = limitSchema.parse(req.query);
      res.json({ data: await listStationSiteDraftsForUser(req.user.id, limit) });
    }),
  );

  app.post(
    "/api/station/site-drafts",
    authenticate,
    siteDraftCreateLimit,
    asyncHandler(async (req, res) => {
      const body = stationSiteDraftRequestSchema.parse(req.body);
      const [profile, stationContent] = await Promise.all([
        getProfileForUser(req.user.id),
        getStationContentForUser(req.user.id),
      ]);
      const generation = await buildSiteDraftResponse({
        prompt: body.prompt,
        user: req.user,
        profile,
        stationContent,
      });
      const created = await createStationSiteDraft({
        userId: req.user.id,
        prompt: body.prompt,
        draft: generation.draft,
        source: generation.source,
        model: generation.model,
      });
      const applied = body.apply
        ? await applyStationSiteDraft({ userId: req.user.id, draftId: created.id })
        : null;

      await createUsageEvent({
        userId: req.user.id,
        eventType: body.apply ? "station.site_draft.apply" : "station.site_draft.create",
        targetType: "station_site_draft",
        targetId: created.id,
        payload: {
          source: generation.source,
          applied: body.apply,
          modelConfigured: generation.model.configured,
          modelMissing: generation.model.missing,
        },
        ipHash: hashRequestIp(req.ip),
        userAgent: req.get("user-agent") || "",
      });

      res.status(201).json({
        data: {
          siteDraft: applied?.siteDraft || created,
          profile: applied?.profile || null,
          generation: {
            source: generation.source,
            model: generation.model,
          },
        },
      });
    }),
  );

  app.post(
    "/api/station/site-drafts/:draftId/apply",
    authenticate,
    asyncHandler(async (req, res) => {
      const { draftId } = stationSiteDraftParamsSchema.parse(req.params);
      const result = await applyStationSiteDraft({ userId: req.user.id, draftId });

      await createUsageEvent({
        userId: req.user.id,
        eventType: "station.site_draft.apply",
        targetType: "station_site_draft",
        targetId: draftId,
        ipHash: hashRequestIp(req.ip),
        userAgent: req.get("user-agent") || "",
      });

      res.json({ data: result });
    }),
  );

  app.get(
    "/api/station/file-assets",
    authenticate,
    asyncHandler(async (req, res) => {
      const { limit } = limitSchema.parse(req.query);
      res.json({ data: await listFileAssetsForUser(req.user.id, limit) });
    }),
  );

  app.post(
    "/api/station/file-assets",
    authenticate,
    fileAssetCreateLimit,
    asyncHandler(async (req, res) => {
      const body = stationFileAssetSchema.parse(req.body);
      const preprocessing = preprocessFileContent({
        originalFilename: body.originalFilename,
        mimeType: body.mimeType,
        content: body.content,
      });
      const byteSize = body.byteSize ?? Buffer.byteLength(body.content || "", "utf8");
      const asset = await createFileAsset({
        userId: req.user.id,
        originalFilename: body.originalFilename,
        mimeType: body.mimeType,
        byteSize,
        checksumSha256: preprocessing.checksumSha256,
        storageProvider: body.content ? "inline" : "pending",
        sourceKind: body.content ? "inline_text" : "upload_placeholder",
        status: preprocessing.status,
        preprocessingResult: preprocessing,
        metadata: body.metadata,
      });

      await createUsageEvent({
        userId: req.user.id,
        eventType: "station.file_asset.create",
        targetType: "file_asset",
        targetId: asset.id,
        payload: {
          status: asset.status,
          kind: preprocessing.kind,
          hasInlineContent: Boolean(body.content),
        },
        ipHash: hashRequestIp(req.ip),
        userAgent: req.get("user-agent") || "",
      });

      res.status(201).json({ data: asset });
    }),
  );

  app.post(
    "/api/station/file-assets/:fileAssetId/preprocess",
    authenticate,
    fileAssetPreprocessLimit,
    asyncHandler(async (req, res) => {
      const { fileAssetId } = fileAssetParamsSchema.parse(req.params);
      const body = stationFileAssetSchema.partial({ originalFilename: true }).parse(req.body);
      const existing = await getFileAssetForUser({ userId: req.user.id, fileAssetId });
      if (!existing) {
        res.status(404).json({ error: { message: "File asset not found" } });
        return;
      }
      const originalFilename = body.originalFilename || existing.originalFilename;
      const mimeType = body.mimeType || existing.mimeType;
      const preprocessing = preprocessFileContent({
        originalFilename,
        mimeType,
        content: body.content || "",
      });
      const updated = await updateFileAssetPreprocessing({
        userId: req.user.id,
        fileAssetId,
        status: preprocessing.status,
        preprocessingResult: preprocessing,
        checksumSha256: preprocessing.checksumSha256,
      });

      await createUsageEvent({
        userId: req.user.id,
        eventType: "station.file_asset.preprocess",
        targetType: "file_asset",
        targetId: updated.id,
        payload: {
          status: updated.status,
          kind: preprocessing.kind,
        },
        ipHash: hashRequestIp(req.ip),
        userAgent: req.get("user-agent") || "",
      });

      res.json({ data: updated });
    }),
  );

  app.get(
    "/api/station/model-jobs",
    authenticate,
    asyncHandler(async (req, res) => {
      const { limit } = limitSchema.parse(req.query);
      res.json({ data: await listGenerationJobsForUser({ userId: req.user.id, kind: "3d_model", limit }) });
    }),
  );

  app.post(
    "/api/station/model-jobs",
    authenticate,
    modelJobCreateLimit,
    asyncHandler(async (req, res) => {
      const body = stationModelJobRequestSchema.parse(req.body);
      const providerStatus = getMeshyRuntimeStatus();
      let providerResult = null;
      let jobStatus = "blocked";
      let errorMessage = providerStatus.configured ? "" : `Missing provider config: ${providerStatus.missing.join(", ")}`;

      if (providerStatus.configured) {
        try {
          providerResult = await submitMeshyModelJob({
            inputType: body.inputType,
            prompt: body.prompt,
            imageUrl: body.imageUrl || "",
            targetFormats: body.targetFormats,
            topology: body.topology,
            poseMode: body.poseMode,
          });
          jobStatus = providerResult.status;
        } catch (error) {
          jobStatus = "failed";
          errorMessage = error.message || "3D model provider request failed";
        }
      }

      const job = await createGenerationJob({
        userId: req.user.id,
        agentId: "model-3d",
        kind: "3d_model",
        inputType: body.inputType,
        prompt: body.prompt,
        sourceAssetId: body.sourceAssetId || null,
        provider: body.provider,
        providerTaskId: providerResult?.providerTaskId || "",
        status: jobStatus,
        progress: jobStatus === "blocked" || jobStatus === "failed" ? 0 : 1,
        requestPayload: providerResult?.requestPayload || {
          inputType: body.inputType,
          targetFormats: body.targetFormats,
          topology: body.topology,
          poseMode: body.poseMode,
          hasImageUrl: Boolean(body.imageUrl),
        },
        resultPayload: providerResult?.resultPayload || {},
        errorMessage,
      });

      await createUsageEvent({
        userId: req.user.id,
        eventType: "station.model_job.create",
        targetType: "generation_job",
        targetId: job.id,
        payload: {
          inputType: body.inputType,
          provider: body.provider,
          status: job.status,
          providerConfigured: providerStatus.configured,
          missing: providerStatus.missing,
        },
        ipHash: hashRequestIp(req.ip),
        userAgent: req.get("user-agent") || "",
      });

      res.status(201).json({
        data: {
          job,
          provider: providerStatus,
        },
      });
    }),
  );

  app.post(
    "/api/station/model-jobs/:jobId/sync",
    authenticate,
    asyncHandler(async (req, res) => {
      const { jobId } = generationJobParamsSchema.parse(req.params);
      const job = await getGenerationJobForUser({ userId: req.user.id, jobId });
      if (!job) {
        res.status(404).json({ error: { message: "Generation job not found" } });
        return;
      }
      const providerStatus = getMeshyRuntimeStatus();
      if (!providerStatus.configured || !job.providerTaskId) {
        res.json({ data: { job, provider: providerStatus } });
        return;
      }

      const providerJob = await fetchMeshyModelJob({
        providerTaskId: job.providerTaskId,
        inputType: job.inputType,
      });
      let status = providerJob.status;
      let storage = null;
      let modelAsset = null;
      let errorMessage = providerJob.status === "failed" ? "3D model provider reported failure" : "";

      if (providerJob.status === "succeeded") {
        try {
          storage = await persistProviderModelAssets({
            userId: req.user.id,
            job,
            providerJob,
          });
          modelAsset = await upsertStationModelAsset({
            userId: req.user.id,
            generationJobId: job.id,
            title: job.prompt,
            provider: job.provider,
            providerTaskId: job.providerTaskId,
            modelFiles: storage.modelFiles,
            thumbnail: storage.thumbnail,
            metadata: {
              source: "provider_sync",
              providerStatus: providerJob.providerStatus,
            },
          });
        } catch (error) {
          status = "blocked";
          errorMessage = error.message || "Generated model assets could not be persisted";
          storage = {
            configured: getOssRuntimeStatus().configured,
            missing: getOssRuntimeStatus().missing,
            error: errorMessage,
          };
        }
      }

      const updated = await updateGenerationJob({
        userId: req.user.id,
        jobId: job.id,
        status,
        progress: providerJob.progress,
        resultPayload: {
          providerStatus: providerJob.providerStatus,
          thumbnailUrl: providerJob.thumbnailUrl,
          modelUrls: providerJob.modelUrls,
          storage,
          modelAssetId: modelAsset?.id || null,
          raw: providerJob.raw,
        },
        errorMessage,
      });

      await createUsageEvent({
        userId: req.user.id,
        eventType: "station.model_job.sync",
        targetType: "generation_job",
        targetId: updated.id,
        payload: { status: updated.status, progress: updated.progress },
        ipHash: hashRequestIp(req.ip),
        userAgent: req.get("user-agent") || "",
      });

      res.json({ data: { job: updated, provider: providerStatus, storage, modelAsset } });
    }),
  );

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

  app.post(
    "/api/station/diary",
    authenticate,
    asyncHandler(async (req, res) => {
      const body = stationDiarySchema.parse(req.body);
      const entry = await createStationDiaryEntry({
        userId: req.user.id,
        ...body,
      });
      await createUsageEvent({
        userId: req.user.id,
        eventType: "station.diary.create",
        targetType: "station_diary_entry",
        targetId: entry.id,
        payload: { visibility: entry.visibility, source: entry.source },
        ipHash: hashRequestIp(req.ip),
        userAgent: req.get("user-agent") || "",
      });
      res.status(201).json({ data: entry });
    }),
  );

  app.patch(
    "/api/station/diary/:entryId",
    authenticate,
    asyncHandler(async (req, res) => {
      const { entryId } = stationDiaryParamsSchema.parse(req.params);
      const body = stationDiaryUpdateSchema.parse(req.body);
      const entry = await updateStationDiaryEntry({
        userId: req.user.id,
        entryId,
        ...body,
      });
      if (!entry) {
        throw new HttpError(404, "Diary entry not found");
      }
      await createUsageEvent({
        userId: req.user.id,
        eventType: "station.diary.update",
        targetType: "station_diary_entry",
        targetId: entry.id,
        payload: { visibility: entry.visibility },
        ipHash: hashRequestIp(req.ip),
        userAgent: req.get("user-agent") || "",
      });
      res.json({ data: entry });
    }),
  );

  app.delete(
    "/api/station/diary/:entryId",
    authenticate,
    asyncHandler(async (req, res) => {
      const { entryId } = stationDiaryParamsSchema.parse(req.params);
      const deleted = await deleteStationDiaryEntry({
        userId: req.user.id,
        entryId,
      });
      if (!deleted) {
        throw new HttpError(404, "Diary entry not found");
      }
      await createUsageEvent({
        userId: req.user.id,
        eventType: "station.diary.delete",
        targetType: "station_diary_entry",
        targetId: entryId,
        payload: {},
        ipHash: hashRequestIp(req.ip),
        userAgent: req.get("user-agent") || "",
      });
      res.status(204).send();
    }),
  );

  app.post(
    "/api/station/albums",
    authenticate,
    asyncHandler(async (req, res) => {
      const body = stationAlbumSchema.parse(req.body);
      const album = await createStationAlbum({
        userId: req.user.id,
        ...body,
      });
      await createUsageEvent({
        userId: req.user.id,
        eventType: "station.album.create",
        targetType: "station_album",
        targetId: album.id,
        payload: { visibility: album.visibility },
        ipHash: hashRequestIp(req.ip),
        userAgent: req.get("user-agent") || "",
      });
      res.status(201).json({ data: album });
    }),
  );

  app.patch(
    "/api/station/albums/:albumId",
    authenticate,
    asyncHandler(async (req, res) => {
      const { albumId } = stationAlbumParamsSchema.parse(req.params);
      const body = stationAlbumUpdateSchema.parse(req.body);
      const album = await updateStationAlbum({
        userId: req.user.id,
        albumId,
        ...body,
      });
      if (!album) {
        throw new HttpError(404, "Album not found");
      }
      await createUsageEvent({
        userId: req.user.id,
        eventType: "station.album.update",
        targetType: "station_album",
        targetId: album.id,
        payload: { visibility: album.visibility },
        ipHash: hashRequestIp(req.ip),
        userAgent: req.get("user-agent") || "",
      });
      res.json({ data: album });
    }),
  );

  app.delete(
    "/api/station/albums/:albumId",
    authenticate,
    asyncHandler(async (req, res) => {
      const { albumId } = stationAlbumParamsSchema.parse(req.params);
      const deleted = await deleteStationAlbum({
        userId: req.user.id,
        albumId,
      });
      if (!deleted) {
        throw new HttpError(404, "Album not found");
      }
      await createUsageEvent({
        userId: req.user.id,
        eventType: "station.album.delete",
        targetType: "station_album",
        targetId: albumId,
        payload: {},
        ipHash: hashRequestIp(req.ip),
        userAgent: req.get("user-agent") || "",
      });
      res.status(204).send();
    }),
  );

  app.post(
    "/api/station/media-assets",
    authenticate,
    asyncHandler(async (req, res) => {
      const body = stationMediaAssetSchema.parse(req.body);
      const asset = await createStationMediaAsset({
        userId: req.user.id,
        ...body,
      });
      await createUsageEvent({
        userId: req.user.id,
        eventType: "station.media.create",
        targetType: "station_media_asset",
        targetId: asset.id,
        payload: { albumId: asset.albumId, kind: asset.kind, status: asset.status },
        ipHash: hashRequestIp(req.ip),
        userAgent: req.get("user-agent") || "",
      });
      res.status(201).json({ data: asset });
    }),
  );

  app.patch(
    "/api/station/media-assets/:mediaAssetId",
    authenticate,
    asyncHandler(async (req, res) => {
      const { mediaAssetId } = stationMediaAssetRouteParamsSchema.parse(
        req.params,
      );
      const body = stationMediaAssetUpdateSchema.parse(req.body);
      const asset = await updateStationMediaAsset({
        userId: req.user.id,
        mediaAssetId,
        ...body,
        hasAlbumId: Object.prototype.hasOwnProperty.call(body, "albumId"),
      });
      if (!asset) {
        throw new HttpError(404, "Media asset not found");
      }
      await createUsageEvent({
        userId: req.user.id,
        eventType: "station.media.update",
        targetType: "station_media_asset",
        targetId: asset.id,
        payload: { albumId: asset.albumId },
        ipHash: hashRequestIp(req.ip),
        userAgent: req.get("user-agent") || "",
      });
      res.json({ data: asset });
    }),
  );

  app.delete(
    "/api/station/media-assets/:mediaAssetId",
    authenticate,
    asyncHandler(async (req, res) => {
      const { mediaAssetId } = stationMediaAssetRouteParamsSchema.parse(
        req.params,
      );
      const asset = await deleteStationMediaAsset({
        userId: req.user.id,
        mediaAssetId,
      });
      if (!asset) {
        throw new HttpError(404, "Media asset not found");
      }
      await createUsageEvent({
        userId: req.user.id,
        eventType: "station.media.delete",
        targetType: "station_media_asset",
        targetId: asset.id,
        payload: { albumId: asset.albumId },
        ipHash: hashRequestIp(req.ip),
        userAgent: req.get("user-agent") || "",
      });
      res.status(204).send();
    }),
  );

  app.post(
    "/api/station/media-assets/:mediaAssetId/upload-url",
    authenticate,
    mediaUploadLimit,
    asyncHandler(async (req, res) => {
      const { mediaAssetId } = stationMediaAssetRouteParamsSchema.parse(
        req.params,
      );
      const asset = await getStationMediaAssetForUser({
        userId: req.user.id,
        mediaAssetId,
      });
      if (!asset) {
        throw new HttpError(404, "Media asset not found");
      }
      if (asset.status !== "pending_upload") {
        throw new HttpError(409, "Media asset is not pending upload");
      }

      const body = stationMediaUploadUrlSchema.parse({
        ...req.body,
        byteSize: req.body?.byteSize ?? asset.byteSize,
      });
      assertMediaKindMatchesMime({
        kind: asset.kind,
        mimeType: body.mimeType,
      });
      const objectKey = buildStationMediaObjectKey({
        userId: req.user.id,
        assetId: asset.id,
        originalFilename: asset.originalFilename,
      });
      const upload = createOssPutSignedUrl({
        objectKey,
        contentType: body.mimeType,
      });
      const preparedAsset = await prepareStationMediaAssetUpload({
        userId: req.user.id,
        mediaAssetId: asset.id,
        storageProvider: upload.storageProvider,
        storageKey: upload.objectKey,
        mimeType: body.mimeType,
        byteSize: body.byteSize,
      });
      if (!preparedAsset) {
        throw new HttpError(409, "Media asset upload state changed");
      }

      await createUsageEvent({
        userId: req.user.id,
        eventType: "station.media.upload_url",
        targetType: "station_media_asset",
        targetId: asset.id,
        payload: { storageProvider: upload.storageProvider },
        ipHash: hashRequestIp(req.ip),
        userAgent: req.get("user-agent") || "",
      });
      res.json({ data: { asset: preparedAsset, upload } });
    }),
  );

  app.post(
    "/api/station/media-assets/:mediaAssetId/upload-complete",
    authenticate,
    mediaUploadLimit,
    asyncHandler(async (req, res) => {
      const { mediaAssetId } = stationMediaAssetRouteParamsSchema.parse(
        req.params,
      );
      const body = stationMediaUploadCompleteSchema.parse(req.body);
      const asset = await getStationMediaAssetForUser({
        userId: req.user.id,
        mediaAssetId,
      });
      if (!asset) {
        throw new HttpError(404, "Media asset not found");
      }
      if (!asset.storageKey || body.storageKey !== asset.storageKey) {
        throw new HttpError(409, "Media upload key does not match");
      }
      if (asset.status === "uploaded") {
        res.json({ data: asset });
        return;
      }
      if (asset.status !== "pending_upload") {
        throw new HttpError(409, "Media asset is not pending upload");
      }

      const storedObject = await inspectOssObject({
        objectKey: asset.storageKey,
      });
      if (storedObject.contentLength === null) {
        throw new HttpError(502, "Media storage did not return object size");
      }
      const uploadedMedia = stationMediaUploadUrlSchema.safeParse({
        mimeType: storedObject.contentType || asset.mimeType,
        byteSize: storedObject.contentLength,
      });
      if (!uploadedMedia.success) {
        throw new HttpError(409, "Uploaded media does not meet requirements");
      }
      assertMediaKindMatchesMime({
        kind: asset.kind,
        mimeType: uploadedMedia.data.mimeType,
        status: 409,
      });
      if (
        asset.mimeType &&
        uploadedMedia.data.mimeType !== asset.mimeType.toLowerCase()
      ) {
        throw new HttpError(409, "Uploaded media type does not match");
      }
      if (
        asset.byteSize !== null &&
        uploadedMedia.data.byteSize !== asset.byteSize
      ) {
        throw new HttpError(409, "Uploaded media size does not match");
      }

      const uploadedAsset = await markStationMediaAssetUploaded({
        userId: req.user.id,
        mediaAssetId: asset.id,
        storageKey: asset.storageKey,
        mimeType: uploadedMedia.data.mimeType,
        byteSize: uploadedMedia.data.byteSize,
        metadata: {
          uploadEtag: storedObject.etag,
          uploadVerifiedAt: new Date().toISOString(),
        },
      });
      if (!uploadedAsset) {
        throw new HttpError(409, "Media asset upload state changed");
      }

      await createUsageEvent({
        userId: req.user.id,
        eventType: "station.media.upload_complete",
        targetType: "station_media_asset",
        targetId: uploadedAsset.id,
        payload: {
          albumId: uploadedAsset.albumId,
          status: uploadedAsset.status,
        },
        ipHash: hashRequestIp(req.ip),
        userAgent: req.get("user-agent") || "",
      });
      res.json({ data: uploadedAsset });
    }),
  );

  app.get(
    "/api/station/media-assets/:mediaAssetId/file",
    authenticate,
    asyncHandler(async (req, res) => {
      const { mediaAssetId } = stationMediaAssetRouteParamsSchema.parse(
        req.params,
      );
      const asset = await getStationMediaAssetForUser({
        userId: req.user.id,
        mediaAssetId,
      });
      if (!asset) {
        throw new HttpError(404, "Media asset not found");
      }
      if (asset.status !== "uploaded" || !asset.storageKey) {
        throw new HttpError(409, "Media asset is not available");
      }

      const range = parseSingleByteRange(req.get("range"));
      const response = await fetchOssObject({
        objectKey: asset.storageKey,
        range,
      });
      if (!response.body) {
        throw new HttpError(502, "Media storage returned an empty response");
      }

      res.status(response.status);
      for (const header of [
        "accept-ranges",
        "content-length",
        "content-range",
        "content-type",
        "etag",
        "last-modified",
      ]) {
        const value = response.headers.get(header);
        if (value) res.setHeader(header, value);
      }
      if (!response.headers.get("content-type") && asset.mimeType) {
        res.setHeader("content-type", asset.mimeType);
      }
      res.setHeader("cache-control", "private, max-age=300");

      try {
        await pipeline(Readable.fromWeb(response.body), res);
      } catch (error) {
        if (!res.destroyed) res.destroy(error);
      }
    }),
  );

  app.get(
    "/api/station/media-assets/search",
    authenticate,
    asyncHandler(async (req, res) => {
      const { query, limit } = stationMediaSearchSchema.parse(req.query);
      const assets = await listStationMediaAssetsForUser(req.user.id, limit);
      const matcher = buildMediaSearchMatcher(query);
      res.json({ data: assets.filter(matcher) });
    }),
  );

  app.patch(
    "/api/station/media-assets/:mediaAssetId/tags",
    authenticate,
    asyncHandler(async (req, res) => {
      const { mediaAssetId } = stationMediaAssetParamsSchema.parse(req.params);
      const body = stationMediaTagsSchema.parse(req.body);
      const asset = await updateStationMediaAssetTags({
        userId: req.user.id,
        mediaAssetId,
        caption: body.caption,
        tags: normalizeMediaTags(body.tags),
        metadata: body.metadata,
      });
      await createUsageEvent({
        userId: req.user.id,
        eventType: "station.media.tags.update",
        targetType: "station_media_asset",
        targetId: asset.id,
        payload: { tagCount: asset.tags.length },
        ipHash: hashRequestIp(req.ip),
        userAgent: req.get("user-agent") || "",
      });
      res.json({ data: asset });
    }),
  );

  app.post(
    "/api/station/media-assets/:mediaAssetId/suggest-tags",
    authenticate,
    asyncHandler(async (req, res) => {
      const { mediaAssetId } = stationMediaAssetParamsSchema.parse(req.params);
      const assets = await listStationMediaAssetsForUser(req.user.id, 100);
      const asset = assets.find((item) => item.id === mediaAssetId);
      if (!asset) {
        res.status(404).json({ error: { message: "Media asset not found" } });
        return;
      }
      const tags = suggestTagsForMediaAsset(asset);
      res.json({ data: { mediaAssetId, tags } });
    }),
  );

  app.get(
    "/api/station/album-suggestions",
    authenticate,
    albumSuggestionLimit,
    asyncHandler(async (_req, res) => {
      const assets = await listStationMediaAssetsForUser(_req.user.id, 100);
      res.json({ data: buildAlbumSuggestions({ mediaAssets: assets }) });
    }),
  );

  app.post(
    "/api/station/album-suggestions/apply",
    authenticate,
    asyncHandler(async (req, res) => {
      const body = stationAlbumSuggestionApplySchema.parse(req.body);
      const album = await createStationAlbum({
        userId: req.user.id,
        title: body.title,
        description: body.description,
        visibility: body.visibility,
      });
      const movedMediaAssets = await moveMediaAssetsToAlbum({
        userId: req.user.id,
        albumId: album.id,
        mediaAssetIds: body.mediaAssetIds,
      });
      await createUsageEvent({
        userId: req.user.id,
        eventType: "station.album_suggestion.apply",
        targetType: "station_album",
        targetId: album.id,
        payload: { mediaCount: movedMediaAssets.length },
        ipHash: hashRequestIp(req.ip),
        userAgent: req.get("user-agent") || "",
      });
      res.status(201).json({ data: { album: { ...album, mediaCount: movedMediaAssets.length }, mediaAssets: movedMediaAssets } });
    }),
  );

  app.post(
    "/api/station/outfits",
    authenticate,
    asyncHandler(async (req, res) => {
      const body = stationOutfitSchema.parse(req.body);
      const outfit = await createStationOutfit({
        userId: req.user.id,
        ...body,
      });
      await createUsageEvent({
        userId: req.user.id,
        eventType: "station.outfit.create",
        targetType: "station_outfit",
        targetId: outfit.id,
        payload: { visibility: outfit.visibility, source: outfit.source },
        ipHash: hashRequestIp(req.ip),
        userAgent: req.get("user-agent") || "",
      });
      res.status(201).json({ data: outfit });
    }),
  );

  app.post(
    "/api/location/resolve",
    authenticate,
    asyncHandler(async (req, res) => {
      const body = locationResolveSchema.parse(req.body);
      const location = await resolveLocation(body);
      await createUsageEvent({
        userId: req.user.id,
        eventType: "location.resolve",
        targetType: "profile",
        targetId: req.user.id,
        payload: {
          provider: location.provider,
          hasCommunity: Boolean(location.community),
          hasActivityArea: Boolean(location.activityArea),
        },
        ipHash: hashRequestIp(req.ip),
        userAgent: req.get("user-agent") || "",
      });
      res.json({ data: location });
    }),
  );
}
