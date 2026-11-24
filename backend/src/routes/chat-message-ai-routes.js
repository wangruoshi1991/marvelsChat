import { z } from "zod";
import { createRateLimitMiddleware } from "../rate-limit-service.js";

const ids = z.object({ threadId: z.string().uuid(), messageId: z.string().uuid() });
const language = z.enum(["zh", "en"]);
const translation = z.union([
  z.object({ language }).strict(),
  z.object({ language, attachmentId: z.string().uuid(), transcriptId: z.string().uuid() }).strict(),
]);
const transcription = z.object({ attachmentId: z.string().uuid(), language: language.optional() }).strict();

export function registerChatMessageAIRoutes(app, {
  authenticate,
  asyncHandler,
  service,
}) {
  const limit = createRateLimitMiddleware({
    action: "chat.message.ai",
    limit: 20,
    windowMs: 10 * 60 * 1000,
    message: "消息处理请求过于频繁，请稍后重试。",
  });
  for (const [action, schema] of [["translate", translation], ["transcribe", transcription]]) {
    app.post(`/api/threads/:threadId/messages/:messageId/${action}`, authenticate, limit,
      asyncHandler(async (req, res) => {
        const input = { userId: req.user.id, ...ids.parse(req.params), ...schema.parse(req.body) };
        const client = new AbortController();
        const cancel = () => client.abort();
        res.once("close", cancel);
        res.set("Cache-Control", "private, no-store");
        try {
          const data = await service[action]({ ...input, signal: client.signal });
          if (!res.destroyed) res.json({ data });
        } catch (error) {
          if (!res.destroyed) throw error;
        } finally {
          res.off("close", cancel);
        }
      }),
    );
  }
}
