import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs/promises";
import test, { before, beforeEach, after } from "node:test";
import { query, withTransaction, closeDatabase } from "../src/db.js";
import * as repository from "../src/agent-workspace-repository.js";
import { createAgentWorkspaceService } from "../src/agent-workspace-service.js";
import { HttpError } from "../src/http-error.js";
import { getAgent } from "../../agents/registry.js";

const enabled = process.env.RUN_AGENT_WORKSPACE_SUBMISSION_INTEGRATION === "1";
const integration = (name, work) => test(name, { skip: !enabled && "Set RUN_AGENT_WORKSPACE_SUBMISSION_INTEGRATION=1 with a disposable loopback *_migration_test database" }, work);
const owner = crypto.randomUUID(), outsider = crypto.randomUUID(), album = crypto.randomUUID();
const service = createAgentWorkspaceService();
const input = overrides => ({ user: { id: owner }, goal: "Isolated durable submission test", contextRefs: [],
  source: { page: "miao.feed", module: "task-feed" }, idempotencyKey: crypto.randomUUID(), ...overrides });
const outcome = async args => (await query("SELECT * FROM agent_workspace_submissions WHERE user_id=? AND idempotency_key=?", [args.user.id, args.idempotencyKey]))[0];
const rejection = (args, code) => error => error instanceof HttpError && error.details?.code === code &&
  error.details.submissionOutcome === "rejected" && error.details.idempotencyKey === args.idempotencyKey;
const deferred = () => { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; };
async function addUser(userId) {
  await query("INSERT INTO users(id,email,password_hash,display_name,ai_id) VALUES(?,?,'isolated-test-only',?,?)",
    [userId, `${userId}@example.invalid`, `Submission ${userId.slice(0, 8)}`, String(crypto.randomInt(100000000000, 999999999999))]);
  const agent = await getAgent("miaoxun-butler");
  await query("INSERT INTO user_agents(user_id,agent_id,enabled,granted_scopes) VALUES(?,'miaoxun-butler',true,?::jsonb)", [userId, JSON.stringify(agent.permissions)]);
}
before(async () => {
  if (!enabled) return;
  const url = new URL(process.env.DATABASE_URL);
  assert.ok(["127.0.0.1", "localhost", "[::1]"].includes(url.hostname) && url.pathname.endsWith("_migration_test"));
  assert.match((await query("SELECT current_database() AS name"))[0].name, /_migration_test$/);
  await addUser(owner); await addUser(outsider);
  await query("INSERT INTO station_albums(id,user_id,title) VALUES(?,?,'Submission fixture')", [album, owner]);
});
beforeEach(async () => {
  if (!enabled) return;
  await query("DELETE FROM agent_workspace_submissions WHERE user_id IN (?,?)", [owner, outsider]);
  await query("DELETE FROM agent_workspaces WHERE user_id IN (?,?)", [owner, outsider]);
  await query("UPDATE users SET status='active' WHERE id IN (?,?)", [owner, outsider]);
  await query("UPDATE user_agents SET enabled=true WHERE user_id IN (?,?)", [owner, outsider]);
});
after(async () => { if (enabled) { await query("DELETE FROM users WHERE id IN (?,?)", [owner, outsider]); await closeDatabase(); } });

integration("a committed rejection survives lost responses and changed permissions; only a new key can create", async () => {
  const args = input();
  await query("UPDATE user_agents SET enabled=false WHERE user_id=?", [owner]);
  await assert.rejects(service.submitAgentWorkspace(args), rejection(args, "WORKSPACE_ACCESS_REQUIRED"));
  const first = await outcome(args);
  assert.equal(first.outcome, "rejected"); assert.equal(first.workspace_id, null);
  assert.deepEqual(Object.keys(first).sort(), ["user_id", "idempotency_key", "request_hash", "outcome", "workspace_id", "rejection_code", "rejection_status", "created_at"].sort());
  assert.equal(JSON.stringify(first).includes(args.goal), false);
  await query("UPDATE user_agents SET enabled=true WHERE user_id=?", [owner]);
  await assert.rejects(service.submitAgentWorkspace(args), rejection(args, "WORKSPACE_ACCESS_REQUIRED"));
  assert.deepEqual(await outcome(args), first);
  assert.equal((await query("SELECT id FROM agent_workspaces WHERE user_id=?", [owner])).length, 0);
  const fresh = await service.submitAgentWorkspace({ ...args, idempotencyKey: crypto.randomUUID() });
  assert.equal(fresh.status, "queued");
});

