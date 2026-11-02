import crypto from "crypto";
import { getAgent, listAgents } from "../../../agents/registry.js";
import { listRegisteredAgentsWithCatalogue } from "../agent-catalog-repository.js";
import { assertAgentExecutionMode, runAgent } from "../agent-runtime.js";
import { config } from "../config.js";
import { HttpError } from "../http-error.js";
import {
  requireAIClientContract,
  requireAgentWorkspaceContract,
} from "../ai-client-contract.js";
import { createRateLimitMiddleware } from "../rate-limit-service.js";
import { query, withTransaction } from "../db.js";
import {
  assertAgentAvailable,
  assertCurrentAgentAccess,
  buildAgentAppContext,
  agentScopesMatchDeclaration,
  assertAgentProductEntitlement,
} from "../ai-agent-access.js";
import { resolveAIContextReferences } from "../ai-context.js";
import { getAITask } from "../ai-task-repository.js";
import { submitAgentWorkspace } from "../agent-workspace-service.js";
import { createWorkspaceDiscussionService } from "../workspace-discussion-service.js";
import { createSpecialistMessageService } from "../specialist-message-service.js";
import {
  assertMatchingMessageRetry,
  messageRequestFingerprint,
} from "../message-request.js";
export {
  assertMatchingMessageRetry,
  messageRequestFingerprint,
} from "../message-request.js";
import {
  buildButlerDispatchContext,
  validateButlerDispatch,
  resolveButlerRequestMessages,
  buildButlerWorkspaceGoal,
} from "../butler-dispatch.js";
import { publicMessage } from "../public-message.js";
export {
  assertAgentAvailable,
  buildAgentAppContext,
} from "../ai-agent-access.js";
import { mediaRetrievalRepository } from "../media-retrieval-default-service.js";
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
  listAgentHistoryBeforeInput,
  listRecentMessagesForThread,
  markThreadReadForUser,
  mirrorDirectMessageToPeer,
  recallMessageForUser,
  setThreadMutedForUser,
} from "../message-repository.js";
import {
  createUsageEvent,
  getAgentContextForUser,
  hashRequestIp,
} from "../repositories.js";
import {
  incrementalMessagesSchema,
  messageSchema,
  threadPreferencesSchema,
} from "../schemas.js";

const defaultLogger = {
  error: (entry) => console.error(JSON.stringify(entry)),
};
const agentRuntimeFailureCode = "AGENT_RUNTIME_FAILED";
const hour = 60 * 60 * 1000;
const staleAgentMessageMs = Math.max(
  2 * 60 * 1000,
  config.newApi.timeoutMs + 30 * 1000,
);
const agentFailureReply =
  "模型服务暂时没有返回。请稍后再试，或让管理员检查后端模型配置。";
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
    status:
      Number.isInteger(status) && status >= 400 && status <= 599 ? status : 500,
  };
}

