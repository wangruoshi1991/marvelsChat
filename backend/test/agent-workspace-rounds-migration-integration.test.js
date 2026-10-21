import assert from "node:assert/strict";
import crypto from "node:crypto";
import test, { before, after } from "node:test";
import pg from "pg";
import { applyPendingMigrations } from "../src/migration-ledger.js";
import { loadMigrationFiles } from "../src/migration-files.js";

const enabled = process.env.RUN_AGENT_WORKSPACE_ROUNDS_MIGRATION_INTEGRATION === "1";
const integration = (name, work) => test(name, { skip: !enabled && "Set RUN_AGENT_WORKSPACE_ROUNDS_MIGRATION_INTEGRATION=1 with an empty disposable loopback *_migration_test database" }, work);
const owner = crypto.randomUUID();
const legacyCapability = {
  agentId: "site-builder", agentVersion: "0.3.4", capability: "site.compose",
  description: "根据目标生成私有结构页面草稿。可接收用户选中消息/照片/日记及真实素材、专业文字成果；仅使用精确交付的内容和资源。依赖素材不得丢弃成纯文字页面，生成后需用户预览确认。",
  inputKinds: ["chat-message", "station-photo", "station-diary"], dependencyKinds: ["media_selection", "text_result"], outputKind: "site_draft",
  requiredScopes: ["profile:read", "messages:read", "station:read", "station:write", "album:read"],
};
let client, migrations;
const fixture = async ({ artifact = null, status = artifact ? "succeeded" : "queued", capability = legacyCapability, node = true } = {}) => {
  const workspaceId = crypto.randomUUID(), nodeId = crypto.randomUUID();
  const result = artifact ? { artifact, resultKey: "legacy-final", sourceReferences: [] } : null;
  const authority = { coordinator: { scopes: ["agents:invoke"] }, capabilities: [capability] };
  await client.query(`INSERT INTO agent_workspaces
    (id,user_id,goal,status,coordinator_version,source,context_refs,authority,input,limits,deadline_at,summary,result,approval,idempotency_key,request_hash)
    VALUES ($1,$2,'Existing owner goal',$3,'0.3.1','{"page":"miao","module":null}','[]',$4::jsonb,'{}',
      '{"deadlineSeconds":600}',clock_timestamp()+INTERVAL '10 minutes','Original summary',$5::jsonb,$6::jsonb,$7,$8)`,
  [workspaceId, owner, status, JSON.stringify(authority), result && JSON.stringify(result), status === "awaiting_confirmation" ? '{}' : null,
    crypto.randomUUID(), "a".repeat(64)]);
  if (artifact && node) await client.query(`INSERT INTO agent_workspace_nodes
    (id,workspace_id,user_id,node_key,agent_id,agent_version,capability,goal,status,result)
    VALUES ($1,$2,$3,'legacy-final','site-builder','0.3.4','site.compose','Original node goal','succeeded',$4::jsonb)`,
  [nodeId, workspaceId, owner, JSON.stringify({ artifact, profileHash: "b".repeat(64), sourceHash: "c".repeat(64), sourceReferences: [] })]);
  return { workspaceId, nodeId, result, authority };
};
before(async () => {
  if (!enabled) return;
  const url = new URL(process.env.DATABASE_URL);
  assert.ok(["127.0.0.1", "localhost", "[::1]"].includes(url.hostname) && url.pathname.endsWith("_migration_test"), "Only an empty disposable loopback database is allowed");
  client = new pg.Client({ connectionString: url.toString() });
  await client.connect();
  assert.equal((await client.query("SELECT count(*)::int AS count FROM pg_tables WHERE schemaname='public'")).rows[0].count, 0);
  migrations = (await loadMigrationFiles()).filter(item => item.filename <= "041_agent_workspace_rounds.sql");
  await applyPendingMigrations({ client, migrations: migrations.filter(item => item.filename < "041_agent_workspace_rounds.sql") });
  await client.query("INSERT INTO users(id,email,password_hash,display_name,ai_id) VALUES($1,$2,'test-only','Migration fixture','123456789012')", [owner, `${owner}@example.invalid`]);
});
after(async () => { if (client) { await client.query("DELETE FROM users WHERE id=$1", [owner]); await client.end(); } });

integration("041 refuses missing delivery lineage and rolls the entire upgrade back", async () => {
  const invalid = await fixture({ artifact: { kind: "text_result", title: "Legacy result", content: "Fixture only" }, node: false });
  await assert.rejects(applyPendingMigrations({ client, migrations }), /WORKSPACE_ROUND_RESULT_LINEAGE_INVALID/);
  assert.equal((await client.query("SELECT count(*)::int AS count FROM information_schema.columns WHERE table_schema='public' AND table_name='agent_workspaces' AND column_name='current_round'")).rows[0].count, 0);
  assert.equal((await client.query("SELECT count(*)::int AS count FROM schema_migrations WHERE filename='041_agent_workspace_rounds.sql'")).rows[0].count, 0);
  await client.query("DELETE FROM agent_workspaces WHERE id=$1", [invalid.workspaceId]);
});

integration("041 backfills exact round history and upgrades only the known page declaration without rewriting source hashes", async () => {
  const delivered = await fixture({ artifact: { kind: "text_result", title: "Legacy result", content: "Fixture only" } });
  const pending = await fixture({ artifact: { kind: "site_draft", id: crypto.randomUUID(), title: "Legacy page" }, status: "awaiting_confirmation" });
  const custom = await fixture({ capability: { ...legacyCapability, description: "Unrecognized custom declaration" } });
  const restricted = await fixture({ capability: { ...legacyCapability, requiredScopes: ["profile:read"] } });
  const [beforeNode] = (await client.query("SELECT result FROM agent_workspace_nodes WHERE id=$1", [pending.nodeId])).rows;
  const applied = await applyPendingMigrations({ client, migrations });
  assert.deepEqual(applied.applied, ["041_agent_workspace_rounds.sql"]);
  for (const item of [delivered, pending, custom, restricted]) {
    const [workspace] = (await client.query("SELECT * FROM agent_workspaces WHERE id=$1", [item.workspaceId])).rows;
    const [round] = (await client.query("SELECT * FROM agent_workspace_rounds WHERE workspace_id=$1", [item.workspaceId])).rows;
    assert.equal(workspace.current_round, 1); assert.equal(round.round_number, 1);
    assert.equal(round.instruction, workspace.goal); assert.equal(round.status, workspace.status);
    assert.equal(round.summary, workspace.summary); assert.deepEqual(round.result, item.result);
    assert.deepEqual(round.approval, workspace.approval);
    assert.equal(round.base_result_node_id, null);
    assert.equal(round.result_node_id, item.result ? item.nodeId : null);
    assert.equal(round.created_at.toISOString(), workspace.created_at.toISOString());
    if (item === delivered) assert.equal(round.completed_at.toISOString(), workspace.updated_at.toISOString());
    else assert.equal(round.completed_at, null);
    assert.deepEqual(workspace.authority, [custom, restricted].includes(item) ? item.authority : {
      ...item.authority, capabilities: [{ ...legacyCapability, dependencyKinds: ["media_selection", "text_result", "site_draft"] }],
    });
  }
  const [afterNode] = (await client.query("SELECT result FROM agent_workspace_nodes WHERE id=$1", [pending.nodeId])).rows;
  assert.deepEqual(afterNode, beforeNode);
  assert.ok((await client.query("SELECT round_number FROM agent_workspace_nodes WHERE user_id=$1", [owner])).rows.every(node => node.round_number === 1));
  assert.deepEqual((await applyPendingMigrations({ client, migrations })).applied, []);
});
