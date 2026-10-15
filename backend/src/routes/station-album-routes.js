import { HttpError } from "../http-error.js";
import { createUsageEvent, hashRequestIp } from "../repositories.js";
import {
  createStationAlbum,
  updateStationAlbum,
} from "../station-repository.js";
import { deleteOwnedStationAlbum } from "../station-media-deletion-service.js";
import {
  stationAlbumParamsSchema,
  stationAlbumSchema,
  stationAlbumUpdateSchema,
} from "../schemas.js";

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
}
