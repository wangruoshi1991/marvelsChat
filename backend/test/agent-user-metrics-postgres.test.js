import assert from "node:assert/strict";
import test from "node:test";
import pg from "pg";
import { createConnectionAdapter } from "../src/db.js";
import { listAgentUserMetrics } from "../src/agent-user-metrics.js";

const enabled = process.env.RUN_AGENT_USER_METRICS_POSTGRES === "1";
test("metrics count unique delivered messages and successful workspace rounds", {
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
      CREATE TEMP TABLE agent_workspace_rounds (user_id text, workspace_id text, round_number integer, status text)`);
    await client.query(`INSERT INTO chat_messages VALUES
      ('m1','owner','{}'),('m2','owner','{"agentWorkspace":{}}'),('m3','other','{}');
      INSERT INTO agent_runs VALUES
      ('owner','a','m1','success','succeeded'),('owner','a','m1','success','succeeded'),
      ('owner','a','m2','success','succeeded'),('owner','a','m3','success','succeeded'),
      ('owner','a',NULL,'success','succeeded'),('owner','a','m1','failed','failed');
      INSERT INTO agent_workspace_rounds VALUES
      ('owner','w1',1,'succeeded'),('owner','w1',2,'failed'),('other','w2',1,'succeeded');
      INSERT INTO agent_workspace_nodes VALUES
      ('owner','a','w1',1,'succeeded'),('owner','a','w1',1,'succeeded'),
      ('owner','a','w1',2,'succeeded'),('owner','b','w1',1,'failed'),('other','a','w2',1,'succeeded')`);
    const result = await listAgentUserMetrics("owner", ["a", "b"], createConnectionAdapter(client).query);
    assert.equal(result.get("a").successfulConversations, 1);
    assert.equal(result.get("a").completedWorkspaceRounds, 1);
    assert.equal(result.get("a").completedInteractions, 2);
    assert.equal(result.get("b").completedInteractions, 0);
  } finally {
    await client.end();
  }
});
