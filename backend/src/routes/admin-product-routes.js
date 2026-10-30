import { agentPublishingService } from "../agent-publishing-service.js";
import { productCatalogRepository } from "../product-catalog-repository.js";
import { productVersionSchema } from "../schemas.js";
import { HttpError } from "../http-error.js";
import { adminPageSchema } from "../schemas.js";
import { listAdminPage } from "../admin-list-repository.js";

export function registerAdminProductRoutes(app, { authenticate, asyncHandler, requireAdmin, service = agentPublishingService, repository = productCatalogRepository, listPage = listAdminPage } = {}) {
  app.get("/api/admin/products", authenticate, requireAdmin("products:read"), asyncHandler(async (req, res) => {
    const page = await listPage("products", adminPageSchema.parse(req.query));
    res.json({ data: Object.prototype.hasOwnProperty.call(req.query, "page") || Object.prototype.hasOwnProperty.call(req.query, "pageSize") ? page : await repository.listProducts() });
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
