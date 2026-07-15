import assert from "node:assert/strict";
import test from "node:test";

process.env.DEFAULT_ADMIN_PASSWORD ||= "test-only-password";

const { registerHomepageWebRoutes } = await import("../src/homepage-web-service.js");

test("homepage Web service mounts hashed assets and all shell routes", () => {
  const routes = [];
  const uses = [];
  const app = {
    use: (path) => uses.push(path),
    get: (path) => routes.push(path),
  };
  registerHomepageWebRoutes(app, {
    distDir: "/tmp/station-web-dist",
    staticMiddleware: () => (_req, _res, next) => next(),
  });

  assert.deepEqual(uses, ["/site-assets"]);
  assert.deepEqual(routes, [
    "/preview/:token",
    "/s/:token",
    "/legal/privacy",
    "/legal/terms",
  ]);
});

test("missing Web artifacts return a controlled 503", () => {
  const handlers = new Map();
  const app = {
    use: () => {},
    get: (path, handler) => handlers.set(path, handler),
  };
  registerHomepageWebRoutes(app, {
    distDir: "/missing",
    staticMiddleware: () => (_req, _res, next) => next(),
    fileExists: () => false,
  });
  let captured;
  handlers.get("/preview/:token")({}, { set: () => {}, sendFile: () => {} }, (error) => {
    captured = error;
  });

  assert.equal(captured?.status, 503);
});