integration("old reference versions produce durable refusals with no workspace and are not replayed after correction", async () => {
  const args = input({ contextRefs: [{kind: "station-album", id: album, version: "0".repeat(64)}] });
  await assert.rejects(service.submitAgentWorkspace(args), rejection(args, "AI_CONTEXT_CHANGED"));
  assert.equal((await outcome(args)).rejection_status, 409);
  await assert.rejects(service.submitAgentWorkspace({ ...args, contextRefs: [{kind: "station-album", id: album}] }), error =>
    error.details?.code === "WORKSPACE_IDEMPOTENCY_CONFLICT" && error.details.submissionOutcome === undefined);
  const fresh = await service.submitAgentWorkspace({ ...args, idempotencyKey: crypto.randomUUID(), contextRefs: [{kind: "station-album", id: album}] });
  assert.equal(fresh.contextRefs.length, 1);
});

for (const firstRejects of [true, false]) integration(`concurrent first outcomes serialize permanently: ${firstRejects ? "rejection before acceptance" : "acceptance before rejection"}`, async () => {
  const entered = deferred(), release = deferred();
  const firstService = createAgentWorkspaceService({ loadAgent: async id => {
    entered.resolve(); await release.promise;
    const agent = await getAgent(id);
    return firstRejects ? { ...agent, permissions: [] } : agent;
  } });
  const secondService = firstRejects ? service : createAgentWorkspaceService({ loadAgent: async id => ({ ...await getAgent(id), permissions: [] }) });
  const args = input();
  const first = firstService.submitAgentWorkspace(args).then(value => ({ value }), error => ({ error }));
  await entered.promise;
  const second = secondService.submitAgentWorkspace(args).then(value => ({ value }), error => ({ error }));
  release.resolve();
  const results = await Promise.all([first, second]);
  if (firstRejects) {
    for (const result of results) assert.ok(rejection(args, "WORKSPACE_ACCESS_REQUIRED")(result.error));
    assert.equal((await outcome(args)).outcome, "rejected");
    assert.equal((await query("SELECT id FROM agent_workspaces WHERE user_id=?", [owner])).length, 0);
  } else {
    assert.equal(results[0].value.id, results[1].value.id);
    assert.equal((await outcome(args)).workspace_id, results[0].value.id);
    assert.equal((await query("SELECT id FROM agent_workspace_nodes WHERE user_id=?", [owner])).length, 1);
  }
});

integration("a business rejection after provisional creation rolls back nodes, authority changes and acceptance before saving the refusal", async () => {
  const rejectingService = createAgentWorkspaceService({ repo: { ...repository, createWorkspaceInTransaction: async (connection, args) => {
    const created = await repository.createWorkspaceInTransaction(connection, args);
    await connection.query("UPDATE user_agents SET enabled=false WHERE user_id=?", [owner]);
    return created;
  } } });
  const args = input();
  await assert.rejects(rejectingService.submitAgentWorkspace(args), rejection(args, "WORKSPACE_ACCESS_REVOKED"));
  assert.equal((await outcome(args)).outcome, "rejected");
  assert.equal((await query("SELECT id FROM agent_workspaces WHERE user_id=?", [owner])).length, 0);
  assert.equal((await query("SELECT id FROM agent_workspace_nodes WHERE user_id=?", [owner])).length, 0);
  assert.equal((await query("SELECT enabled FROM user_agents WHERE user_id=?", [owner]))[0].enabled, true);
});

integration("server failures roll back provisional acceptance without fixing a rejected outcome", async () => {
  const failingService = createAgentWorkspaceService({ repo: { ...repository, createWorkspaceInTransaction: async (connection, args) => {
    await repository.createWorkspaceInTransaction(connection, args);
    throw new HttpError(503, "isolated transient failure", {code: "WORKSPACE_ACCESS_REQUIRED"});
  } } });
  const args = input();
  await assert.rejects(failingService.submitAgentWorkspace(args), error => error.status === 503 && error.details.submissionOutcome === undefined);
  assert.equal(await outcome(args), undefined);
  assert.equal((await query("SELECT id FROM agent_workspaces WHERE user_id=?", [owner])).length, 0);
  const created = await service.submitAgentWorkspace(args);
  assert.equal((await outcome(args)).workspace_id, created.id);
});

