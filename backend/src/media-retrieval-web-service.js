import express from "express";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { HttpError } from "./http-error.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const defaultMediaRetrievalDistDir = path.resolve(
  __dirname,
  "../../media-retrieval-web/dist",
);

const mediaRetrievalContentSecurityPolicy = [
  "default-src 'self'",
  "base-uri 'self'",
  "object-src 'none'",
  "frame-ancestors 'none'",
  "form-action 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' blob: data:",
  "media-src 'self' blob:",
  "connect-src 'self' blob:",
  "font-src 'self'",
  "worker-src 'self' blob:",
].join("; ");

const isHttpsRequest = (req) => (req.get("x-forwarded-proto") || "")
  .split(",", 1)[0]
  .trim()
  .toLowerCase() === "https";

export const requireMediaRetrievalHttps = (req, _res, next) => {
  if (!isHttpsRequest(req)) {
    next(new HttpError(426, "HTTPS is required.", { code: "HTTPS_REQUIRED" }));
    return;
  }
  next();
};

export function registerMediaRetrievalWebRoutes(app, {
  distDir = defaultMediaRetrievalDistDir,
  staticMiddleware = express.static,
  fileExists = existsSync,
  requireHttps = requireMediaRetrievalHttps,
} = {}) {
  app.use(
    "/media-retrieval-assets",
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
      next(new HttpError(503, "Media retrieval Web build is unavailable."));
      return;
    }
    res.set("Cache-Control", "private, no-store");
    res.set("Content-Security-Policy", mediaRetrievalContentSecurityPolicy);
    res.sendFile(indexPath, (error) => {
      if (error) next(error);
    });
  };

  for (const route of ["/media-retrieval", "/media-retrieval/", "/media-retrieval/*"]) {
    app.get(route, requireHttps, sendShell);
  }
}
