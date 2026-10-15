import assert from "node:assert/strict";
import crypto from "node:crypto";
import { readFile } from "node:fs/promises";
import test from "node:test";
import pg from "pg";
import { applyPendingMigrations } from "../src/migration-ledger.js";

const enabled = process.env.RUN_WORKSPACE_SITE_DRAFT_OWNERSHIP_INTEGRATION === "1";
const integration = (name, work) => test(name, { skip: !enabled && "Set RUN_WORKSPACE_SITE_DRAFT_OWNERSHIP_INTEGRATION=1 with a disposable loopback *_migration_test database" }, work);
const sql = await readFile(new URL("../database/039_workspace_site_draft_ownership.sql", import.meta.url), "utf8");
const owner = crypto.randomUUID(), other = crypto.randomUUID(), workspaceId = crypto.randomUUID();
const nodeId = crypto.randomUUID(), draftId = crypto.randomUUID();
const artifact = { artifact: { kind: "site_draft", id: draftId, title: "Owned draft" }, resultKey: "page" };

const fixture = async work => {
  const url = new URL(process.env.DATABASE_URL);
  if (!["127.0.0.1", "localhost", "[::1]"].includes(url.hostname) || !url.pathname.endsWith("_migration_test")) {
    throw new Error("A dedicated disposable loopback *_migration_test database is required");
  }
  const client = new pg.Client({ connectionString: url.toString() });
  const schema = `site_binding_${crypto.randomBytes(8).toString("hex")}`;
  await client.connect();
  try {
    await client.query("BEGIN");
    await client.query(`CREATE SCHEMA ${schema}`);
    await client.query(`SET LOCAL search_path = ${schema}`);
    await client.query(`CREATE TABLE agent_workspaces (id CHAR(36) PRIMARY KEY, user_id CHAR(36), status TEXT, result JSONB, last_operation TEXT);
      CREATE TABLE agent_workspace_nodes (id CHAR(36) PRIMARY KEY, workspace_id CHAR(36) REFERENCES agent_workspaces(id) ON DELETE CASCADE,
        user_id CHAR(36), node_key TEXT, agent_id TEXT, capability TEXT, status TEXT, result JSONB);
      CREATE TABLE station_site_drafts (id CHAR(36) PRIMARY KEY, user_id CHAR(36) NOT NULL, status TEXT, draft JSONB)`);
    await client.query("INSERT INTO agent_workspaces VALUES($1,$2,'awaiting_confirmation',$3::jsonb,NULL)", [workspaceId, owner, JSON.stringify(artifact)]);
    await client.query("INSERT INTO agent_workspace_nodes VALUES($1,$2,$3,'page','site-builder','site.compose','succeeded',$4::jsonb)", [nodeId, workspaceId, owner, JSON.stringify(artifact)]);
    await client.query("INSERT INTO station_site_drafts VALUES($1,$2,'draft','{}'::jsonb)", [draftId, owner]);
    await work(client);
  } finally {
    await client.query("ROLLBACK");
    assert.equal((await client.query("SELECT to_regnamespace($1) AS name", [schema])).rows[0].name, null);
    await client.end();
  }
};

const concurrentFixture = async work => {
  const url = new URL(process.env.DATABASE_URL);
  if (!["127.0.0.1", "localhost", "[::1]"].includes(url.hostname) || !url.pathname.endsWith("_migration_test")) {
    throw new Error("A dedicated disposable loopback *_migration_test database is required");
  }
  const schema = `site_binding_locks_${crypto.randomBytes(8).toString("hex")}`;
  const client = new pg.Client({ connectionString: url.toString() });
  await client.connect();
  try {
    await client.query(`CREATE SCHEMA ${schema}`);
    await client.query(`SET search_path TO ${schema}, pg_catalog`);
    await client.query(`CREATE TABLE agent_workspaces (id CHAR(36) PRIMARY KEY, user_id CHAR(36), status TEXT, result JSONB, last_operation TEXT);
      CREATE TABLE agent_workspace_nodes (id CHAR(36) PRIMARY KEY, workspace_id CHAR(36) REFERENCES agent_workspaces(id) ON DELETE CASCADE,
        user_id CHAR(36), node_key TEXT, agent_id TEXT, capability TEXT, status TEXT, result JSONB);
      CREATE TABLE station_site_drafts (id CHAR(36) PRIMARY KEY, user_id CHAR(36) NOT NULL, status TEXT, draft JSONB)`);
    await client.query("INSERT INTO agent_workspaces VALUES($1,$2,'awaiting_confirmation',$3::jsonb,NULL)", [workspaceId, owner, JSON.stringify(artifact)]);
    await client.query("INSERT INTO agent_workspace_nodes VALUES($1,$2,$3,'page','site-builder','site.compose','succeeded',$4::jsonb)", [nodeId, workspaceId, owner, JSON.stringify(artifact)]);
    await client.query("INSERT INTO station_site_drafts VALUES($1,$2,'draft','{}'::jsonb)", [draftId, owner]);
    await work({ url: url.toString(), schema });
  } finally {
    try {
      await client.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
      assert.equal((await client.query("SELECT to_regnamespace($1) AS name", [schema])).rows[0].name, null);
    } finally {
      await client.end();
    }
  }
};

