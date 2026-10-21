import assert from "node:assert/strict";
import crypto from "node:crypto";
import test, { before, after } from "node:test";
import pg from "pg";
import { applyPendingMigrations } from "../src/migration-ledger.js";
import { loadMigrationFiles } from "../src/migration-files.js";

const enabled = process.env.RUN_AGENT_WORKSPACE_DIRECT_MIGRATION_INTEGRATION === "1";
const integration = (name, work) => test(name, { skip: !enabled && "Set RUN_AGENT_WORKSPACE_DIRECT_MIGRATION_INTEGRATION=1 with an empty disposable loopback *_migration_test database" }, work);
const owner = crypto.randomUUID(), outsider = crypto.randomUUID();
const threadId = crypto.randomUUID(), foreignThreadId = crypto.randomUUID(), otherThreadId = crypto.randomUUID();
const inputMessageId = crypto.randomUUID(), foreignInputId = crypto.randomUUID(), agentInputId = crypto.randomUUID();
const recalledInputId = crypto.randomUUID(), deletedInputId = crypto.randomUUID();
const origin = { kind: "agent_conversation", threadId, inputMessageId, agentId: "file-preprocessor", agentVersion: "0.3.4", capability: "text.summarize" };
const legacyId = crypto.randomUUID(), legacyNodeId = crypto.randomUUID();
let client, migrations, legacy;

async function insertWorkspace({ mode = "direct", provenance = origin, sqlNull = false, coordinatorVersion = null, userId = owner } = {}) {
  const workspaceId = crypto.randomUUID();
  await client.query(`INSERT INTO agent_workspaces
    (id,user_id,goal,coordinator_version,execution_mode,origin,source,context_refs,authority,input,limits,deadline_at,idempotency_key,request_hash)
    VALUES ($1,$2,'Persistent user instruction',$3,$4,$5::jsonb,'{"page":"messages.agent","module":"file-preprocessor"}',
      '[]','{"capabilities":[]}','{}','{"deadlineSeconds":600}',clock_timestamp()+INTERVAL '10 minutes',$6,$7)`,
  [workspaceId, userId, coordinatorVersion, mode, sqlNull ? null : JSON.stringify(provenance), crypto.randomUUID(), "b".repeat(64)]);
  await client.query(`INSERT INTO agent_workspace_rounds(workspace_id,user_id,round_number,instruction,status)
    VALUES($1,$2,1,'Persistent user instruction','queued')`, [workspaceId, userId]);
  await client.query("SET CONSTRAINTS ALL IMMEDIATE");
  return workspaceId;
}
async function rejectsConstraint(options) {
  await client.query("BEGIN");
  try { await assert.rejects(insertWorkspace(options), error => error.code === "23514"); }
  finally { await client.query("ROLLBACK"); }
}
before(async () => {
  if (!enabled) return;
  const url = new URL(process.env.DATABASE_URL);
  assert.ok(["127.0.0.1", "localhost", "[::1]"].includes(url.hostname) && url.pathname.endsWith("_migration_test"), "Only an empty disposable loopback database is allowed");
  client = new pg.Client({ connectionString: url.toString() }); await client.connect();
  assert.equal((await client.query("SELECT count(*)::int AS count FROM pg_tables WHERE schemaname='public'")).rows[0].count, 0);
  migrations = (await loadMigrationFiles()).filter(item => item.filename <= "042_direct_agent_workspaces.sql");
  await applyPendingMigrations({ client, migrations: migrations.filter(item => item.filename < "042_direct_agent_workspaces.sql") });
  for (const userId of [owner, outsider]) await client.query(`INSERT INTO users(id,email,password_hash,display_name,ai_id)
    VALUES($1,$2,'isolated-migration-only',$3,$4)`, [userId, `${userId}@example.invalid`, `Migration ${userId.slice(0, 8)}`, String(crypto.randomInt(100000000000, 999999999999))]);
  for (const [id, userId] of [[threadId, owner], [otherThreadId, owner], [foreignThreadId, outsider]]) {
    await client.query("INSERT INTO chat_threads(id,user_id,title,agent_id,kind) VALUES($1,$2,'Migration fixture','file-preprocessor','agent')", [id, userId]);
  }
  for (const [id, userId, thread, sender] of [[inputMessageId, owner, threadId, "user"], [agentInputId, owner, threadId, "agent"],
    [recalledInputId, owner, threadId, "user"], [deletedInputId, owner, threadId, "user"], [foreignInputId, outsider, foreignThreadId, "user"]]) {
    await client.query(`INSERT INTO chat_messages(id,user_id,thread_id,sender_type,sender_name,content)
      VALUES($1,$2,$3,$4,'Migration fixture','Original instruction')`, [id, userId, thread, sender]);
  }
  await client.query("UPDATE chat_messages SET recalled_at=clock_timestamp() WHERE id=$1", [recalledInputId]);
  await client.query("UPDATE chat_messages SET deleted_at=clock_timestamp() WHERE id=$1", [deletedInputId]);
  await client.query("BEGIN");
  const result = { artifact: { kind: "text_result", title: "Existing result", content: "Original contribution" }, resultKey: "existing-specialist", sourceReferences: [] };
  await client.query(`INSERT INTO agent_workspaces
    (id,user_id,goal,status,coordinator_version,source,context_refs,authority,input,limits,deadline_at,summary,result,idempotency_key,request_hash)
    VALUES($1,$2,'Existing coordinated goal','succeeded','0.3.1','{"page":"miao","module":null}',
      '[]','{"coordinator":{"scopes":["agents:invoke"]},"capabilities":[]}','{}','{"deadlineSeconds":600}',
      clock_timestamp()+INTERVAL '10 minutes','Original summary',$3::jsonb,$4,$5)`,
  [legacyId, owner, JSON.stringify(result), crypto.randomUUID(), "a".repeat(64)]);
  await client.query(`INSERT INTO agent_workspace_nodes(id,workspace_id,user_id,node_key,agent_id,agent_version,capability,goal,status,result)
    VALUES($1,$2,$3,'existing-specialist','file-preprocessor','0.3.4','text.summarize','Original node goal','succeeded',$4::jsonb)`,
  [legacyNodeId, legacyId, owner, JSON.stringify({ artifact: result.artifact, sourceReferences: [] })]);
  await client.query(`INSERT INTO agent_workspace_rounds(workspace_id,user_id,round_number,instruction,result_node_id,status,summary,result)
    VALUES($1,$2,1,'Existing coordinated goal',$3,'succeeded','Original summary',$4::jsonb)`,
  [legacyId, owner, legacyNodeId, JSON.stringify(result)]);
  await client.query("COMMIT");
  legacy = {
    workspace: (await client.query("SELECT * FROM agent_workspaces WHERE id=$1", [legacyId])).rows[0],
    node: (await client.query("SELECT * FROM agent_workspace_nodes WHERE id=$1", [legacyNodeId])).rows[0],
    round: (await client.query("SELECT * FROM agent_workspace_rounds WHERE workspace_id=$1", [legacyId])).rows[0],
  };
});
after(async () => { if (client) { await client.query("DELETE FROM users WHERE id IN ($1,$2)", [owner, outsider]); await client.end(); } });

