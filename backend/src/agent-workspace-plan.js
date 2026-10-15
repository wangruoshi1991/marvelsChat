import { z } from "zod";
import { HttpError } from "./http-error.js";
import { workspaceAccessDecisionSchema } from "./agent-workspace-input-request.js";

const key = z.string().regex(/^[a-z][a-z0-9_-]{0,79}$/).refine(value => !value.startsWith("coordinate-"));
const text = z.string().trim().min(1).max(2000);
export const workspaceDecisionSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("plan"), summary: text, steps: z.array(z.object({
    key, agentId: z.string().min(1).max(120), capability: z.string().min(1).max(120), goal: text,
    dependsOn: z.array(key).max(20), contextRefIndexes: z.array(z.number().int().min(0).max(5)).max(6),
  }).strict()).min(1).max(20) }).strict(),
  z.object({ type: z.literal("complete"), summary: text, resultKey: key }).strict(),
  z.object({ type: z.literal("clarify"), question: text }).strict(),
  z.object({ type: z.literal("request_access"), summary: text, capabilities: z.array(z.object({
    agentId: z.string().min(1).max(120), capability: z.string().min(1).max(120),
  }).strict()).min(1).max(20) }).strict(),
]);
const invalid = message => { throw new HttpError(502, message, { code: "WORKSPACE_PLAN_INVALID" }); };

// Decisions select registered capabilities and existing identities. No words in
// a goal imply a route, permission, fabricated result, or executable code.
export function validateWorkspaceDecision(reply, { workspace, catalogue, unavailableCapabilities = [] }) {
  let decision;
  try { decision = workspaceDecisionSchema.parse(typeof reply === "string" ? JSON.parse(reply) : reply); }
  catch { invalid("协调 Agent 返回了无效计划，未执行后续操作。"); }
  const existing = new Map(workspace.nodes.map(node => [node.key, node]));
  if (decision.type === "clarify") return decision;
  if (decision.type === "request_access") {
    const requirements = decision.capabilities.map(selected => {
      const match = unavailableCapabilities.find(item => item.agentId === selected.agentId && item.capability === selected.capability);
      if (!match || catalogue.some(item => item.agentId === selected.agentId && item.capability === selected.capability)) {
        invalid("协调 Agent 请求了不存在或当前已可执行的授权能力。");
      }
      const { agentId, agentName, capability, requiredScopes, reason } = match;
      return { agentId, agentName, capability, requiredScopes, reason };
    });
    const checked = workspaceAccessDecisionSchema.safeParse({ type: decision.type, summary: decision.summary, requirements });
    if (!checked.success) invalid("协调 Agent 返回了重复或无效的授权请求。");
    return checked.data;
  }
  if (decision.type === "complete") {
    const result = existing.get(decision.resultKey);
    if (!result || result.status !== "succeeded" || !result.result?.artifact || result.capability === "workspace.coordinate") {
      invalid("协调 Agent 没有选择已实际完成的成果。");
    }
    return decision;
  }
  const planned = new Map(decision.steps.map(node => [node.key, node]));
  if (planned.size !== decision.steps.length || decision.steps.some(node => existing.has(node.key))) invalid("计划节点名称重复。");
  const capability = node => catalogue.find(item => item.agentId === node.agentId && item.capability === node.capability);
  for (const node of decision.steps) {
    const declared = capability(node);
    if (!declared) invalid("计划使用了未注册或未授权的专业能力。");
    if (new Set(node.dependsOn).size !== node.dependsOn.length || new Set(node.contextRefIndexes).size !== node.contextRefIndexes.length) invalid("计划引用重复。");
    for (const index of node.contextRefIndexes) {
      if (!declared.inputKinds.includes(workspace.contextRefs[index]?.kind)) invalid("计划引用超出该 Agent 的能力范围。");
    }
    for (const dependency of node.dependsOn) {
      const prior = existing.get(dependency);
      const next = planned.get(dependency);
      const kind = prior?.status === "succeeded" ? prior.result?.artifact?.kind : next ? capability(next)?.outputKind : null;
      if (dependency === node.key || !kind || !declared.dependencyKinds.includes(kind)) invalid("计划依赖不存在、尚未成功或成果类型不匹配。");
    }
  }
  const visiting = new Set();
  const visited = new Set();
  const visit = name => {
    if (visiting.has(name)) invalid("协作计划包含循环依赖。");
    if (visited.has(name) || !planned.has(name)) return;
    visiting.add(name);
    planned.get(name).dependsOn.forEach(visit);
    visiting.delete(name); visited.add(name);
  };
  planned.forEach((_node, name) => visit(name));
  return { ...decision, nodes: decision.steps.map(node => ({
    key: node.key, agentId: node.agentId, agentVersion: capability(node).agentVersion,
    capability: node.capability, goal: node.goal, dependencies: node.dependsOn, contextRefIndexes: node.contextRefIndexes,
  })) };
}
