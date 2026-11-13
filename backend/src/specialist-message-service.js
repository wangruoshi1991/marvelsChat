import crypto from "node:crypto";
import { z } from "zod";
import { getAgent } from "../../agents/registry.js";
import { withTransaction } from "./db.js";
import { config } from "./config.js";
import { HttpError } from "./http-error.js";
import { agentScopesMatchDeclaration, assertAgentProductEntitlement } from "./ai-agent-access.js";
import { resolveAIContextReferences } from "./ai-context.js";
import { assertAgentExecutionMode, runAgent } from "./agent-runtime.js";
import { listExecutableWorkspaceCapabilities } from "./agent-workspace-capabilities.js";
import * as workspaceService from "./agent-workspace-service.js";
import { hashSiteDocumentValue } from "./site-document-repository.js";
import { completeAgentMessageOnce } from "./message-repository.js";
import { mapMessage } from "./repository-mappers.js";
import { messageSchema } from "./schemas.js";
import { assertMatchingMessageRetry, messageRequestFingerprint } from "./message-request.js";
import { chatContentPreviewService,canonicalSourceSnapshots } from "./chat-content-preview-service.js";
import { specialistRequestSource, validateSpecialistDispatch } from "./specialist-dispatch.js";

const fail = (status, code, message) => new HttpError(status, message, { code });
const mode = "dispatch";
const receiptVersion = 1;
const snapshot = row => ({ id: row.id, hash: hashSiteDocumentValue([row.sender_type, row.content]) });
const matchesDeclaration = (expected, agent, capabilities) => expected.agentId === agent.key &&
  expected.agentVersion === agent.version && hashSiteDocumentValue(expected.authorityCeiling) === hashSiteDocumentValue(capabilities);
const matchesContentAuthority = (expected, entitlement) => !expected.contentAuthority ||
  hashSiteDocumentValue(expected.contentAuthority) === hashSiteDocumentValue(entitlement);
const pendingFailure = () => fail(409, "SPECIALIST_MESSAGE_PENDING", "当前会话有消息仍在处理中，请稍后核对原消息再发送。");
const interruptedFailure = () => fail(409, "SPECIALIST_MESSAGE_INTERRUPTED", "原消息的模型调用状态未知，未创建任务；原请求已保留，不会自动再次调用模型。请核对会话后另发一条消息。");
const knownFailures = new Set(["AGENT_PRODUCT_ENTITLEMENT_REQUIRED", "AI_ACCESS_REVOKED", "AI_AGENT_VERSION_CHANGED", "AI_CONTEXT_CHANGED", "AI_CONTEXT_NOT_FOUND",
  "AI_CONTEXT_SCOPE_REQUIRED", "SPECIALIST_INPUT_CHANGED", "SPECIALIST_CONTEXT_CHANGED", "SPECIALIST_CONTEXT_LIMIT",
  "SPECIALIST_DISPATCH_INVALID", "SPECIALIST_MESSAGE_PENDING", "SPECIALIST_MESSAGE_INTERRUPTED",
  "WORKSPACE_CAPABILITY_UNAVAILABLE", "WORKSPACE_CONTEXT_INVALID", "WORKSPACE_ACCESS_REVOKED",
  "WORKSPACE_AGENT_CHANGED", "WORKSPACE_ORIGIN_CHANGED", "WORKSPACE_INPUT_TOO_LARGE", "WORKSPACE_ACCESS_REQUIRED",
  "AI_AGENT_MODE_UNSUPPORTED", "CHAT_CONTENT_CHANGED", "CHAT_CONTENT_SOURCE_CHANGED", "CHAT_CONTENT_SOURCE_LIMIT", "CHAT_CONTENT_SOURCE_UNSUPPORTED", "CHAT_CONTENT_AUTHORITY_CHANGED"]);

function safeFailure(error) {
  if (knownFailures.has(error?.details?.code)) return { status: error.status, code: error.details.code, message: error.message };
  return { status: 503, code: "SPECIALIST_MESSAGE_FAILED",
    message: "本次消息未返回可用答复，未创建任务；原请求已保留，不会自动再次调用模型。" };
}

