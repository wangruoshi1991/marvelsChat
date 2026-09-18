import assert from "node:assert/strict";
import test from "node:test";
import { config } from "../src/config.js";
import { closeDatabase, getPool } from "../src/db.js";
import { registerMessageRoutes } from "../src/routes/message-routes.js";

test("sync cursor precedes reads so a concurrent new thread remains eligible for the next sync", async (t) => {
  const startedAt = Date.UTC(2026, 8, 15);
  t.mock.timers.enable({ apis: ["Date"], now: startedAt });
  const previousConfig = config.db;
  config.db = { configured: true, databaseUrl: "postgresql://localhost/sync_test", connectionLimit: 1 };
  t.after(async () => {
    await closeDatabase();
    config.db = previousConfig;
  });
  const pool = await getPool();
  let observedCursor;
  t.mock.method(pool, "query", async (sql, params) => {
    if (/SELECT id\s+FROM chat_threads/.test(sql)) {
      observedCursor = params[1];
      t.mock.timers.setTime(startedAt + 1000);
    }
    return { rows: sql.includes("COUNT(*)") ? [{ total: 0 }] : [] };
  });
  const handlers = new Map();
  const app = Object.fromEntries(["get", "post", "patch", "delete"].map(method => [
    method, (route, ...registered) => handlers.set(`${method} ${route}`, registered.at(-1)),
  ]));
  registerMessageRoutes(app, {
    authenticate: (_req, _res, next) => next(),
    asyncHandler: handler => handler,
    getOnlineUserIds: () => [],
    sendRealtimeToUser: () => {},
  });
  let body;
  const previousCursor = new Date(startedAt - 1000).toISOString();
  await handlers.get("get /api/app/sync")({
    user: { id: "user-1" }, query: { updatedAfter: previousCursor },
  }, { json: value => { body = value; } });

  assert.equal(observedCursor, previousCursor);
  assert.deepEqual(body.data.threads, []);
  assert.equal(body.data.serverTime, new Date(startedAt).toISOString());
});
