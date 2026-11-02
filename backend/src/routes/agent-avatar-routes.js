import express from "express";
import { agentAvatarAssetService, agentAvatarMaxBytes } from "../agent-avatar-assets.js";
import { hasAdminPermission } from "../auth.js";
import { HttpError } from "../http-error.js";
import { createRateLimitMiddleware } from "../rate-limit-service.js";

const uploadLimit = createRateLimitMiddleware({ action: "admin.agent.avatar.upload", limit: 30, windowMs: 3600000, message: "头像上传过于频繁，请稍后重试" });
const anyPermission = (...permissions) => (req, _res, next) => {
  if (!permissions.some((permission) => hasAdminPermission(req.user, permission))) return next(new HttpError(403, "Admin permission required"));
  next();
};

export function registerAgentAvatarRoutes(app, { authenticate, asyncHandler, service = agentAvatarAssetService } = {}) {
  app.post("/api/admin/agent-avatar-assets", authenticate, anyPermission("agents:manage", "products:write"), uploadLimit,
    express.raw({ type: () => true, limit: agentAvatarMaxBytes, inflate: false }), asyncHandler(async (req, res) => {
      const result = await service.upload({ bytes: req.body, mimeType: String(req.get("Content-Type") || "").split(";")[0].trim().toLowerCase(), actorUserId: req.user.id, requestId: req.get("Idempotency-Key") });
      res.status(result.replayed ? 200 : 201).json({ data: result.asset });
    }));
  const send = (publishedOnly) => asyncHandler(async (req, res) => {
    const { asset, bytes } = await service.read(req.params.id, req.params.hash, { publishedOnly });
    res.set("Content-Type", asset.mimeType);
    res.set("Cache-Control", publishedOnly ? "public, max-age=300, must-revalidate" : "private, no-store");
    res.set("X-Content-Type-Options", "nosniff");
    if (!publishedOnly) res.vary("Authorization");
    res.set("ETag", `"${asset.sha256}"`);
    res.send(bytes);
  });
  app.get("/api/admin/agent-avatar-assets/:id/:hash.webp", authenticate, anyPermission("agents:manage", "products:read", "products:write"), send(false));
  app.get("/api/agent-avatar-assets/:id/:hash.webp", send(true));
}
