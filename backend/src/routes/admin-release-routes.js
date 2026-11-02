import { agentPublishingService } from "../agent-publishing-service.js";
import { agentIdentitySchema, createAgentReleaseSchema } from "../schemas.js";
import { HttpError } from "../http-error.js";
import { adminPageSchema } from "../schemas.js";
import { getAgentRelease, listAgentReleases } from "../agent-release-repository.js";
import { listAdminPage } from "../admin-list-repository.js";
import { query } from "../db.js";
import { hasAdminPermission } from "../auth.js";
import { z } from "zod";

const releaseIdSchema = z.string().uuid();

export function registerAdminReleaseRoutes(app, { authenticate, asyncHandler, requireAdmin, service = agentPublishingService, listPage = listAdminPage, readRelease = getAgentRelease, runQuery = query } = {}) {
  app.get("/api/admin/agent-registry", authenticate, requireAdmin("agents:manage"), asyncHandler(async (_req, res) => {
    res.json({ data: await service.listRegistry() });
  }));

  app.post("/api/admin/agent-releases", authenticate, requireAdmin("agents:manage"), asyncHandler(async (req, res) => {
    const body = createAgentReleaseSchema.parse(req.body);
    const requestId = z.string().trim().min(8).max(160).parse(req.get("Idempotency-Key"));
    const result = await service.createRelease({ ...body, actorUserId: req.user.id, requestId });
    res.status(result.created ? 201 : 200).json({ data: result.release });
  }));

  app.get("/api/admin/agent-releases", authenticate, requireAdmin("agents:manage"), asyncHandler(async (req, res) => {
    const page = await listPage("releases", adminPageSchema.parse(req.query));
    res.json({ data: Object.prototype.hasOwnProperty.call(req.query, "page") || Object.prototype.hasOwnProperty.call(req.query, "pageSize") ? page : await listAgentReleases() });
  }));

  app.get("/api/admin/agent-releases/:id", authenticate, requireAdmin("agents:manage"), asyncHandler(async (req, res) => {
    const release = await readRelease(releaseIdSchema.parse(req.params.id));
    if (!release) throw new HttpError(404, "Agent release not found", { code: "RELEASE_NOT_FOUND" });
    const productsVisible = hasAdminPermission(req.user, "products:read");
    const [history, products] = await Promise.all([
      runQuery(`SELECT h.id, h.from_status, h.to_status, h.reason, h.request_id, h.created_at, u.email AS actor_email
        FROM agent_release_status_history h LEFT JOIN users u ON u.id = h.actor_user_id
        WHERE h.release_id = ? ORDER BY h.created_at ASC, h.id ASC`, [release.id]),
      productsVisible ? runQuery(`SELECT DISTINCT p.id, p.product_key, p.display_name, pv.version, pv.status
        FROM product_agent_dependencies d JOIN product_versions pv ON pv.id = d.product_version_id
        JOIN products p ON p.id = pv.product_id WHERE d.agent_release_id = ? ORDER BY p.product_key, pv.version`, [release.id]) : [],
    ]);
    res.json({ data: { release, history: history.map((row) => ({ id: row.id, fromStatus: row.from_status, toStatus: row.to_status, reason: row.reason || null, requestId: row.request_id || null, actorEmail: row.actor_email || null, createdAt: row.created_at })),
      productsVisible, products: products.map((row) => ({ id: row.id, productKey: row.product_key, displayName: row.display_name, version: row.version, status: row.status })) } });
  }));

  app.post("/api/admin/agent-releases/:id/review", authenticate, requireAdmin("agents:manage"), asyncHandler(async (req, res) => {
    res.json({ data: await service.reviewRelease({ releaseId: releaseIdSchema.parse(req.params.id), actorUserId: req.user.id, requestId: req.get("Idempotency-Key") || null }) });
  }));

  app.patch("/api/admin/agent-releases/:id/identity", authenticate, requireAdmin("agents:manage"), asyncHandler(async (req, res) => {
    const identity = agentIdentitySchema.parse(req.body);
    const requestId = req.get("Idempotency-Key") || null;
    if (!requestId) throw new HttpError(400, "Idempotency-Key is required for Agent identity changes", { code: "IDEMPOTENCY_KEY_REQUIRED" });
    res.json({ data: await service.setIdentity({ releaseId: releaseIdSchema.parse(req.params.id), identity, actorUserId: req.user.id, requestId }) });
  }));

  app.post("/api/admin/agent-releases/:id/withdraw", authenticate, requireAdmin("agents:manage"), asyncHandler(async (req, res) => {
    res.json({ data: await service.withdrawRelease({ releaseId: releaseIdSchema.parse(req.params.id), actorUserId: req.user.id, requestId: req.get("Idempotency-Key") || null }) });
  }));

  app.post("/api/admin/agent-releases/:id/publish", authenticate, requireAdmin("agents:manage"), asyncHandler(async (req, res) => {
    res.json({ data: await service.publishRelease({ releaseId: releaseIdSchema.parse(req.params.id), actorUserId: req.user.id, requestId: req.get("Idempotency-Key") || null }) });
  }));
}
