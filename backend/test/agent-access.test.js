import assert from "node:assert/strict";
import test from "node:test";

process.env.DEFAULT_ADMIN_PASSWORD ||= "test-only-password";

const {
  createUserWithDefaults,
  resolveAgentGrantedScopes,
  setUserAgentAccess,
} = await import("../src/repositories.js");
const { agentAccessSchema } = await import("../src/schemas.js");
const { assertCurrentAgentAccess } = await import("../src/ai-agent-access.js");
const { registerAppRoutes } = await import("../src/routes/app-routes.js");
const { createAdminAgentAccessHandler, registerAdminRoutes } = await import(
  "../src/routes/admin-routes.js"
);
const { createSafeErrorResponse } = await import(
  "../src/request-observability.js"
);

const agent = {
  key: "example-agent",
  permissions: ["profile:read", "station:read"],
};

test("new accounts have no Agent grant or Agent conversation until explicit addition", async () => {
  const calls = [];
  let transactionCommitted = false;
  const readUser = async (userId) => {
    assert.equal(transactionCommitted, true);
    return { id: userId };
  };
  const account = await createUserWithDefaults(
    {
      email: "new@example.com",
      displayName: "New Owner",
      passwordHash: "test-hash",
      role: "user",
    },
    {
      transaction: async (work) => {
        await work({
          execute: async (sql, params = []) => {
            calls.push({ sql, params });
            return sql.includes("nextval") ? [[{ value: "51" }]] : [[]];
          },
        });
        transactionCommitted = true;
      },
      readUser,
    }
  );
  assert.match(account.id, /^[0-9a-f-]{36}$/);
  const user = calls.find((call) => call.sql.includes("INSERT INTO users"));
  assert.equal(user.params[0], account.id);
  assert.ok(
    calls.some((call) => call.sql.includes("INSERT INTO user_profiles"))
  );
  assert.ok(
    calls.some((call) => call.sql.includes("INSERT INTO profile_visibility"))
  );
  assert.ok(
    calls.every(
      (call) => !/user_agents|chat_threads|chat_messages/.test(call.sql)
    )
  );
});

test("a failed account transaction never returns a partially created account", async () => {
  let read = false;
  await assert.rejects(
    createUserWithDefaults(
      {
        email: "new@example.com",
        displayName: "New Owner",
        passwordHash: "test-hash",
        role: "user",
      },
      {
        transaction: async (work) =>
          work({
            execute: async (sql) => {
              if (sql.includes("nextval")) return [[{ value: "51" }]];
              if (sql.includes("INSERT INTO user_profiles"))
                throw new Error("profile write rejected");
              return [[]];
            },
          }),
        readUser: async () => {
          read = true;
        },
      }
    ),
    /profile write rejected/
  );
  assert.equal(read, false);
});

test("Agent access resolution accepts an explicit complete declaration", () => {
  assert.deepEqual(
    resolveAgentGrantedScopes(agent, ["profile:read", "station:read"]),
    agent.permissions
  );
});

test("external enable requests require an explicit array before declaration validation", () => {
  for (const grantedScopes of [undefined, null, "profile:read"]) {
    const result = agentAccessSchema.safeParse({
      enabled: true,
      grantedScopes,
    });
    assert.equal(result.success, false);
    assert.ok(
      result.error.issues.some((issue) => issue.path[0] === "grantedScopes")
    );
  }
  for (const grantedScopes of [[], ["profile:read"]]) {
    assert.deepEqual(
      agentAccessSchema.parse({ enabled: true, grantedScopes }).grantedScopes,
      grantedScopes
    );
  }
});

test("external disable requests normalize omitted or supplied scopes to an empty grant", () => {
  assert.deepEqual(
    agentAccessSchema.parse({ enabled: false }).grantedScopes,
    []
  );
  assert.deepEqual(
    agentAccessSchema.parse({ enabled: false, grantedScopes: ["profile:read"] })
      .grantedScopes,
    []
  );
});