integration("outcomes are owner scoped, reject changed hashes, and require the current owner to remain active", async () => {
  const args = input();
  const accepted = await service.submitAgentWorkspace(args);
  await assert.rejects(service.submitAgentWorkspace({...args, goal: "Different request"}), error => error.details.code === "WORKSPACE_IDEMPOTENCY_CONFLICT" && !error.details.submissionOutcome);
  const another = await service.submitAgentWorkspace({...args, user: {id: outsider}});
  assert.notEqual(another.id, accepted.id);
  await query("UPDATE users SET status='disabled' WHERE id=?", [owner]);
  await assert.rejects(service.submitAgentWorkspace(args), error => error.status === 403 && !error.details.submissionOutcome);
  await query("UPDATE users SET status='active' WHERE id=?", [owner]);
  assert.equal((await service.submitAgentWorkspace(args)).id, accepted.id);
  const rejectedArgs = input({contextRefs: [{kind: "station-album", id: crypto.randomUUID()}]});
  await assert.rejects(service.submitAgentWorkspace(rejectedArgs), rejection(rejectedArgs, "AI_CONTEXT_NOT_FOUND"));
  await query("UPDATE users SET status='disabled' WHERE id=?", [owner]);
  await assert.rejects(service.submitAgentWorkspace(rejectedArgs), error => error.status === 403 && !error.details.submissionOutcome);
});

integration("accepted receipts prevent single-workspace deletion, but removing the owner cascades all of that owner's records", async () => {
  const disposable = crypto.randomUUID(); await addUser(disposable);
  try {
    const args = input({user: {id: disposable}});
    const created = await service.submitAgentWorkspace(args);
    await assert.rejects(query("DELETE FROM agent_workspaces WHERE id=?", [created.id]), error => error.code === "23503");
    assert.equal((await outcome(args)).workspace_id, created.id);
    await query("DELETE FROM users WHERE id=?", [disposable]);
    assert.equal((await query("SELECT * FROM agent_workspace_submissions WHERE user_id=?", [disposable])).length, 0);
    assert.equal((await query("SELECT * FROM agent_workspaces WHERE user_id=?", [disposable])).length, 0);
  } finally { await query("DELETE FROM users WHERE id=?", [disposable]); }
});

integration("038 imports every existing 037 submission without changing identity or request hashes", async () => {
  const schema = `submission_migration_${crypto.randomBytes(6).toString("hex")}`;
  const sql = await fs.readFile(new URL("../database/038_agent_workspace_submissions.sql", import.meta.url), "utf8");
  await withTransaction(async connection => {
    await connection.query(`CREATE SCHEMA ${schema}`);
    try {
      await connection.query(`SET LOCAL search_path TO ${schema},pg_catalog`);
      await connection.query("CREATE TABLE users(id CHAR(36) PRIMARY KEY)");
      await connection.query("CREATE TABLE agent_workspaces(id CHAR(36) PRIMARY KEY,user_id CHAR(36) NOT NULL REFERENCES users(id) ON DELETE CASCADE,idempotency_key VARCHAR(160) NOT NULL,request_hash CHAR(64) NOT NULL,created_at TIMESTAMPTZ NOT NULL, UNIQUE(id,user_id))");
      await connection.query("INSERT INTO users VALUES(?)", [owner]);
      const id = crypto.randomUUID(), key = crypto.randomUUID();
      await connection.query("INSERT INTO agent_workspaces VALUES(?,?,?,?,?::timestamptz)", [id, owner, key, "a".repeat(64), "2026-10-12T10:00:00Z"]);
      await connection.query(sql);
      const [receipt] = await connection.query("SELECT * FROM agent_workspace_submissions");
      assert.equal(receipt.user_id, owner); assert.equal(receipt.workspace_id, id);
      assert.equal(receipt.request_hash, "a".repeat(64)); assert.equal(receipt.idempotency_key, key);
      assert.equal(receipt.outcome, "accepted"); assert.equal(receipt.created_at.toISOString(), "2026-10-12T10:00:00.000Z");
      await connection.query("SET CONSTRAINTS ALL IMMEDIATE");
    } finally { await connection.query("SET LOCAL search_path TO public,pg_catalog"); await connection.query(`DROP SCHEMA ${schema} CASCADE`); }
  });
});
