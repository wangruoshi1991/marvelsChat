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

const retrievalHeaders = (headers = {}) => ({
  "X-Miaoxun-Retrieval-Contract": "2",
  ...headers,
});

const createRequest = ({ headers = {}, userId = "11111111-1111-4111-8111-111111111111", body = {} } = {}) => ({
  user: { id: userId },
  body,
  params: {},
  query: {},
  ip: "127.0.0.1",
  get: (name) => headers[name] || "",
});

const createResponse = () => ({
  statusCode: 200,
  body: null,
  status(code) {
    this.statusCode = code;
    return this;
  },
  json(value) {
    this.body = value;
    return this;
  },
  set() {},
});

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
  assert.equal(
    routes.filter((route) => route.path.startsWith("/api/station/media-retrieval/")).every((route) => route.handlers.length >= 3),
    true,
  );
  assert.equal(routes.some((route) => route.path === "/api/station/media-assets/search"), false);
});

test("media retrieval rejects legacy clients before status or paid work is dispatched", () => {
  const { app, routes } = createRouteRecorder();
  registerStationMediaRetrievalRoutes(app, { authenticate, asyncHandler, service });
  const statusRoute = routes.find((candidate) => candidate.path === "/api/station/media-retrieval/status");
  const request = createRequest();
  const response = createResponse();

  statusRoute.handlers[1](request, response, () => assert.fail("legacy client must not pass the contract gate"));

  assert.equal(response.statusCode, 426);
  assert.equal(response.body.error.code, "retrieval_client_update_required");
});

test("media retrieval accepts the current contract header", () => {
  const { app, routes } = createRouteRecorder();
  registerStationMediaRetrievalRoutes(app, { authenticate, asyncHandler, service });
  const statusRoute = routes.find((candidate) => candidate.path === "/api/station/media-retrieval/status");
  const request = createRequest({ headers: retrievalHeaders() });
  let continued = false;

  statusRoute.handlers[1](request, createResponse(), () => {
    continued = true;
  });

  assert.equal(continued, true);
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

test("search requires an explicit idempotency key before service dispatch", async () => {
  let dispatched = false;
  const { app, routes } = createRouteRecorder();
  registerStationMediaRetrievalRoutes(app, {
    authenticate,
    asyncHandler,
    service: {
      searchMediaRetrieval: async () => {
        dispatched = true;
      },
    },
  });
  const route = routes.find((candidate) => candidate.path === "/api/station/media-retrieval/search");
  const request = createRequest({
    headers: retrievalHeaders({ "Idempotency-Key": "" }),
    body: { query: "yellow dress" },
  });
  const response = createResponse();
  route.handlers[2](request, response, () => {});
  await assert.rejects(
    () => route.handlers[3](request, response),
    (error) => error.code === "retrieval_request_invalid" && error.retryable === false,
  );
  assert.equal(dispatched, false);
});
