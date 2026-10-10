import crypto from "crypto";
import { listAgents } from "../../../agents/registry.js";
import { runAgent } from "../agent-runtime.js";
import { config } from "../config.js";
import { HttpError } from "../http-error.js";
import { createRateLimitMiddleware } from "../rate-limit-service.js";
import { query } from "../db.js";
import { createAlbumAssistantTools } from "../album-assistant-tools.js";
import { mediaRetrievalRepository, mediaRetrievalUserService } from "../media-retrieval-default-service.js";
import { listStationMediaAssetsByIdsForUser } from "../station-library-repository.js";
import {
  addMessageToThreadOnce,
  completeAgentMessageOnce,
  deleteMessageForUser,
  getAgentResultForInput,
  getMessageByClientId,
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
  setThreadMutedForUser,
} from "../message-repository.js";
import {
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
  threadPreferencesSchema,
} from "../schemas.js";

const defaultLogger = { error: (entry) => console.error(JSON.stringify(entry)) };
const agentRuntimeFailureCode = "AGENT_RUNTIME_FAILED";
const hour = 60 * 60 * 1000;
const staleAgentMessageMs = Math.max(2 * 60 * 1000, config.newApi.timeoutMs + 30 * 1000);
const agentFailureReply = "模型服务暂时没有返回。请稍后再试，或让管理员检查后端模型配置。";
const agentMessageCreateLimit = createRateLimitMiddleware({
  action: "agent.message.send",
  limit: 120,
  windowMs: hour,
  message: "Agent 消息发送过于频繁，请稍后再试。",
});

function enforceAgentMessageCreateLimit(req, res) {
  let nextError = null;
  agentMessageCreateLimit(req, res, (error) => {
    nextError = error || null;
  });
  if (nextError) throw nextError;
}

export function agentRuntimeFailureDiagnostic(error) {
  const status = Number(error?.status);
  return {
    code: agentRuntimeFailureCode,
    errorName:
      typeof error?.name === "string" && error.name.trim()
        ? error.name.trim().slice(0, 80)
        : "Error",
    status: Number.isInteger(status) && status >= 400 && status <= 599 ? status : 500,
  };
}

export function buildAgentAppContext(agentContext, access, clientContext, localActionResult) {
  const scopes = new Set(access.grantedScopes);
  return {
    profile: scopes.has("profile:read") ? agentContext.profile : null,
    modules: scopes.has("agents:invoke") ? agentContext.modules : {},
    ownedAgents: scopes.has("agents:invoke") ? agentContext.ownedAgents : [],
    stationContent: scopes.has("station:read") ? agentContext.stationContent : null,
    client: clientContext || null,
    localActionResult: scopes.has("agents:invoke") ? localActionResult || null : null,
  };
}

export function assertMatchingMessageRetry(message, fingerprint) {
  if (message.metadata?.source !== "app" || message.metadata?.requestFingerprint !== fingerprint) {
    throw new HttpError(409, 'Client message ID already belongs to a different request');
  }
}

function assertMatchingPeerMirror(message, fingerprint, senderUserId) {
  if (message.metadata?.source !== "direct" ||
      message.metadata?.senderUserId !== senderUserId ||
      message.metadata?.requestFingerprint !== fingerprint) {
    throw new HttpError(409, 'Client message ID conflicts with a peer message');
  }
}

export function assertAgentAvailable(agentContext, agentId) {
  const agent = agentContext.registeredAgents.find((item) => item.key === agentId);
  if (!agent) {
    throw new HttpError(404, "Agent is not registered");
  }
  const access = agentContext.ownedAgents.find((item) => item.id === agentId && item.enabled);
  if (!access) {
    throw new HttpError(403, "Agent is not enabled for this account");
  }
  const declaredScopes = new Set(agent.permissions);
  const grantedScopes = access.grantedScopes.filter((scope) => declaredScopes.has(scope));
  return { agent, access, grantedScopes };
}

