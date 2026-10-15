import assert from "node:assert/strict";
import crypto from "node:crypto";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import test, { before, after, beforeEach } from "node:test";
import pg from "pg";
import { createConnectionAdapter } from "../src/db.js";
import { loadMigrationFiles } from "../src/migration-files.js";
import { applyPendingMigrations } from "../src/migration-ledger.js";
import { createAITaskInTransaction, createAITaskRepository } from "../src/ai-task-repository.js";

const enabled = process.env.RUN_AI_TASK_REPOSITORY_INTEGRATION === "1";
const externalUrl = process.env.AI_TASK_REPOSITORY_DATABASE_URL || "";
const backendDir = fileURLToPath(new URL("../", import.meta.url));
const composeFile = fileURLToPath(new URL("../docker-compose.test.yml", import.meta.url));
const composeProject = `ai-tasks-test-${process.pid}`;
const owner = crypto.randomUUID();
const otherOwner = crypto.randomUUID();
let pool;
let repository;
let startedCompose = false;
const compose = args => execFileSync("docker", ["compose", "-p", composeProject, "-f", composeFile, ...args], {
  cwd: backendDir, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"],
}).trim();
const transaction = async work => {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await work(createConnectionAdapter(client));
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally { client.release(); }
};
const args = overrides => ({
  userId: owner, kind: "site_draft", agentId: "site-builder", agentVersion: "0.1.0",
  input: { prompt: "private source text" }, idempotencyKey: crypto.randomUUID(), requestHash: "a".repeat(64),
  ...overrides,
});
const create = overrides => transaction(connection => createAITaskInTransaction(connection, args(overrides)));
const approval = overrides => ({
  id: crypto.randomUUID(), draftId: crypto.randomUUID(), draftHash: "b".repeat(64), profileHash: "c".repeat(64),
  expiresAt: new Date(Date.now() + 60000).toISOString(), ...overrides,
});
const waiting = async overrides => {
  await create();
  const claimed = await repository.claimAITask();
  return repository.finishAITask({ taskId: claimed.id, claimToken: claimed.claimToken,
    status: "awaiting_confirmation", phase: "awaiting_confirmation", approval: approval(overrides) });
};
const isConflict = error => error.status === 409;

