import { z } from "zod";
import { HttpError } from "../http-error.js";
import { getAITask, listAITasks, listAITaskEvents, mutateAITask } from "../ai-task-repository.js";
import { confirmSiteTask } from "../ai-site-task-service.js";
import { createRateLimitMiddleware } from "../rate-limit-service.js";
import { requireAIClientContract, requireSiteDocumentContract } from "../ai-client-contract.js";

const paramsSchema = z.object({ taskId: z.string().uuid() });
const listSchema = z.object({
  threadId: z.string().uuid().optional(),
  kind: z.enum(["agent_message", "site_draft"]).optional(),
  limit: z.coerce.number().int().min(1).max(50).default(30),
}).strict();
const eventsSchema = z.object({
  afterSequence: z.coerce.number().int().min(0).default(0),
  limit: z.coerce.number().int().min(1).max(100).default(50),
}).strict();
export const aiTaskDecisionSchema = z.object({
  revision: z.number().int().min(1),
  operation: z.enum(["cancel", "confirm", "reject"]),
  approvalId: z.string().uuid().optional(),
}).strict().refine(value => value.operation !== "confirm" || Boolean(value.approvalId), "Confirmation requires an approval ID");
const decisionLimit = createRateLimitMiddleware({ action: "ai_task.decision", limit: 60, windowMs: 60000, message: "任务操作过于频繁，请稍后重试。" });

export function registerAITaskRoutes(app, { authenticate, asyncHandler }) {
  app.get("/api/tasks", authenticate, requireAIClientContract, asyncHandler(async (req, res) => {
    res.json({ data: await listAITasks({ userId: req.user.id, ...listSchema.parse(req.query) }) });
  }));
  app.get("/api/tasks/:taskId", authenticate, requireAIClientContract, asyncHandler(async (req, res) => {
    const task = await getAITask({ userId: req.user.id, ...paramsSchema.parse(req.params) });
    if (!task) throw new HttpError(404, "AI task not found");
    res.json({ data: task });
  }));
  app.get("/api/tasks/:taskId/events", authenticate, requireAIClientContract, asyncHandler(async (req, res) => {
    res.json({ data: await listAITaskEvents({ userId: req.user.id, ...paramsSchema.parse(req.params), ...eventsSchema.parse(req.query) }) });
  }));
  app.post("/api/tasks/:taskId/decision", authenticate, requireAIClientContract, decisionLimit, asyncHandler(async (req, res) => {
    const { taskId } = paramsSchema.parse(req.params);
    const body = aiTaskDecisionSchema.parse(req.body);
    // Confirmation currently applies a site document. Validate even for an
    // idempotent replay, which can bypass the mutation callback below.
    if (body.operation === "confirm") requireSiteDocumentContract(req);
    const task = await mutateAITask({ userId: req.user.id, taskId, revision: body.revision, operation: body.operation, approvalId: body.approvalId,
      mutate: body.operation === "confirm" ? async (connection, record) => {
        if (record.kind !== "site_draft") throw new HttpError(409, "此任务没有可确认的操作。");
        return confirmSiteTask(connection, record, { approvalId: body.approvalId, userId: req.user.id });
      } : undefined,
    });
    res.json({ data: task });
  }));
}