// Result references are re-authorized at read time. The message metadata only
// contains run IDs, so an old message cannot be used to bypass owner, consent,
// Agent-scope, recall, or current-index checks.
export async function getAuthorizedMediaResults({
  userId,
  threadId,
  messageId,
  getMessage = getMessageForUser,
  queryFn = query,
  retrievalRepository = mediaRetrievalRepository,
  listAssets = listStationMediaAssetsByIdsForUser,
}) {
  const message = await getMessage({ userId, threadId, messageId });
  if (!message || message.senderType !== "agent" || message.recalledAt) {
    throw new HttpError(404, "Message not found");
  }
  const access = await queryFn(
    "SELECT enabled, granted_scopes FROM user_agents WHERE user_id = ? AND agent_id = 'album-manager'",
    [userId],
  );
  const profile = await retrievalRepository.getMediaRetrievalProfile({ userId });
  if (
    profile?.indexState !== "enabled" ||
    profile.consentVersion !== "media-retrieval-consent-v1" ||
    !access[0]?.enabled ||
    !access[0].granted_scopes.includes("album:read")
  ) {
    throw new HttpError(403, "相册 AI 授权已撤回。");
  }
  const runIds = message.metadata?.albumAssistant?.retrievalRunIds || [];
  const responses = await Promise.all(
    runIds.slice(0, 1).map((agentRunId) =>
      retrievalRepository.getMediaRetrievalSearchResponse({ userId, agentRunId }),
    ),
  );
  const results = responses.flatMap((response) => response?.results || []);
  const assets = await listAssets({
    userId,
    mediaAssetIds: results.map((result) => result.mediaAssetId),
  });
  const live = new Map(
    assets
      .filter((asset) => asset.status === "uploaded")
      .map((asset) => [asset.id, asset]),
  );
  return results.filter((result) => live.get(result.mediaAssetId)?.kind === result.kind);
}

