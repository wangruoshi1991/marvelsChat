import crypto from "node:crypto";
import { listAgents } from "../../agents/registry.js";
import { query, withTransaction } from "./db.js";
import { HttpError } from "./http-error.js";
import { mapMessage } from "./repository-mappers.js";
import { assertAgentAvailable, buildAgentAppContext, agentScopesMatchDeclaration } from "./ai-agent-access.js";
import { resolveAIContextReferences } from "./ai-context.js";
import { createAITaskInTransaction, finishAITask, advanceAITask, getAITask } from "./ai-task-repository.js";
import { getAgentContextForUser, getUserById } from "./repositories.js";
import { getThreadForUser, completeAgentMessageOnce, listAgentHistoryBeforeInput } from "./message-repository.js";
import { runAgent } from "./agent-runtime.js";
import { createAlbumAssistantTools } from "./album-assistant-tools.js";
import { mediaRetrievalUserService } from "./media-retrieval-default-service.js";

export async function submitAlbumMessageTask({ user, thread, body, requestFingerprint, replyMetadata, agentAccess }) {
  try {
    return await withTransaction(async connection => {
      // Serialize the message and task together; no durable message may be left
      // without the queued task needed to produce its answer.
      const users = await connection.query("SELECT id FROM users WHERE id = ? AND status = 'active' FOR SHARE", [user.id]);
      if (!users.length) throw new HttpError(403, "账号当前不可执行任务。");
      const access = await connection.query("SELECT enabled, granted_scopes FROM user_agents WHERE user_id = ? AND agent_id = ? FOR SHARE", [user.id, thread.agentId]);
      if (!access[0]?.enabled || !agentScopesMatchDeclaration(agentAccess.agent, access[0].granted_scopes)) {
        throw new HttpError(403, "相册 Agent 授权已撤回或范围已变化，请在“我”移除后重新添加。", { code: "AI_ACCESS_REVOKED" });
      }
      const consent = await connection.query("SELECT index_state, consent_version FROM media_retrieval_profiles WHERE user_id = ? FOR SHARE", [user.id]);
      if (consent[0]?.index_state !== "enabled" || consent[0]?.consent_version !== "media-retrieval-consent-v1") throw new HttpError(403, "请先启用相册 AI 并确认授权。");
      const locked = await connection.query("SELECT id FROM chat_threads WHERE id = ? AND user_id = ? FOR UPDATE", [thread.id, user.id]);
      if (!locked.length) throw new HttpError(404, "Thread not found");
      const existing = await connection.query("SELECT * FROM chat_messages WHERE user_id = ? AND client_message_id = ?", [user.id, body.clientMessageId]);
      if (existing[0] && (existing[0].thread_id !== thread.id || existing[0].metadata?.requestFingerprint !== requestFingerprint)) {
        throw new HttpError(409, "Client message ID already belongs to a different request");
      }
      if (existing[0]?.metadata?.taskId) {
        const task = await getAITask({ userId: user.id, taskId: existing[0].metadata.taskId });
        if (!task) throw new HttpError(409, "任务记录不可用，请刷新会话。");
        return { task, message: mapMessage(existing[0]), reused: true };
      }
      const resolved = existing[0]
        ? { references: existing[0].metadata.contextRefs || [] }
        : await resolveAIContextReferences({ userId: user.id, refs: body.contextRefs,
          grantedScopes: access[0].granted_scopes.filter(scope => agentAccess.agent.permissions.includes(scope)), queryFn: connection.query });
      const inputMessageId = existing[0]?.id || crypto.randomUUID();
      if (!existing[0]) {
        await connection.query(`INSERT INTO chat_messages (id, user_id, thread_id, sender_type, sender_name, content, metadata, client_message_id)
          VALUES (?, ?, ?, 'user', ?, ?, ?::jsonb, ?)`, [inputMessageId, user.id, thread.id, user.displayName, body.content,
          JSON.stringify({ source: "app", ...replyMetadata, requestFingerprint, contextRefs: resolved.references }), body.clientMessageId]);
      }
      const { task, reused } = await createAITaskInTransaction(connection, {
        userId: user.id, kind: "agent_message", agentId: thread.agentId, agentVersion: agentAccess.agent.version,
        threadId: thread.id, inputMessageId, contextRefs: resolved.references,
        idempotencyKey: body.clientMessageId, requestHash: requestFingerprint,
        input: { clientContext: body.clientContext || null },
      });
      const [message] = await connection.query(`UPDATE chat_messages SET metadata = metadata || jsonb_build_object('taskId', ?::text)
        WHERE id = ? RETURNING *`, [task.id, inputMessageId]);
      if (!reused) await connection.query("UPDATE chat_threads SET updated_at = CURRENT_TIMESTAMP WHERE id = ?", [thread.id]);
      return { task, message: mapMessage(message), reused };
    });
  } catch (error) {
    if (error.code === "23505") throw new HttpError(409, "Client message ID already belongs to another message");
    throw error;
  }
}

