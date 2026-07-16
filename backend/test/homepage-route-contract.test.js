import assert from "node:assert/strict";
import test from "node:test";

process.env.DEFAULT_ADMIN_PASSWORD ||= "test-only-password";

const { registerStationRoutes } = await import("../src/routes/station-routes.js");
const { registerHomepagePublicRoutes } = await import("../src/routes/homepage-public-routes.js");
const { registerAccountRoutes } = await import("../src/routes/account-routes.js");

const authenticate = (_req, _res, next) => next();
const asyncHandler = (handler) => handler;

const collectRoutes = (register) => {
  const routes = [];
  const app = {};
  for (const method of ["get", "post", "patch", "delete"]) {
    app[method] = (path, ...handlers) => routes.push({ method, path, handlers });
  }
  register(app);
  return routes;
};

test("registers the authenticated Build 24 homepage lifecycle contract", () => {
  const routes = collectRoutes((app) =>
    registerStationRoutes(app, { authenticate, asyncHandler }));
  const expected = [
    ["get", "/api/station/homepage-jobs"],
    ["post", "/api/station/homepage-jobs"],
    ["get", "/api/station/homepage-jobs/:jobId"],
    ["get", "/api/station/site-drafts/:draftId"],
    ["patch", "/api/station/site-drafts/:draftId"],
    ["post", "/api/station/site-drafts/:draftId/refine"],
    ["post", "/api/station/site-drafts/:draftId/preview-token"],
    ["post", "/api/station/site-drafts/:draftId/publish"],
    ["get", "/api/station/site"],
    ["post", "/api/station/site/unpublish"],
    ["get", "/api/station/site/releases"],
    ["post", "/api/station/site/releases/:releaseId/restore"],
  ];

  for (const [method, path] of expected) {
    const route = routes.find((item) => item.method === method && item.path === path);
    assert.ok(route, `Missing ${method.toUpperCase()} ${path}`);
    assert.equal(route.handlers[0], authenticate, `${path} must authenticate first`);
  }
});

test("registers anonymous preview/share and authenticated account safety routes", () => {
  const publicRoutes = collectRoutes((app) =>
    registerHomepagePublicRoutes(app, { asyncHandler }));
  assert.ok(publicRoutes.some((item) =>
    item.method === "get" && item.path === "/api/homepage-previews/:token"));
  assert.ok(publicRoutes.some((item) =>
    item.method === "get" && item.path === "/api/homepage-shares/:token"));

  const accountRoutes = collectRoutes((app) =>
    registerAccountRoutes(app, { authenticate, asyncHandler }));
  const policies = accountRoutes.find((item) =>
    item.method === "get" && item.path === "/api/legal/policies");
  const consent = accountRoutes.find((item) =>
    item.method === "post" && item.path === "/api/me/consents");
  const deletion = accountRoutes.find((item) =>
    item.method === "delete" && item.path === "/api/account");

  assert.ok(policies);
  assert.equal(consent.handlers[0], authenticate);
  assert.equal(deletion.handlers[0], authenticate);
});
