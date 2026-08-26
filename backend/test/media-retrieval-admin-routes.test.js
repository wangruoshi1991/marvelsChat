import assert from "node:assert/strict";
import test from "node:test";

process.env.DEFAULT_ADMIN_PASSWORD ||= "test-only-password";

const { buildMediaRetrievalRuntimeStatus } = await import("../src/media-retrieval-runtime-status.js");
const { registerAdminMediaRetrievalRoutes } = await import("../src/routes/admin-media-retrieval-routes.js");

test("runtime status remains temporarily unavailable when provider, worker, vector, budget, or controls are not ready", async () => {
  const status = await buildMediaRetrievalRuntimeStatus({
    evaluatedAt: new Date("2026-08-06T00:00:00.000Z"),
    configStatus: {
      configured: true,
      enabled: true,
      providerCallsEnabled: false,
      globalDailyBudgetFen: 1000,
      missing: ["provider-calls-disabled"],
      apiKey: "must-not-serialize",
      apiBaseUrl: "https://must-not-serialize.example/api/v1",
    },
    vectorReady: true,
    ossReady: true,
    overview: {
      controls: {
        agent_enabled: true,
        provider_calls_enabled: false,
        index_requests_enabled: true,
        lifecycle: "sandbox",
        global_daily_budget_fen: 1000,
      },
      workerLastSeenAt: "2026-08-05T23:59:50.000Z",
      globalCost: { reserved_fen: 0, estimated_fen: 0, unknown_fen: 0 },
    },
  });

  assert.equal(status.publicAvailability.state, "temporarily-unavailable");
  assert.equal(status.publicAvailability.canStartRun, false);
  assert.ok(status.publicAvailability.reasonCodes.includes("not-ready"));
  assert.equal(JSON.stringify(status).includes("must-not-serialize"), false);
});

test("runtime status becomes route-eligible only for a live, ready, budgeted limited release", async () => {
  const status = await buildMediaRetrievalRuntimeStatus({
    evaluatedAt: new Date("2026-08-06T00:00:00.000Z"),
    configStatus: {
      configured: true,
      enabled: true,
      providerCallsEnabled: true,
      globalDailyBudgetFen: 1000,
      missing: [],
    },
    vectorReady: true,
    ossReady: true,
    overview: {
      controls: {
        agent_enabled: true,
        provider_calls_enabled: true,
        index_requests_enabled: true,
        lifecycle: "limited_release",
        global_daily_budget_fen: 1000,
      },
      workerLastSeenAt: "2026-08-05T23:59:50.000Z",
      globalCost: { reserved_fen: 0, estimated_fen: 0, unknown_fen: 0 },
    },
  });
  assert.equal(status.routeEligibility.canRouteNewRun, true);
  assert.equal(status.publicAvailability.state, "available");
});

test("admin media retrieval routes expose only overview, runs, and bounded controls", () => {
  const routes = [];
  const app = {
    get: (path, ...handlers) => routes.push({ method: "GET", path, handlers }),
    patch: (path, ...handlers) => routes.push({ method: "PATCH", path, handlers }),
  };
  const authenticate = () => {};
  const requireAdmin = () => () => {};
  registerAdminMediaRetrievalRoutes(app, {
    authenticate,
    requireAdmin,
    asyncHandler: (handler) => handler,
    dependencies: {},
  });
  assert.deepEqual(routes.map((route) => `${route.method} ${route.path}`), [
    "GET /api/admin/media-retrieval/overview",
    "GET /api/admin/media-retrieval/runs",
    "PATCH /api/admin/media-retrieval/controls",
  ]);
});