function assertMatchingPeerMirror(message, fingerprint, senderUserId) {
  if (
    message.metadata?.source !== "direct" ||
    message.metadata?.senderUserId !== senderUserId ||
    message.metadata?.requestFingerprint !== fingerprint
  ) {
    throw new HttpError(409, "Client message ID conflicts with a peer message");
  }
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
  loadAgent = getAgent,
}) {
  const message = await getMessage({ userId, threadId, messageId });
  if (!message || message.senderType !== "agent" || message.recalledAt) {
    throw new HttpError(404, "Message not found");
  }
  const access = await queryFn(
    "SELECT enabled, granted_scopes FROM user_agents WHERE user_id = ? AND agent_id = 'album-manager'",
    [userId],
  );
  const profile = await retrievalRepository.getMediaRetrievalProfile({
    userId,
  });
  const agent = await loadAgent("album-manager");
  if (
    profile?.indexState !== "enabled" ||
    profile.consentVersion !== "media-retrieval-consent-v1" ||
    !access[0]?.enabled ||
    !agentScopesMatchDeclaration(agent, access[0].granted_scopes)
  ) {
    throw new HttpError(
      403,
      "相册 Agent 授权已撤回或范围已变化，请在“我”移除后重新添加。",
      { code: "AI_ACCESS_REVOKED" },
    );
  }
  await assertAgentProductEntitlement({ userId, agent, queryFn });
  const runIds = message.metadata?.albumAssistant?.retrievalRunIds || [];
  const responses = await Promise.all(
    runIds.slice(0, 1).map((agentRunId) =>
      retrievalRepository.getMediaRetrievalSearchResponse({
        userId,
        agentRunId,
      }),
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
  return results.filter(
    (result) => live.get(result.mediaAssetId)?.kind === result.kind,
  );
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
    runAgentRuntime = runAgent,
  },
) {
  const discussWorkspace = createWorkspaceDiscussionService({
    runAgentRuntime,
  });
  const sendSpecialistMessage = createSpecialistMessageService({
    runAgentRuntime,
  });
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
      const thread = await getThreadForUser(
        req.user.id,
        req.params.threadId,
        getOnlineUserIds(),
      );
      if (!thread) throw new HttpError(404, "Thread not found");
      const { after } = incrementalMessagesSchema.parse(req.query);
      const messages = after
        ? await listMessagesForThreadSince(
            req.user.id,
            req.params.threadId,
            after,
          )
        : (await listMessagesForThreads(req.user.id, [req.params.threadId]))[
            req.params.threadId
          ] || [];
      res.json({ data: messages.map(publicMessage) });
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
          message: publicMessage(result.peerMessage),
        });
      }
      res.json({ data: { message: publicMessage(result.message) } });
    }),
  );

  app.post(
    "/api/threads/:threadId/messages",
    authenticate,
    asyncHandler(async (req, res) => {
      const body = messageSchema.parse(req.body);
      const thread = await getThreadForUser(
        req.user.id,
        req.params.threadId,
        getOnlineUserIds(),
      );
      if (!thread) throw new HttpError(404, "Thread not found");
      if (thread.agentId === "album-manager" || body.contextRefs.length)
        requireAIClientContract(req);
      const clientMessageId = body.clientMessageId || crypto.randomUUID();
      const requestFingerprint = messageRequestFingerprint(body);
      if (body.workspaceContext) {
        requireAIClientContract(req);
        requireAgentWorkspaceContract(req);
        enforceAgentMessageCreateLimit(req, res);
        const result = await discussWorkspace({
          userId: req.user.id,
          threadId: thread.id,
          body,
        });
        if (!result.reused)
          await createUsageEvent({
            userId: req.user.id,
            eventType: "message.send",
            targetType: "thread",
            targetId: thread.id,
            payload: { agentId: thread.agentId },
            ipHash: hashRequestIp(req.ip),
            userAgent: req.get("user-agent") || "",
          });
        return res
          .status(result.reused ? 200 : 201)
          .json({ data: { messages: result.messages.map(publicMessage) } });
      }
      if (
        body.agentContextReset !== undefined &&
        (!thread.agentId || thread.agentId === "miaoxun-butler")
      ) {
        throw new HttpError(400, "仅专业 Agent 会话支持清除专业待续需求。", {
          code: "SPECIALIST_CONTEXT_INVALID",
        });
      }
      const replay = async (message) => {
        assertMatchingMessageRetry(message, requestFingerprint);
        if (message.deletedAt) {
          throw new HttpError(409, "这条消息已删除，不能重试。", {
            code: "MESSAGE_DELETED",
          });
        }
        if (message.metadata?.taskId) {
          const task = await getAITask({
            userId: req.user.id,
            taskId: message.metadata.taskId,
          });
          if (!task) throw new HttpError(409, "任务记录不可用，请刷新会话。");
          const result = await getAgentResultForInput(message.id);
          return res.status(200).json({
            data: {
              task,
              messages: [
                message,
                ...(result?.outputMessage && !result.outputMessage.deletedAt
                  ? [result.outputMessage]
                  : []),
              ].map(publicMessage),
            },
          });
        }
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
          if (peer)
            assertMatchingPeerMirror(
              peer.message,
              requestFingerprint,
              req.user.id,
            );
          if (peer?.created) {
            sendRealtimeToUser(thread.peerUserId, {
              type: "thread.message",
              threadId: peer.message.threadId,
              message: publicMessage(peer.message),
            });
          }
        }
        const messages = [message];
        if (thread.agentId) {
          let result = await getAgentResultForInput(message.id);
          const createdAt = Date.parse(message.createdAt || "");
          const staleAfter =
            thread.agentId === "album-manager"
              ? Math.max(staleAgentMessageMs, 15 * 60 * 1000)
              : staleAgentMessageMs;
          if (
            !result?.outputMessage &&
            Number.isFinite(createdAt) &&
            Date.now() - createdAt >= staleAfter
          ) {
            const stalePending = message.metadata?.butlerClarification;
            if (thread.agentId === "miaoxun-butler" && stalePending) {
              await resolveButlerRequestMessages({
                userId: req.user.id,
                threadId: thread.id,
                requestMessageIds: stalePending.requestMessageIds,
                queryFn: query,
              });
            }
            result = await completeAgentMessageOnce({
              userId: req.user.id,
              threadId: thread.id,
              inputMessageId: message.id,
              agentId: thread.agentId,
              senderName: thread.title,
              content: agentFailureReply,
              metadata: {
                provider: "runtime-error",
                errorCode: agentRuntimeFailureCode,
                ...(thread.agentId === "miaoxun-butler"
                  ? {
                      butlerClarification: {
                        requestMessageIds: [
                          ...(stalePending
                            ? stalePending.requestMessageIds
                            : []),
                          message.id,
                        ],
                        contextRefs: stalePending
                          ? stalePending.contextRefs
                          : message.metadata?.contextRefs || [],
                        source: {
                          currentPage:
                            (stalePending
                              ? stalePending.source.currentPage
                              : message.metadata?.assistSource?.currentPage) ||
                            "messages.butler",
                        },
                      },
                    }
                  : {}),
              },
              status: "error",
              provider: "runtime-error",
              latencyMs: Date.now() - createdAt,
              errorMessage: agentRuntimeFailureCode,
            });
          }
          if (!result?.outputMessage) {
            throw new HttpError(
              409,
              "Message is still processing; retry shortly",
            );
          }
          if (!result.outputMessage.deletedAt)
            messages.push(result.outputMessage);
        }
        res
          .status(200)
          .json({ data: { messages: messages.map(publicMessage) } });
      };
      const specialist = async () => {
        requireAIClientContract(req);
        requireAgentWorkspaceContract(req);
        enforceAgentMessageCreateLimit(req, res);
        const result = await sendSpecialistMessage({
          userId: req.user.id,
          threadId: thread.id,
          body,
        });
        // An older server may have admitted this key before the cutover. Its
        // durable target wins; never create a second album or workspace task.
        if (result.legacy) return replay(result.legacy);
        if (!result.reused)
          await createUsageEvent({
            userId: req.user.id,
            eventType: "message.send",
            targetType: "thread",
            targetId: thread.id,
            payload: { agentId: thread.agentId },
            ipHash: hashRequestIp(req.ip),
            userAgent: req.get("user-agent") || "",
          });
        return res
          .status(result.reused ? 200 : 201)
          .json({ data: { messages: result.messages.map(publicMessage) } });
      };
      const existing = await getMessageByClientId({
        userId: req.user.id,
        threadId: thread.id,
        clientMessageId,
        source: "app",
      });
      if (existing)
        return existing.metadata?.specialistMessage
          ? specialist()
          : replay(existing);
      if (thread.agentId && thread.agentId !== "miaoxun-butler")
        return specialist();
      if (body.butlerContextReset && thread.agentId !== "miaoxun-butler") {
        throw new HttpError(400, "仅妙管家支持清除待续需求上下文。", {
          code: "BUTLER_CONTEXT_INVALID",
        });
      }
      if (thread.agentId === "miaoxun-butler") {
        requireAIClientContract(req);
        requireAgentWorkspaceContract(req);
        if ((body.clientContext?.currentPage?.length || 0) > 80) {
          throw new HttpError(400, "请求来源过长，请重新打开妙管家后发送。", {
            code: "BUTLER_SOURCE_INVALID",
          });
        }
      }
      const agentContext = thread.agentId
        ? await getAgentContextForUser(
            req.user,
            await listRegisteredAgentsWithCatalogue(await listAgents()),
          )
        : null;
      let agentAccess = null;
      if (thread.agentId) {
        agentAccess = assertAgentAvailable(agentContext, thread.agentId);
        await assertCurrentAgentAccess({ userId: req.user.id, agent: agentAccess.agent, grantedScopes: agentAccess.grantedScopes, contextRefs: [] });
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

      if (!thread.agentId && body.contextRefs.length)
        throw new HttpError(
          400,
          "AI context references require an Agent conversation",
        );
      const messageMode =
        thread.agentId === "miaoxun-butler" ? "dispatch" : "chat";
      if (thread.agentId) {
        // A generation plan is not a conversation. Reject unsupported chat
        // before persisting a new message or attempting a model call.
        assertAgentExecutionMode(await getAgent(thread.agentId), messageMode);
      }
      const resolvedContext = thread.agentId
        ? await resolveAIContextReferences({
            userId: req.user.id,
            refs: body.contextRefs,
            grantedScopes: agentAccess.grantedScopes,
          })
        : { references: [], context: [] };

      const rawButlerHistory =
        thread.agentId === "miaoxun-butler"
          ? await listRecentMessagesForThread(req.user.id, thread.id, 12)
          : [];
      // A linked task discussion is a hard boundary for the ordinary Butler
      // clarification chain. Starting a new ordinary request after it (the
      // client sends butlerContextReset) must not resurrect an older pending
      // question or carry its source references across the boundary.
      const latestLinkedIndex = rawButlerHistory.findLastIndex((message) =>
        Boolean(message.metadata?.workspaceContext),
      );
      const butlerHistory =
        latestLinkedIndex >= 0
          ? rawButlerHistory.slice(latestLinkedIndex + 1)
          : rawButlerHistory;
      const previousButlerMessage = butlerHistory.at(-1);
      // A different message can arrive while the preceding answer is still
      // running. Its source=app snapshot was written below by this server, not
      // accepted from client metadata, and must retain the same scope guard.
      const carriesPendingContext =
        previousButlerMessage?.senderType === "agent" ||
        (previousButlerMessage?.senderType === "user" &&
          previousButlerMessage.metadata?.source === "app" &&
          previousButlerMessage.metadata?.butlerContextReset !== true);
      const pendingClarification =
        !body.butlerContextReset &&
        !previousButlerMessage?.metadata?.workspaceContext &&
        carriesPendingContext &&
        !previousButlerMessage.recalledAt
          ? previousButlerMessage.metadata?.butlerClarification
          : null;
      const pendingContextMissing = Boolean(
        pendingClarification?.contextRefs?.some(
          (prior) =>
            !resolvedContext.references.some(
              (ref) => prior.kind === ref.kind && prior.id === ref.id,
            ),
        ),
      );
      const continuesPendingContext = Boolean(
        pendingClarification &&
        (!resolvedContext.references.length ||
          resolvedContext.references.every((ref) =>
            pendingClarification.contextRefs.some(
              (prior) => prior.kind === ref.kind && prior.id === ref.id,
            ),
          )),
      );
      const assertPendingInput = async (queryFn = query, lock = false) => {
        if (!continuesPendingContext) return;
        await resolveButlerRequestMessages({
          userId: req.user.id,
          threadId: thread.id,
          requestMessageIds: pendingClarification.requestMessageIds,
          queryFn,
          lock,
        });
        await resolveAIContextReferences({
          userId: req.user.id,
          refs: pendingClarification.contextRefs,
          grantedScopes: agentAccess.grantedScopes,
          queryFn,
          lock,
        });
      };
      await assertPendingInput();

      const userInsert = await addMessageToThreadOnce({
        userId: req.user.id,
        threadId: thread.id,
        senderType: "user",
        senderName: req.user.displayName,
        content: body.content,
        metadata: {
          source: "app",
          ...replyMetadata,
          requestFingerprint,
          contextRefs: resolvedContext.references,
          ...(body.butlerContextReset ? { butlerContextReset: true } : {}),
          ...(continuesPendingContext
            ? { butlerClarification: pendingClarification }
            : {}),
          ...(thread.agentId === "miaoxun-butler" &&
          body.clientContext?.currentPage
            ? { assistSource: { currentPage: body.clientContext.currentPage } }
            : {}),
        },
        clientMessageId,
      });
      if (!userInsert.created) return replay(userInsert.message);
      const userMessage = userInsert.message;
      const requestContinuation =
        thread.agentId === "miaoxun-butler"
          ? {
              requestMessageIds: [
                ...(continuesPendingContext
                  ? pendingClarification.requestMessageIds
                  : []),
                userMessage.id,
              ],
              contextRefs: continuesPendingContext
                ? pendingClarification.contextRefs
                : resolvedContext.references,
              source: {
                currentPage:
                  (continuesPendingContext
                    ? pendingClarification.source.currentPage
                    : userMessage.metadata?.assistSource?.currentPage) ||
                  "messages.butler",
              },
            }
          : null;

      const responseMessages = [userMessage];
      if (thread.peerUserId) {
        const peerMessage = await mirrorDirectMessageToPeer({
          thread,
          senderUser: req.user,
          content: body.content,
          metadata: { ...replyMetadata, requestFingerprint },
          clientMessageId,
        });
        if (peerMessage)
          assertMatchingPeerMirror(
            peerMessage.message,
            requestFingerprint,
            req.user.id,
          );
        if (peerMessage?.created) {
          sendRealtimeToUser(thread.peerUserId, {
            type: "thread.message",
            threadId: peerMessage.message.threadId,
            message: publicMessage(peerMessage.message),
          });
        }
      } else if (thread.agentId) {
        const startedAt = Date.now();
        let completion;
        let dispatchDecision = null;
        let dispatchContext = null;
        try {
          const isButler = thread.agentId === "miaoxun-butler";
          if (isButler) {
            const requestMessages = await resolveButlerRequestMessages({
              userId: req.user.id,
              threadId: thread.id,
              requestMessageIds: requestContinuation.requestMessageIds,
              queryFn: query,
            });
            dispatchContext = {
              ...buildButlerDispatchContext({ agentContext, agentAccess }),
              pendingContextMissing,
              contextReset: body.butlerContextReset === true,
              requestMessages: requestMessages.map(({ content }) => ({
                content,
              })),
            };
          }
          const result = await runAgentRuntime({
            agentId: thread.agentId,
            mode: messageMode,
            input: body.content,
            user: req.user,
            thread,
            messages: agentAccess.grantedScopes.includes("messages:read")
              ? isButler
                ? butlerHistory
                : await listAgentHistoryBeforeInput(
                    req.user.id,
                    thread.id,
                    userMessage.id,
                    12,
                  )
              : [],
            appContext: {
              ...buildAgentAppContext(
                agentContext,
                agentAccess,
                body.clientContext,
              ),
              resolvedReferences: resolvedContext.context,
              ...(isButler ? { dispatch: dispatchContext } : {}),
            },
            beforeModelCall: async () => {
              await assertPendingInput();
              if (isButler)
                await resolveButlerRequestMessages({
                  userId: req.user.id,
                  threadId: thread.id,
                  requestMessageIds: requestContinuation.requestMessageIds,
                  queryFn: query,
                });
              return assertCurrentAgentAccess({
                userId: req.user.id,
                agent: agentAccess.agent,
                grantedScopes: agentAccess.grantedScopes,
                contextRefs: resolvedContext.references,
              });
            },
          });
          if (isButler)
            dispatchDecision = validateButlerDispatch(
              result.reply,
              dispatchContext,
            );
          if (dispatchDecision?.type === "workspace" && pendingContextMissing) {
            dispatchDecision = {
              type: "clarify",
              question:
                body.clientContext?.language === "en"
                  ? "Keep or select the original material again before sending, so this task stays within your selection."
                  : "请保留原来的素材引用或重新选择后再发送，这样任务会限定在你选中的内容内。",
            };
          }
          if (dispatchDecision?.type === "workspace") {
            const requestMessages = await resolveButlerRequestMessages({
              userId: req.user.id,
              threadId: thread.id,
              requestMessageIds: requestContinuation.requestMessageIds,
              queryFn: query,
            });
            buildButlerWorkspaceGoal(requestMessages);
          }
          const clarification =
            dispatchDecision?.type === "reply" && continuesPendingContext
              ? pendingClarification
              : dispatchDecision?.type === "clarify"
                ? {
                    requestMessageIds: requestContinuation.requestMessageIds,
                    contextRefs: pendingContextMissing
                      ? pendingClarification.contextRefs
                      : resolvedContext.references,
                    source: continuesPendingContext
                      ? pendingClarification.source
                      : {
                          currentPage:
                            userMessage.metadata?.assistSource?.currentPage ||
                            "messages.butler",
                        },
                  }
                : null;
          completion = {
            content:
              dispatchDecision?.type === "reply"
                ? dispatchDecision.reply
                : dispatchDecision?.type === "clarify"
                  ? dispatchDecision.question
                  : dispatchDecision
                    ? ""
                    : result.reply,
            metadata: {
              provider: result.provider,
              tokenUsage: result.tokenUsage,
              ...(clarification ? { butlerClarification: clarification } : {}),
              ...(result.albumAssistant
                ? { albumAssistant: result.albumAssistant }
                : {}),
            },
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
            content:
              error?.details?.code === "BUTLER_GOAL_LIMIT"
                ? error.message
                : agentFailureReply,
            metadata: {
              provider: "runtime-error",
              errorCode: failure.code,
              ...(requestContinuation
                ? { butlerClarification: requestContinuation }
                : {}),
            },
            status: "error",
            provider: "runtime-error",
            latencyMs: Date.now() - startedAt,
            errorMessage: failure.code,
          };
        }
        const completionInput = {
          userId: req.user.id,
          threadId: thread.id,
          inputMessageId: userMessage.id,
          agentId: thread.agentId,
          senderName: thread.title,
        };
        let completed;
        if (completion.status === "success") {
          try {
            completed = await withTransaction(async (connection) => {
              return completeAgentMessageOnce({
                ...completionInput,
                ...completion,
                connection,
                prepareCompletion: async (lockedConnection) => {
                  await assertPendingInput(lockedConnection.query, true);
                  const requestMessages = requestContinuation
                    ? await resolveButlerRequestMessages({
                        userId: req.user.id,
                        threadId: thread.id,
                        requestMessageIds:
                          requestContinuation.requestMessageIds,
                        queryFn: lockedConnection.query,
                        lock: true,
                      })
                    : null;
                  await assertCurrentAgentAccess({
                    userId: req.user.id,
                    agent: agentAccess.agent,
                    grantedScopes: agentAccess.grantedScopes,
                    contextRefs: resolvedContext.references,
                    queryFn: lockedConnection.query,
                    lock: true,
                  });
                  if (dispatchDecision?.type !== "workspace") return {};
                  const workspace = await submitAgentWorkspace({
                    user: req.user,
                    connection: lockedConnection,
                    idempotencyKey: `butler-message:${userMessage.id}`,
                    goal: buildButlerWorkspaceGoal(requestMessages),
                    contextRefs: resolvedContext.references,
                    source: {
                      page: continuesPendingContext
                        ? pendingClarification.source.currentPage
                        : userMessage.metadata?.assistSource?.currentPage ||
                          "messages.butler",
                      module: null,
                    },
                    // A grant added while the model was responding does not
                    // become authority for this already-submitted request.
                    authorityCeiling: dispatchContext.availableCapabilities,
                  });
                  return {
                    content:
                      body.clientContext?.language === "en"
                        ? "I've created your task. Follow its agents, progress and results in Miao."
                        : "已创建任务，可在妙页查看参与的 Agent、进展和成果。",
                    metadata: { agentWorkspace: { id: workspace.id } },
                  };
                },
              });
            });
          } catch (error) {
            if (![403, 404, 409].includes(error?.status)) throw error;
            completed = await completeAgentMessageOnce({
              ...completionInput,
              content:
                "授权或引用内容已变化，本次未交付结果。请核对后重新发送。",
              metadata: {
                provider: "runtime-error",
                errorCode: "AI_CONTEXT_CHANGED",
                ...(requestContinuation
                  ? { butlerClarification: requestContinuation }
                  : {}),
              },
              status: "error",
              provider: "runtime-error",
              latencyMs: Date.now() - startedAt,
              errorMessage: "AI_CONTEXT_CHANGED",
            });
          }
        } else {
          completed = await completeAgentMessageOnce({
            ...completionInput,
            ...completion,
          });
        }
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

      res.status(201).json({
        data: { messages: responseMessages.map(publicMessage) },
      });
    }),
  );
}
