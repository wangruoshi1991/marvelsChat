import express from "express";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { HttpError } from "./http-error.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const defaultHomepageDistDir = path.resolve(__dirname, "../../station-web/dist");

export function registerHomepageWebRoutes(app, {
  distDir = defaultHomepageDistDir,
  staticMiddleware = express.static,
  fileExists = existsSync,
} = {}) {
  app.use(
    "/site-assets",
    staticMiddleware(distDir, {
      immutable: true,
      maxAge: "1y",
      index: false,
    }),
  );

  const indexPath = path.join(distDir, "index.html");
  const sendShell = ({ privatePage }) => (_req, res, next) => {
    if (!fileExists(indexPath)) {
      next(new HttpError(503, "Homepage Web build is unavailable."));
      return;
    }
    res.set("Cache-Control", privatePage ? "private, no-store" : "public, max-age=300");
    res.sendFile(indexPath, (error) => {
      if (error) next(error);
    });
  };

  app.get("/preview/:token", sendShell({ privatePage: true }));
  app.get("/s/:token", sendShell({ privatePage: true }));
  app.get("/legal/privacy", sendShell({ privatePage: false }));
  app.get("/legal/terms", sendShell({ privatePage: false }));
}
