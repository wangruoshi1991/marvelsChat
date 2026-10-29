import assert from "node:assert/strict";
import test from "node:test";
import { createAdminOperationsRepository } from "../src/admin-operations-repository.js";

const baseTask = {
  id: "00000000-0000-0000-0000-000000000001",
  user_id: "00000000-0000-0000-0000-000000000002",
  kind: "agent_message",
  agent_id: "miaoxun-butler",
  agent_version: "1.0.0",
  status: "failed",
  phase: "failed",
  revision: 2,
  input: { prompt: "test" },
  error: { code: "MODEL_FAILED", message: "provider unavailable" },
  created_at: new Date("2026-10-29T00:00:00Z"),
  updated_at: new Date("2026-10-29T00:01:00Z"),
  thread_id: null,
  task_type: "ai_task",
};

function fakeRepository() {
  const calls = [];
  const runQuery = async (sql, params = []) => {
    calls.push({ sql, params });
    if (sql.includes("users_total")) return [{ users_total: "3", active_users: "2", threads_total: "4", messages: "5", runs: "6", ai_tasks: "7", ai_tasks_active: "1", workspaces: "2", workspaces_active: "1", succeeded: "4", failed: "2" }];
    if (sql.includes("GROUP BY day")) return [{ day: new Date("2026-10-29T00:00:00Z"), runs: "6", succeeded: "4", failed: "2", tasks: "3" }];
    if (sql.includes("FROM (${")) return [];
    if (sql.includes("FROM agent_runs") && sql.includes("GROUP BY agent_id")) return [{ agent_id: "miaoxun-butler", runs: "2", succeeded: "1", failed: "1", token_total: null, cost_cents: null, avg_latency_ms: null }];
    if (sql.includes("FROM products p")) return [{ product_key: "daily", display_name: "日报", entitlements: "2", enabled_entitlements: "1" }];
    if (sql.includes("GROUP BY user_id")) return [{ user_id: baseTask.user_id, runs: "2", succeeded: "1", failed: "1", token_total: null, cost_cents: null }];
    if (sql.includes("FROM ai_tasks") && sql.includes("GROUP BY status")) return [{ status: "failed", count: "1" }];
    if (sql.includes("UNION ALL")) return [baseTask];
    throw new Error(`Unexpected query: ${sql}`);
  };
  return { calls, runQuery };
}

test("overview keeps a bounded window, daily series and explicit empty metadata", async () => {
  const fake = fakeRepository();
  const repository = createAdminOperationsRepository({ runQuery: fake.runQuery });
  const result = await repository.adminOverview({ days: 7 });
  assert.equal(result.window.days, 7);
  assert.equal(result.metrics.agentRuns, 6);
  assert.deepEqual(result.daily[0], { day: "2026-10-29", runs: 6, succeeded: 4, failed: 2, tasks: 3 });
  assert.equal(result.empty.metrics, false);
  assert.ok(fake.calls.every(call => call.params.every(value => typeof value === "string")));
});

test("monitoring preserves unknown token and cost as null", async () => {
  const fake = fakeRepository();
  const repository = createAdminOperationsRepository({ runQuery: fake.runQuery });
  const result = await repository.adminMonitoring({ days: 30 });
  assert.deepEqual(result.agents[0], { agentId: "miaoxun-butler", runs: 2, succeeded: 1, failed: 1, tokenTotal: null, costCents: null, averageLatencyMs: null });
  assert.deepEqual(result.products[0], { productKey: "daily", displayName: "日报", entitlementCount: 2, enabledEntitlementCount: 1 });
  assert.deepEqual(result.taskStatuses, [{ status: "failed", count: 1 }]);
});

test("task listing exposes ai task identity and failure code without fabricated rows", async () => {
  const fake = fakeRepository();
  const repository = createAdminOperationsRepository({ runQuery: fake.runQuery });
  const result = await repository.listAdminTasks({ status: "failed", limit: 20 });
  assert.equal(result.length, 1);
  assert.equal(result[0].type, "ai_task");
  assert.equal(result[0].agentId, "miaoxun-butler");
  assert.equal(result[0].failureCode, "MODEL_FAILED");
});

test("admin cancellation is idempotent and appends a durable task event plus audit", async () => {
  const statements = [];
  const transaction = async work => work({
    query: async (sql, params = []) => {
      statements.push({ sql, params });
      if (sql.includes("FROM usage_events")) return [];
      if (sql.includes("FROM ai_tasks") && sql.includes("FOR UPDATE")) return [{ ...baseTask, status: "queued", phase: "queued", error: null, revision: 1 }];
      if (sql.includes("UPDATE ai_tasks SET status = 'cancelled'")) return [{ id: baseTask.id, status: "cancelled", revision: 2, updated_at: new Date() }];
      return [];
    },
  });
  const repository = createAdminOperationsRepository({ runQuery: async () => [], transaction });
  const result = await repository.mutateAdminTask({ taskId: baseTask.id, operation: "cancel", idempotencyKey: "cancel-key-1", actor: baseTask.user_id });
  assert.deepEqual(result, { id: baseTask.id, type: "ai_task", status: "cancelled", revision: 2, operation: "cancel", replayed: false });
  assert.equal(statements.filter(item => item.sql.includes("ai_task_events")).length, 1);
  assert.equal(statements.filter(item => item.sql.includes("INSERT INTO usage_events")).length, 1);
});

test("retry rejects running or awaiting tasks instead of resetting an uncertain execution", async () => {
  const transaction = async work => work({
    query: async sql => {
      if (sql.includes("FROM usage_events")) return [];
      if (sql.includes("FROM ai_tasks")) return [{ ...baseTask, status: "running" }];
      return [];
    },
  });
  const repository = createAdminOperationsRepository({ runQuery: async () => [], transaction });
  await assert.rejects(
    repository.mutateAdminTask({ taskId: baseTask.id, operation: "retry", idempotencyKey: "retry-key-1", actor: baseTask.user_id }),
    error => error.code === "ADMIN_TASK_RETRY_UNAVAILABLE" && error.status === 409,
  );
});
