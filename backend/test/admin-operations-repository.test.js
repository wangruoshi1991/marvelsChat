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
  failure_code: "MODEL_FAILED",
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

test("task detail exposes ordered operational events without private input or provider payloads", async () => {
  const eventRows = [
    { sequence: 1, payload: { status: "queued", phase: "queued", prompt: "PRIVATE_EVENT_PROMPT" }, created_at: new Date("2026-10-29T00:00:00Z") },
    { sequence: 2, payload: { status: "failed", phase: "failed", errorCode: "MODEL_FAILED", error: { message: "PRIVATE_PROVIDER_RESPONSE" }, input: { text: "PRIVATE_EVENT_INPUT" }, sequence: 999 }, created_at: new Date("2026-10-29T00:01:00Z") },
  ];
  const repository = createAdminOperationsRepository({ runQuery: async (sql) => {
    if (sql.includes("FROM ai_tasks WHERE id")) return [baseTask];
    if (sql.includes("FROM ai_task_events")) return eventRows;
    throw new Error(`Unexpected detail query: ${sql}`);
  }});
  const result = await repository.getAdminTaskDetail(baseTask.id);
  assert.equal(result.id, baseTask.id);
  assert.equal(Object.hasOwn(result, "input"), false);
  assert.equal(Object.hasOwn(result, "error"), false);
  assert.equal(result.failureCode, "MODEL_FAILED");
  assert.deepEqual(result.allowedOperations, ["retry"]);
  assert.equal(result.eventKind, "status_events");
  assert.equal(result.eventsTruncated, false);
  assert.deepEqual(result.events.map((event) => event.sequence), [1, 2]);
  assert.equal(result.events[1].errorCode, "MODEL_FAILED");
  assert.doesNotMatch(JSON.stringify(result), /PRIVATE_|provider unavailable|"prompt"/);
});

test("task lists strip stored content and expose only operations supported by each task type and state", async () => {
  const cases = [
    { type: "ai_task", status: "failed", operations: ["retry"] },
    { type: "ai_task", status: "queued", operations: ["cancel"] },
    { type: "ai_task", status: "awaiting_confirmation", operations: ["cancel"] },
    { type: "ai_task", status: "running", operations: [] },
    { type: "ai_task", status: "interrupted", operations: [] },
    { type: "agent_workspace", status: "failed", operations: [] },
    { type: "agent_workspace", status: "running", operations: ["cancel"] },
    { type: "agent_workspace", status: "waiting_input", operations: ["cancel"] },
    { type: "agent_workspace", status: "cancelling", operations: ["cancel"] },
    { type: "agent_workspace", status: "succeeded", operations: [] },
  ];
  const repository = createAdminOperationsRepository({ runQuery: async () => cases.map((item) => ({ ...baseTask, task_type: item.type, status: item.status, input: { prompt: "PRIVATE_TASK_PROMPT" }, error: { code: "MODEL_FAILED", message: "PRIVATE_PROVIDER_MESSAGE" } })) });
  const rows = await repository.listAdminTasks();
  assert.deepEqual(rows.map((row) => row.allowedOperations), cases.map((item) => item.operations));
  assert.ok(rows.every((row) => !Object.hasOwn(row, "input") && !Object.hasOwn(row, "error")));
  assert.doesNotMatch(JSON.stringify(rows), /PRIVATE_/);
});

test("workspace detail keeps node snapshots separate from state history and strips all private content", async () => {
  const repository = createAdminOperationsRepository({ runQuery: async (sql) => {
    if (sql.includes("FROM ai_tasks WHERE id")) return [];
    if (sql.includes("FROM agent_workspaces WHERE id")) return [{ ...baseTask, task_type: "agent_workspace", kind: "agent_workspace", status: "running", goal: "PRIVATE_GOAL", summary: "PRIVATE_SUMMARY", question: "PRIVATE_QUESTION", approval: { text: "PRIVATE_APPROVAL" } }];
    if (sql.includes("FROM agent_workspace_nodes")) return [{ id: "node-1", agent_id: "miaoxun-butler", agent_version: "1.0.0", status: "failed", failure_code: "MODEL_FAILED", error: { code: "MODEL_FAILED", message: "PRIVATE_PROVIDER_MESSAGE" }, created_at: baseTask.created_at, updated_at: baseTask.updated_at }];
    throw new Error(`Unexpected query: ${sql}`);
  }});
  const result = await repository.getAdminTaskDetail(baseTask.id);
  assert.equal(result.type, "agent_workspace");
  assert.equal(result.eventKind, "workspace_nodes");
  assert.deepEqual(result.allowedOperations, ["cancel"]);
  assert.equal(result.events[0].errorCode, "MODEL_FAILED");
  assert.equal(Object.hasOwn(result.events[0], "sequence"), false);
  assert.doesNotMatch(JSON.stringify(result), /PRIVATE_|"input"|"goal"|"summary"|"question"|"approval"|"error"/);
});

test("task detail declares truncation when its bounded state history has more records", async () => {
  const repository = createAdminOperationsRepository({ runQuery: async (sql) => {
    if (sql.includes("FROM ai_tasks WHERE id")) return [baseTask];
    if (sql.includes("FROM ai_task_events")) return Array.from({ length: 201 }, (_, index) => ({ sequence: index + 1, payload: { status: "running", phase: "generating" }, created_at: baseTask.created_at }));
    throw new Error(`Unexpected query: ${sql}`);
  }});
  const result = await repository.getAdminTaskDetail(baseTask.id);
  assert.equal(result.events.length, 200);
  assert.equal(result.eventsTruncated, true);
  assert.equal(result.events.at(-1).sequence, 200);
});

test("task detail rejects malformed IDs before querying and reports missing tasks explicitly", async () => {
  let reads = 0;
  const repository = createAdminOperationsRepository({ runQuery: async () => { reads += 1; return []; } });
  await assert.rejects(repository.getAdminTaskDetail("not-a-uuid"), (error) => error.name === "ZodError");
  assert.equal(reads, 0);
  await assert.rejects(repository.getAdminTaskDetail(baseTask.id), (error) => error.status === 404 && error.code === "ADMIN_TASK_NOT_FOUND");
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

test("workspace cancellation stops queued nodes and preserves running-node draining", async () => {
  const statements = [];
  const transaction = async work => work({
    query: async (sql, params = []) => {
      statements.push({ sql, params });
      if (sql.includes("FROM usage_events")) return [];
      if (sql.includes("FROM ai_tasks") && sql.includes("FOR UPDATE")) return [];
      if (sql.includes("FROM agent_workspaces") && sql.includes("FOR UPDATE")) return [{
        id: baseTask.id, user_id: baseTask.user_id, status: "running", revision: 4,
      }];
      if (sql.includes("FROM agent_workspace_nodes") && sql.includes("status = 'running'")) return [{ id: "00000000-0000-0000-0000-000000000003" }];
      if (sql.includes("UPDATE agent_workspaces")) return [{ id: baseTask.id, status: "cancelling", revision: 5, updated_at: new Date() }];
      return [];
    },
  });
  const repository = createAdminOperationsRepository({ runQuery: async () => [], transaction });
  const result = await repository.mutateAdminTask({ taskId: baseTask.id, operation: "cancel", idempotencyKey: "cancel-workspace-1", actor: baseTask.user_id });
  assert.equal(result.status, "cancelling");
  assert.ok(statements.some(item => item.sql.includes("UPDATE agent_workspace_nodes SET status = 'cancelled'")));
});
