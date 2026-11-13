import { HttpError } from "../http-error.js";
import { createUsageEvent, hashRequestIp } from "../repositories.js";
import {
  deleteStationPost,
} from "../station-repository.js";
import {
  stationPostParamsSchema,
  stationPostSchema,
  stationPostInteractionSchema,
} from "../schemas.js";
import { setStationPostInteraction } from "../station-interaction-repository.js";
import { submitStationPost, getStationPostSubmission, resolveStationPostSubmission } from "../station-post-submission-repository.js";
import { stationPostSubmissionParamsSchema } from "../schemas.js";

export function registerStationPostRoutes(app, { authenticate, asyncHandler }) {
  app.post(
    "/api/station/posts",
    authenticate,
    asyncHandler(async (req, res) => {
      const body = stationPostSchema.parse(req.body);
      const post = await submitStationPost({
        userId: req.user.id,
        ...body,
        audit: {
          ipHash: hashRequestIp(req.ip),
          userAgent: req.get("user-agent") || "",
        },
      });
      res.status(201).json({ data: post });
    }),
  );

  app.get(
    "/api/station/post-submissions/:clientRequestId",
    authenticate,
    asyncHandler(async (req, res) => {
      const params = stationPostSubmissionParamsSchema.parse(req.params);
      const receipt = await getStationPostSubmission({ userId: req.user.id, ...params });
      res.json({ data: receipt });
    }),
  );

  app.post(
    "/api/station/post-submissions/:clientRequestId/resolve",
    authenticate,
    asyncHandler(async (req, res) => {
      const params = stationPostSubmissionParamsSchema.parse(req.params);
      const receipt = await resolveStationPostSubmission({ userId: req.user.id, ...params });
      res.json({ data: receipt });
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

  app.post(
    "/api/station/posts/:postId/interactions",
    authenticate,
    asyncHandler(async (req, res) => {
      const { postId } = stationPostParamsSchema.parse(req.params);
      const body = stationPostInteractionSchema.parse(req.body);
      const result = await setStationPostInteraction({
        userId: req.user.id,
        postId,
        ...body,
        audit: {
          ipHash: hashRequestIp(req.ip),
          userAgent: req.get("user-agent") || "",
        },
      });
      res.json({ data: result });
    }),
  );
}
