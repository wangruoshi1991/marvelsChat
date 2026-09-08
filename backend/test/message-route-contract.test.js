import assert from "node:assert/strict";
import test from "node:test";

process.env.DEFAULT_ADMIN_PASSWORD ||= "test-only-password";

const {
  agentRuntimeFailureDiagnostic,
  assertAgentAvailable,
  buildAgentAppContext,
  registerMessageRoutes,
} = await import("../src/routes/message-routes.js");

test("registers thread notification preference routes", () => {
  const routes = [];
  const routeHandlers = new Map();
  const app = {};
  for (const method of ["get", "post", "patch", "delete"]) {
    app[method] = (path, ...handlers) => {
      const route = `${method.toUpperCase()} ${path}`;
      routes.push(route);
      routeHandlers.set(route, handlers);
    };
  }

  registerMessageRoutes(app, {
    authenticate: (_req, _res, next) => next(),
    asyncHandler: (handler) => handler,
    getOnlineUserIds: () => [],
    sendRealtimeToUser: () => undefined,
  });

  assert.ok(routes.includes("PATCH /api/threads/:threadId/preferences"));
  assert.equal(
    routeHandlers.get("POST /api/threads/:threadId/messages").length,
    2,
  );
});

test("Agent runtime diagnostics never expose provider error messages", () => {
  const diagnostic = agentRuntimeFailureDiagnostic(
    Object.assign(new Error("provider rejected secret-token"), { status: 502 }),
  );

  assert.deepEqual(diagnostic, {
    code: "AGENT_RUNTIME_FAILED",
    errorName: "Error",
    status: 502,
  });
  assert.doesNotMatch(JSON.stringify(diagnostic), /secret-token/);
});

test("Agent chat context includes current station content", () => {
  const stationContent = {
    albums: [{ id: "album-1" }],
    diaryEntries: [{ id: "diary-1" }],
    mediaAssets: [{ id: "media-1" }],
  };
  const context = buildAgentAppContext(
    {
      profile: { nickname: "Tester" },
      modules: { album: { status: "connected" } },
      ownedAgents: [{ id: "album-manager" }],
      stationContent,
    },
    { grantedScopes: ["profile:read", "station:read"] },
    { currentPage: "station" },
    null,
  );

  assert.equal(context.stationContent, stationContent);
  assert.deepEqual(context.client, { currentPage: "station" });
  assert.equal(context.localActionResult, null);
});

test("Agent chat context omits data outside granted scopes", () => {
  const context = buildAgentAppContext(
    {
      profile: { nickname: "Tester" },
      modules: { album: { status: "connected" } },
      ownedAgents: [{ id: "album-manager" }],
      stationContent: { albums: [{ id: "album-1" }] },
    },
    { grantedScopes: ["profile:read"] },
    { currentPage: "station" },
    { type: "publish", status: "applied" },
  );

  assert.deepEqual(context.profile, { nickname: "Tester" });
  assert.deepEqual(context.modules, {});
  assert.deepEqual(context.ownedAgents, []);
  assert.equal(context.stationContent, null);
  assert.equal(context.localActionResult, null);
});

test("Agent chat uses only scopes declared by the registered Agent", () => {
  const access = assertAgentAvailable(
    {
      registeredAgents: [
        { key: "model-3d", permissions: ["profile:read", "station:read"] },
      ],
      ownedAgents: [
        {
          id: "model-3d",
          enabled: true,
          grantedScopes: ["profile:read", "station:write"],
        },
      ],
    },
    "model-3d",
  );

  assert.deepEqual(access.grantedScopes, ["profile:read"]);
});

test("Agent chat rejects a disabled Agent thread", () => {
  assert.throws(
    () =>
      assertAgentAvailable(
        {
          registeredAgents: [{ key: "model-3d" }],
          ownedAgents: [],
        },
        "model-3d",
      ),
    (error) =>
      error?.status === 403 &&
      error?.message === "Agent is not enabled for this account",
  );
});

test("Agent chat rejects a thread whose Agent is no longer registered", () => {
  assert.throws(
    () =>
      assertAgentAvailable(
        {
          registeredAgents: [],
          ownedAgents: [{ id: "retired-agent", enabled: true }],
        },
        "retired-agent",
      ),
    (error) => error?.status === 404 && error?.message === "Agent is not registered",
  );
});
