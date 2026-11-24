import { z } from "zod";
import { forwardChatMessage } from "../chat-forward-repository.js";
import { publicMessage } from "../public-message.js";
import { createRateLimitMiddleware } from "../rate-limit-service.js";

const input = z.object({
  threadId: z.uuid(),
  messageId: z.uuid(),
}).strict();
const forwardBody = z.object({
  targetThreadId: z.uuid(),
  clientMessageId: z.uuid(),
}).strict();
const limitForwarding = createRateLimitMiddleware({
  action: "chat.message.forward",
  limit: 60,
  windowMs: 60 * 60 * 1000,
  message: "转发过于频繁，请稍后重试。",
});

export function registerChatForwardRoutes(app, { authenticate, asyncHandler, sendRealtimeToUser }) {
  app.post(
    "/api/threads/:threadId/messages/:messageId/forward",
    authenticate,
    limitForwarding,
    asyncHandler(async (req, res) => {
      const { threadId, messageId } = input.parse(req.params);
      const { targetThreadId, clientMessageId } = forwardBody.parse(req.body);
      const result = await forwardChatMessage({
        user: req.user,
        threadId: threadId.toLowerCase(),
        messageId: messageId.toLowerCase(),
        targetThreadId: targetThreadId.toLowerCase(),
        clientMessageId: clientMessageId.toLowerCase(),
      });
      for (const delivery of result.deliveries) {
        sendRealtimeToUser(delivery.userId, {
          type: "thread.message",
          threadId: delivery.message.threadId,
          message: publicMessage(delivery.message),
        });
      }
      res.status(result.reused ? 200 : 201).json({
        data: { messages: [publicMessage(result.message)] },
      });
    }),
  );
}
