import assert from "node:assert/strict";
import test from "node:test";
import { registerUIPreferenceRoutes } from "../src/routes/ui-preference-routes.js";

test("registers authenticated UI preference preview, confirm, reset, and undo routes", () => {
  const routes = [];
  const app = {};
  for (const method of ["get", "post"]) {
    app[method] = (path, ...handlers) => routes.push({ method, path, handlers });
  }
  const authenticate = (_req, _res, next) => next();
  const asyncHandler = handler => handler;
  registerUIPreferenceRoutes(app, { authenticate, asyncHandler, service: {} });
  assert.deepEqual(routes.map(route => `${route.method.toUpperCase()} ${route.path}`), [
    "POST /api/ui/preferences/preview",
    "GET /api/ui/preferences/previews/:id",
    "POST /api/ui/preferences/confirm",
    "POST /api/ui/preferences/reset",
    "POST /api/ui/preferences/undo",
  ]);
  for (const route of routes) {
    assert.equal(route.handlers[0], authenticate);
    assert.equal(route.handlers.length, 3);
  }
});
