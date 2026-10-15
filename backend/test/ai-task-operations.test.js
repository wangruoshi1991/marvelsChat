import assert from "node:assert/strict";
import crypto from "node:crypto";
import test, { before, after } from "node:test";
import pg from "pg";
import { checkAITaskOperations } from "../scripts/check-ai-task-operations.js";
import { loadMigrationFiles } from "../src/migration-files.js";
import { applyPendingMigrations } from "../src/migration-ledger.js";

test("operations refuses an unmigrated database before reading queues and releases its read-only snapshot", async () => {
  const statements = [];
  let released = false;
  const client = { query: async sql => {
    statements.push(sql);
    if (sql.startsWith("SELECT to_regclass")) return { rows: [{ table_name: null }] };
    return { rows: [] };
  }, release: () => { released = true; } };
  const result = await checkAITaskOperations({ pool: { connect: async () => client },
    migrations: [{ filename: "037_agent_workspaces.sql", sql: "SELECT 1" }] });
  assert.deepEqual(result, { ok: false, code: "DATABASE_MIGRATIONS_REQUIRED", appliedCount: 0, expectedCount: 1 });
  assert.equal(statements[0], "BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");
  assert.equal(statements.at(-1), "ROLLBACK");
  assert.equal(statements.some(sql => sql.includes("FROM ai_tasks") || sql.includes("FROM agent_workspace")), false);
  assert.equal(released, true);
});

test("operations always releases its connection when a database query fails", async () => {
  const statements = [];
  let released = false;
  const failure = new Error("query unavailable");
  const client = { query: async sql => {
    statements.push(sql);
    if (sql.startsWith("SELECT")) throw failure;
    return { rows: [] };
  }, release: () => { released = true; } };
  await assert.rejects(checkAITaskOperations({ pool: { connect: async () => client }, migrations: [] }), error => error === failure);
  assert.equal(statements.at(-1), "ROLLBACK");
  assert.equal(released, true);
});

