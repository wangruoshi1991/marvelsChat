import { unavailableWorkspaceFileSources } from './agent-workspace-repository.js';
import crypto from "node:crypto";
import { getAgent } from "../../agents/registry.js";
import { withTransaction } from "./db.js";
import { config } from "./config.js";
import { HttpError } from "./http-error.js";
import { agentScopesMatchDeclaration, assertAgentProductEntitlement } from "./ai-agent-access.js";
import { readContributionDiscussionContext } from "./agent-workspace-service.js";
import { discussionHistoryHash as historyHash, validateDiscussionHistory } from "./workspace-discussion-history.js";
import { assertAgentExecutionMode, runAgent } from "./agent-runtime.js";
import { completeAgentMessageOnce } from "./message-repository.js";
import { mapMessage } from "./repository-mappers.js";
import { messageSchema } from "./schemas.js";
import { assertMatchingMessageRetry, messageRequestFingerprint } from "./message-request.js";

const fail = (status, code, message) => new HttpError(status, message, { code });
const stale = () => fail(409, "WORKSPACE_DISCUSSION_STALE", "原任务的进度或轮次已变化。请重新打开原任务，核对后再发起讨论。");
const inputUnavailable = () => fail(409, "WORKSPACE_DISCUSSION_INPUT_CHANGED", "讨论消息已删除、撤回或变化，本次未交付答复。");
const knownFailures = new Set(["WORKSPACE_DISCUSSION_STALE", "WORKSPACE_DISCUSSION_INPUT_CHANGED",
  "WORKSPACE_DISCUSSION_HISTORY_CHANGED", "WORKSPACE_DISCUSSION_INTERRUPTED", "WORKSPACE_DISCUSSION_PENDING",
  "AI_ACCESS_REVOKED", "AI_AGENT_VERSION_CHANGED", "WORKSPACE_NOT_FOUND", "WORKSPACE_FILE_SOURCE_UNAVAILABLE",
  "WORKSPACE_ACCESS_REVOKED", "WORKSPACE_AGENT_CHANGED", "WORKSPACE_SOURCES_CHANGED", "WORKSPACE_CONTRIBUTION_UNAVAILABLE",
  "AGENT_PRODUCT_ENTITLEMENT_REQUIRED", "WORKSPACE_CONTRIBUTION_CHANGED"]);

function safeFailure(error) {
  if (knownFailures.has(error?.details?.code)) return { status: error.status, code: error.details.code, message: error.message };
  return { status: 503, code: "WORKSPACE_DISCUSSION_FAILED", message: "本次任务讨论未返回可用答复；原请求已保留，不会自动再次调用模型。" };
}

export function assertDiscussionReply(value) {
  if (typeof value !== "string" || !value.trim() || value.length > 16000) {
    throw fail(502, "WORKSPACE_DISCUSSION_RESPONSE_INVALID", "任务讨论未返回有效文字答复。");
  }
  const reply = value.trim();
  // This mode has no structured action protocol. A dispatch-shaped response
  // must never be displayed as a successful execution or fed into dispatch.
  let parsed;
  try { parsed = JSON.parse(reply.replace(/^```(?:json)?\s*|\s*```$/gi, "")); } catch { /* Natural language is expected. */ }
  if (parsed && typeof parsed === "object") throw fail(502, "WORKSPACE_DISCUSSION_RESPONSE_INVALID", "任务讨论只能返回文字建议。");
  return reply;
}

function deliver(outcome) {
  if (outcome.failure) throw new HttpError(outcome.failure.status, outcome.failure.message, {
    code: outcome.failure.code, messageId: outcome.message.id, workspaceContext: outcome.message.metadata.workspaceContext,
  });
  return { reused: outcome.reused, messages: [outcome.message, ...(outcome.output && !outcome.output.deletedAt ? [outcome.output] : [])] };
}

