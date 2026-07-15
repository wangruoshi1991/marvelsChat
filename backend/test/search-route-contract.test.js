import assert from "node:assert/strict";
import test from "node:test";

process.env.DEFAULT_ADMIN_PASSWORD ||= "test-only-password";

const { registerAppRoutes } = await import("../src/routes/app-routes.js");

test("registers persistent search history routes", () => {
  const routes = [];
  const app = {};
  for (const method of ["get", "post", "patch", "delete"]) {
    app[method] = (path) => routes.push(`${method.toUpperCase()} ${path}`);
  }

  registerAppRoutes(app, {
    authenticate: (_req, _res, next) => next(),
    asyncHandler: (handler) => handler,
    getOnlineUserIds: () => [],
    sendPresenceChanged: () => undefined,
  });

  assert.ok(routes.includes("GET /api/search/history"));
  assert.ok(routes.includes("POST /api/search/history"));
  assert.ok(routes.includes("DELETE /api/search/history"));
  assert.ok(routes.includes("DELETE /api/search/history/:historyId"));
});
