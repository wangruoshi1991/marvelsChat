import { getStationContentForUser } from "../station-repository.js";

export function registerStationContentRoutes(app, { authenticate, asyncHandler }) {
  app.get(
    "/api/station/content",
    authenticate,
    asyncHandler(async (req, res) => {
      const content = await getStationContentForUser(req.user.id);
      res.json({ data: content });
    }),
  );
}
