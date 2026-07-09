import {
  createUsageEvent,
  hashRequestIp,
} from "../repositories.js";
import { eventSchema } from "../schemas.js";

export function registerEventRoutes(app, { authenticate, asyncHandler }) {
  app.post(
    "/api/events",
    authenticate,
    asyncHandler(async (req, res) => {
      const body = eventSchema.parse(req.body);
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
