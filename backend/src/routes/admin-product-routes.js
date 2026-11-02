import { agentPublishingService } from "../agent-publishing-service.js";
import { productCatalogRepository } from "../product-catalog-repository.js";
import { productVersionSchema } from "../schemas.js";
import { HttpError } from "../http-error.js";
import { adminPageSchema } from "../schemas.js";
import { listAdminPage } from "../admin-list-repository.js";
import { query } from "../db.js";

export function registerAdminProductRoutes(app, { authenticate, asyncHandler, requireAdmin, service = agentPublishingService, repository = productCatalogRepository, listPage = listAdminPage, readQuery = query } = {}) {
  app.get("/api/admin/products", authenticate, requireAdmin("products:read"), asyncHandler(async (req, res) => {
    const page = await listPage("products", adminPageSchema.parse(req.query));
    res.json({ data: Object.prototype.hasOwnProperty.call(req.query, "page") || Object.prototype.hasOwnProperty.call(req.query, "pageSize") ? page : await repository.listProducts() });
  }));

  app.get("/api/admin/products/:id", authenticate, requireAdmin("products:read"), asyncHandler(async (req, res) => {
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(req.params.id)) {
      throw new HttpError(400, "Invalid product ID", { code: "PRODUCT_ID_INVALID" });
    }
    const product = await repository.getProduct(req.params.id);
    if (!product) throw new HttpError(404, "Product not found", { code: "PRODUCT_NOT_FOUND" });
    const [history, entitlementRows] = await Promise.all([
      readQuery(`SELECT h.id, h.from_status, h.to_status, h.reason, h.request_id, h.created_at, u.email AS actor_email
        FROM product_status_history h LEFT JOIN users u ON u.id = h.actor_user_id
        WHERE h.product_id = ? ORDER BY h.created_at ASC, h.id ASC`, [product.id]),
      readQuery(`SELECT status, COUNT(*) AS count FROM user_entitlements WHERE product_id = ? GROUP BY status ORDER BY status`, [product.id]),
    ]);
    res.json({ data: { product, history: history.map((row) => ({ id: row.id, fromStatus: row.from_status, toStatus: row.to_status, reason: row.reason || null, requestId: row.request_id || null, actorEmail: row.actor_email || null, createdAt: row.created_at })), entitlementSummary: entitlementRows.map((row) => ({ status: row.status, count: Number(row.count || 0) })) } });
  }));

  app.post("/api/admin/products", authenticate, requireAdmin("products:write"), asyncHandler(async (req, res) => {
    const body = productVersionSchema.parse(req.body);
    if (body.status !== "draft") throw new HttpError(422, "New product versions must start as draft", { code: "PRODUCT_INITIAL_STATUS_INVALID" });
    res.status(201).json({ data: await service.createProduct({ ...body, createdBy: req.user.id }) });
  }));

  app.post("/api/admin/products/:id/submit", authenticate, requireAdmin("products:write"), asyncHandler(async (req, res) => {
    res.json({ data: await service.submitProduct({ productId: req.params.id, actorUserId: req.user.id, requestId: req.get("Idempotency-Key") || null }) });
  }));

  app.post("/api/admin/products/:id/publish", authenticate, requireAdmin("products:write"), asyncHandler(async (req, res) => {
    res.json({ data: await service.publishProduct({ productId: req.params.id, actorUserId: req.user.id, requestId: req.get("Idempotency-Key") || null }) });
  }));

  app.post("/api/admin/products/:id/pause", authenticate, requireAdmin("products:write"), asyncHandler(async (req, res) => {
    res.json({ data: await service.pauseProduct({ productId: req.params.id, actorUserId: req.user.id, requestId: req.get("Idempotency-Key") || null }) });
  }));
}
