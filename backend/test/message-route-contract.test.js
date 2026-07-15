import assert from "node:assert/strict";
import test from "node:test";

process.env.DEFAULT_ADMIN_PASSWORD ||= "test-only-password";

const { registerMessageRoutes } = await import("../src/routes/message-routes.js");

test("registers thread notification preference routes", () => {
  const routes = [];
  const app = {};
  for (const method of ["get", "post", "patch", "delete"]) {
    app[method] = (path) => routes.push(`${method.toUpperCase()} ${path}`);
  }

  registerMessageRoutes(app, {
    authenticate: (_req, _res, next) => next(),
    asyncHandler: (handler) => handler,
    getOnlineUserIds: () => [],
    sendRealtimeToUser: () => undefined,
  });

  assert.ok(routes.includes("PATCH /api/threads/:threadId/preferences"));
});
