import { agentPublishingService } from "../agent-publishing-service.js";
import { productCatalogRepository } from "../product-catalog-repository.js";
import { HttpError } from "../http-error.js";
import { z } from "zod";

export function registerProductRoutes(app, { authenticate, asyncHandler, service = agentPublishingService, repository = productCatalogRepository } = {}) {
  app.get("/api/products", authenticate, asyncHandler(async (_req, res) => {
    const products = await repository.listProducts({ includeUnpublished: false });
    res.json({ data: products });
  }));

  app.post("/api/me/products/:productId/enable", authenticate, asyncHandler(async (req, res) => {
    const grantedScopes = Array.isArray(req.body?.grantedScopes) ? req.body.grantedScopes : [];
    if (!req.body || req.body.consent !== true) throw new HttpError(400, "Explicit product consent is required", { code: "PRODUCT_CONSENT_REQUIRED" });
    const entitlement = await service.enableProduct({ userId: req.user.id, productId: req.params.productId, productVersionId: req.body.productVersionId === undefined ? null : z.string().uuid().parse(req.body.productVersionId), grantedScopes, consentVersion: req.body.consentVersion || null, idempotencyKey: req.get("Idempotency-Key") || null });
    res.status(201).json({ data: entitlement });
  }));

  app.delete("/api/me/products/:productId/enable", authenticate, asyncHandler(async (req, res) => {
    const idempotencyKey = req.get("Idempotency-Key") || null;
    const entitlement = await service.disableProduct({
      userId: req.user.id,
      productId: req.params.productId,
      idempotencyKey,
    });
    res.json({ data: entitlement });
  }));
}
