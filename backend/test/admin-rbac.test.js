import assert from "node:assert/strict";
import test from "node:test";

process.env.DEFAULT_ADMIN_ENABLED = "false";

const { createAdminUserDetailReader } = await import("../src/admin-repository.js");
const { assertAdminAccountMutationAllowed, hasAdminPermission } = await import("../src/auth.js");
const { registerAdminRoutes } = await import("../src/routes/admin-routes.js");

test("admin permissions require an admin role and an explicit grant", () => {
  assert.equal(hasAdminPermission({ role: "user", adminPermissions: ["*"] }, "users:read"), false);
  assert.equal(hasAdminPermission({ role: "admin", adminPermissions: ["users:read"] }, "users:read"), true);
  assert.equal(hasAdminPermission({ role: "admin", adminPermissions: ["users:read"] }, "audit:read"), false);
  assert.equal(hasAdminPermission({ role: "admin", adminPermissions: ["*"] }, "model:operate"), true);
});

test("users:write cannot create or mutate administrator accounts", async () => {
  const restricted = { id: "operator", role: "admin", adminPermissions: ["users:write"] };
  const superAdmin = { id: "super", role: "admin", adminPermissions: ["*"] };
  assert.throws(() => assertAdminAccountMutationAllowed(restricted, { requestedRole: "admin" }),
    (error) => error.status === 403);
  assert.throws(() => assertAdminAccountMutationAllowed(restricted, { targetRole: "admin" }),
    (error) => error.status === 403);
  assert.doesNotThrow(() => assertAdminAccountMutationAllowed(restricted, { targetRole: "user" }));
  assert.doesNotThrow(() => assertAdminAccountMutationAllowed(superAdmin, { targetRole: "admin" }));

  const routes = new Map();
  const app = Object.fromEntries(["get", "post", "patch"].map((method) => [method,
    (path, ...handlers) => routes.set(`${method} ${path}`, handlers.at(-1))]));
  registerAdminRoutes(app, {
    authenticate: (_req, _res, next) => next(),
    requireAdmin: () => (_req, _res, next) => next(),
    asyncHandler: (handler) => handler,
  });
  let responded = false;
  await assert.rejects(
    () => routes.get("post /api/admin/users")({
      user: restricted,
      body: { email: "new@example.com", displayName: "New Admin", password: "Validpassword", role: "admin" },
    }, { status: () => { responded = true; return { json: () => {} }; } }),
    (error) => error.status === 403,
  );
  assert.equal(responded, false);
});

test("user detail omits Agent and audit data without their independent grants", async () => {
  let agentReads = 0;
  let auditReads = 0;
  const readDetail = createAdminUserDetailReader({
    findRawUser: async () => ({
      id: "user-1",
      email: "person@example.com",
      display_name: "Person",
      ai_id: "10000001",
      role: "user",
      admin_permissions: [],
      status: "active",
    }),
    getProfile: async () => ({ userId: "user-1" }),
    listThreads: async () => [],
    listAgentAccess: async () => {
      agentReads += 1;
      return [{ id: "agent-1" }];
    },
    getSessionSummary: async () => ({ active: 1 }),
    runQuery: async () => {
      auditReads += 1;
      return [];
    },
  });

  const detail = await readDetail({
    userId: "user-1",
    registeredAgents: [],
    includeAgents: false,
    includeAudit: false,
  });
  assert.deepEqual(detail.agents, []);
  assert.deepEqual(detail.recentEvents, []);
  assert.deepEqual(detail.recentRuns, []);
  assert.equal(agentReads, 0);
  assert.equal(auditReads, 0);
});

test("user detail requires both RBAC projection decisions explicitly", async () => {
  const readDetail = createAdminUserDetailReader({
    findRawUser: async () => null,
    getProfile: async () => null,
    listThreads: async () => [],
    listAgentAccess: async () => [],
    getSessionSummary: async () => ({}),
    runQuery: async () => [],
  });

  await assert.rejects(
    () => readDetail({ userId: "user-1", registeredAgents: [] }),
    /explicit Agent and audit access flags/,
  );
});
