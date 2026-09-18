import {
  createUsageEvent,
  hashRequestIp,
} from "../repositories.js";
import { eventSchema } from "../schemas.js";
import { HttpError } from "../http-error.js";
import { MEDIA_RETRIEVAL_DIAGNOSTIC_EVENT } from "../media-retrieval-diagnostics.js";

export function registerEventRoutes(app, { authenticate, asyncHandler }) {
  app.post(
    "/api/events",
    authenticate,
    asyncHandler(async (req, res) => {
      const body = eventSchema.parse(req.body);
      if (body.eventType === MEDIA_RETRIEVAL_DIAGNOSTIC_EVENT) {
        throw new HttpError(400, "This event type is reserved for server diagnostics.");
      }
      const event = await createUsageEvent({
        userId: req.user.id,
        eventType: body.eventType,
        targetType: body.targetType || null,
        targetId: body.targetId || null,
        payload: body.payload,
        ipHash: hashRequestIp(req.ip),
        userAgent: req.get("user-agent") || "",
      });

      res.status(201).json({ data: event });
    }),
  );
}
