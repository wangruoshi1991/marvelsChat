import assert from "node:assert/strict";
import test from "node:test";

process.env.DEFAULT_ADMIN_PASSWORD ||= "test-only-password";

const { registerAvatar3dRoutes } = await import("../src/routes/avatar-3d-routes.js");

const collectRoutes = () => {
  const routes = [];
  const app = {};
  for (const method of ["get", "post", "delete"]) {
    app[method] = (path, ...handlers) => routes.push({ method, path, handlers });
  }
  return { app, routes };
};

const authenticate = (_req, _res, next) => next();
const requireCsrf = (_req, _res, next) => next();
const requireHttps = (_req, _res, next) => next();
const asyncHandler = (handler) => handler;

const register = () => {
  const { app, routes } = collectRoutes();
  registerAvatar3dRoutes(app, {
    authenticate,
    requireCsrf,
    requireHttps,
    asyncHandler,
    sessionService: {},
    service: {},
    recordUsageEvent: async () => {},
  });
  return routes;
};

test("registers the complete private avatar Web API contract", () => {
  const routes = register();
  const expected = [
    ["post", "/api/avatar-3d/session"],
    ["delete", "/api/avatar-3d/session"],
    ["get", "/api/avatar-3d/bootstrap"],
    ["post", "/api/avatar-3d/photos"],
    ["post", "/api/avatar-3d/photos/:photoId/complete"],
    ["delete", "/api/avatar-3d/photos/:photoId"],
    ["get", "/api/avatar-3d/photos/:photoId/file"],
    ["post", "/api/avatar-3d/jobs"],
    ["get", "/api/avatar-3d/jobs"],
    ["get", "/api/avatar-3d/jobs/:jobId"],
    ["post", "/api/avatar-3d/jobs/:jobId/confirm-style"],
    ["post", "/api/avatar-3d/jobs/:jobId/cancel"],
    ["get", "/api/avatar-3d/jobs/:jobId/style-preview"],
    ["get", "/api/avatar-3d/models/:modelId"],
    ["get", "/api/avatar-3d/models/:modelId/file"],
    ["get", "/api/avatar-3d/models/:modelId/thumbnail"],
    ["delete", "/api/avatar-3d/models/:modelId"],
  ];

  assert.deepEqual(
    routes.map(({ method, path }) => [method, path]),
    expected,
  );
});

test("authenticates every private route and verifies CSRF before mutations", () => {
  const routes = register();
  const login = routes.find((route) =>
    route.method === "post" && route.path === "/api/avatar-3d/session");
  assert.ok(login);
  assert.equal(login.handlers[0], requireHttps);
  assert.equal(login.handlers.includes(authenticate), false);
  assert.equal(login.handlers.includes(requireCsrf), false);

  for (const route of routes.filter((item) => item !== login)) {
    assert.equal(route.handlers[0], authenticate, `${route.method} ${route.path} must authenticate first`);
    if (["post", "delete"].includes(route.method)) {
      assert.equal(
        route.handlers[1],
        requireCsrf,
        `${route.method} ${route.path} must verify CSRF immediately after auth`,
      );
    }
  }
});
