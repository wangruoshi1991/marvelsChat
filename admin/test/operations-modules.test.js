import assert from "node:assert/strict";
import test from "node:test";
import { createAccountsModule } from "../src/modules/accounts.js";
import { createMonitoringModule } from "../src/modules/monitoring.js";
import { createProductsModule } from "../src/modules/products.js";
import { createTasksModule } from "../src/modules/tasks.js";
import { createOverviewModule } from "../src/modules/overview.js";

test("accounts module filters real rows and uses protected status endpoint", async () => {
  const calls = [];
  const client = async (path, options) => { calls.push({ path, options }); return [{ id: "u1", displayName: "Alice", email: "alice@example.com", role: "user", status: "active", activeSessionCount: 1, threadCount: 2, agentCount: 0 }]; };
  const module = createAccountsModule(client);
  await module.load();
  assert.match(module.render(), /Alice/);
  await module.handleAction("filter", { query: "missing" });
  assert.doesNotMatch(module.render(), /Alice/);
  await module.handleAction("status", { userId: "u1", nextValue: "disabled" });
  assert.equal(calls.at(-1).path, "/api/admin/users/u1/status");
  assert.equal(JSON.parse(calls.at(-1).options.body).status, "disabled");
});

test("tasks module sends bounded filter query and idempotent retry", async () => {
  const calls = [];
  const client = async (path, options) => { calls.push({ path, options }); return { items: [{ id: "task-1", status: "failed", agentId: "album-manager" }] }; };
  const module = createTasksModule(client);
  await module.handleAction("filter", { status: "failed", agentId: "album-manager" });
  await module.load();
  assert.match(calls[0].path, /status=failed/);
  assert.match(calls[0].path, /agentId=album-manager/);
  await module.handleAction("retry", { taskId: "task-1" });
  assert.equal(calls.at(-1).path, "/api/admin/tasks/task-1/retry");
  assert.match(calls.at(-1).options.headers["Idempotency-Key"], /^admin-task-retry-task-1-/);
});

test("product module creates only an explicit draft contract", async () => {
  const calls = [];
  const client = async (path, options) => { calls.push({ path, options }); return []; };
  const module = createProductsModule(client);
  await module.handleAction("create", { body: { productKey: "demo", version: "1.0.0", displayName: "Demo" } });
  assert.equal(calls[0].path, "/api/admin/products");
  assert.equal(JSON.parse(calls[0].options.body).status, "draft");
});

test("monitoring module switches only supported windows", async () => {
  const calls = [];
  const module = createMonitoringModule(async (path) => { calls.push(path); return { agents: [] }; });
  await module.load();
  await module.handleAction("window", { days: "7" });
  await module.load();
  assert.equal(calls.at(-1), "/api/admin/monitoring?days=7");
  await assert.rejects(() => module.handleAction("window", { days: "14" }), /只支持/);
});

test("overview module keeps the real trend and detail tables alongside summary metrics", async () => {
  const calls = [];
  const module = createOverviewModule(async (path) => {
    calls.push(path);
    return {
      window: { days: 7 },
      metrics: { usersTotal: 3, agentRuns: 4 },
      daily: [{ day: "2026-10-30", runs: 4, succeeded: 3, failed: 1, tasks: 2 }],
      recentUsers: [{ id: "u1", displayName: "真实账号", email: "user@example.com", role: "user", status: "active" }],
      freshness: { source: "postgresql", generatedAt: "2026-10-30T00:00:00.000Z" },
    };
  });
  await module.load();
  const html = module.render();
  assert.match(html, /运行趋势/);
  assert.match(html, /每日运行明细/);
  assert.match(html, /真实账号/);
  await module.handleAction("window", { days: "30" });
  await module.load();
  assert.equal(calls.at(-1), "/api/admin/overview?days=30");
  await assert.rejects(() => module.handleAction("window", { days: "14" }), /只支持/);
});
