import { HttpError } from "../http-error.js";
import { buildAlbumSuggestions } from "../album-management-service.js";
import { createRateLimitMiddleware } from "../rate-limit-service.js";
import { createUsageEvent, hashRequestIp } from "../repositories.js";
import {
  createStationAlbum,
  listStationMediaAssetsForUser,
  moveMediaAssetsToAlbum,
  updateStationAlbum,
} from "../station-repository.js";
import { deleteOwnedStationAlbum } from "../station-media-deletion-service.js";
import {
  stationAlbumParamsSchema,
  stationAlbumSchema,
  stationAlbumSuggestionApplySchema,
  stationAlbumUpdateSchema,
} from "../schemas.js";

const hour = 60 * 60 * 1000;
const albumSuggestionLimit = createRateLimitMiddleware({
  action: "station.album_suggestion.generate",
  limit: 60,
  windowMs: hour,
  message: "相册整理请求过于频繁，请稍后再试。",
});

export function registerStationAlbumRoutes(app, { authenticate, asyncHandler }) {
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
      const deleted = await deleteOwnedStationAlbum({
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

  app.get(
    "/api/station/album-suggestions",
    authenticate,
    albumSuggestionLimit,
    asyncHandler(async (req, res) => {
      const assets = await listStationMediaAssetsForUser(req.user.id, 100);
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
      res.status(201).json({
        data: {
          album: { ...album, mediaCount: movedMediaAssets.length },
          mediaAssets: movedMediaAssets,
        },
      });
    }),
  );
}
