import { agentPublishingService } from "../agent-publishing-service.js";
import { agentIdentitySchema } from "../schemas.js";
import { HttpError } from "../http-error.js";
import { adminPageSchema } from "../schemas.js";
import { listAgentReleases } from "../agent-release-repository.js";
import { listAdminPage } from "../admin-list-repository.js";

export function registerAdminReleaseRoutes(app, { authenticate, asyncHandler, requireAdmin, service = agentPublishingService, listPage = listAdminPage } = {}) {
  app.get("/api/admin/agent-releases", authenticate, requireAdmin("agents:manage"), asyncHandler(async (req, res) => {
    await service.syncRegistry();
    const page = await listPage("releases", adminPageSchema.parse(req.query));
    res.json({ data: Object.prototype.hasOwnProperty.call(req.query, "page") || Object.prototype.hasOwnProperty.call(req.query, "pageSize") ? page : await listAgentReleases() });
  }));

  app.post("/api/admin/agent-releases/:id/review", authenticate, requireAdmin("agents:manage"), asyncHandler(async (req, res) => {
    res.json({ data: await service.reviewRelease({ releaseId: req.params.id, actorUserId: req.user.id, requestId: req.get("Idempotency-Key") || null }) });
  }));

  app.patch("/api/admin/agent-releases/:id/identity", authenticate, requireAdmin("agents:manage"), asyncHandler(async (req, res) => {
    const identity = agentIdentitySchema.parse(req.body);
    const requestId = req.get("Idempotency-Key") || null;
    if (!requestId) throw new HttpError(400, "Idempotency-Key is required for Agent identity changes", { code: "IDEMPOTENCY_KEY_REQUIRED" });
    res.json({ data: await service.setIdentity({ releaseId: req.params.id, identity, actorUserId: req.user.id, requestId }) });
  }));

  app.post("/api/admin/agent-releases/:id/publish", authenticate, requireAdmin("agents:manage"), asyncHandler(async (req, res) => {
    res.json({ data: await service.publishRelease({ releaseId: req.params.id, actorUserId: req.user.id, requestId: req.get("Idempotency-Key") || null }) });
  }));
}