integration("042 upgrades coordinated history without inventing origins or rewriting requests, rounds and contributions", async () => {
  assert.deepEqual((await applyPendingMigrations({ client, migrations })).applied, ["042_direct_agent_workspaces.sql"]);
  const { execution_mode, origin: storedOrigin, ...unchanged } = (await client.query("SELECT * FROM agent_workspaces WHERE id=$1", [legacyId])).rows[0];
  assert.equal(execution_mode, "coordinated"); assert.equal(storedOrigin, null); assert.deepEqual(unchanged, legacy.workspace);
  assert.deepEqual((await client.query("SELECT * FROM agent_workspace_nodes WHERE id=$1", [legacyNodeId])).rows[0], legacy.node);
  assert.deepEqual((await client.query("SELECT * FROM agent_workspace_rounds WHERE workspace_id=$1", [legacyId])).rows[0], legacy.round);
  assert.deepEqual((await applyPendingMigrations({ client, migrations })).applied, []);
});

integration("042 enforces strict origin JSON and mutually exclusive direct/coordinated identities", async () => {
  const missingInput = { ...origin }; delete missingInput.inputMessageId;
  for (const provenance of [null, [], {}, missingInput, { ...origin, extra: true }, { ...origin, kind: "client" },
    { ...origin, inputMessageId: "invalid" }, { ...origin, agentId: null }, { ...origin, agentId: "" },
    { ...origin, agentVersion: "" }, { ...origin, capability: "" }, { ...origin, capability: null },
    { ...origin, threadId: null }, { ...origin, inputMessageId: null }]) await rejectsConstraint({ provenance });
  await rejectsConstraint({ sqlNull: true });
  await rejectsConstraint({ coordinatorVersion: "0.3.1" });
  await rejectsConstraint({ mode: "coordinated", provenance: origin, coordinatorVersion: "0.3.1" });
  await rejectsConstraint({ mode: "coordinated", provenance: null, coordinatorVersion: null });
  await rejectsConstraint({ mode: "unknown", provenance: null, coordinatorVersion: "0.3.1" });
});

integration("042 rejects foreign threads, mismatched Agents, non-user input and recalled or deleted sources", async () => {
  for (const provenance of [{ ...origin, threadId: foreignThreadId, inputMessageId: foreignInputId },
    { ...origin, threadId: otherThreadId }, { ...origin, agentId: "site-builder" }, { ...origin, inputMessageId: agentInputId },
    { ...origin, inputMessageId: recalledInputId }, { ...origin, inputMessageId: deletedInputId },
    { ...origin, inputMessageId: foreignInputId }, { ...origin, inputMessageId: crypto.randomUUID() }]) await rejectsConstraint({ provenance });
  await rejectsConstraint({ userId: outsider });
});

integration("042 validates origin updates and retains execution history when the original conversation is deleted", async () => {
  await client.query("BEGIN"); const workspaceId = await insertWorkspace(); await client.query("COMMIT");
  const saved = (await client.query("SELECT origin,coordinator_version,execution_mode FROM agent_workspaces WHERE id=$1", [workspaceId])).rows[0];
  assert.deepEqual(saved, { origin, coordinator_version: null, execution_mode: "direct" });
  await assert.rejects(client.query("UPDATE agent_workspaces SET origin=$1::jsonb WHERE id=$2", [JSON.stringify({ ...origin, inputMessageId: foreignInputId }), workspaceId]), error => error.code === "23514");
  await assert.rejects(client.query("UPDATE agent_workspaces SET user_id=$1 WHERE id=$2", [outsider, workspaceId]), error => error.code === "23514");
  await client.query("DELETE FROM chat_threads WHERE id=$1", [threadId]);
  assert.deepEqual((await client.query("SELECT origin FROM agent_workspaces WHERE id=$1", [workspaceId])).rows[0].origin, origin);
  assert.equal((await client.query("SELECT count(*)::int AS count FROM agent_workspace_rounds WHERE workspace_id=$1", [workspaceId])).rows[0].count, 1);
  assert.deepEqual((await applyPendingMigrations({ client, migrations })).applied, []);
});
