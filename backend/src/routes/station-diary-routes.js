import { HttpError } from "../http-error.js";
import { createUsageEvent, hashRequestIp } from "../repositories.js";
import {
  createStationDiaryEntry,
  deleteStationDiaryEntry,
  updateStationDiaryEntry,
} from "../station-repository.js";
import {
  stationDiaryParamsSchema,
  stationDiarySchema,
  stationDiaryUpdateSchema,
} from "../schemas.js";

export function registerStationDiaryRoutes(app, { authenticate, asyncHandler }) {
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
}
