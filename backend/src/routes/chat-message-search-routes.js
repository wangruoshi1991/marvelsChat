import { z } from "zod";
import { searchChatMessages } from "../chat-message-search.js";

const paramsSchema = z.object({ threadId: z.uuid() });
const bodySchema = z.object({
  q: z.string().trim().min(1).max(200).refine((value) => !value.includes("\u0000")),
  limit: z.int().min(1).max(50).default(30),
  cursor: z.string().max(240).regex(/^[A-Za-z0-9_-]+$/).optional(),
}).strict();

export function registerChatMessageSearchRoutes(app, { authenticate, asyncHandler }) {
  app.post(
    "/api/threads/:threadId/messages/search",
    (_req, res, next) => {
      res.set("Cache-Control", "private, no-store");
      next();
    },
    authenticate,
    asyncHandler(async (req, res) => {
      const { threadId } = paramsSchema.parse(req.params);
      const input = bodySchema.parse(req.body);
      const data = await searchChatMessages({ userId: req.user.id, threadId, ...input });
      res.json({ data });
    }),
  );
}
