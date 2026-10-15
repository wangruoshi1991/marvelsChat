import { listStationVideoDraftsForUser } from "../station-repository.js";
import { limitSchema } from "../schemas.js";

// Existing drafts remain readable. New video work uses the registered Agent
// capability and its authenticated workspace, rather than a template generator.
export function registerStationVideoRoutes(app, { authenticate, asyncHandler }) {
  app.get(
    "/api/station/video-drafts",
    authenticate,
    asyncHandler(async (req, res) => {
      const { limit } = limitSchema.parse(req.query);
      res.json({ data: await listStationVideoDraftsForUser(req.user.id, limit) });
    }),
  );
}
