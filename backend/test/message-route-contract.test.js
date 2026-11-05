import assert from "node:assert/strict";
import crypto from "node:crypto";
import test from "node:test";

process.env.DEFAULT_ADMIN_PASSWORD ||= "test-only-password";

const {
  agentRuntimeFailureDiagnostic,
  assertAgentAvailable,
  assertMatchingMessageRetry,
  buildAgentAppContext,
  registerMessageRoutes,
  messageRequestFingerprint,
  uiPreferenceFailureReply,
} = await import("../src/routes/message-routes.js");
const { messageSchema } = await import("../src/schemas.js");

test("messages reject fabricated client-side action completion instead of suppressing model dispatch", () => {
  assert.throws(() => messageSchema.parse({ content: "帮我建站", localActionResult: {
    type: "navigation", status: "applied", message: "建站入口已准备打开。",
  } }), error => error.issues.some(issue => issue.code === "unrecognized_keys" && issue.keys.includes("localActionResult")));
});

test("empty references preserve production message keys while semantic references change them", () => {
  const body = messageSchema.parse({ content: "Existing message", replyToMessageId: crypto.randomUUID() });
  const stored = crypto.createHash("sha256").update(JSON.stringify([body.content, body.replyToMessageId])).digest("hex");
  assert.equal(messageRequestFingerprint(body), stored);
  const ref = { kind: "station-album", id: crypto.randomUUID(), version: "a".repeat(64) };
  const referenced = messageRequestFingerprint({ ...body, contextRefs: [ref] });
  assert.notEqual(referenced, stored);
  assert.equal(messageRequestFingerprint({ ...body, contextRefs: [{ ...ref, title: "Presentation only" }] }), referenced);
  assert.notEqual(messageRequestFingerprint({ ...body, contextRefs: [{ ...ref, version: "b".repeat(64) }] }), referenced);
});

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

test("message requests accept a stable UUID and reject malformed retry keys", () => {
  const clientMessageId = "d9503652-c62e-47d7-a6fb-18ba78462990";
  assert.equal(messageSchema.parse({ content: " hello ", clientMessageId }).content, "hello");
  assert.equal(messageSchema.parse({ content: "hello" }).clientMessageId, undefined);
  assert.throws(() => messageSchema.parse({ content: "hello", clientMessageId: "not-a-uuid" }));
});

test("a reused message ID cannot change its content or reply target", () => {
  const fingerprint = "original-request";
  const saved = { metadata: { source: "app", requestFingerprint: fingerprint } };
  assert.doesNotThrow(() => assertMatchingMessageRetry(saved, fingerprint));
  assert.throws(
    () => assertMatchingMessageRetry(saved, "different-content-or-reply"),
    (error) => error?.status === 409,
  );
  assert.throws(
    () => assertMatchingMessageRetry({ metadata: {} }, fingerprint),
    (error) => error?.status === 409,
  );
  assert.throws(
    () => assertMatchingMessageRetry({ metadata: { source: "direct", requestFingerprint: fingerprint } }, fingerprint),
    (error) => error?.status === 409,
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

test("UI preference chat failures explain no change and invalid suggestions without exposing model output", () => {
  assert.match(uiPreferenceFailureReply({ details: { code: "UI_PREFERENCE_NO_CHANGE" } }, "zh"), /没有.*变化/);
  assert.match(uiPreferenceFailureReply({ message: "MODEL_SECRET", details: { code: "UI_AGENT_INVALID_RESPONSE" } }, "zh"), /重试/);
  assert.doesNotMatch(uiPreferenceFailureReply({ message: "MODEL_SECRET", details: { code: "UI_AGENT_INVALID_RESPONSE" } }, "zh"), /MODEL_SECRET/);
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
  );

  assert.equal(context.stationContent, stationContent);
  assert.deepEqual(context.client, { currentPage: "station" });
  assert.equal(Object.hasOwn(context, "localActionResult"), false);
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
  );

  assert.deepEqual(context.profile, { nickname: "Tester" });
  assert.deepEqual(context.modules, {});
  assert.deepEqual(context.ownedAgents, []);
  assert.equal(context.stationContent, null);
  assert.equal(Object.hasOwn(context, "localActionResult"), false);
});

test("Agent chat rejects incomplete or outdated declarations instead of filtering into a usable grant", () => {
  const publishedAgent = {
    key: "model-3d",
    version: "1.0.0",
    releaseVersion: "1.0.0",
    catalogStatus: "published",
    contractHash: "a".repeat(64),
    identity: { key: "model-3d", avatarKind: "agent-mark", displayName: "模型", description: "", mark: "模", shape: "circle", colors: { background: "#123456", foreground: "#ffffff", accent: "#facc15" }, published: true, source: "registry", updatedAt: "2026-10-29T00:00:00.000Z" },
    permissions: ["profile:read", "station:read"],
  };
  for (const grantedScopes of [["profile:read"], ["profile:read", "station:write"], ["profile:read", "station:read", "station:write"]]) {
    assert.throws(() => assertAgentAvailable(
    {
      registeredAgents: [
        publishedAgent,
      ],
      ownedAgents: [
        {
          id: "model-3d",
          enabled: true,
          grantedScopes,
        },
      ],
    },
    "model-3d",
    ), { details: { code: "AI_ACCESS_REVOKED" } });
  }
  const access = assertAgentAvailable({ registeredAgents: [publishedAgent],
    ownedAgents: [{ id: "model-3d", enabled: true, grantedScopes: ["station:read", "profile:read"] }] }, "model-3d");
  assert.deepEqual(access.grantedScopes, ["station:read", "profile:read"]);
});

test("Agent chat rejects a disabled Agent thread", () => {
  const publishedAgent = {
    key: "model-3d", version: "1.0.0", releaseVersion: "1.0.0", catalogStatus: "published", contractHash: "a".repeat(64),
    identity: { key: "model-3d", avatarKind: "agent-mark", displayName: "模型", description: "", mark: "模", shape: "circle", colors: { background: "#123456", foreground: "#ffffff", accent: "#facc15" }, published: true, source: "registry", updatedAt: "2026-10-29T00:00:00.000Z" },
    permissions: ["profile:read"],
  };
  assert.throws(
    () =>
      assertAgentAvailable(
        {
          registeredAgents: [publishedAgent],
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
