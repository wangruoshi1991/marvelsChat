import { z } from "zod";
import { acknowledgeDirectMessageDelivery, listDirectMessageReceipts } from "../chat-message-receipts.js";
import { createRateLimitMiddleware } from "../rate-limit-service.js";

const params = z.object({ threadId: z.uuid().transform(value => value.toLowerCase()) });
const body = z.object({
  messageIds: z.array(z.uuid().transform(value => value.toLowerCase())).min(1).max(50)
    .transform(ids => [...new Set(ids)]),
}).strict();

export function registerChatMessageReceiptRoutes(app, { authenticate, asyncHandler }) {
  const limit = createRateLimitMiddleware({
    action: "chat.message.receipts", limit: 120, windowMs: 60_000,
    message: "回执同步过于频繁，请稍后重试。",
  });
  for (const [suffix, operation] of [
    ["delivered", acknowledgeDirectMessageDelivery],
    ["status", listDirectMessageReceipts],
  ]) {
    app.post(`/api/threads/:threadId/message-receipts/${suffix}`,
      (_req, res, next) => { res.set("Cache-Control", "private, no-store"); next(); },
      authenticate, limit, asyncHandler(async (req, res) => {
        const { threadId } = params.parse(req.params);
        const { messageIds } = body.parse(req.body);
        res.json({ data: await operation({ userId: req.user.id, threadId, messageIds }) });
      }));
  }
}
