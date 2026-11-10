import assert from "node:assert/strict";
import test from "node:test";
import pg from "pg";
import { createConnectionAdapter } from "../src/db.js";
import { listAgentUserMetrics } from "../src/agent-user-metrics.js";

const enabled = process.env.RUN_AGENT_USER_METRICS_POSTGRES === "1";
const integration = (name, work) => test(name, {
  skip: !enabled && "Requires a disposable loopback *_migration_test database",
}, async () => {
  const database = new URL(process.env.DATABASE_URL);
  assert.ok(["127.0.0.1", "localhost"].includes(database.hostname));
  assert.match(database.pathname, /_migration_test$/);
  const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  try {
    await client.query(`CREATE TEMP TABLE agent_runs (user_id text, agent_id text, output_message_id text, status text, lifecycle_status text);
      CREATE TEMP TABLE chat_messages (id text, user_id text, metadata jsonb);
      CREATE TEMP TABLE agent_workspace_nodes (user_id text, agent_id text, workspace_id text, round_number integer, status text);
      CREATE TEMP TABLE agent_workspace_rounds (user_id text, workspace_id text, round_number integer, status text);
      CREATE TEMP TABLE agent_workspaces (id text, user_id text, current_round integer, status text)`);
    await work(client, (owner = "owner", keys = ["a", "b"]) =>
      listAgentUserMetrics(owner, keys, createConnectionAdapter(client).query));
  } finally {
    await client.end();
  }
});

integration("metrics count unique delivered messages and successful workspace rounds", async (client, metrics) => {
    await client.query(`INSERT INTO chat_messages VALUES
      ('m1','owner','{}'),('m2','owner','{"agentWorkspace":{}}'),('m3','other','{}');
      INSERT INTO agent_runs VALUES
      ('owner','a','m1','success','succeeded'),('owner','a','m1','success','succeeded'),
      ('owner','a','m2','success','succeeded'),('owner','a','m3','success','succeeded'),
      ('owner','a',NULL,'success','succeeded'),('owner','a','m1','failed','failed');
      INSERT INTO agent_workspace_rounds VALUES
      ('owner','w1',1,'succeeded'),('owner','w1',2,'failed'),('other','w2',1,'succeeded');
      INSERT INTO agent_workspaces VALUES
      ('w1','owner',2,'failed'),('w2','other',1,'succeeded');
      INSERT INTO agent_workspace_nodes VALUES
      ('owner','a','w1',1,'succeeded'),('owner','a','w1',1,'succeeded'),
      ('owner','a','w1',2,'succeeded'),('owner','b','w1',1,'failed'),('other','a','w2',1,'succeeded')`);
    const result = await metrics();
    assert.equal(result.get("a").successfulConversations, 1);
    assert.equal(result.get("a").completedWorkspaceRounds, 1);
    assert.equal(result.get("a").completedInteractions, 2);
    assert.equal(result.get("b").completedInteractions, 0);
});

integration("a completed current workspace counts while its unfrozen round row remains queued", async (client, metrics) => {
  await client.query(`INSERT INTO agent_workspaces VALUES ('w1','owner',1,'succeeded');
    INSERT INTO agent_workspace_rounds VALUES ('owner','w1',1,'queued');
    INSERT INTO agent_workspace_nodes VALUES ('owner','a','w1',1,'succeeded')`);
  const result = await metrics();
  assert.equal(result.get("a").completedWorkspaceRounds, 1);
  assert.equal(result.get("a").completedInteractions, 1);
  assert.equal(result.get("a").level, 1);
  assert.equal(result.get("a").levelProgress, 1);
});

integration("a frozen successful history counts while a failed current round does not", async (client, metrics) => {
  await client.query(`INSERT INTO agent_workspaces VALUES ('w1','owner',2,'failed');
    INSERT INTO agent_workspace_rounds VALUES ('owner','w1',1,'succeeded'),('owner','w1',2,'queued');
    INSERT INTO agent_workspace_nodes VALUES
    ('owner','a','w1',1,'succeeded'),('owner','a','w1',2,'succeeded'),('owner','b','w1',2,'succeeded')`);
  const result = await metrics();
  assert.equal(result.get("a").completedWorkspaceRounds, 1);
  assert.equal(result.get("b").completedWorkspaceRounds, 0);
});

integration("several successful nodes by the same Agent count once per completed round", async (client, metrics) => {
  await client.query(`INSERT INTO agent_workspaces VALUES ('w1','owner',1,'succeeded');
    INSERT INTO agent_workspace_rounds VALUES ('owner','w1',1,'queued');
    INSERT INTO agent_workspace_nodes VALUES
    ('owner','a','w1',1,'succeeded'),('owner','a','w1',1,'succeeded'),
    ('owner','a','w1',1,'succeeded'),('owner','b','w1',1,'failed')`);
  const result = await metrics();
  assert.equal(result.get("a").completedWorkspaceRounds, 1);
  assert.equal(result.get("b").completedWorkspaceRounds, 0);
});

integration("workspace metrics keep node, round and workspace ownership aligned", async (client, metrics) => {
  await client.query(`INSERT INTO agent_workspaces VALUES ('foreign','other',1,'succeeded'),('local','owner',1,'succeeded');
    INSERT INTO agent_workspace_rounds VALUES
    ('other','foreign',1,'succeeded'),('owner','foreign',1,'succeeded'),('owner','local',1,'queued');
    INSERT INTO agent_workspace_nodes VALUES
    ('other','a','foreign',1,'succeeded'),('owner','a','foreign',1,'succeeded'),
    ('other','a','local',1,'succeeded'),('owner','b','local',1,'succeeded')`);
  const result = await metrics();
  assert.equal(result.get("a").completedWorkspaceRounds, 0);
  assert.equal(result.get("b").completedWorkspaceRounds, 1);
});
