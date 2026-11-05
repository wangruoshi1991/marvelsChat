import { z } from "zod";
import { createGroupChat, getGroupMembers, leaveGroupChat } from "../group-chat-repository.js";
import { publicMessage } from "../public-message.js";
import { createRateLimitMiddleware } from "../rate-limit-service.js";
const createSchema = z.object({ title: z.string().trim().min(1).max(80), memberUserIds: z.array(z.string().uuid()).min(2).max(49), idempotencyKey: z.string().uuid() }).strict();
const createLimit = createRateLimitMiddleware({ action: 'chat.group.create', limit: 30, windowMs: 3600000, message: '创建群聊过于频繁，请稍后重试。' });
export function registerGroupChatRoutes(app, { authenticate, asyncHandler, sendRealtimeToUser }) {
  app.post('/api/chat-groups', authenticate, createLimit, asyncHandler(async (req, res) => {
    const result = await createGroupChat({ userId: req.user.id, ...createSchema.parse(req.body) });
    if (result.created) for (const userId of result.recipients) sendRealtimeToUser(userId, { type: 'threads.changed' });
    res.status(result.created ? 201 : 200).json({ data: { thread: result.thread, messages: result.messages.map(publicMessage) } });
  }));
  app.get('/api/chat-groups/:groupId/members', authenticate, asyncHandler(async (req, res) => {
    res.json({ data: await getGroupMembers({ userId: req.user.id, groupId: z.string().uuid().parse(req.params.groupId) }) });
  }));
  app.delete('/api/chat-groups/:groupId/membership', authenticate, asyncHandler(async (req, res) => {
    res.json({ data: await leaveGroupChat({ userId: req.user.id, groupId: z.string().uuid().parse(req.params.groupId) }) });
  }));
}