export function registerMessageRoutes(
  app,
  {
    authenticate,
    asyncHandler,
    getOnlineUserIds,
    sendRealtimeToUser,
    logger = defaultLogger,
    retrievalRepository = mediaRetrievalRepository,
    retrievalService = mediaRetrievalUserService,
    runAgentRuntime = runAgent,
  },
) {
  app.get(
    "/api/threads/:threadId/messages/:messageId/media-results",
    authenticate,
    asyncHandler(async (req, res) => {
      const data = await getAuthorizedMediaResults({
        userId: req.user.id,
        threadId: req.params.threadId,
        messageId: req.params.messageId,
        retrievalRepository,
      });
      res.json({ data });
    }),
  );

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
      const serverTime = new Date().toISOString();
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
          serverTime,
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

  app.patch(
    "/api/threads/:threadId/preferences",
    authenticate,
    asyncHandler(async (req, res) => {
      const preferences = threadPreferencesSchema.parse(req.body);
      const result = await setThreadMutedForUser(
        req.user.id,
        req.params.threadId,
        preferences.muted,
      );
      res.json({ data: result });
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
      const clientMessageId = body.clientMessageId || crypto.randomUUID();
      const requestFingerprint = crypto.createHash('sha256')
        .update(JSON.stringify([body.content, body.replyToMessageId || null]))
        .digest('hex');
      const replay = async (message) => {
        assertMatchingMessageRetry(message, requestFingerprint);
        if (thread.peerUserId) {
          const peer = await mirrorDirectMessageToPeer({
            thread,
            senderUser: req.user,
            content: body.content,
            metadata: message.metadata?.replyTo
              ? { replyTo: message.metadata.replyTo, requestFingerprint }
              : { requestFingerprint },
            clientMessageId,
          });
          if (peer) assertMatchingPeerMirror(peer.message, requestFingerprint, req.user.id);
          if (peer?.created) {
            sendRealtimeToUser(thread.peerUserId, {
              type: 'thread.message',
              threadId: peer.message.threadId,
              message: peer.message,
            });
          }
        }
        let agentRun = null;
        const messages = [message];
        if (thread.agentId) {
          let result = await getAgentResultForInput(message.id);
          const createdAt = Date.parse(message.createdAt || "");
          const staleAfter = thread.agentId === "album-manager" ? Math.max(staleAgentMessageMs, 15 * 60 * 1000) : staleAgentMessageMs;
          if (!result?.outputMessage && Number.isFinite(createdAt) && Date.now() - createdAt >= staleAfter) {
            result = await completeAgentMessageOnce({
              userId: req.user.id,
              threadId: thread.id,
              inputMessageId: message.id,
              agentId: thread.agentId,
              senderName: thread.title,
              content: agentFailureReply,
              metadata: { provider: "runtime-error", errorCode: agentRuntimeFailureCode },
              status: "error",
              provider: "runtime-error",
              latencyMs: Date.now() - createdAt,
              errorMessage: agentRuntimeFailureCode,
            });
          }
          if (!result?.outputMessage) {
            throw new HttpError(409, 'Message is still processing; retry shortly');
          }
          agentRun = result.agentRun;
          messages.push(result.outputMessage);
        }
        res.status(200).json({ data: { messages, agentRun } });
      };
      const existing = await getMessageByClientId({
        userId: req.user.id,
        threadId: thread.id,
        clientMessageId,
        source: 'app',
      });
      if (existing) return replay(existing);
      const agentContext = thread.agentId
        ? await getAgentContextForUser(req.user, await listAgents())
        : null;
      let agentAccess = null;
      if (thread.agentId) {
        agentAccess = assertAgentAvailable(agentContext, thread.agentId);
        enforceAgentMessageCreateLimit(req, res);
      }
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

      const userInsert = await addMessageToThreadOnce({
        userId: req.user.id,
        threadId: thread.id,
        senderType: "user",
        senderName: req.user.displayName,
        content: body.content,
        metadata: { source: "app", ...replyMetadata, requestFingerprint },
        clientMessageId,
      });
      if (!userInsert.created) return replay(userInsert.message);
      const userMessage = userInsert.message;

      const responseMessages = [userMessage];
      let agentRun = null;

      if (thread.peerUserId) {
        const peerMessage = await mirrorDirectMessageToPeer({
          thread,
          senderUser: req.user,
          content: body.content,
          metadata: { ...replyMetadata, requestFingerprint },
          clientMessageId,
        });
        if (peerMessage) assertMatchingPeerMirror(peerMessage.message, requestFingerprint, req.user.id);
        if (peerMessage?.created) {
          sendRealtimeToUser(thread.peerUserId, {
            type: "thread.message",
            threadId: peerMessage.message.threadId,
            message: peerMessage.message,
          });
        }
      } else if (thread.agentId) {
        const startedAt = Date.now();
        let completion;
        try {
          const tools = thread.agentId === "album-manager" && agentAccess.grantedScopes.includes("album:read")
            ? createAlbumAssistantTools({
                userId: req.user.id, inputMessageId: userMessage.id, service: retrievalService,
                listAlbums: (userId, name = "") => query("SELECT id, title FROM station_albums WHERE user_id = ? AND deleted_at IS NULL AND title ILIKE ? ORDER BY title, id LIMIT 51", [userId, `%${name.replace(/[\\%_]/g, "\\$&")}%`]),
                assertAccess: async () => {
                  const rows = await query("SELECT enabled, granted_scopes FROM user_agents WHERE user_id = ? AND agent_id = 'album-manager'", [req.user.id]);
                  if (!rows[0]?.enabled || !rows[0].granted_scopes?.includes("album:read")) throw new HttpError(403, "相册 AI 授权已撤回。");
                },
              }) : null;
          const result = await runAgentRuntime({
            agentId: thread.agentId,
            input: body.content,
            user: req.user,
            thread,
            messages: thread.agentId === "album-manager" || agentAccess.grantedScopes.includes("messages:read")
              ? await listRecentMessagesForThread(req.user.id, thread.id, 12)
              : [],
            appContext: buildAgentAppContext(
              agentContext,
              agentAccess,
              body.clientContext,
              body.localActionResult,
            ),
            tools,
          });
          completion = {
            content: result.reply,
            metadata: { provider: result.provider, tokenUsage: result.tokenUsage,
              ...(result.albumAssistant ? { albumAssistant: result.albumAssistant } : {}) },
            status: "success",
            provider: result.provider,
            latencyMs: result.latencyMs,
            tokenUsage: result.tokenUsage,
          };
        } catch (error) {
          const failure = agentRuntimeFailureDiagnostic(error);
          logger.error({
            type: "agent_runtime_failure",
            ...failure,
            agentId: thread.agentId,
            requestId: req.requestId || null,
            threadId: thread.id,
          });
          completion = {
            content: agentFailureReply,
            metadata: {
              provider: "runtime-error",
              errorCode: failure.code,
            },
            status: "error",
            provider: "runtime-error",
            latencyMs: Date.now() - startedAt,
            errorMessage: failure.code,
          };
        }
        const completed = await completeAgentMessageOnce({
          userId: req.user.id,
          threadId: thread.id,
          inputMessageId: userMessage.id,
          agentId: thread.agentId,
          senderName: thread.title,
          ...completion,
        });
        agentRun = completed.agentRun;
        responseMessages.push(completed.outputMessage);
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
