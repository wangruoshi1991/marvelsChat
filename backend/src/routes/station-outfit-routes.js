import { createUsageEvent, hashRequestIp } from "../repositories.js";
import { createStationOutfit } from "../station-repository.js";
import { stationOutfitSchema } from "../schemas.js";

export function registerStationOutfitRoutes(app, { authenticate, asyncHandler }) {
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
}
