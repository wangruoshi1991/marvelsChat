import { z } from "zod";
import { HttpError } from "./http-error.js";
import { listExecutableWorkspaceCapabilities, listUnavailableWorkspaceCapabilities } from "./agent-workspace-capabilities.js";

const capability = z.object({
  agentId: z.string().min(1).max(120), capability: z.string().min(1).max(120),
}).strict();
const decisionSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("reply"), reply: z.string().trim().min(1).max(4000) }).strict(),
  z.object({ type: z.literal("clarify"), question: z.string().trim().min(1).max(2000) }).strict(),
  z.object({ type: z.literal("ui_preference") }).strict(),
  z.object({ type: z.literal("workspace"),
    capabilities: z.array(capability).min(1).max(20) }).strict(),
]);

export async function resolveButlerRequestMessages({ userId, threadId, requestMessageIds, queryFn, lock = false }) {
  const checked = z.array(z.string().uuid()).min(1).safeParse(requestMessageIds);
  if (!checked.success || new Set(checked.data).size !== checked.data.length) {
    throw new HttpError(409, "原需求记录不可用，请重新提出需求。", { code: "BUTLER_CONTEXT_CHANGED" });
  }
  const rows = await queryFn(`SELECT id, content FROM chat_messages
    WHERE id = ANY(?::text[]) AND thread_id = ? AND user_id = ? AND sender_type = 'user'
    AND deleted_at IS NULL AND recalled_at IS NULL ORDER BY created_at, id${lock ? " FOR SHARE" : ""}`,
  [checked.data, threadId, userId]);
  if (rows.length !== checked.data.length || rows.some((row, index) => row.id !== checked.data[index] || typeof row.content !== "string" || !row.content.trim())) {
    throw new HttpError(409, "原需求已删除、撤回或变化，请重新提出需求。", { code: "BUTLER_CONTEXT_CHANGED" });
  }
  return rows;
}

// Only exact persisted user turns become a shared goal. Model replies, source
// descriptions and independent conversations never contribute to this text.
export function buildButlerWorkspaceGoal(requestMessages) {
  const checked = z.array(z.object({ id: z.string().uuid(), content: z.string().trim().min(1) })).min(1).safeParse(requestMessages);
  if (!checked.success) throw new HttpError(409, "原需求记录不可用，请重新提出需求。", { code: "BUTLER_CONTEXT_CHANGED" });
  const goal = checked.data.map(message => message.content).join("\n\n");
  if (goal.length > 2000) throw new HttpError(422, "这次需求和补充内容超过2000字，请重新整理为一条完整需求后发送。", { code: "BUTLER_GOAL_LIMIT" });
  return goal;
}

// Registry declarations must match an actual executor. Display labels, client
// enabledAgentIds and model-generated permissions never become authority.
export function buildButlerDispatchContext({ agentContext, agentAccess }) {
  const canCoordinate = agentAccess.grantedScopes.includes("agents:invoke");
  const grants = agentContext.ownedAgents.map(agent => ({
    agentId: agent.id, enabled: agent.enabled, grantedScopes: agent.grantedScopes,
  }));
  return {
    canCoordinate,
    availableCapabilities: canCoordinate ? listExecutableWorkspaceCapabilities({
      registeredAgents: agentContext.registeredAgents, grants,
    }) : [],
    unavailableCapabilities: canCoordinate ? listUnavailableWorkspaceCapabilities({
      registeredAgents: agentContext.registeredAgents, grants,
    }) : [],
  };
}

export function validateButlerDispatch(reply, context) {
  let decision;
  try { decision = decisionSchema.parse(typeof reply === "string" ? JSON.parse(reply) : reply); }
  catch { throw new HttpError(502, "妙管家没有返回有效答复，本次未创建协作任务。", { code: "BUTLER_DISPATCH_INVALID" }); }
  if (decision.type !== "workspace") return decision;
  if (!context.canCoordinate) {
    throw new HttpError(403, "本次对话不能创建协作任务。", { code: "BUTLER_DISPATCH_FORBIDDEN" });
  }
  const supported = [...context.availableCapabilities, ...context.unavailableCapabilities];
  const selected = new Set();
  for (const entry of decision.capabilities) {
    const key = `${entry.agentId}/${entry.capability}`;
    if (selected.has(key) || !supported.some(item => item.agentId === entry.agentId && item.capability === entry.capability)) {
      throw new HttpError(502, "妙管家选择了未接入或重复的能力，本次未创建协作任务。", { code: "BUTLER_DISPATCH_INVALID" });
    }
    selected.add(key);
  }
  return decision;
}
