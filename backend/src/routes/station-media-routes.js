import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { HttpError } from "../http-error.js";
import {
  buildMediaSearchMatcher,
  normalizeMediaTags,
  suggestTagsForMediaAsset,
} from "../album-management-service.js";
import {
  buildStationMediaObjectKey,
  createOssPutSignedUrl,
  fetchOssObject,
  inspectOssObject,
} from "../oss-service.js";
import { createRateLimitMiddleware } from "../rate-limit-service.js";
import { createUsageEvent, hashRequestIp } from "../repositories.js";
import {
  createStationMediaAsset,
  deleteStationMediaAsset,
  getStationMediaAssetForUser,
  listStationMediaAssetsForUser,
  markStationMediaAssetUploaded,
  prepareStationMediaAssetUpload,
  updateStationMediaAsset,
  updateStationMediaAssetTags,
} from "../station-repository.js";
import {
  stationMediaAssetParamsSchema,
  stationMediaAssetRouteParamsSchema,
  stationMediaAssetSchema,
  stationMediaAssetUpdateSchema,
  stationMediaSearchSchema,
  stationMediaTagsSchema,
  stationMediaUploadCompleteSchema,
  stationMediaUploadUrlSchema,
} from "../schemas.js";

const hour = 60 * 60 * 1000;
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

export function registerStationMediaRoutes(app, { authenticate, asyncHandler }) {
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
}
