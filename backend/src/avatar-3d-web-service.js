import express from "express";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { requireAvatarHttps } from "./avatar-3d-session.js";
import { HttpError } from "./http-error.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const defaultAvatar3dDistDir = path.resolve(__dirname, "../../avatar-web/dist");

export function registerAvatar3dWebRoutes(app, {
  distDir = defaultAvatar3dDistDir,
  staticMiddleware = express.static,
  fileExists = existsSync,
  requireHttps = requireAvatarHttps,
} = {}) {
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
    res.sendFile(indexPath, (error) => {
      if (error) next(error);
    });
  };

  for (const route of ["/avatar", "/avatar/", "/avatar/*"]) {
    app.get(route, requireHttps, sendShell);
  }
}
