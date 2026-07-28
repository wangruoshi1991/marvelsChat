import express from "express";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  createAvatarAppSession,
  isAvatarHttpsRequest,
  requireAvatarHttps,
} from "./avatar-3d-session.js";
import { config } from "./config.js";
import { HttpError } from "./http-error.js";
import { avatar3dModelParamsSchema } from "./schemas.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const defaultAvatar3dDistDir = path.resolve(__dirname, "../../avatar-web/dist");

const normalizeHttpsOrigin = (value) => {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && url.hostname ? url.origin : "";
  } catch {
    return "";
  }
};

const configuredUploadOrigin = () => {
  if (!config.oss.bucket || !config.oss.endpoint) return "";
  return normalizeHttpsOrigin(`https://${config.oss.bucket}.${config.oss.endpoint}`);
};

const avatarContentSecurityPolicy = (uploadOrigin) => [
  "default-src 'self'",
  "base-uri 'self'",
  "object-src 'none'",
  "frame-ancestors 'none'",
  "form-action 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' blob: data:",
  `connect-src 'self' blob:${uploadOrigin ? ` ${uploadOrigin}` : ""}`,
  "font-src 'self'",
  "worker-src 'self' blob:",
].join("; ");

export function registerAvatar3dWebRoutes(app, {
  asyncHandler = (handler) => handler,
  distDir = defaultAvatar3dDistDir,
  staticMiddleware = express.static,
  fileExists = existsSync,
  requireHttps = requireAvatarHttps,
  sessionService = { createAvatarAppSession },
  secureRequest = isAvatarHttpsRequest,
  uploadOrigin = configuredUploadOrigin(),
} = {}) {
  const exactUploadOrigin = normalizeHttpsOrigin(uploadOrigin);

  app.get(
    "/avatar/app-session",
    requireHttps,
    asyncHandler(async (req, res) => {
      const { modelId } = avatar3dModelParamsSchema.parse({
        modelId: req.query?.modelId,
      });
      const header = String(req.get("authorization") || "");
      const token = header.startsWith("Bearer ") ? header.slice(7).trim() : "";
      const result = await sessionService.createAvatarAppSession({
        token,
        secure: secureRequest(req),
      });
      res.setHeader("Set-Cookie", result.cookies);
      res.set("Cache-Control", "private, no-store");
      res.set("Content-Security-Policy", "default-src 'none'; style-src 'unsafe-inline'");
      res.set("Referrer-Policy", "no-referrer");
      res.status(200).type("html").send(
        `<!doctype html><html><head><meta charset="utf-8"><meta http-equiv="refresh" content="0;url=/avatar/?mode=viewer&amp;modelId=${encodeURIComponent(modelId)}"></head><body></body></html>`,
      );
    }),
  );

  app.use(
    "/avatar-assets",
    requireHttps,
    staticMiddleware(distDir, {
      immutable: true,
      maxAge: "1y",
      index: false,
    }),
  );

  const indexPath = path.join(distDir, "index.html");
  const sendShell = (_req, res, next) => {
    if (!fileExists(indexPath)) {
      next(new HttpError(503, "Avatar Web build is unavailable."));
      return;
    }
    res.set("Cache-Control", "private, no-store");
    res.set("Content-Security-Policy", avatarContentSecurityPolicy(exactUploadOrigin));
    res.sendFile(indexPath, (error) => {
      if (error) next(error);
    });
  };

  for (const route of ["/avatar", "/avatar/", "/avatar/*"]) {
    app.get(route, requireHttps, sendShell);
  }
}
