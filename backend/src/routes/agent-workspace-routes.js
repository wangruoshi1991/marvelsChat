import { z } from "zod";
import { HttpError } from "../http-error.js";
import { getAgentWorkspace, listAgentWorkspaces } from "../agent-workspace-repository.js";
import { submitAgentWorkspace, decideAgentWorkspace, getWorkspaceMedia, getWorkspaceText, workspaceRequestSchema } from "../agent-workspace-service.js";
import { createRateLimitMiddleware } from "../rate-limit-service.js";
import { requireAIClientContract, requireAgentWorkspaceContract, requireSiteDocumentContract } from "../ai-client-contract.js";

const params = z.object({ workspaceId: z.string().uuid() }).strict();
const list = z.object({ limit: z.coerce.number().int().min(1).max(50).default(30) }).strict();
export const workspaceActionSchema = z.object({
  revision: z.number().int().positive(), operation: z.enum(["cancel", "confirm", "reject", "reply", "continue"]),
  approvalId: z.string().uuid().optional(), text: z.string().trim().min(1).max(2000).optional(),
  idempotencyKey: z.string().min(8).max(160).optional(),
}).strict().superRefine((value, context) => {
  if ((value.operation === "confirm") !== Boolean(value.approvalId)
      || (["reply", "continue"].includes(value.operation)) !== Boolean(value.text)
      || (value.operation === "continue") !== Boolean(value.idempotencyKey)) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: "Only confirm requires approvalId; reply and continue require text; only continue requires idempotencyKey" });
  }
});
const submitLimit = createRateLimitMiddleware({ action: "agent_workspace.submit", limit: 10, windowMs: 60000, message: "协作任务提交过于频繁，请稍后重试。" });
const decisionLimit = createRateLimitMiddleware({ action: "agent_workspace.decision", limit: 60, windowMs: 60000, message: "协作操作过于频繁，请稍后重试。" });

export function registerAgentWorkspaceRoutes(app, { authenticate, asyncHandler,
  service = { submitAgentWorkspace, decideAgentWorkspace, getWorkspaceMedia, getWorkspaceText },
  repository = { getAgentWorkspace, listAgentWorkspaces },
} = {}) {
  const guard = [authenticate, requireAIClientContract, requireAgentWorkspaceContract];
  app.get("/api/agent-workspaces", ...guard, asyncHandler(async (req, res) => {
    res.json({ data: await repository.listAgentWorkspaces({ userId: req.user.id, ...list.parse(req.query) }) });
  }));
  app.post("/api/agent-workspaces", ...guard, submitLimit, asyncHandler(async (req, res) => {
    res.status(202).json({ data: await service.submitAgentWorkspace({ user: req.user, ...workspaceRequestSchema.parse(req.body) }) });
  }));
  app.get("/api/agent-workspaces/:workspaceId", ...guard, asyncHandler(async (req, res) => {
    const data = await repository.getAgentWorkspace({ userId: req.user.id, ...params.parse(req.params) });
    if (!data) throw new HttpError(404, "协作任务不存在。", { code: "WORKSPACE_NOT_FOUND" });
    res.json({ data });
  }));
  app.get("/api/agent-workspaces/:workspaceId/media/:assetId", ...guard, asyncHandler(async (req, res) => {
    const ids = params.extend({ assetId: z.string().uuid() }).parse(req.params);
    res.json({ data: await service.getWorkspaceMedia({ userId: req.user.id, ...ids }) });
  }));
  app.get("/api/agent-workspaces/:workspaceId/text/:nodeId", ...guard, asyncHandler(async (req, res) => {
    const ids = params.extend({ nodeId: z.string().uuid() }).parse(req.params);
    res.json({ data: await service.getWorkspaceText({ userId: req.user.id, ...ids }) });
  }));
  app.post("/api/agent-workspaces/:workspaceId/decision", ...guard, decisionLimit, asyncHandler(async (req, res) => {
    const decision = workspaceActionSchema.parse(req.body);
    if (decision.operation === "confirm") requireSiteDocumentContract(req);
    res.json({ data: await service.decideAgentWorkspace({ userId: req.user.id, ...params.parse(req.params), ...decision }) });
  }));
}