// Dependency injection is for isolated verification. Production always uses the
// registered runtime and the same authorized retrieval service as the media UI.
export function createMessageTaskExecutor({ runAgentRuntime = runAgent, retrievalService = mediaRetrievalUserService } = {}) {
  return async function executeMessageTask(record) {
    if (record.agentId !== "album-manager") throw new HttpError(422, "Unsupported message task agent");
    const user = await getUserById(record.userId);
    const thread = await getThreadForUser(record.userId, record.threadId);
    if (!user || user.status !== "active" || !thread || thread.agentId !== record.agentId) throw new HttpError(403, "任务账号或会话不可用。");
    const registeredAgents = await listAgents();
    const agentContext = await getAgentContextForUser(user, registeredAgents);
    const access = assertAgentAvailable(agentContext, record.agentId);
    const canReadHistory = access.grantedScopes.includes("messages:read");
    if (access.agent.version !== record.agentVersion) throw new HttpError(409, "Agent 已更新，请重新发起任务。", { code: "AI_AGENT_VERSION_CHANGED" });
    const readInput = async (queryFn = query) => {
      const rows = await queryFn(`SELECT * FROM chat_messages WHERE id = ? AND user_id = ? AND thread_id = ?
        AND deleted_at IS NULL AND recalled_at IS NULL`, [record.inputMessageId, record.userId, record.threadId]);
      if (!rows[0]) throw new HttpError(404, "任务输入已删除或撤回。");
      return rows[0];
    };
    const assertAccess = async (queryFn = query, lock = false) => {
      const rows = await queryFn(`SELECT a.enabled, a.granted_scopes FROM user_agents a JOIN users u ON u.id = a.user_id
        WHERE a.user_id = ? AND a.agent_id = ? AND u.status = 'active'`, [record.userId, record.agentId]);
      if (!rows[0]?.enabled || !agentScopesMatchDeclaration(access.agent, rows[0].granted_scopes)) {
        throw new HttpError(403, "相册 Agent 授权已撤回或范围已变化，请在“我”移除后重新添加。", { code: "AI_ACCESS_REVOKED" });
      }
      const consent = await queryFn("SELECT index_state, consent_version FROM media_retrieval_profiles WHERE user_id = ?", [record.userId]);
      if (consent[0]?.index_state !== "enabled" || consent[0]?.consent_version !== "media-retrieval-consent-v1") throw new HttpError(403, "相册 AI 授权已撤回。");
      await readInput(queryFn);
      return resolveAIContextReferences({ userId: record.userId, refs: record.contextRefs,
        grantedScopes: rows[0].granted_scopes.filter(scope => access.agent.permissions.includes(scope)), queryFn, lock });
    };
    const resolved = await assertAccess();
    const input = await readInput();
    const appContext = buildAgentAppContext(agentContext, access, record.input.clientContext);
    appContext.resolvedReferences = resolved.context;
    const tools = createAlbumAssistantTools({
      userId: record.userId, operationKey: `album-chat:${record.inputMessageId}`, service: retrievalService,
      listAlbums: (userId, name = "") => query("SELECT id, title FROM station_albums WHERE user_id = ? AND deleted_at IS NULL AND title ILIKE ? ORDER BY title, id LIMIT 51", [userId, `%${name.replace(/[\\%_]/g, "\\$&")}%`]),
      assertAccess: async () => {
        await assertAccess();
        await advanceAITask({ taskId: record.id, claimToken: record.claimToken, phase: "searching" });
      },
    });
    let firstModelCall = true;
    const result = await runAgentRuntime({
      agentId: record.agentId, input: input.content, user, thread,
      messages: canReadHistory
        ? await listAgentHistoryBeforeInput(record.userId, record.threadId, record.inputMessageId, 12)
        : [],
      appContext, tools,
      beforeModelCall: async () => {
        await assertAccess();
        await advanceAITask({ taskId: record.id, claimToken: record.claimToken, phase: "generating",
          ...(firstModelCall ? { expectedPhase: "validating" } : {}) });
        firstModelCall = false;
      },
    });
    return finishAITask({ taskId: record.id, claimToken: record.claimToken, status: "succeeded", phase: "completed",
      complete: async connection => {
        // Recheck access under locks through the output commit. Revocation and
        // deletion must not race a late result into the conversation.
        await connection.query("SELECT id FROM users WHERE id = ? FOR SHARE", [record.userId]);
        await connection.query("SELECT user_id FROM user_agents WHERE user_id = ? AND agent_id = ? FOR SHARE", [record.userId, record.agentId]);
        await connection.query("SELECT user_id FROM media_retrieval_profiles WHERE user_id = ? FOR SHARE", [record.userId]);
        await connection.query("SELECT id FROM chat_messages WHERE id = ? FOR UPDATE", [record.inputMessageId]);
        await assertAccess(connection.query, true);
        const completed = await completeAgentMessageOnce({
          connection, userId: record.userId, threadId: record.threadId, inputMessageId: record.inputMessageId,
          agentId: record.agentId, senderName: thread.title, content: result.reply, status: "success",
          provider: result.provider, latencyMs: result.latencyMs, tokenUsage: result.tokenUsage,
          metadata: { provider: result.provider, tokenUsage: result.tokenUsage, taskId: record.id,
            ...(result.albumAssistant ? { albumAssistant: result.albumAssistant } : {}) },
        });
        return { artifacts: [{ kind: "message", id: completed.outputMessage.id, threadId: record.threadId, title: "相册查询回复" }] };
      },
    });
  };
}

export const executeMessageTask = createMessageTaskExecutor();
