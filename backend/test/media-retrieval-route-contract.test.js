import assert from "node:assert/strict";
import test from "node:test";

process.env.DEFAULT_ADMIN_PASSWORD ||= "test-only-password";

const { registerAgentRunRoutes } = await import("../src/routes/agent-run-routes.js");
const { registerStationMediaRetrievalRoutes } = await import("../src/routes/station-media-retrieval-routes.js");

function createRouteRecorder() {
  const routes = [];
  const app = {};
  for (const method of ["get", "post", "delete"]) {
    app[method] = (path, ...handlers) => routes.push({ method, path, handlers });
  }
  return { app, routes };
}

const authenticate = (_req, _res, next) => next?.();
const asyncHandler = (handler) => handler;
const service = {};

test("media retrieval registers the six protected API routes without replacing legacy media search", () => {
  const { app, routes } = createRouteRecorder();
  registerStationMediaRetrievalRoutes(app, { authenticate, asyncHandler, service });
  registerAgentRunRoutes(app, { authenticate, asyncHandler, service });

  assert.deepEqual(
    routes.map((route) => `${route.method.toUpperCase()} ${route.path}`),
    [
      "POST /api/station/media-retrieval/enable",
      "GET /api/station/media-retrieval/status",
      "POST /api/station/media-retrieval/search",
      "POST /api/station/media-retrieval/reindex",
      "DELETE /api/station/media-retrieval/index",
      "GET /api/agent-runs/:runId/events",
    ],
  );
  assert.equal(routes.every((route) => route.handlers[0] === authenticate), true);
  assert.equal(routes.some((route) => route.path === "/api/station/media-assets/search"), false);
});

test("Agent run parameter validation is converted to the public media retrieval error contract", async () => {
  const { app, routes } = createRouteRecorder();
  registerAgentRunRoutes(app, { authenticate, asyncHandler, service });
  const route = routes.find((candidate) => candidate.path === "/api/agent-runs/:runId/events");
  await assert.rejects(
    () => route.handlers[1]({ params: { runId: "not-a-uuid" }, query: {} }, {}),
    (error) => error.code === "retrieval_request_invalid" && error.retryable === false,
  );
});