integration("039 binds an exact unconfirmed node and leaves standalone drafts independent", () => fixture(async client => {
  const standalone = crypto.randomUUID();
  await client.query("INSERT INTO station_site_drafts VALUES($1,$2,'draft','{}'::jsonb)", [standalone, owner]);
  await client.query(sql);
  const rows = (await client.query("SELECT id,workspace_node_id FROM station_site_drafts ORDER BY id")).rows;
  assert.equal(rows.find(row => row.id === draftId).workspace_node_id, nodeId);
  assert.equal(rows.find(row => row.id === standalone).workspace_node_id, null);
}));

integration("039 preserves a confirmed page after another page made its status draft", () => fixture(async client => {
  await client.query("UPDATE agent_workspaces SET status='succeeded',last_operation='confirm'");
  await client.query(sql);
  assert.equal((await client.query("SELECT workspace_node_id FROM station_site_drafts")).rows[0].workspace_node_id, null);
  await client.query("DELETE FROM agent_workspaces");
  assert.equal((await client.query("SELECT count(*)::int AS count FROM station_site_drafts")).rows[0].count, 1);
}));

integration("039 binds succeeded task intermediate pages that were never the confirmed result", () => fixture(async client => {
  await client.query("UPDATE agent_workspaces SET status='succeeded',result=$1::jsonb", [JSON.stringify({ artifact: { kind: "text_result" }, resultKey: "summary" })]);
  await client.query(sql);
  assert.equal((await client.query("SELECT workspace_node_id FROM station_site_drafts")).rows[0].workspace_node_id, nodeId);
}));

integration("039 rejects ambiguous site provenance before publishing any migration", () => fixture(async client => {
  await client.query("INSERT INTO agent_workspace_nodes SELECT $1,workspace_id,user_id,'duplicate',agent_id,capability,status,result FROM agent_workspace_nodes", [crypto.randomUUID()]);
  await assert.rejects(client.query(sql), /WORKSPACE_SITE_DRAFT_OWNERSHIP_AMBIGUOUS/);
}));

integration("039 rejects cross-account, undeclared or unfinished historical ownership", async () => {
  for (const mutation of ["user_id='" + other + "'", "capability='text.summarize'", "status='running'"]) {
    await fixture(async client => {
      await client.query(`UPDATE agent_workspace_nodes SET ${mutation}`);
      await assert.rejects(client.query(sql), /WORKSPACE_SITE_DRAFT_OWNERSHIP_CONFLICT/);
    });
  }
});

integration("039 enforces same-owner association and one pending draft per node", async () => {
  await fixture(async client => {
    await client.query(sql);
    await assert.rejects(client.query("UPDATE station_site_drafts SET user_id=$1", [other]), issue => issue.code === "23503");
  });
  await fixture(async client => {
    await client.query(sql);
    await assert.rejects(client.query("INSERT INTO station_site_drafts VALUES($1,$2,'draft','{}'::jsonb,$3)", [crypto.randomUUID(), owner, nodeId]), issue => issue.code === "23505");
  });
});

integration("039 cascades pending draft cleanup but preserves an atomically detached saved page", async () => {
  await fixture(async client => {
    await client.query(sql);
    await client.query("DELETE FROM agent_workspaces");
    assert.equal((await client.query("SELECT count(*)::int AS count FROM station_site_drafts")).rows[0].count, 0);
  });
  await fixture(async client => {
    await client.query(sql);
    await client.query("UPDATE station_site_drafts SET status='applied',workspace_node_id=NULL");
    await client.query("DELETE FROM agent_workspaces");
    assert.equal((await client.query("SELECT count(*)::int AS count FROM station_site_drafts")).rows[0].count, 1);
  });
});

