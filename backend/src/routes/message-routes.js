import crypto from "crypto";
import { listAgents } from "../../../agents/registry.js";
import { runAgent } from "../agent-runtime.js";
import { HttpError } from "../http-error.js";
import {
  addMessageToThread,
  deleteMessageForUser,
  getMessageForUser,
  getThreadForUser,
  listMessagesForThreadSince,
  listMessagesForThreads,
  listRecentMessagesForThread,
  listThreadIdsUpdatedSince,
  listThreadsForUser,
  markThreadReadForUser,
  mirrorDirectMessageToPeer,
  recallMessageForUser,
} from "../message-repository.js";
import {
  createAgentRun,
  createUsageEvent,
  getAgentContextForUser,
  hashRequestIp,
  listNotificationsForUser,
  unreadNotificationCount,
} from "../repositories.js";
import {
  incrementalMessagesSchema,
  incrementalSyncSchema,
  messageSchema,
} from "../schemas.js";

export function registerMessageRoutes(
  app,
  { authenticate, asyncHandler, getOnlineUserIds, sendRealtimeToUser },
) {
  app.get(
    "/api/threads/:threadId/messages",
    authenticate,
    asyncHandler(async (req, res) => {
      const thread = await getThreadForUser(req.user.id, req.params.threadId, getOnlineUserIds());
      if (!thread) throw new HttpError(404, "Thread not found");
      const { after } = incrementalMessagesSchema.parse(req.query);
      const messages = after
        ? await listMessagesForThreadSince(req.user.id, req.params.threadId, after)
        : (await listMessagesForThreads(req.user.id, [req.params.threadId]))[req.params.threadId] || [];
      res.json({ data: messages });
    }),
  );

  app.get(
    "/api/app/sync",
    authenticate,
    asyncHandler(async (req, res) => {
      const { updatedAfter } = incrementalSyncSchema.parse(req.query);
      const threadIds = await listThreadIdsUpdatedSince(req.user.id, updatedAfter || null);
      const threads = threadIds.length
        ? (await listThreadsForUser(req.user.id, getOnlineUserIds())).filter((thread) => threadIds.includes(thread.id))
        : [];
      const messagesByThread = await listMessagesForThreads(req.user.id, threadIds);
      const [notices, unreadNoticeCount] = await Promise.all([
        listNotificationsForUser(req.user.id),
        unreadNotificationCount(req.user.id),
      ]);

      res.json({
        data: {
          threads,
          messagesByThread,
          notices,
          unreadNoticeCount,
          serverTime: new Date().toISOString(),
        },
      });
    }),
  );

  app.post(
    "/api/threads/:threadId/read",
    authenticate,
    asyncHandler(async (req, res) => {
      await markThreadReadForUser(req.user.id, req.params.threadId);
      res.json({ data: { ok: true } });
    }),
  );

  app.delete(
    "/api/threads/:threadId/messages/:messageId",
    authenticate,
    asyncHandler(async (req, res) => {
      await deleteMessageForUser({
        userId: req.user.id,
        threadId: req.params.threadId,
        messageId: req.params.messageId,
      });
      res.json({ data: { ok: true } });
    }),
  );

  app.post(
    "/api/threads/:threadId/messages/:messageId/recall",
    authenticate,
    asyncHandler(async (req, res) => {
      const result = await recallMessageForUser({
        userId: req.user.id,
        threadId: req.params.threadId,
        messageId: req.params.messageId,
      });
      if (result.peerUserId && result.peerMessage) {
        sendRealtimeToUser(result.peerUserId, {
          type: "thread.message.updated",
          threadId: result.peerMessage.threadId,
          message: result.peerMessage,
        });
      }
      res.json({ data: { message: result.message } });
    }),
  );

  app.post(
    "/api/threads/:threadId/messages",
    authenticate,
    asyncHandler(async (req, res) => {
      const body = messageSchema.parse(req.body);
      const thread = await getThreadForUser(req.user.id, req.params.threadId, getOnlineUserIds());
      if (!thread) throw new HttpError(404, "Thread not found");
      const clientMessageId = crypto.randomUUID();
      let replyTo = null;
      if (body.replyToMessageId) {
        replyTo = await getMessageForUser({
          userId: req.user.id,
          threadId: thread.id,
          messageId: body.replyToMessageId,
        });
        if (!replyTo) throw new HttpError(404, "Reply target not found");
      }
      const replyMetadata = replyTo
        ? {
            replyTo: {
              messageId: replyTo.id,
              senderName: replyTo.senderName,
              content: replyTo.recalledAt ? "" : replyTo.content,
              recalledAt: replyTo.recalledAt || null,
            },
          }
        : {};

      const userMessage = await addMessageToThread({
        userId: req.user.id,
        threadId: thread.id,
        senderType: "user",
        senderName: req.user.displayName,
        content: body.content,
        metadata: { source: "app", ...replyMetadata },
        clientMessageId,
      });

      const responseMessages = [userMessage];
      let agentRun = null;

      if (thread.peerUserId) {
        const peerMessage = await mirrorDirectMessageToPeer({
          thread,
          senderUser: req.user,
          content: body.content,
          metadata: replyMetadata,
          clientMessageId,
        });
        if (peerMessage) {
          sendRealtimeToUser(thread.peerUserId, {
            type: "thread.message",
            threadId: peerMessage.threadId,
            message: peerMessage,
          });
        }
      } else if (thread.agentId) {
        const startedAt = Date.now();
        try {
          const agentContext = await getAgentContextForUser(req.user, await listAgents());
          const result = await runAgent({
            agentId: thread.agentId,
            input: body.content,
            user: req.user,
            thread,
            messages: await listRecentMessagesForThread(req.user.id, thread.id, 12),
            appContext: {
              profile: agentContext.profile,
              modules: agentContext.modules,
              ownedAgents: agentContext.ownedAgents,
              client: body.clientContext || null,
              localActionResult: body.localActionResult || null,
            },
          });
          const agentMessage = await addMessageToThread({
            userId: req.user.id,
            threadId: thread.id,
            senderType: "agent",
            senderName: thread.title,
            content: result.reply,
            metadata: { provider: result.provider, tokenUsage: result.tokenUsage },
            countUnread: false,
          });

          agentRun = await createAgentRun({
            userId: req.user.id,
            agentId: thread.agentId,
            threadId: thread.id,
            inputMessageId: userMessage.id,
            outputMessageId: agentMessage.id,
            status: "success",
            provider: result.provider,
            latencyMs: result.latencyMs,
            tokenPrompt: result.tokenUsage.prompt,
            tokenCompletion: result.tokenUsage.completion,
            tokenTotal: result.tokenUsage.total,
          });
          responseMessages.push(agentMessage);
        } catch (error) {
          agentRun = await createAgentRun({
            userId: req.user.id,
            agentId: thread.agentId,
            threadId: thread.id,
            inputMessageId: userMessage.id,
            status: "error",
            provider: "runtime-error",
            latencyMs: Date.now() - startedAt,
            errorMessage: error.message,
          });

          const agentMessage = await addMessageToThread({
            userId: req.user.id,
            threadId: thread.id,
            senderType: "agent",
            senderName: thread.title,
            content: "模型服务暂时没有返回。请稍后再试，或让管理员检查后端模型配置。",
            metadata: { provider: "runtime-error", error: error.message },
            countUnread: false,
          });
          responseMessages.push(agentMessage);
        }
      }

      await createUsageEvent({
        userId: req.user.id,
        eventType: "message.send",
        targetType: "thread",
        targetId: thread.id,
        payload: { agentId: thread.agentId || null },
        ipHash: hashRequestIp(req.ip),
        userAgent: req.get("user-agent") || "",
      });

      res.status(201).json({ data: { messages: responseMessages, agentRun } });
    }),
  );
}