function deliver(outcome) {
  if (outcome.legacy) return outcome;
  if (outcome.failure) throw new HttpError(outcome.failure.status, outcome.failure.message, {
    code: outcome.failure.code, messageId: outcome.message.id,
  });
  return { reused: outcome.reused, messages: [outcome.message,
    ...(outcome.output && !outcome.output.deletedAt && !outcome.output.recalledAt ? [outcome.output] : [])] };
}

export function createSpecialistMessageService({ transaction = withTransaction, loadAgent = getAgent,
  runAgentRuntime = runAgent, completeMessage = completeAgentMessageOnce,
  submitDirectAgentWorkspace = args => workspaceService.submitDirectAgentWorkspace(args),
  contentPreviews = chatContentPreviewService,
  now = () => Date.now(), processingTimeoutMs = Math.max(120000, config.newApi.timeoutMs + 30000),
} = {}) {
  // Serialize admission and receipts, never a provider call. Advisory locks do
  // not invert the message -> thread row order used by recall and completion.
  const lockThread = (connection, userId, threadId) => connection.query(
    "SELECT pg_advisory_xact_lock(hashtextextended(?, 0))", [`specialist-message:${userId}:${threadId}`]);

  async function access(connection, userId, threadId, expected = null) {
    const [user] = await connection.query("SELECT id,display_name FROM users WHERE id = ? AND status = 'active' FOR SHARE", [userId]);
    const [thread] = await connection.query("SELECT id,title,agent_id FROM chat_threads WHERE id = ? AND user_id = ?", [threadId, userId]);
    if (!user) throw fail(403, "AI_ACCESS_REVOKED", "账号不可用，本次未交付新的答复。");
    if (!thread) throw fail(404, "SPECIALIST_THREAD_NOT_FOUND", "会话不存在或不可访问。");
    if (!thread.agent_id || thread.agent_id === "miaoxun-butler") throw fail(400, "SPECIALIST_THREAD_INVALID", "此入口仅用于专业 Agent 会话。");
    const agent = await loadAgent(thread.agent_id);
    assertAgentExecutionMode(agent, mode);
    const [grant] = await connection.query("SELECT enabled,granted_scopes FROM user_agents WHERE user_id = ? AND agent_id = ? FOR SHARE", [userId, agent.key]);
    if (!grant?.enabled || !agentScopesMatchDeclaration(agent, grant.granted_scopes)) {
      throw fail(403, "AI_ACCESS_REVOKED", "Agent 授权已撤回或范围已变化，请在“我”核对授权。");
    }
    const entitlement=await assertAgentProductEntitlement({ userId, agent, queryFn: connection.query.bind(connection) });
    if(expected && !matchesContentAuthority(expected, entitlement))
      throw fail(409,"CHAT_CONTENT_AUTHORITY_CHANGED","产品授权版本已变化，请重新整理创作。");
    const capabilities = listExecutableWorkspaceCapabilities({ registeredAgents: [agent], grants: [{
      agentId: agent.key, enabled: grant.enabled, grantedScopes: grant.granted_scopes,
    }] });
    if (!capabilities.length) throw fail(422, "AI_AGENT_MODE_UNSUPPORTED", "此 Agent 当前不支持专业任务会话。");
    if (expected && !matchesDeclaration(expected, agent, capabilities)) {
      throw fail(409, "AI_AGENT_VERSION_CHANGED", "原消息使用的 Agent 声明已更新，不能重试；请整理为新消息发送。");
    }
    return { agent, user: { id: user.id, displayName: user.display_name }, thread,
      grantedScopes: grant.granted_scopes, capabilities, entitlement };
  }
  async function findInput(connection, userId, clientMessageId) {
    const [row] = await connection.query("SELECT * FROM chat_messages WHERE user_id = ? AND client_message_id = ? FOR UPDATE", [userId, clientMessageId]);
    return row;
  }
  function checkInput(row, { threadId, fingerprint }) {
    if (!row || row.thread_id !== threadId || row.sender_type !== "user") throw fail(409, "MESSAGE_REQUEST_CONFLICT", "消息标识已被其他请求使用。");
    assertMatchingMessageRetry(mapMessage(row), fingerprint);
    if (row.deleted_at || row.recalled_at) throw fail(409, "SPECIALIST_INPUT_CHANGED", "原消息已删除或撤回，本次未交付答复。");
  }
  async function requestMessages(connection, userId, threadId, ids) {
    if (!z.array(z.string().uuid()).min(1).max(20).safeParse(ids).success || new Set(ids).size !== ids.length) {
      throw fail(409, "SPECIALIST_CONTEXT_CHANGED", "原需求记录不可用，请重新提出完整需求。");
    }
    const rows = await connection.query(`SELECT id,sender_type,content FROM chat_messages WHERE user_id = ? AND thread_id = ?
      AND id = ANY(?::text[]) AND sender_type = 'user' AND deleted_at IS NULL AND recalled_at IS NULL
      ORDER BY created_at,id FOR SHARE`, [userId, threadId, ids]);
    if (rows.length !== ids.length || rows.some((row, index) => row.id !== ids[index])) {
      throw fail(409, "SPECIALIST_CONTEXT_CHANGED", "原需求已删除、撤回或变化，请重新提出完整需求。");
    }
    return rows;
  }
  async function validateSnapshots(connection, userId, threadId, snapshots) {
    if (!snapshots.length) return;
    const rows = await connection.query(`SELECT id,sender_type,content FROM chat_messages WHERE user_id = ? AND thread_id = ?
      AND id = ANY(?::text[]) AND deleted_at IS NULL AND recalled_at IS NULL ORDER BY id FOR SHARE`,
    [userId, threadId, snapshots.map(item => item.id)]);
    if (rows.length !== snapshots.length || snapshots.some(item => {
      const row = rows.find(candidate => candidate.id === item.id);
      return !row || snapshot(row).hash !== item.hash;
    })) throw fail(409, "SPECIALIST_CONTEXT_CHANGED", "本次消息引用的需求或会话内容已删除、撤回或变化，未交付答复。");
  }
  async function validateInputContext(connection, row, currentAccess) {
    const saved = row.metadata.specialistMessage;
    await requestMessages(connection, row.user_id, row.thread_id, saved.requestMessageIds);
    await validateSnapshots(connection, row.user_id, row.thread_id, saved.requestSnapshots);
    await validateSnapshots(connection, row.user_id, row.thread_id, saved.history);
    if(saved.contentPreviewContext)await contentPreviews.validateContinuationInTransaction({connection,userId:row.user_id,threadId:row.thread_id,context:saved.contentPreviewContext});
    const selected = await resolveAIContextReferences({ userId: row.user_id, refs: row.metadata.contextRefs,
      grantedScopes: currentAccess.grantedScopes, queryFn: connection.query.bind(connection), lock: true });
    await resolveAIContextReferences({ userId: row.user_id, refs: saved.pendingContextRefs,
      grantedScopes: currentAccess.grantedScopes, queryFn: connection.query.bind(connection), lock: true });
    return selected;
  }
  async function readReceipt(connection, row) {
    const [output] = await connection.query(`SELECT output.* FROM agent_runs run JOIN chat_messages output ON output.id = run.output_message_id
      WHERE run.input_message_id = ? AND run.user_id = ? AND run.thread_id = ? AND run.agent_id = ? AND run.run_type = 'chat'`,
    [row.id, row.user_id, row.thread_id, row.metadata.specialistMessage.agentId]);
    return { message: mapMessage(row), output: output ? mapMessage(output) : null,
      failure: row.metadata.specialistMessage.failure || null, reused: true };
  }
  async function completeFailure(connection, row, failure, senderName) {
    const prior = await readReceipt(connection, row);
    if (prior.output || prior.failure) return prior;
    const saved = row.metadata.specialistMessage;
    const metadata = { ...row.metadata, specialistMessage: { ...saved, state: "failed", failure } };
    const [updated] = await connection.query("UPDATE chat_messages SET metadata = ?::jsonb WHERE id = ? RETURNING *", [JSON.stringify(metadata), row.id]);
    if (row.deleted_at || row.recalled_at) return { message: mapMessage(updated), failure, reused: true };
    const completed = await completeMessage({ connection, userId: row.user_id, threadId: row.thread_id, inputMessageId: row.id,
      agentId: saved.agentId, senderName, content: failure.message, status: "error", provider: "runtime-error",
      latencyMs: Math.max(0, now() - new Date(row.created_at).getTime()), errorMessage: failure.code,
      metadata: { specialistMessage: { version: receiptVersion, mode, agentId: saved.agentId, agentVersion: saved.agentVersion }, errorCode: failure.code } });
    return { message: mapMessage(updated), output: completed.outputMessage, failure, reused: true };
  }
  async function replay(connection, row, currentAccess) {
    if (row.metadata.specialistMessage.version !== receiptVersion || row.metadata.specialistMessage.mode !== mode) {
      throw fail(409, "MESSAGE_REQUEST_CONFLICT", "消息协议已变化，不能重新分派原请求。");
    }
    await access(connection, row.user_id, row.thread_id, row.metadata.specialistMessage);
    await validateInputContext(connection, row, currentAccess);
    const receipt = await readReceipt(connection, row);
    if (receipt.output || receipt.failure) return receipt;
    if (now() - new Date(row.created_at).getTime() >= processingTimeoutMs) {
      return completeFailure(connection, row, safeFailure(interruptedFailure()), currentAccess.thread.title);
    }
    return { ...receipt, failure: safeFailure(pendingFailure()) };
  }
  async function previousClarification(connection, userId, threadId, current) {
    // Include deleted/recalled rows in the boundary: skipping them would revive
    // an earlier private request that the user no longer sees as current.
    const [last] = await connection.query("SELECT * FROM chat_messages WHERE user_id = ? AND thread_id = ? ORDER BY created_at DESC,id DESC LIMIT 1 FOR SHARE", [userId, threadId]);
    if (!last || last.sender_type !== "agent" || last.deleted_at || last.recalled_at ||
      last.metadata?.agentDispatch?.kind !== "clarify") return null;
    const [run] = await connection.query(`SELECT input.metadata FROM agent_runs run JOIN chat_messages input ON input.id = run.input_message_id
      WHERE run.output_message_id = ? AND run.user_id = ? AND run.thread_id = ? AND run.agent_id = ? AND run.status = 'success'
      AND input.deleted_at IS NULL AND input.recalled_at IS NULL`, [last.id, userId, threadId, current.agent.key]);
    const saved = run?.metadata?.specialistMessage;
    if (saved?.state !== "completed") return null;
    // A new message has already passed today's exact consent checks. An old
    // clarification cannot veto every new request after an Agent upgrade, nor
    // can its old goal, selected sources or authority be promoted to the new
    // version. Old same-key receipts remain strict in replay().
    if (!matchesDeclaration(saved, current.agent, current.capabilities) || !matchesContentAuthority(saved, current.entitlement)) {
      return { contextResetReason: "agent_updated" };
    }
    return last.metadata.agentClarification ? { clarification: { ...last.metadata.agentClarification,
      requestSnapshots: saved.requestSnapshots } } : null;
  }

  return async function submitSpecialistMessage({ userId, threadId, body: inputBody }) {
    const body = messageSchema.parse(inputBody);
    if (!body.clientMessageId) throw fail(400, "SPECIALIST_MESSAGE_ID_REQUIRED", "发送专业 Agent 消息需要稳定的消息标识，请更新客户端。");
    if (body.workspaceContext || body.butlerContextReset !== undefined) throw fail(400, "SPECIALIST_CONTEXT_INVALID", "专业会话不能混用任务讨论或管家上下文。");
    const source = specialistRequestSource(body);
    const fingerprint = messageRequestFingerprint(body);
    let admission;
    try {
      admission = await transaction(async connection => {
        await lockThread(connection, userId, threadId);
        const current = await access(connection, userId, threadId);
        if (body.contentPreviewContext && current.agent.key !== "comic-diary") throw fail(400,"SPECIALIST_CONTEXT_INVALID","此 Agent 不支持创作预览续作。");
        const existing = await findInput(connection, userId, body.clientMessageId);
        if (existing) {
          checkInput(existing, { threadId, fingerprint });
          if (!existing.metadata?.specialistMessage) return { replay: { legacy: mapMessage(existing) } };
          return { replay: await replay(connection, existing, current) };
        }
        const pending = await connection.query(`SELECT * FROM chat_messages WHERE user_id = ? AND thread_id = ? AND sender_type = 'user'
          AND metadata->'specialistMessage'->>'state' IN ('admitted','dispatched') AND deleted_at IS NULL AND recalled_at IS NULL
          ORDER BY created_at,id FOR UPDATE`, [userId, threadId]);
        for (const row of pending) {
          if (now() - new Date(row.created_at).getTime() < processingTimeoutMs) throw pendingFailure();
          await completeFailure(connection, row, safeFailure(interruptedFailure()), current.thread.title);
        }
        const continuation = body.contentPreviewContext ? await contentPreviews.continuationInTransaction({connection,userId,threadId,
          context:body.contentPreviewContext,contextRefs:body.contextRefs,agent:current.agent}) : null;
        if(current.agent.key==='comic-diary')await contentPreviews.supersedePendingInTransaction({connection,userId,threadId});
        const effectiveRefs = continuation ? continuation.contextRefs : body.contextRefs;
        const selected = await resolveAIContextReferences({ userId, refs: effectiveRefs, grantedScopes: current.grantedScopes,
          queryFn: connection.query.bind(connection), lock: true });
        if(current.agent.key === "comic-diary" && selected.context.some(item=>item.kind==='station-photo' && item.mediaKind!=='image'))
          throw fail(422,"CHAT_CONTENT_SOURCE_UNSUPPORTED","漫画创作仅支持图片参考，请移除视频。");
        if(current.agent.key === "comic-diary" && selected.context.some(item=>item.kind==='chat-message' && item.threadId!==threadId))
          throw fail(422,"CHAT_CONTENT_SOURCE_UNSUPPORTED","本次创作仅支持当前会话中的消息来源。");
        const prior = body.agentContextReset || continuation ? null : await previousClarification(connection, userId, threadId, current);
        const previous = prior?.clarification;
        const contextResetReason = prior?.contextResetReason;
        if (previous) await validateSnapshots(connection, userId, threadId, previous.requestSnapshots);
        const chain = previous ? await requestMessages(connection, userId, threadId, previous.requestMessageIds) : [];
        if (chain.length >= 20) throw fail(422, "SPECIALIST_CONTEXT_LIMIT", "补充消息过多，请清除待续需求后整理为一条完整需求。");
        const pendingContextRefs = previous?.contextRefs || [];
        await resolveAIContextReferences({ userId, refs: pendingContextRefs, grantedScopes: current.grantedScopes,
          queryFn: connection.query.bind(connection), lock: true });
        const pendingContextMissing = pendingContextRefs.some(prior => !selected.references.some(ref =>
          ref.kind === prior.kind && ref.id === prior.id && ref.version === prior.version));
        const contextReset = body.agentContextReset === true || contextResetReason === "agent_updated";
        let history = [];
        if (!contextReset && current.grantedScopes.includes("messages:read")) {
          // A reset is a persisted history boundary, not just a prompt hint.
          // Keep the boundary even when its message is deleted or recalled so
          // the next turn cannot revive pre-reset stories or selected sources.
          // Preserve PostgreSQL microseconds; pg Date decoding truncates them.
          const [boundary] = await connection.query(`SELECT id,created_at::text AS boundary_created_at FROM chat_messages
            WHERE user_id = ? AND thread_id = ? AND sender_type = 'user'
            AND (metadata->>'agentContextReset' = 'true' OR metadata->'specialistMessage'->>'contextResetReason' = 'agent_updated')
            ORDER BY created_at DESC,id DESC LIMIT 1 FOR SHARE`, [userId, threadId]);
          history = (await connection.query(`SELECT id,sender_type,content FROM chat_messages
            WHERE user_id = ? AND thread_id = ? AND deleted_at IS NULL AND recalled_at IS NULL
            AND NOT(id=ANY(?::text[]))
            ${boundary ? "AND (created_at,id) >= (?::timestamptz,?::text)" : ""}
            ORDER BY created_at DESC,id DESC LIMIT 10 FOR SHARE`,
          [userId, threadId, continuation?.removedMessageIds || [], ...(boundary ? [boundary.boundary_created_at, boundary.id] : [])])).reverse();
        }
        let replyTo = null;
        if (body.replyToMessageId) {
          const [row] = await connection.query("SELECT id,sender_name,content,recalled_at FROM chat_messages WHERE id = ? AND user_id = ? AND thread_id = ? AND deleted_at IS NULL FOR SHARE", [body.replyToMessageId, userId, threadId]);
          if (!row) throw fail(404, "SPECIALIST_INPUT_CHANGED", "回复的消息已不可用。");
          replyTo = { messageId: row.id, senderName: row.sender_name, content: row.recalled_at ? "" : row.content, recalledAt: row.recalled_at };
        }
        const id = crypto.randomUUID();
        const requestRows = [...chain, { id, sender_type: "user", content: body.content }];
        const saved = { version: receiptVersion, mode, state: "admitted", agentId: current.agent.key,
          agentVersion: current.agent.version, authorityCeiling: current.capabilities,
          ...(current.agent.key==="comic-diary"?{contentAuthority:current.entitlement}:{}),
          requestMessageIds: requestRows.map(row => row.id), requestSnapshots: requestRows.map(snapshot),
          history: history.map(snapshot), pendingContextRefs, pendingContextMissing, source: previous?.source || source,
          ...(contextResetReason ? { contextResetReason } : {}),
          ...(continuation ? {contentPreviewContext:{id:continuation.id,revision:continuation.revision,snapshotHash:continuation.snapshotHash}} : {}) };
        const metadata = { source: "app", requestFingerprint: fingerprint, contextRefs: selected.references, specialistMessage: saved,
          ...(replyTo ? { replyTo } : {}), ...(body.agentContextReset ? { agentContextReset: true } : {}) };
        const [row] = await connection.query(`INSERT INTO chat_messages(id,user_id,thread_id,sender_type,sender_name,content,metadata,client_message_id)
          VALUES (?,?,?,'user',?,?,?::jsonb,?) RETURNING *`,
        [id, userId, threadId, current.user.displayName, body.content, JSON.stringify(metadata), body.clientMessageId]);
        await connection.query("UPDATE chat_threads SET updated_at = CURRENT_TIMESTAMP WHERE id = ?", [threadId]);
        return { row, current, requestRows, selected, continuation, messages: history.map(item => ({ senderType: item.sender_type, content: item.content })) };
      });
    } catch (error) {
      if (error?.code === "23505") throw fail(409, "MESSAGE_REQUEST_CONFLICT", "消息标识已被其他请求使用。");
      throw error;
    }
    if (admission.replay) return deliver(admission.replay);
    const saved = admission.row.metadata.specialistMessage;
    let dispatched = false;
    try {
      const result = await runAgentRuntime({ agentId: saved.agentId, mode, input: body.content,
        user: admission.current.user, thread: null, messages: admission.messages,
        appContext: { client: { language: body.clientContext?.language || "zh" }, resolvedReferences: admission.selected.context.map(item => item.kind === "station-file" ? { kind: item.kind, id: item.id, title: item.title, parseVersion: item.parseVersion, contentAvailableInTask: true } : item),
          ...(admission.continuation ? {contentPreviewContext:{kind:admission.continuation.kind,snapshot:admission.continuation.snapshot}}:{}),
          specialistDispatch: { agent: { id: saved.agentId, name: admission.current.agent.name }, capabilities: saved.authorityCeiling,
            requestMessages: admission.requestRows.map(({ content }) => ({ content })), pendingContextMissing: saved.pendingContextMissing,
            contextReset: body.agentContextReset === true || saved.contextResetReason === "agent_updated" } },
        beforeModelCall: async () => transaction(async connection => {
          await lockThread(connection, userId, threadId);
          const current = await access(connection, userId, threadId, saved);
          const row = await findInput(connection, userId, body.clientMessageId);
          checkInput(row, { threadId, fingerprint });
          await validateInputContext(connection, row, current);
          if (dispatched || row.metadata.specialistMessage.state !== "admitted") throw interruptedFailure();
          await connection.query("UPDATE chat_messages SET metadata = jsonb_set(metadata,'{specialistMessage,state}','\"dispatched\"'::jsonb) WHERE id = ?", [row.id]);
          dispatched = true;
        }),
      });
      if (!dispatched) throw fail(502, "SPECIALIST_DISPATCH_INVALID", "Agent 执行没有经过权限复验，未创建任务。");
      let decision = validateSpecialistDispatch(result.reply, { agentId: saved.agentId, capabilities: saved.authorityCeiling });
      if (["workspace","content_preview"].includes(decision.type) && saved.pendingContextMissing) decision = { type: "clarify",
        question: body.clientContext?.language === "en" ? "Keep or select the original material again before sending, or clear the pending request to start a new one."
          : "请保留或重新选择原来的素材后再发送；如果要另提需求，请先清除待续需求。" };
      const outcome = await transaction(async connection => {
        await lockThread(connection, userId, threadId);
        const current = await access(connection, userId, threadId, saved);
        const row = await findInput(connection, userId, body.clientMessageId);
        checkInput(row, { threadId, fingerprint });
        await validateInputContext(connection, row, current);
        const prior = await readReceipt(connection, row);
        if (prior.output || prior.failure) return prior;
        if (row.metadata.specialistMessage.state !== "dispatched") throw interruptedFailure();
        const agentDispatch = { version: receiptVersion, kind: decision.type,
          ...(saved.contextResetReason === "agent_updated" ? { contextResetReason: saved.contextResetReason } : {}) };
        const clarification = decision.type === "clarify" ? { requestMessageIds: saved.requestMessageIds,
          contextRefs: saved.pendingContextMissing ? saved.pendingContextRefs : row.metadata.contextRefs, source: saved.source } : null;
        const completed = await completeMessage({ connection, userId, threadId, inputMessageId: row.id, agentId: saved.agentId,
          senderName: current.thread.title, content: ["reply","content_preview"].includes(decision.type) ? decision.reply : decision.type === "clarify" ? decision.question : "",
          status: "success", provider: result.provider, latencyMs: result.latencyMs, tokenUsage: result.tokenUsage,
          metadata: { agentDispatch, ...(clarification ? { agentClarification: clarification } : {}),
            specialistMessage: { version: receiptVersion, mode, agentId: saved.agentId, agentVersion: saved.agentVersion },
            provider: result.provider, tokenUsage: result.tokenUsage },
          prepareCompletion: async lockedConnection => {
            if (decision.type === "content_preview") {
              const preview = await contentPreviews.persistPreparedInTransaction({connection:lockedConnection,userId,threadId,inputMessageId:row.id,
                decision,sourceSnapshots:canonicalSourceSnapshots([...saved.requestSnapshots,...saved.history]),
                contextRefs:row.metadata.contextRefs,authority:{agentId:saved.agentId,agentVersion:saved.agentVersion,entitlement:saved.contentAuthority},
                basePreviewId:saved.contentPreviewContext?.id||null});
              return {metadata:{contentPreview:{version:1,id:preview.id}}};
            }
            if (decision.type !== "workspace") return {};
            const workspace = await submitDirectAgentWorkspace({ user: current.user, threadId, inputMessageId: row.id,
              requestMessageIds: saved.requestMessageIds, capability: decision.capability, contextRefs: row.metadata.contextRefs,
              source: { page: saved.source.currentPage, module: null }, idempotencyKey: `specialist-message:${row.id}`,
              authorityCeiling: saved.authorityCeiling, connection: lockedConnection });
            return { content: body.clientContext?.language === "en" ? "Your task is ready. Follow its progress and results in Miao."
              : "已创建任务，可在妙页查看这位 Agent 的进展和成果。", metadata: { agentWorkspace: { id: workspace.id } } };
          } });
        if (decision.type === "content_preview") await contentPreviews.bindOutputInTransaction(connection,{
          previewId:completed.outputMessage.metadata.contentPreview.id,outputMessageId:completed.outputMessage.id});
        const updatedMetadata = { ...row.metadata, agentDispatch,
          specialistMessage: { ...row.metadata.specialistMessage, state: "completed" } };
        const [updated] = await connection.query("UPDATE chat_messages SET metadata = ?::jsonb WHERE id = ? RETURNING *", [JSON.stringify(updatedMetadata), row.id]);
        return { message: mapMessage(updated), output: completed.outputMessage, reused: false };
      });
      return deliver(outcome);
    } catch (error) {
      const failure = safeFailure(error);
      const outcome = await transaction(async connection => {
        await lockThread(connection, userId, threadId);
        const row = await findInput(connection, userId, body.clientMessageId);
        if (!row) return null;
        // A committed success wins over transport failure or a late response.
        // No rejected model text, provider error or private history is exposed.
        return completeFailure(connection, row, failure, admission.current.thread.title);
      });
      if (outcome && !outcome.failure) {
        await transaction(async connection => { const current = await access(connection, userId, threadId, saved);
          await validateInputContext(connection, admission.row, current); });
        return deliver(outcome);
      }
      throw new HttpError(outcome?.failure?.status || failure.status, outcome?.failure?.message || failure.message,
        { code: outcome?.failure?.code || failure.code, messageId: admission.row.id });
    }
  };
}
