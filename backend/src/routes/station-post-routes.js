import { HttpError } from "../http-error.js";
import { createUsageEvent, hashRequestIp } from "../repositories.js";
import {
  createStationPost,
  deleteStationPost,
} from "../station-repository.js";
import {
  stationPostParamsSchema,
  stationPostSchema,
} from "../schemas.js";

export function registerStationPostRoutes(app, { authenticate, asyncHandler }) {
  app.post(
    "/api/station/posts",
    authenticate,
    asyncHandler(async (req, res) => {
      const body = stationPostSchema.parse(req.body);
      const post = await createStationPost({
        userId: req.user.id,
        ...body,
      });
      await createUsageEvent({
        userId: req.user.id,
        eventType: "station.post.create",
        targetType: "station_post",
        targetId: post.id,
        payload: {
          visibility: post.visibility,
          mediaCount: post.media.length,
          agentCapabilityCount: post.agentCapabilities.length,
        },
        ipHash: hashRequestIp(req.ip),
        userAgent: req.get("user-agent") || "",
      });
      res.status(201).json({ data: post });
    }),
  );

  app.delete(
    "/api/station/posts/:postId",
    authenticate,
    asyncHandler(async (req, res) => {
      const { postId } = stationPostParamsSchema.parse(req.params);
      const deleted = await deleteStationPost({
        userId: req.user.id,
        postId,
      });
      if (!deleted) {
        throw new HttpError(404, "Post not found");
      }
      await createUsageEvent({
        userId: req.user.id,
        eventType: "station.post.delete",
        targetType: "station_post",
        targetId: postId,
        payload: {},
        ipHash: hashRequestIp(req.ip),
        userAgent: req.get("user-agent") || "",
      });
      res.status(204).send();
    }),
  );
}