// Both paths are discussion-only. Butler metadata discussion never reads a
// body; selected contribution discussion uses the original delivery gate.
export function createWorkspaceDiscussionService({ transaction = withTransaction, loadAgent = getAgent,
  runAgentRuntime = runAgent, completeMessage = completeAgentMessageOnce,
  agentId = "miaoxun-butler", contribution = false, readContribution = readContributionDiscussionContext,
  now = () => Date.now(), processingTimeoutMs = Math.max(120000, config.newApi.timeoutMs + 30000),
} = {}) {
  const mode = contribution ? "discussContribution" : "discussWorkspace";
  const runtimeMode = contribution ? "chat" : mode;
  const sourceHash = value => crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex");
  async function selectedContext(connection, workspace, selector, expectedHash) {
    const context = await readContribution({ connection, userId: workspace.user_id, agentId, selector });
    if (expectedHash && expectedHash !== sourceHash(context)) {
      throw fail(409, "WORKSPACE_CONTRIBUTION_CHANGED", "原贡献内容已变化，请重新查看成果后讨论。");
    }
    return context;
  }
  async function lockWorkspace(connection, userId, selector) {
    // All stages, including recovery and failure receipts, take the workspace
    // before any message lock. No database lock is held across a model call.
    const [workspace] = await connection.query(`SELECT id,user_id,context_refs,goal,current_round,revision,status,summary,
      result->'artifact'->>'kind' AS result_kind,result->'artifact'->>'title' AS result_title
      FROM agent_workspaces WHERE id = ? AND user_id = ? FOR UPDATE`, [selector.id, userId]);
    if (!workspace) throw fail(404, "WORKSPACE_NOT_FOUND", "原任务不存在或不可访问。");
    return workspace;
  }
  async function access(connection, userId, threadId, expectedVersion = null) {
    const agent = await loadAgent(agentId);
    assertAgentExecutionMode(agent, runtimeMode);
    const [user] = await connection.query("SELECT display_name FROM users WHERE id = ? AND status = 'active' FOR SHARE", [userId]);
    const [grant] = await connection.query("SELECT enabled,granted_scopes FROM user_agents WHERE user_id = ? AND agent_id = ? FOR SHARE", [userId, agentId]);
    if (!user || !grant?.enabled || !agentScopesMatchDeclaration(agent, grant.granted_scopes)) {
      throw fail(403, "AI_ACCESS_REVOKED", "Agent 授权已撤回或范围已变化，请在“我”核对授权。");
    }
    const [thread] = await connection.query("SELECT title,agent_id,kind,peer_user_id FROM chat_threads WHERE id = ? AND user_id = ?", [threadId, userId]);
    if (thread?.agent_id !== agentId || thread.kind !== "agent" || thread.peer_user_id !== null) {
      throw fail(400, "WORKSPACE_DISCUSSION_THREAD_INVALID", contribution
        ? "请在这份贡献所属的 Agent 会话中继续讨论。" : "只能在妙讯管家会话中讨论原任务。");
    }
    if (contribution) await assertAgentProductEntitlement({ userId, agent, queryFn: connection.query.bind(connection) });
    if (expectedVersion !== null && expectedVersion !== agent.version) {
      throw fail(409, "AI_AGENT_VERSION_CHANGED", "妙讯管家已更新，请重新发起讨论。");
    }
    return { agent, user, thread };
  }
  const assertCurrent = (workspace, selector) => {
    if (workspace.current_round !== selector.currentRound || workspace.revision !== selector.revision) throw stale();
  };
  async function findInput(connection, userId, clientMessageId) {
    const [row] = await connection.query("SELECT * FROM chat_messages WHERE user_id = ? AND client_message_id = ? FOR UPDATE", [userId, clientMessageId]);
    return row;
  }
  function checkInput(row, { threadId, fingerprint }) {
    if (!row || row.thread_id !== threadId || row.sender_type !== "user") throw fail(409, "MESSAGE_REQUEST_CONFLICT", "Client message ID already belongs to a different request");
    assertMatchingMessageRetry(mapMessage(row), fingerprint);
    if (row.deleted_at || row.recalled_at) throw inputUnavailable();
    if (row.metadata?.workspaceDiscussion?.mode !== mode) throw fail(409, "MESSAGE_REQUEST_CONFLICT", "消息不属于原任务讨论。");
  }
  async function readReceipt(connection, row) {
    const [output] = await connection.query(`SELECT output.* FROM agent_runs run JOIN chat_messages output ON output.id = run.output_message_id
      WHERE run.input_message_id = ? AND run.user_id = ? AND run.thread_id = ? AND run.agent_id = ? AND run.run_type = 'chat'`,
    [row.id, row.user_id, row.thread_id, agentId]);
    return { message: mapMessage(row), output: output ? mapMessage(output) : null,
      failure: row.metadata.workspaceDiscussion.failure || null, reused: true };
  }
  async function completeFailure(connection, row, failure, senderName) {
    const prior = await readReceipt(connection, row);
    if (prior.output || prior.failure) return prior;
    const metadata = { ...row.metadata, workspaceDiscussion: { ...row.metadata.workspaceDiscussion, state: "failed", failure } };
    const [updated] = await connection.query("UPDATE chat_messages SET metadata = ?::jsonb WHERE id = ? RETURNING *", [JSON.stringify(metadata), row.id]);
    const completed = await completeMessage({ connection, userId: row.user_id, threadId: row.thread_id,
      inputMessageId: row.id, agentId, senderName, content: failure.message, status: "error", provider: "runtime-error",
      latencyMs: Math.max(0, now() - new Date(row.created_at).getTime()), errorMessage: failure.code,
      metadata: { workspaceContext: row.metadata.workspaceContext, workspaceDiscussion: { mode, agentVersion: row.metadata.workspaceDiscussion.agentVersion }, errorCode: failure.code },
    });
    return { message: mapMessage(updated), output: completed.outputMessage, failure, reused: true };
  }
  async function replay(connection, row, senderName) {
    const receipt = await readReceipt(connection, row);
    if (receipt.output || receipt.failure) return receipt;
    if (now() - new Date(row.created_at).getTime() >= processingTimeoutMs) {
      return completeFailure(connection, row, safeFailure(fail(409, "WORKSPACE_DISCUSSION_INTERRUPTED",
        "原讨论请求的结果未知，已停止恢复；不会重复调用模型。请核对原任务后另发一条讨论。")), senderName);
    }
    return { ...receipt, failure: safeFailure(fail(409, "WORKSPACE_DISCUSSION_PENDING", "原讨论消息仍在处理中，请稍后核对同一请求。")) };
  }
  async function readHistory(connection, userId, threadId, selector, agentVersion) {
    const rows = await connection.query(`SELECT input.id AS input_id,input.sender_type AS input_type,input.content AS input_content,input.metadata AS input_metadata,
      output.id AS output_id,output.sender_type AS output_type,output.content AS output_content,output.metadata AS output_metadata
      FROM agent_runs run JOIN chat_messages input ON input.id = run.input_message_id JOIN chat_messages output ON output.id = run.output_message_id
      WHERE run.user_id = ? AND run.thread_id = ? AND run.agent_id = ? AND run.run_type = 'chat' AND run.status = 'success'
        AND input.user_id = ? AND output.user_id = ? AND input.thread_id = ? AND output.thread_id = ?
        AND input.deleted_at IS NULL AND input.recalled_at IS NULL AND output.deleted_at IS NULL AND output.recalled_at IS NULL
        AND input.metadata->'workspaceDiscussion'->>'mode' = ? AND output.metadata->'workspaceDiscussion'->>'mode' = ?
        AND input.metadata->'workspaceDiscussion'->>'agentVersion' = ? AND output.metadata->'workspaceDiscussion'->>'agentVersion' = ?
        AND input.metadata->'workspaceContext'->>'id' = ? AND output.metadata->'workspaceContext'->>'id' = ?
        AND input.metadata->'workspaceContext'->>'currentRound' = ? AND output.metadata->'workspaceContext'->>'currentRound' = ?
      ${contribution ? `AND input.metadata->'workspaceContext'->>'nodeId' = ? AND output.metadata->'workspaceContext'->>'nodeId' = ?
        AND input.metadata->'workspaceContext'->>'revision' = ? AND output.metadata->'workspaceContext'->>'revision' = ?` : ""}
      ORDER BY input.created_at DESC,input.id DESC LIMIT 6 FOR SHARE OF input,output`,
    [userId, threadId, agentId, userId, userId, threadId, threadId, mode, mode, agentVersion, agentVersion, selector.id, selector.id, String(selector.currentRound), String(selector.currentRound),
      ...(contribution ? [selector.nodeId, selector.nodeId, String(selector.revision), String(selector.revision)] : [])]);
    return rows.reverse().flatMap(row => [
      { id: row.input_id, sender_type: row.input_type, content: row.input_content, metadata: row.input_metadata },
      { id: row.output_id, sender_type: row.output_type, content: row.output_content, metadata: row.output_metadata },
    ]);
  }
  async function validateHistory(connection, admission) {
    await validateDiscussionHistory(connection, { userId: admission.userId, threadId: admission.threadId,
      history: admission.row.metadata.workspaceDiscussion.history, transitive: contribution });
  }
  async function assertFileSources(connection, workspace) {
    const unavailable = await unavailableWorkspaceFileSources(connection, workspace.user_id,
      (workspace.context_refs || []).filter(ref => ref.kind === 'station-file'), { lock: true });
    if (unavailable.size) throw fail(409, 'WORKSPACE_FILE_SOURCE_UNAVAILABLE',
      '引用文件已删除、变化或授权不可用，不能继续讨论原成果，请重新选择文件创建任务。');
  }
  async function metadataContext(connection, workspace, selector, language) {
    const nodes = await connection.query("SELECT agent_id,capability,status FROM agent_workspace_nodes WHERE workspace_id = ? AND round_number = ? ORDER BY created_at,id", [workspace.id, selector.currentRound]);
    const participants = [];
    for (const node of nodes) {
      const registered = await loadAgent(node.agent_id);
      participants.push({ name: registered?.name || "不可用的 Agent", capability: node.capability, status: node.status });
    }
    return { workspace: { goal: workspace.goal, currentRound: workspace.current_round, revision: workspace.revision,
      status: workspace.status, summary: workspace.summary, participants,
      result: workspace.result_kind ? { kind: workspace.result_kind, title: workspace.result_title } : null },
    language: language === "en" ? "en" : "zh-CN", resultContentRead: false };
  }
  return async function discussWorkspace({ userId, threadId, body: inputBody }) {
    const body = messageSchema.parse(inputBody);
    if (!body.workspaceContext) throw fail(400, "WORKSPACE_DISCUSSION_CONTEXT_INVALID", "任务讨论必须明确关联原任务。");
    const selector = body.workspaceContext;
    if (Boolean(selector.nodeId) !== contribution) throw fail(400, "WORKSPACE_DISCUSSION_CONTEXT_INVALID", "请从选中的协作成果发起讨论。");
    const fingerprint = messageRequestFingerprint(body);
    let admission;
    try {
      admission = await transaction(async connection => {
        const workspace = await lockWorkspace(connection, userId, selector);
        const currentAccess = await access(connection, userId, threadId);
        const existing = await findInput(connection, userId, body.clientMessageId);
        if (existing) {
          checkInput(existing, { threadId, fingerprint });
          if (contribution) await selectedContext(connection, workspace, selector, existing.metadata.workspaceDiscussion.sourceHash);
          return { replay: await replay(connection, existing, currentAccess.thread.title) };
        }
        assertCurrent(workspace, selector);
        const selected = contribution ? await selectedContext(connection, workspace, selector) : null;
        if (!contribution) await assertFileSources(connection, workspace);
        // A registry upgrade starts an isolated discussion history. Accepted
        // old receipts still replay, but old-mode context is not silently reused.
        const history = await readHistory(connection, userId, threadId, selector, currentAccess.agent.version);
        if (contribution) await validateDiscussionHistory(connection, { userId, threadId,
          history: history.map(row => ({ id: row.id, hash: historyHash(row) })), transitive: true });
        const metadata = { source: "app", requestFingerprint: fingerprint,
          workspaceContext: { ...selector, goal: workspace.goal },
          workspaceDiscussion: { mode, agentVersion: currentAccess.agent.version, state: "admitted",
            ...(contribution ? { sourceHash: sourceHash(selected) } : {}),
            history: history.map(row => ({ id: row.id, hash: historyHash(row) })) } };
        const [row] = await connection.query(`INSERT INTO chat_messages (id,user_id,thread_id,sender_type,sender_name,content,metadata,client_message_id)
          VALUES (?,?,?,'user',?,?,?::jsonb,?) RETURNING *`,
        [crypto.randomUUID(), userId, threadId, currentAccess.user.display_name, body.content, JSON.stringify(metadata), body.clientMessageId]);
        await connection.query("UPDATE chat_threads SET updated_at = CURRENT_TIMESTAMP WHERE id = ?", [threadId]);
        return { userId, threadId, selector, fingerprint, row, agentVersion: currentAccess.agent.version, senderName: currentAccess.thread.title,
          messages: history.map(item => ({ senderType: item.sender_type,
            content: contribution && item.sender_type === "agent" ? item.metadata.workspaceContributionDiscussion?.reply : item.content })),
          workspaceDiscussion: contribution ? { ...selected, language: body.clientContext?.language === "en" ? "en" : "zh-CN" }
            : await metadataContext(connection, workspace, selector, body.clientContext?.language) };
      });
    } catch (error) {
      if (error?.code === "23505") throw fail(409, "MESSAGE_REQUEST_CONFLICT", "Client message ID already belongs to another message");
      throw error;
    }
    if (admission.replay) return deliver(admission.replay);
    let dispatched = false;
    try {
      const result = await runAgentRuntime({ agentId, mode: runtimeMode, input: body.content, user: null, thread: null,
        messages: admission.messages, appContext: { [contribution ? "contributionDiscussion" : "workspaceDiscussion"]: admission.workspaceDiscussion },
        beforeModelCall: async () => transaction(async connection => {
          const workspace = await lockWorkspace(connection, userId, selector);
          await access(connection, userId, threadId, admission.agentVersion);
          assertCurrent(workspace, selector);
          if (contribution) await selectedContext(connection, workspace, selector, admission.row.metadata.workspaceDiscussion.sourceHash);
          else await assertFileSources(connection, workspace);
          await validateHistory(connection, admission);
          const row = await findInput(connection, userId, body.clientMessageId);
          checkInput(row, admission);
          if (dispatched || row.metadata.workspaceDiscussion.state !== "admitted") throw fail(409, "WORKSPACE_DISCUSSION_INTERRUPTED", "原讨论请求已受理，不会重复调用模型。");
          await connection.query("UPDATE chat_messages SET metadata = jsonb_set(metadata,'{workspaceDiscussion,state}','\"dispatched\"'::jsonb) WHERE id = ?", [row.id]);
          dispatched = true;
        }),
      });
      if (!dispatched) throw fail(502, "WORKSPACE_DISCUSSION_RESPONSE_INVALID", "讨论执行没有经过权限复验。");
      const content = assertDiscussionReply(result.reply);
      const outcome = await transaction(async connection => {
        const workspace = await lockWorkspace(connection, userId, selector);
        await access(connection, userId, threadId, admission.agentVersion);
        // Recovery may already have committed a failure. It wins over a late
        // provider response; do not replace that original receipt.
        const row = await findInput(connection, userId, body.clientMessageId);
        checkInput(row, admission);
        const prior = await readReceipt(connection, row);
        if (prior.output || prior.failure) return prior;
        assertCurrent(workspace, selector);
        if (contribution) await selectedContext(connection, workspace, selector, admission.row.metadata.workspaceDiscussion.sourceHash);
        else await assertFileSources(connection, workspace);
        await validateHistory(connection, admission);
        const completed = await completeMessage({ connection, userId, threadId, inputMessageId: row.id, agentId,
          senderName: admission.senderName, content: contribution ? "协作讨论已回复" : content, status: "success", provider: result.provider, latencyMs: result.latencyMs,
          tokenUsage: result.tokenUsage, metadata: { workspaceContext: row.metadata.workspaceContext,
            ...(contribution ? { workspaceContributionDiscussion: { reply: content, sourceHash: admission.row.metadata.workspaceDiscussion.sourceHash } } : {}),
            workspaceDiscussion: { mode, agentVersion: admission.agentVersion }, provider: result.provider, tokenUsage: result.tokenUsage } });
        const [updated] = await connection.query("UPDATE chat_messages SET metadata = jsonb_set(metadata,'{workspaceDiscussion,state}','\"completed\"'::jsonb) WHERE id = ? RETURNING *", [row.id]);
        return { message: mapMessage(updated), output: completed.outputMessage, reused: false };
      });
      return deliver(outcome);
    } catch (error) {
      let failure = safeFailure(error);
      // Persist only a fixed failure explanation, never the rejected model
      // text or provider error. This receipt cannot reopen a model call.
      const recorded = await transaction(async connection => {
        await lockWorkspace(connection, userId, selector);
        const row = await findInput(connection, userId, body.clientMessageId);
        if (!row || row.deleted_at || row.recalled_at) return;
        checkInput(row, admission);
        return completeFailure(connection, row, failure, admission.senderName);
      });
      if (recorded?.failure) failure = recorded.failure;
      throw new HttpError(failure.status, failure.message, { code: failure.code,
        messageId: admission.row.id, workspaceContext: admission.row.metadata.workspaceContext });
    }
  };
}

export const discussWorkspace = createWorkspaceDiscussionService();
