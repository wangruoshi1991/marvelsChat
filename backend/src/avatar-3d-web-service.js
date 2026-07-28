import express from "express";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { requireAvatarHttps } from "./avatar-3d-session.js";
import { config } from "./config.js";
import { HttpError } from "./http-error.js";

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
  distDir = defaultAvatar3dDistDir,
  staticMiddleware = express.static,
  fileExists = existsSync,
  requireHttps = requireAvatarHttps,
  uploadOrigin = configuredUploadOrigin(),
} = {}) {
  const exactUploadOrigin = normalizeHttpsOrigin(uploadOrigin);
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