for (const boundary of ["app", "admin"]) {
  test(`${boundary} Agent route rejects implicit grants before owner lookup, consent, persistence or audit`, async () => {
    const routes = new Map();
    const app = Object.fromEntries(
      ["get", "post", "patch", "delete"].map((method) => [
        method,
        (path, ...handlers) => routes.set(`${method} ${path}`, handlers),
      ])
    );
    const authenticate = () => {};
    const requireAdmin = (permission) =>
      Object.assign(() => {}, { permission });
    const services = {
      authenticate,
      requireAdmin,
      asyncHandler: (handler) => handler,
      getOnlineUserIds: () => [],
      sendPresenceChanged: () => {},
    };
    if (boundary === "app") registerAppRoutes(app, services);
    else registerAdminRoutes(app, services);
    const path =
      boundary === "app"
        ? "/api/me/agents/:agentId"
        : "/api/admin/users/:userId/agents/:agentId";
    const handlers = routes.get(`patch ${path}`);
    assert.equal(handlers[0], authenticate);
    if (boundary === "admin")
      assert.equal(handlers[1].permission, "agents:manage");
    let reachedResource = false;
    for (const body of [
      { enabled: true },
      { enabled: true, albumAIConsentVersion: "media-retrieval-consent-v1" },
    ]) {
      const request = {
        body,
        get user() {
          reachedResource = true;
          throw new Error("must not read an owner");
        },
        get params() {
          reachedResource = true;
          throw new Error("must not resolve a resource");
        },
      };
      await assert.rejects(
        handlers.at(-1)(request, {
          json: () => assert.fail("must not succeed"),
        }),
        (error) => {
          const response = createSafeErrorResponse(error, {
            production: true,
            requestId: "test-only",
          });
          assert.equal(response.status, 400);
          assert.match(
            response.body.error.details.fieldErrors.grantedScopes[0],
            /explicitly confirmed/
          );
          return true;
        }
      );
    }
    assert.equal(reachedResource, false);
  });
}

test("persistence revokes disabled grants and requires explicit scopes for every enable", async () => {
  for (const [enabled, requested, expected] of [
    [false, undefined, []],
    [false, ["profile:read"], []],
    [true, [...agent.permissions], [...agent.permissions]],
  ]) {
    let stored;
    const connection = {
      query: async (sql, parameters) => {
        if (sql.startsWith("SELECT id FROM users"))
          return [{ id: "test-owner" }];
        if (sql.includes("INSERT INTO user_agents")) {
          stored = {
            user_id: parameters[0],
            agent_id: parameters[1],
            alias: parameters[2],
            enabled: parameters[3],
            granted_scopes: JSON.parse(parameters[4]),
          };
          return [];
        }
        if (sql.startsWith("SELECT id FROM chat_threads"))
          return [{ id: "test-thread" }];
        if (sql.startsWith("UPDATE chat_threads")) return [];
        if (sql.includes("FROM user_agents")) return [stored];
        assert.fail(`Unexpected persistence query: ${sql}`);
      },
    };
    const [access] = await setUserAgentAccess({
      userId: "test-owner",
      agent,
      enabled,
      grantedScopes: requested,
      connection,
    });
    assert.deepEqual(stored.granted_scopes, expected);
    assert.deepEqual(access.grantedScopes, expected);
    assert.equal(access.enabled, enabled);
  }
  await assert.rejects(
    setUserAgentAccess({
      userId: "test-owner",
      agent,
      enabled: true,
      connection: {
        query: async () => assert.fail("must reject before persistence"),
      },
    }),
    (error) =>
      error?.status === 400 &&
      error?.message === "Agent access requires explicitly confirmed scopes."
  );
});

test("Agent access deduplicates a complete declaration without reducing or expanding it", () => {
  assert.deepEqual(
    resolveAgentGrantedScopes(agent, ["profile:read", "station:read", "profile:read"]),
    agent.permissions
  );
});

test("empty and partial grants fail before persistence without filling in permissions", async () => {
  for (const grantedScopes of [[], ["profile:read"], ["station:read"]]) {
    const requested = [...grantedScopes];
    assert.throws(() => resolveAgentGrantedScopes(agent, grantedScopes), { details: { code: "AGENT_FULL_ACCESS_REQUIRED" } });
    await assert.rejects(setUserAgentAccess({ userId: "owner", agent, enabled: true, grantedScopes,
      connection: { query: async () => assert.fail("must not persist or create a thread") } }),
    { details: { code: "AGENT_FULL_ACCESS_REQUIRED" } });
    assert.deepEqual(grantedScopes, requested);
  }
});

test("Agent access rejects scopes outside the registered declaration", () => {
  assert.throws(
    () => resolveAgentGrantedScopes(agent, ["station:write"]),
    (error) =>
      error?.status === 400 &&
      error?.message === "Unsupported Agent scopes: station:write"
  );
});

test("a live permission change stops an in-flight Agent before reading referenced data", async () => {
  for (const granted_scopes of [[], ["profile:read"], [...agent.permissions, "station:write"]]) {
    const calls = [];
    const previous = [...granted_scopes];
    await assert.rejects(assertCurrentAgentAccess({ userId: "owner", agent, grantedScopes: ["profile:read"],
      contextRefs: [{ kind: "station-diary", id: "00000000-0000-4000-8000-000000000001" }],
      queryFn: async (sql, params) => { calls.push({ sql, params }); return [{ enabled: true, granted_scopes }]; } }),
    { details: { code: "AI_ACCESS_REVOKED" } });
    assert.equal(calls.length, 1);
    assert.deepEqual(calls[0].params, ["owner", agent.key]);
    assert.match(calls[0].sql, /user_agents/);
    assert.deepEqual(granted_scopes, previous);
  }
});

