import { z } from "zod";
import { HttpError } from "./http-error.js";

const decisionSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("reply"), reply: z.string().trim().min(1).max(4000) }).strict(),
  z.object({ type: z.literal("clarify"), question: z.string().trim().min(1).max(2000) }).strict(),
  z.object({ type: z.literal("workspace"), capability: z.string().min(1).max(120) }).strict(),
]);

// A classifier selects one executor of this conversation's authenticated Agent.
// It never supplies an identity, a rewritten goal, references or permissions.
export function validateSpecialistDispatch(reply, { agentId, capabilities }) {
  let decision;
  try { decision = decisionSchema.parse(typeof reply === "string" ? JSON.parse(reply) : reply); }
  catch { throw new HttpError(502, "Agent 未返回有效答复，本次未创建任务。", { code: "SPECIALIST_DISPATCH_INVALID" }); }
  if (decision.type === "workspace" && !capabilities.some(entry => entry.agentId === agentId && entry.capability === decision.capability)) {
    throw new HttpError(502, "Agent 选择了当前会话不可执行的能力，本次未创建任务。", { code: "SPECIALIST_DISPATCH_INVALID" });
  }
  return decision;
}

export function specialistRequestSource(body) {
  const currentPage = body.clientContext?.currentPage || "messages.agent";
  if (currentPage.length > 80) throw new HttpError(400, "请求来源过长，请重新打开会话后发送。", { code: "SPECIALIST_SOURCE_INVALID" });
  return { currentPage };
}