integration("039 forbids a saved page from retaining its collaborative authorization binding", () => fixture(async client => {
  await client.query(sql);
  await assert.rejects(client.query("UPDATE station_site_drafts SET status='applied'"), issue => issue.code === "23514");
}));

integration("039 lock inversion is detected, rolled back, and can be retried after readers drain", () => concurrentFixture(async ({ url, schema }) => {
  const reader = new pg.Client({ connectionString: url });
  const migrator = new pg.Client({ connectionString: url });
  const observer = new pg.Client({ connectionString: url });
  await Promise.all([reader.connect(), migrator.connect(), observer.connect()]);
  const setSchema = client => client.query(`SET search_path TO ${schema}, pg_catalog`);
  try {
    await Promise.all([setSchema(reader), setSchema(migrator), setSchema(observer)]);
    await reader.query("BEGIN");
    await reader.query("SELECT id FROM station_site_drafts WHERE id=$1", [draftId]);
    const relationOids = (await observer.query(`SELECT
      '"${schema}".agent_workspace_nodes'::regclass::oid AS node_oid,
      '"${schema}".station_site_drafts'::regclass::oid AS draft_oid`)).rows[0];

    await migrator.query("BEGIN");
    await migrator.query("SET LOCAL lock_timeout = '8s'");
    await migrator.query("SET LOCAL statement_timeout = '10s'");
    const migrationPid = (await migrator.query("SELECT pg_backend_pid() AS pid")).rows[0].pid;
    const migrationRequest = migrator.query(sql).then(
      value => ({ value }),
      async error => {
        await migrator.query("ROLLBACK").catch(() => {});
        return { error };
      },
    );
    let lockCycleReady = false;
    const deadline = Date.now() + 4000;
    while (Date.now() < deadline) {
      const locks = (await observer.query(`SELECT
        EXISTS (SELECT 1 FROM pg_locks WHERE pid=$1 AND relation=$2::oid AND mode='AccessExclusiveLock' AND granted) AS holds_node,
        EXISTS (SELECT 1 FROM pg_locks WHERE pid=$1 AND relation=$3::oid AND mode='AccessExclusiveLock' AND NOT granted) AS waits_draft`,
      [migrationPid, relationOids.node_oid, relationOids.draft_oid])).rows[0];
      if (locks.holds_node && locks.waits_draft) {
        lockCycleReady = true;
        break;
      }
      await new Promise(resolve => setTimeout(resolve, 20));
    }
    assert.equal(lockCycleReady, true, "migration must hold the node lock while waiting for the draft lock");

    const readRequest = reader.query("SELECT id FROM agent_workspace_nodes WHERE id=$1", [nodeId]).then(
      value => ({ value }),
      async error => {
        await reader.query("ROLLBACK").catch(() => {});
        return { error };
      },
    );
    const [migrationResult, readResult] = await Promise.all([migrationRequest, readRequest]);
    assert.equal([migrationResult.error, readResult.error].some(error => error?.code === "40P01"), true,
      "PostgreSQL must detect the migration/read lock cycle as a deadlock");
    await reader.query("ROLLBACK").catch(() => {});
    await migrator.query("ROLLBACK").catch(() => {});

    const uncommittedColumn = (await observer.query(`SELECT count(*)::int AS count FROM information_schema.columns
      WHERE table_schema=$1 AND table_name='station_site_drafts' AND column_name='workspace_node_id'`, [schema])).rows[0].count;
    assert.equal(uncommittedColumn, 0, "failed migration must leave no partial schema change");

    const migration = { filename: "039_workspace_site_draft_ownership.sql", sql };
    assert.deepEqual(await applyPendingMigrations({ client: migrator, migrations: [migration] }), {
      applied: [migration.filename],
      skipped: [],
    });
    assert.deepEqual(await applyPendingMigrations({ client: migrator, migrations: [migration] }), {
      applied: [],
      skipped: [migration.filename],
    });
  } finally {
    await reader.query("ROLLBACK").catch(() => {});
    await migrator.query("ROLLBACK").catch(() => {});
    await Promise.all([reader.end(), migrator.end(), observer.end()]);
  }
}));
