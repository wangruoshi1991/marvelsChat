import { z } from "zod";

const identifier = z.string().min(1).max(120);
const reason = z.enum(["authorization_required", "new_task_required"]);
export const workspaceAccessRequirementSchema = z.object({
  agentId: identifier, agentName: z.string().min(1).max(160), capability: identifier,
  requiredScopes: z.array(identifier).min(1).max(40), reason,
}).strict();
export const workspaceAccessDecisionSchema = z.object({
  type: z.literal("request_access"), summary: z.string().min(1).max(2000),
  requirements: z.array(workspaceAccessRequirementSchema).min(1).max(20),
}).strict().superRefine((value, context) => {
  const keys = value.requirements.map(item => `${item.agentId}/${item.capability}`);
  if (new Set(keys).size !== keys.length || value.requirements.some(item => new Set(item.requiredScopes).size !== item.requiredScopes.length)) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: "Duplicate access requirement" });
  }
});

// Requirements come from the server catalogue. Model prose is never parsed as
// a permission request, nor may model output provide scopes or recovery actions.
export function workspaceAccessInputRequest(rawDecision) {
  const { requirements } = workspaceAccessDecisionSchema.parse(rawDecision);
  const requiresAuthorization = requirements.some(item => item.reason === "authorization_required");
  const names = [...new Set(requirements.filter(item => item.reason === "authorization_required").map(item => item.agentName))].join("、");
  return {
    kind: "agent_access",
    question: requiresAuthorization
      ? `请前往“我 → 我的 Agent”确认${names}的授权范围，再新建任务。当前任务不会扩大权限。`
      : "所需能力已授权，请新建任务以使用这些能力。当前任务不会扩大权限。",
    reason: requiresAuthorization ? "authorization_required" : "new_task_required",
    requirements,
    nextAction: requiresAuthorization ? "manage_agents_then_restart" : "restart",
  };
}

export function workspaceInputRequest(row, nodes) {
  if (row.status !== "waiting_input") return null;
  const latest = [...nodes].reverse().find(node => node.capability === "workspace.coordinate" && node.status === "succeeded");
  const decision = latest?.result?.decision;
  if (decision?.type === "request_access") {
    const request = workspaceAccessInputRequest(decision);
    if (request.question !== row.question) throw new TypeError("Workspace access request does not match its stored question");
    return request;
  }
  if (decision?.type !== "clarify" || typeof decision.question !== "string" || decision.question !== row.question) {
    throw new TypeError("Workspace input request must match the latest coordinator decision");
  }
  return { kind: "clarification", question: z.string().min(1).max(2000).parse(decision.question) };
}