if (process.env.RUN_AI_TASK_OPERATIONS_INTEGRATION !== "1") {
  test("operations aggregates need an empty isolated PostgreSQL database", {
    skip: "RUN_AI_TASK_OPERATIONS_INTEGRATION=1 and AI_TASK_OPERATIONS_DATABASE_URL",
  }, () => {});
} else {
  let pool;
  let migrations;
  const owner = crypto.randomUUID();
  const secretText = "Fixture private goal must not appear in an operational summary";
  const workspace = async ({ status = "running", expired = false, tracked = true } = {}) => {
    const id = crypto.randomUUID();
    await pool.query(`INSERT INTO agent_workspaces
      (id,user_id,goal,status,coordinator_version,source,context_refs,authority,input,limits,deadline_at,idempotency_key,request_hash,question)
      VALUES ($1::text,$2,$3,$4,'test','{"page":"miao","module":null}','[]','{}','{}','{"deadlineSeconds":1200}',
        CURRENT_TIMESTAMP + $5::interval,$1,$6,$7)`,
    [id, owner, secretText, status, expired ? "-1 minute" : "20 minutes", "a".repeat(64), status === "waiting_input" ? secretText : null]);
    if (tracked) await pool.query(`INSERT INTO agent_workspace_submissions
      (user_id,idempotency_key,request_hash,outcome,workspace_id) VALUES ($1,$2::text,$3,'accepted',$2::text)`, [owner, id, "a".repeat(64)]);
    return id;
  };
  const node = async (workspaceId, key, { status = "queued", dependencies = [], receipts = [], age = "2 minutes", expired = false } = {}) => {
    const id = crypto.randomUUID();
    await pool.query(`INSERT INTO agent_workspace_nodes
      (id,workspace_id,user_id,node_key,agent_id,agent_version,capability,goal,status,dependencies,model_calls,model_receipts,claim_token,lease_until,created_at)
      VALUES ($1,$2,$3,$4,'site-builder','test','site.compose',$5,$6,$7,$8,$9,$10,$11,CURRENT_TIMESTAMP-$12::interval)`,
    [id, workspaceId, owner, key, secretText, status, JSON.stringify(dependencies), receipts.length, JSON.stringify(receipts),
      status === "running" ? crypto.randomUUID() : null,
      status === "running" ? new Date(Date.now() + (expired ? -60000 : 300000)) : null, age]);
    return id;
  };
  before(async () => {
    const url = new URL(process.env.AI_TASK_OPERATIONS_DATABASE_URL);
    if (!["127.0.0.1", "localhost", "[::1]"].includes(url.hostname) || !url.pathname.endsWith("_migration_test")) {
      throw new Error("An isolated loopback _migration_test database is required");
    }
    pool = new pg.Pool({ connectionString: url.toString(), max: 4 });
    migrations = await loadMigrationFiles();
    const client = await pool.connect();
    try {
      assert.equal((await client.query("SELECT count(*)::int AS n FROM pg_tables WHERE schemaname='public'")).rows[0].n, 0);
      await applyPendingMigrations({ client, migrations });
      await client.query("INSERT INTO users(id,email,password_hash,display_name,ai_id) VALUES($1,$2,'fixture-only','Ops fixture','787878787879')",
        [owner, `${owner}@example.test`]);
    } finally { client.release(); }
  });
  after(async () => {
    if (pool) {
      await pool.query("DELETE FROM users WHERE id=$1", [owner]);
      await pool.end();
    }
  });

  test("operations counts ready nodes inside running workspaces, dependency waits and unknown model calls without exposing content", async () => {
    const running = await workspace();
    await node(running, "ready");
    await node(running, "done", { status: "succeeded" });
    await node(running, "ready-after-done", { dependencies: ["done"] });
    await node(running, "active", { status: "running", expired: true,
      receipts: [{ status: "dispatched", startedAt: new Date().toISOString() }] });
    await node(running, "blocked", { dependencies: ["active"] });
    await node(running, "missing-dependency", { dependencies: ["missing"] });
    await node(await workspace({ status: "waiting_input" }), "waiting-user");
    await node(await workspace({ status: "queued", expired: true }), "expired-parent");
    await node(await workspace({ status: "interrupted" }), "unknown", { status: "interrupted",
      receipts: [{ status: "unknown", finishedAt: new Date().toISOString() },
        { status: "unknown", finishedAt: new Date(Date.now() - 2 * 86400000).toISOString() }] });
    await node(await workspace({ status: "failed" }), "orphan-dispatch", { status: "failed",
      receipts: [{ status: "dispatched", startedAt: new Date().toISOString() }] });
    const before = (await pool.query("SELECT jsonb_agg(to_jsonb(n) ORDER BY id) AS snapshot FROM agent_workspace_nodes n")).rows[0].snapshot;
    const result = await checkAITaskOperations({ pool, migrations });
    assert.equal(result.ok, true);
    assert.equal(result.workerLiveness, "not_checked");
    assert.equal(result.workspaces.queued, 1);
    assert.equal(result.workspaces.running, 1);
    assert.equal(result.workspaces.waiting_input, 1);
    assert.equal(result.workspaces.expired_deadlines, 1);
    assert.equal(result.workspaces.failed_last_24h, 1);
    assert.equal(result.workspaces.interrupted_last_24h, 1);
    const { oldest_queued_seconds, oldest_ready_seconds, ...counts } = result.workspaceNodes;
    assert.deepEqual(counts, { queued: 6, ready: 2, waiting_dependencies: 2, inactive_parent: 2,
      running: 1, expired_leases: 1, interrupted_last_24h: 1, failed_last_24h: 1 });
    assert.ok(oldest_queued_seconds >= 120 && oldest_ready_seconds >= 120);
    assert.deepEqual(result.workspaceCalls, { dispatched: 2, unknown: 2, unknown_last_24h: 1, dispatched_without_running_node: 1 });
    assert.deepEqual(result.workspaceSubmissions, { accepted: 5, rejected: 0, rejected_last_24h: 0, mismatched_workspaces: 0, untracked_workspaces: 0 });
    assert.equal(result.queue.queued, 0);
    assert.doesNotMatch(JSON.stringify(result), new RegExp(`${secretText}|${owner}|${running}|site-builder|site.compose`));
    assert.deepEqual((await pool.query("SELECT jsonb_agg(to_jsonb(n) ORDER BY id) AS snapshot FROM agent_workspace_nodes n")).rows[0].snapshot, before);
  });

  test("submission diagnostics count durable rejection and missing receipts without exposing request data", async () => {
    const before = await checkAITaskOperations({ pool, migrations });
    const untracked = await workspace({ tracked: false });
    const mismatch = await workspace();
    await pool.query("UPDATE agent_workspace_submissions SET request_hash=$1 WHERE workspace_id=$2", ["b".repeat(64), mismatch]);
    for (const age of ["1 hour", "2 days"]) await pool.query(`INSERT INTO agent_workspace_submissions
      (user_id,idempotency_key,request_hash,outcome,rejection_code,rejection_status,created_at)
      VALUES ($1,$2,$3,'rejected','AI_CONTEXT_CHANGED',409,CURRENT_TIMESTAMP-$4::interval)`, [owner, crypto.randomUUID(), "a".repeat(64), age]);
    const snapshot = (await pool.query("SELECT jsonb_agg(to_jsonb(s) ORDER BY idempotency_key) AS value FROM agent_workspace_submissions s")).rows[0].value;
    const result = await checkAITaskOperations({ pool, migrations });
    assert.deepEqual(result.workspaceSubmissions, { accepted: before.workspaceSubmissions.accepted + 1, rejected: 2,
      rejected_last_24h: 1, mismatched_workspaces: 1, untracked_workspaces: 1 });
    assert.doesNotMatch(JSON.stringify(result), new RegExp(`${secretText}|${owner}|${untracked}|${mismatch}|AI_CONTEXT_CHANGED`));
    assert.deepEqual((await pool.query("SELECT jsonb_agg(to_jsonb(s) ORDER BY idempotency_key) AS value FROM agent_workspace_submissions s")).rows[0].value, snapshot);
  });

  test("the previous 037 file set cannot certify a database upgraded to 038", async () => {
    const result = await checkAITaskOperations({ pool, migrations: migrations.filter(item => item.filename < "038") });
    assert.deepEqual(result, { ok: false, code: "DATABASE_MIGRATIONS_REQUIRED", appliedCount: migrations.length, expectedCount: 37 });
  });
}