test("Agent grant resolution never defaults omitted scopes to registry permissions", () => {
  assert.throws(
    () => resolveAgentGrantedScopes(agent),
    (error) =>
      error?.status === 400 &&
      error?.message === "Agent access requires explicitly confirmed scopes."
  );
});

test("admin Album AI enable cannot substitute for the account holder consent", async () => {
  const calls = [];
  const handler = createAdminAgentAccessHandler({
    findUser: async () => ({
      id: "owner",
      role: "user",
      email: "owner@example.test",
    }),
    listRegisteredAgents: async () => [
      {
        key: "album-manager",
        name: "Album Manager",
        permissions: ["album:read"],
      },
    ],
    setAccess: async (...args) => calls.push(["setAccess", ...args]),
    setAlbumAccess: async (...args) => calls.push(["setAlbumAccess", ...args]),
    recordEvent: async (...args) => calls.push(["event", ...args]),
  });
  await assert.rejects(
    handler(
      {
        user: { id: "admin", role: "admin", adminPermissions: ["*"] },
        params: { userId: "owner", agentId: "album-manager" },
        body: { enabled: true, grantedScopes: ["album:read"] },
        get: () => "test-idempotency-key",
      },
      {}
    ),
    (error) =>
      error?.status === 409 &&
      error?.details?.code === "ALBUM_OWNER_CONSENT_REQUIRED"
  );
  assert.deepEqual(calls, []);
});

test("admin Album removal uses the shared consent/index lifecycle and caller idempotency key", async () => {
  const calls = [];
  const handler = createAdminAgentAccessHandler({
    findUser: async () => ({
      id: "owner",
      role: "user",
      email: "owner@example.test",
    }),
    listRegisteredAgents: async () => [
      {
        key: "album-manager",
        name: "Album Manager",
        permissions: ["album:read"],
      },
    ],
    setAccess: async (...args) => calls.push(["setAccess", ...args]),
    setAlbumAccess: async (...args) => {
      calls.push(["setAlbumAccess", ...args]);
      return [{ id: "album-manager", enabled: false, grantedScopes: [] }];
    },
    recordEvent: async (...args) => calls.push(["event", ...args]),
  });
  let response;
  await handler(
    {
      user: { id: "admin", role: "admin", adminPermissions: ["*"] },
      params: { userId: "owner", agentId: "album-manager" },
      body: { enabled: false },
      get: (name) => (name === "Idempotency-Key" ? "revoke-album-0001" : ""),
      ip: "127.0.0.1",
    },
    {
      json: (value) => {
        response = value;
      },
    }
  );
  assert.equal(calls[0][0], "setAlbumAccess");
  assert.equal(calls[0][1].idempotencyKey, "revoke-album-0001");
  assert.deepEqual(calls[0][1].body.grantedScopes, []);
  assert.equal(
    calls.some((call) => call[0] === "setAccess"),
    false
  );
  assert.equal(response.data.agent.enabled, false);
});

test("admin non-Album enable retains explicit full declaration scope contract", async () => {
  const calls = [];
  const handler = createAdminAgentAccessHandler({
    findUser: async () => ({
      id: "owner",
      role: "user",
      email: "owner@example.test",
    }),
    listRegisteredAgents: async () => [agent],
    setAccess: async (args) => {
      calls.push(args);
      return [
        { id: agent.key, enabled: true, grantedScopes: args.grantedScopes },
      ];
    },
    recordEvent: async () => {},
  });
  await handler(
    {
      user: { id: "admin", role: "admin", adminPermissions: ["*"] },
      params: { userId: "owner", agentId: agent.key },
      body: { enabled: true, grantedScopes: ["profile:read", "station:read"] },
      get: () => "",
      ip: "127.0.0.1",
    },
    { json: () => {} }
  );
  assert.deepEqual(calls[0].grantedScopes, agent.permissions);
});

test("admin enable rejects a partial grant before persistence or audit", async () => {
  const handler = createAdminAgentAccessHandler({
    findUser: async () => ({ id: "owner", role: "user" }), listRegisteredAgents: async () => [agent],
    setAccess: async () => assert.fail("must not persist"), recordEvent: async () => assert.fail("must not audit an accepted change"),
  });
  await assert.rejects(handler({ user: { id: "admin", role: "admin", adminPermissions: ["*"] },
    params: { userId: "owner", agentId: agent.key }, body: { enabled: true, grantedScopes: ["profile:read"] } }, {}),
  { details: { code: "AGENT_FULL_ACCESS_REQUIRED" } });
});