if (!enabled) {
  test("AI task PostgreSQL integration requires explicit opt-in", {
    skip: "RUN_AI_TASK_REPOSITORY_INTEGRATION=1; optional AI_TASK_REPOSITORY_DATABASE_URL must be an empty loopback _migration_test database",
  }, () => {});
} else {
  before(async () => {
    let databaseUrl = externalUrl;
    if (databaseUrl) {
      const url = new URL(databaseUrl);
      if (!["127.0.0.1", "localhost", "[::1]"].includes(url.hostname) || !url.pathname.endsWith("_migration_test")) {
        throw new Error("AI task integration requires a loopback _migration_test database");
      }
    } else {
      compose(["up", "--wait", "--quiet-pull"]);
      startedCompose = true;
      const port = Number(compose(["port", "postgres", "5432"]).match(/:(\d+)\s*$/)?.[1]);
      if (!port) throw new Error("Isolated database port missing");
      databaseUrl = `postgresql://postgres:postgres@127.0.0.1:${port}/marvels_chat_test`;
    }
    pool = new pg.Pool({ connectionString: databaseUrl, max: 8 });
    const client = await pool.connect();
    try {
      const tables = await client.query("SELECT COUNT(*)::int AS n FROM pg_tables WHERE schemaname = 'public'");
      if (tables.rows[0].n !== 0) throw new Error("AI task integration database must have an empty public schema");
      const migrations = await loadMigrationFiles();
      await applyPendingMigrations({ client, migrations: migrations.filter(migration => migration.filename < "036_ai_tasks.sql") });
      const upgraded = await applyPendingMigrations({ client, migrations });
      assert.ok(upgraded.applied.includes("036_ai_tasks.sql"));
      assert.deepEqual((await applyPendingMigrations({ client, migrations })).applied, []);
      for (const [id, aiId] of [[owner, "818181818181"], [otherOwner, "828282828282"]]) {
        await client.query(`INSERT INTO users (id, email, password_hash, display_name, ai_id)
          VALUES ($1, $2, 'test-only-hash', $3, $4)`, [id, `${id}@example.test`, `Task ${id.slice(0, 8)}`, aiId]);
      }
    } finally { client.release(); }
    repository = createAITaskRepository({ query: createConnectionAdapter(pool).query, withTransaction: transaction });
  });
  after(async () => {
    if (pool) {
      await pool.query("DELETE FROM users WHERE id = ANY($1::text[])", [[owner, otherOwner]]);
      await pool.end();
    }
    if (startedCompose) compose(["down", "--volumes", "--remove-orphans"]);
  });
  beforeEach(async () => { await pool.query("DELETE FROM ai_tasks"); });

  test("task creation is atomic, concurrent-idempotent, owner isolated and privately projected", async () => {
    const input = args();
    const results = await Promise.all(Array.from({ length: 6 }, () => transaction(connection => createAITaskInTransaction(connection, input))));
    assert.equal(results.filter(result => !result.reused).length, 1);
    assert.equal(new Set(results.map(result => result.task.id)).size, 1);
    const task = results[0].task;
    assert.equal(task.revision, 1);
    assert.deepEqual(task.allowedActions, ["cancel"]);
    assert.equal(task.goal, input.input.prompt);
    for (const key of ["input", "userId", "claimToken", "leaseUntil", "requestHash", "idempotencyKey"]) assert.equal(key in task, false);
    await assert.rejects(transaction(connection => createAITaskInTransaction(connection, { ...input, requestHash: "d".repeat(64) })), isConflict);
    assert.equal((await repository.getAITaskByKey(input)).id, task.id);
    assert.equal(await repository.getAITask({ userId: otherOwner, taskId: task.id }), null);
    assert.deepEqual(await repository.listAITasks({ userId: otherOwner }), []);
    await assert.rejects(repository.listAITaskEvents({ userId: otherOwner, taskId: task.id }), error => error.status === 404);
    await assert.rejects(transaction(async connection => {
      await createAITaskInTransaction(connection, args());
      throw new Error("outer transaction rollback");
    }), /outer transaction rollback/);
    assert.equal((await repository.listAITasks({ userId: owner })).length, 1);
    const events = await repository.listAITaskEvents({ userId: owner, taskId: task.id });
    assert.equal(events.events.length, 1);
    assert.equal(events.nextSequence, 1);
    assert.equal(events.hasMore, false);
  });

  test("concurrent claimers cannot execute the same task and events are complete monotonic projections", async () => {
    const { task } = await create();
    const claims = await Promise.all(Array.from({ length: 6 }, () => repository.claimAITask()));
    const claimed = claims.find(Boolean);
    assert.equal(claims.filter(Boolean).length, 1);
    assert.deepEqual(claimed.input, { prompt: "private source text" });
    assert.equal(claimed.userId, owner);
    assert.deepEqual(claimed.allowedActions, []);
    assert.equal(await repository.heartbeatAITask({ taskId: task.id, claimToken: crypto.randomUUID() }), false);
    assert.equal(await repository.heartbeatAITask({ taskId: task.id, claimToken: claimed.claimToken }), true);
    assert.equal((await repository.getAITask({ userId: owner, taskId: task.id })).revision, 2);
    await repository.advanceAITask({ taskId: task.id, claimToken: claimed.claimToken, phase: "generating" });
    const completed = await repository.finishAITask({ taskId: task.id, claimToken: claimed.claimToken,
      status: "succeeded", phase: "completed", artifacts: [{ kind: "site_draft", id: crypto.randomUUID(), title: "A real saved result reference" }] });
    assert.equal(completed.revision, 4);
    assert.deepEqual(completed.allowedActions, []);
    const first = await repository.listAITaskEvents({ userId: owner, taskId: task.id, limit: 2 });
    assert.equal(first.hasMore, true);
    assert.deepEqual(first.events.map(event => event.sequence), [1, 2]);
    const next = await repository.listAITaskEvents({ userId: owner, taskId: task.id, afterSequence: first.nextSequence });
    assert.deepEqual(next.events.map(event => event.sequence), [3, 4]);
    assert.deepEqual(next.events.map(event => event.phase), ["generating", "completed"]);
    assert.equal(JSON.stringify(next.events).includes("saved result"), false);
    for (const event of [...first.events, ...next.events]) {
      assert.deepEqual(Object.keys(event).sort(), ["createdAt", "phase", "sequence", "status"]);
    }
    await assert.rejects(repository.finishAITask({ taskId: task.id, claimToken: claimed.claimToken, status: "failed", phase: "failed" }), isConflict);
  });

  test("expired leases interrupt without requeue and stale workers cannot publish or revive them", async () => {
    await create();
    const claimed = await repository.claimAITask();
    await pool.query("UPDATE ai_tasks SET lease_until = clock_timestamp() - INTERVAL '1 second' WHERE id = $1", [claimed.id]);
    assert.equal(await repository.heartbeatAITask({ taskId: claimed.id, claimToken: claimed.claimToken }), false);
    let wrote = false;
    await assert.rejects(repository.finishAITask({ taskId: claimed.id, claimToken: claimed.claimToken,
      status: "succeeded", phase: "completed", complete: async () => { wrote = true; } }), isConflict);
    assert.equal(wrote, false);
    assert.equal(await repository.recoverInterruptedAITasks(), 1);
    assert.equal(await repository.recoverInterruptedAITasks(), 0);
    assert.equal(await repository.claimAITask(), null);
    const task = await repository.getAITask({ userId: owner, taskId: claimed.id });
    assert.equal(task.status, "interrupted");
    assert.equal(task.error.code, "AI_TASK_INTERRUPTED");
    assert.deepEqual(task.allowedActions, []);
    await assert.rejects(repository.advanceAITask({ taskId: claimed.id, claimToken: claimed.claimToken, phase: "searching" }), isConflict);
  });

  test("input messages and queued tasks commit atomically and cannot cross owner or thread boundaries", async () => {
    const threadId = crypto.randomUUID();
    const inputMessageId = crypto.randomUUID();
    const submission = args({ kind: "agent_message", agentId: "album-manager", threadId, inputMessageId });
    await pool.query("INSERT INTO chat_threads (id, user_id, title, kind, agent_id) VALUES ($1, $2, 'Task test', 'agent', 'album-manager')", [threadId, owner]);
    const insertMessage = connection => connection.query(`INSERT INTO chat_messages
      (id, thread_id, user_id, sender_type, sender_name, content) VALUES (?, ?, ?, 'user', 'Task test', 'Private test input')`,
    [inputMessageId, threadId, owner]);
    await assert.rejects(transaction(async connection => {
      await insertMessage(connection);
      await createAITaskInTransaction(connection, submission);
      throw new Error("message and task rollback");
    }), /message and task rollback/);
    assert.equal((await pool.query("SELECT COUNT(*)::int AS n FROM chat_messages WHERE id = $1", [inputMessageId])).rows[0].n, 0);
    assert.equal((await repository.listAITasks({ userId: owner })).length, 0);
    const { task } = await transaction(async connection => {
      await insertMessage(connection);
      return createAITaskInTransaction(connection, submission);
    });
    assert.equal(task.inputMessageId, inputMessageId);
    assert.equal((await repository.listAITasks({ userId: owner, threadId }))[0].id, task.id);
    await assert.rejects(create({ ...submission, userId: otherOwner }), error => error.status === 404);
    const anotherThread = crypto.randomUUID();
    await pool.query("INSERT INTO chat_threads (id, user_id, title) VALUES ($1, $2, 'Another task test')", [anotherThread, owner]);
    await assert.rejects(create({ ...submission, threadId: anotherThread }), error => error.status === 404);
  });

  test("phase changes support model-tool cycles, avoid duplicate events, and allow a single dispatch compare-and-set", async () => {
    await create();
    const claimed = await repository.claimAITask();
    const start = { taskId: claimed.id, claimToken: claimed.claimToken, phase: "generating", expectedPhase: "validating" };
    const first = await repository.advanceAITask(start);
    await assert.rejects(repository.advanceAITask(start), error => error.code === "AI_TASK_PHASE_CHANGED");
    assert.equal((await repository.advanceAITask({ ...start, expectedPhase: undefined })).revision, first.revision);
    for (const phase of ["searching", "generating", "searching", "generating"]) {
      await repository.advanceAITask({ taskId: claimed.id, claimToken: claimed.claimToken, phase });
    }
    const page = await repository.listAITaskEvents({ userId: owner, taskId: claimed.id });
    assert.deepEqual(page.events.map(event => event.phase), ["queued", "validating", "generating", "searching", "generating", "searching", "generating"]);
  });

  test("active tasks precede recent terminal history within a bounded recovery list", async () => {
    await waiting();
    await create();
    await repository.claimAITask();
    await create();
    await pool.query("UPDATE ai_tasks SET updated_at = clock_timestamp() - INTERVAL '1 year'");
    for (let i = 0; i < 4; i += 1) {
      const { task } = await create();
      await repository.mutateAITask({ userId: owner, taskId: task.id, revision: task.revision, operation: "cancel" });
    }
    const listed = await repository.listAITasks({ userId: owner, kind: "site_draft", limit: 3 });
    assert.deepEqual(listed.map(task => task.status).sort(), ["awaiting_confirmation", "queued", "running"]);
    const withHistory = await repository.listAITasks({ userId: owner, limit: 4 });
    assert.equal(withHistory[3].status, "cancelled");
  });

  test("output side effects roll back if completion throws or the lease expires during its transaction", async () => {
    await create();
    const claimed = await repository.claimAITask();
    const original = (await pool.query("SELECT display_name FROM users WHERE id = $1", [owner])).rows[0].display_name;
    await assert.rejects(repository.finishAITask({ taskId: claimed.id, claimToken: claimed.claimToken,
      status: "succeeded", phase: "completed", complete: async connection => {
        await connection.query("UPDATE users SET display_name = 'must roll back' WHERE id = ?", [owner]);
        throw new Error("output persistence failure");
      } }), /output persistence failure/);
    await assert.rejects(repository.finishAITask({ taskId: claimed.id, claimToken: claimed.claimToken,
      status: "succeeded", phase: "completed", complete: async connection => {
        await connection.query("UPDATE users SET display_name = 'must roll back' WHERE id = ?", [owner]);
        await connection.query("UPDATE ai_tasks SET lease_until = clock_timestamp() - INTERVAL '1 second' WHERE id = ?", [claimed.id]);
      } }), isConflict);
    assert.equal((await pool.query("SELECT display_name FROM users WHERE id = $1", [owner])).rows[0].display_name, original);
    assert.equal((await repository.getAITask({ userId: owner, taskId: claimed.id })).status, "running");
    assert.equal((await repository.listAITaskEvents({ userId: owner, taskId: claimed.id })).events.length, 2);
  });

  test("queued cancellation is revision checked and late completion cannot overwrite it", async () => {
    const { task } = await create();
    await assert.rejects(repository.mutateAITask({ userId: otherOwner, taskId: task.id, revision: task.revision, operation: "cancel" }), error => error.status === 404);
    await assert.rejects(repository.mutateAITask({ userId: owner, taskId: task.id, revision: task.revision + 1, operation: "cancel" }), isConflict);
    const request = { userId: owner, taskId: task.id, revision: task.revision, operation: "cancel" };
    const cancelled = await repository.mutateAITask(request);
    assert.equal(cancelled.status, "cancelled");
    assert.deepEqual(await repository.mutateAITask(request), cancelled);
    assert.equal(await repository.claimAITask(), null);
    await assert.rejects(repository.finishAITask({ taskId: task.id, claimToken: crypto.randomUUID(), status: "succeeded", phase: "completed" }), isConflict);
    await create();
    const running = await repository.claimAITask();
    await assert.rejects(repository.mutateAITask({ userId: owner, taskId: running.id, revision: running.revision, operation: "cancel" }), isConflict);
  });

  test("confirmation is atomic, exactly once under concurrency, and rejects a competing decision", async () => {
    const task = await waiting();
    const draftId = task.approval.draftId;
    let calls = 0;
    const request = { userId: owner, taskId: task.id, revision: task.revision, operation: "confirm", approvalId: task.approval.id,
      mutate: async (connection, record) => {
        assert.equal(record.approval.draftId, draftId);
        calls += 1;
        await connection.query("UPDATE users SET display_name = 'confirmed output' WHERE id = ?", [owner]);
        return { artifacts: [{ kind: "site_draft", id: draftId, title: "Confirmed draft" }], approval: null };
      } };
    await assert.rejects(repository.mutateAITask({ ...request, approvalId: crypto.randomUUID() }), error => error.code === "AI_TASK_APPROVAL_MISMATCH");
    assert.equal(calls, 0);
    const results = await Promise.all(Array.from({ length: 4 }, () => repository.mutateAITask(request)));
    assert.equal(calls, 1);
    assert.ok(results.every(result => result.status === "succeeded" && result.revision === task.revision + 1));
    assert.ok(results.every(result => result.approval === null));
    await assert.rejects(repository.mutateAITask({ ...request, approvalId: crypto.randomUUID() }), isConflict);
    await assert.rejects(repository.mutateAITask({ ...request, operation: "reject" }), isConflict);
    assert.equal(calls, 1);
    assert.equal((await repository.listAITaskEvents({ userId: owner, taskId: task.id })).events.length, 4);
  });

  test("expired confirmation never executes, while rejection remains available and replayable", async () => {
    const task = await waiting({ expiresAt: new Date(Date.now() - 1000).toISOString() });
    assert.deepEqual(task.allowedActions, ["cancel", "reject"]);
    await assert.rejects(repository.mutateAITask({ userId: owner, taskId: task.id, revision: task.revision, operation: "confirm", approvalId: task.approval.id,
      mutate: async () => assert.fail("expired approval must not execute") }), isConflict);
    const request = { userId: owner, taskId: task.id, revision: task.revision, operation: "reject" };
    const rejected = await repository.mutateAITask(request);
    assert.equal(rejected.status, "cancelled");
    assert.deepEqual(await repository.mutateAITask(request), rejected);
  });

  test("confirmation callback rollback preserves approval and no event, including mid-transaction expiry", async () => {
    const task = await waiting();
    await assert.rejects(repository.mutateAITask({ userId: owner, taskId: task.id, revision: task.revision, operation: "confirm", approvalId: task.approval.id,
      mutate: async connection => {
        await connection.query("UPDATE ai_tasks SET approval = jsonb_set(approval, '{expiresAt}', to_jsonb((clock_timestamp() - INTERVAL '1 second')::text)) WHERE id = ?", [task.id]);
      } }), isConflict);
    assert.deepEqual(await repository.getAITask({ userId: owner, taskId: task.id }), task);
    await assert.rejects(repository.mutateAITask({ userId: owner, taskId: task.id, revision: task.revision, operation: "confirm", approvalId: task.approval.id,
      mutate: async () => { throw new Error("profile mismatch"); } }), /profile mismatch/);
    assert.equal((await repository.listAITaskEvents({ userId: owner, taskId: task.id })).events.length, 3);
  });

  test("owner deletion removes tasks and private events; invalid event payloads fail at the database boundary", async () => {
    const { task } = await create({ userId: otherOwner });
    await assert.rejects(pool.query("INSERT INTO ai_task_events (task_id, user_id, sequence, payload) VALUES ($1, $2, 2, $3)",
      [task.id, otherOwner, { status: "queued", phase: "queued", privateText: "must not publish" }]), error => error.code === "23514");
    await assert.rejects(pool.query("INSERT INTO ai_task_events (task_id, user_id, sequence, payload) VALUES ($1, $2, 2, $3)",
      [task.id, owner, { status: "queued", phase: "queued" }]), error => error.code === "23503");
    await pool.query("DELETE FROM users WHERE id = $1", [otherOwner]);
    assert.equal(await repository.getAITask({ userId: otherOwner, taskId: task.id }), null);
    assert.equal((await pool.query("SELECT COUNT(*)::int AS n FROM ai_task_events WHERE task_id = $1", [task.id])).rows[0].n, 0);
  });
}
