import { createUsageEvent, hashRequestIp } from "../repositories.js";
import { withTransaction } from "../db.js";
import { createStationOutfit } from "../station-repository.js";
import { stationOutfitSchema } from "../schemas.js";

export function registerStationOutfitRoutes(app, { authenticate, asyncHandler }) {
  app.post(
    "/api/station/outfits",
    authenticate,
    asyncHandler(async (req, res) => {
      const body = stationOutfitSchema.parse(req.body);
      const outfit = await withTransaction(async connection => {
        const created = await createStationOutfit({ userId: req.user.id, ...body }, connection.query);
        await createUsageEvent({
          userId: req.user.id,
          eventType: "station.outfit.create",
          targetType: "station_outfit",
          targetId: created.id,
          payload: { visibility: created.visibility, source: created.source },
          ipHash: hashRequestIp(req.ip),
          userAgent: req.get("user-agent") || "",
        }, connection.query);
        return created;
      });
      res.status(201).json({ data: outfit });
    }),
  );
}
