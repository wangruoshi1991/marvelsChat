import assert from "node:assert/strict";
import crypto from "node:crypto";
import test, { after, before } from "node:test";
import pg from "pg";
import { applyPendingMigrations } from "../src/migration-ledger.js";
import { loadMigrationFiles } from "../src/migration-files.js";
import { createConnectionAdapter } from "../src/db.js";
import { ensureDefaultButlerAccess } from "../src/repositories.js";
import { getAgent } from "../../agents/registry.js";
import { computeAgentReleaseContractHash } from "../../shared/agent-catalog.js";

const enabled = process.env.RUN_DEFAULT_BUTLER_MIGRATION_INTEGRATION === "1";
const databaseUrl = String(process.env.DEFAULT_BUTLER_MIGRATION_DATABASE_URL || "").trim();
const fullScopes = ["profile:read", "messages:read", "agents:invoke", "station:read", "album:read"];
const ids = {
  missing: "10101010-1010-4010-8010-101010101010",
  disabled: "20202020-2020-4020-8020-202020202020",
  incomplete: "30303030-3030-4030-8030-303030303030",
  complete: "40404040-4040-4040-8040-404040404040",
};

let pool;

const assertDedicatedDatabase = (value) => {
  const parsed = new URL(value);
  assert.ok(["127.0.0.1", "localhost", "[::1]"].includes(parsed.hostname), "migration test must use loopback PostgreSQL");
  const name = decodeURIComponent(parsed.pathname.slice(1));
  assert.notEqual(name, "marvels_chat", "migration test must never connect to marvels_chat");
  assert.ok(name.endsWith("_migration_test"), "migration test database must end with _migration_test");
};

const query = (sql, params = []) => pool.query(sql, params);

if (!enabled) {
  test("default Butler migration requires an isolated loopback _migration_test PostgreSQL database", {
    skip: "RUN_DEFAULT_BUTLER_MIGRATION_INTEGRATION=1 and DEFAULT_BUTLER_MIGRATION_DATABASE_URL are required",
  }, () => {});
} else if (!databaseUrl) {
  test("default Butler migration integration requires a dedicated database URL", () => {
    assert.fail("Set DEFAULT_BUTLER_MIGRATION_DATABASE_URL to a loopback _migration_test database.");
  });
} else {
  before(async () => {
    assertDedicatedDatabase(databaseUrl);
    pool = new pg.Pool({ connectionString: databaseUrl, max: 2 });
    const client = await pool.connect();
    try {
      const result = await client.query("SELECT COUNT(*)::int AS count FROM pg_tables WHERE schemaname = 'public'");
      assert.equal(result.rows[0].count, 0, "migration database must start empty");
      const migrations = await loadMigrationFiles();
      const target = "040_default_butler_access.sql";
      await applyPendingMigrations({ client, migrations: migrations.filter(item => item.filename < target) });
      for (const [index, [id, suffix]] of Object.entries(ids).entries()) {
        await client.query(
          "INSERT INTO users (id, email, password_hash, display_name, ai_id) VALUES ($1, $2, 'test-only', $3, $4)",
          [suffix, `${id}@migration.test`, `Migration ${id}`, String(index + 1).padStart(12, "0")],
        );
      }
      await client.query(
        "INSERT INTO user_agents (user_id, agent_id, alias, enabled, granted_scopes) VALUES ($1, 'miaoxun-butler', '自定义管家', FALSE, '[]'::jsonb), ($2, 'miaoxun-butler', '旧管家', TRUE, '[\"profile:read\"]'::jsonb), ($3, 'miaoxun-butler', '我的管家', TRUE, $4::jsonb)",
        [ids.disabled, ids.incomplete, ids.complete, JSON.stringify(fullScopes)],
      );
      await client.query(
        "INSERT INTO chat_threads (id, user_id, title, status_text, avatar_text, agent_id, kind) VALUES ($1, $2, '旧会话', '已停用', '旧', 'miaoxun-butler', 'agent'), ($3, $4, '我的会话', '在线 · Agent', '我', 'miaoxun-butler', 'agent')",
        [crypto.randomUUID(), ids.disabled, crypto.randomUUID(), ids.complete],
      );
      // ensureDefaultButlerAccess now reads the current operator-published
      // identity contract. This migration fixture predates migration 044, so
      // provide the minimal release-backed catalog row explicitly instead of
      // relying on a legacy user_agents grant.
      await client.query(`
        CREATE TABLE agent_catalog (
          agent_id VARCHAR(80) PRIMARY KEY,
          display_name VARCHAR(120),
          description TEXT,
          identity_mark VARCHAR(40),
          identity_shape VARCHAR(20),
          identity_colors JSONB NOT NULL DEFAULT '{}'::jsonb,
          published BOOLEAN NOT NULL DEFAULT TRUE,
          status VARCHAR(20) NOT NULL DEFAULT 'unpublished',
          release_version VARCHAR(80),
          contract_hash CHAR(64),
          source VARCHAR(80) NOT NULL DEFAULT 'migration-test',
          updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
        )`);
      const registeredButler = await getAgent("miaoxun-butler");
      const identity = {
        key: registeredButler.key,
        avatarKind: "agent-mark",
        displayName: "妙讯管家",
        description: "默认妙讯管家",
        mark: "妙",
        shape: "rounded",
        colors: { background: "#f4efe7", foreground: "#2d2926", accent: "#c78b5d" },
        published: true,
        source: "migration-test",
        updatedAt: "2026-10-30T00:00:00.000Z",
      };
      const contractHash = computeAgentReleaseContractHash({
        key: registeredButler.key,
        version: registeredButler.version,
        permissions: registeredButler.permissions,
        identity,
      });
      await client.query(
        `INSERT INTO agent_catalog
          (agent_id, display_name, description, identity_mark, identity_shape, identity_colors, status, release_version, contract_hash)
         VALUES ('miaoxun-butler', $1, $2, $3, $4, $5::jsonb, 'published', $6, $7)`,
        [identity.displayName, identity.description, identity.mark, identity.shape, JSON.stringify(identity.colors), registeredButler.version, contractHash],
      );
      const completeThread = await client.query("SELECT id FROM chat_threads WHERE user_id = $1", [ids.complete]);
      await client.query(
        "INSERT INTO chat_messages (id, thread_id, user_id, sender_type, sender_name, content, metadata) VALUES ($1, $2, $3, 'agent', '我的管家', '已有消息', '{}'::jsonb)",
        [crypto.randomUUID(), completeThread.rows[0].id, ids.complete],
      );
    } finally {
      client.release();
    }
  });

  after(async () => {
    if (!pool) return;
    await query("DELETE FROM users WHERE id = ANY($1::text[])", [Object.values(ids)]);
    await pool.end();
  });

  test("040 enables every existing Butler row, preserves aliases, and creates one usable thread/welcome", async () => {
    const migrations = await loadMigrationFiles();
    const target = migrations.find(item => item.filename === "040_default_butler_access.sql");
    assert.ok(target);
    const client = await pool.connect();
    try {
      await applyPendingMigrations({ client, migrations });

      const grants = await client.query("SELECT user_id, alias, enabled, granted_scopes FROM user_agents WHERE agent_id = 'miaoxun-butler' ORDER BY user_id");
      assert.equal(grants.rows.length, 4);
      for (const row of grants.rows) {
        assert.equal(row.enabled, true);
        assert.deepEqual(row.granted_scopes, fullScopes);
      }
      assert.equal(grants.rows.find(row => row.user_id === ids.disabled).alias, "自定义管家");
      assert.equal(grants.rows.find(row => row.user_id === ids.incomplete).alias, "旧管家");
      assert.equal(grants.rows.find(row => row.user_id === ids.complete).alias, "我的管家");
      assert.equal(grants.rows.find(row => row.user_id === ids.missing).alias, "妙讯管家");

      const threads = await client.query("SELECT user_id, title, status_text, kind FROM chat_threads WHERE agent_id = 'miaoxun-butler' ORDER BY user_id");
      assert.equal(threads.rows.length, 4);
      assert.ok(threads.rows.every(row => row.status_text === "在线 · Agent" && row.kind === "agent"));
      assert.equal(threads.rows.find(row => row.user_id === ids.disabled).title, "旧会话");

      const messages = await client.query("SELECT t.user_id, m.sender_name, m.content, m.metadata FROM chat_threads t JOIN chat_messages m ON m.thread_id = t.id WHERE t.agent_id = 'miaoxun-butler' ORDER BY t.user_id");
      assert.equal(messages.rows.length, 4);
      for (const [userId, alias] of [[ids.missing, "妙讯管家"], [ids.disabled, "自定义管家"], [ids.incomplete, "旧管家"]]) {
        const welcome = messages.rows.find(row => row.user_id === userId);
        assert.equal(welcome.sender_name, alias);
        assert.equal(welcome.content, `${alias} 已添加，可以开始对话。`);
        assert.deepEqual(welcome.metadata, { source: "account_default", agentId: "miaoxun-butler" });
      }
      const existingMessage = messages.rows.find(row => row.user_id === ids.complete);
      assert.equal(existingMessage.content, "已有消息");
    } finally {
      client.release();
    }
  });

  test("040 is ledger-safe when applied again", async () => {
    const migrations = await loadMigrationFiles();
    const target = migrations.find(item => item.filename === "040_default_butler_access.sql");
    const client = await pool.connect();
    try {
      const result = await applyPendingMigrations({ client, migrations });
      assert.deepEqual(result.applied, []);
      assert.ok(result.skipped.includes("040_default_butler_access.sql"));
      const counts = await client.query("SELECT (SELECT COUNT(*) FROM user_agents WHERE agent_id = 'miaoxun-butler') AS grants, (SELECT COUNT(*) FROM chat_threads WHERE agent_id = 'miaoxun-butler') AS threads, (SELECT COUNT(*) FROM chat_messages WHERE metadata->>'agentId' = 'miaoxun-butler') AS welcomes");
      assert.deepEqual(counts.rows[0], { grants: "4", threads: "4", welcomes: "3" });

      const before = await client.query("SELECT * FROM (SELECT 'grant' AS kind, to_jsonb(row) AS value FROM user_agents row WHERE agent_id = 'miaoxun-butler' UNION ALL SELECT 'thread', to_jsonb(row) FROM chat_threads row WHERE agent_id = 'miaoxun-butler' UNION ALL SELECT 'message', to_jsonb(row) FROM chat_messages row WHERE metadata->>'agentId' = 'miaoxun-butler') snapshot ORDER BY kind, value::text");
      await client.query("BEGIN");
      try {
        await client.query(target.sql);
        await client.query("COMMIT");
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      }
      const after = await client.query("SELECT * FROM (SELECT 'grant' AS kind, to_jsonb(row) AS value FROM user_agents row WHERE agent_id = 'miaoxun-butler' UNION ALL SELECT 'thread', to_jsonb(row) FROM chat_threads row WHERE agent_id = 'miaoxun-butler' UNION ALL SELECT 'message', to_jsonb(row) FROM chat_messages row WHERE metadata->>'agentId' = 'miaoxun-butler') snapshot ORDER BY kind, value::text");
      assert.deepEqual(after.rows, before.rows);
    } finally {
      client.release();
    }
  });

  test("account default reconciliation preserves aliases and is database-idempotent", async () => {
    const client = await pool.connect();
    const connection = createConnectionAdapter(client);
    const snapshotSql = `SELECT * FROM (
      SELECT 'grant' AS kind, to_jsonb(row) AS value FROM user_agents row WHERE user_id = $1
      UNION ALL SELECT 'thread', to_jsonb(row) FROM chat_threads row WHERE user_id = $1
      UNION ALL SELECT 'message', to_jsonb(row) FROM chat_messages row WHERE user_id = $1
      UNION ALL SELECT 'event', to_jsonb(row) FROM usage_events row WHERE user_id = $1
    ) snapshot ORDER BY kind, value::text`;
    const reconcile = async (userId) => {
      await client.query("BEGIN");
      try {
        const result = await ensureDefaultButlerAccess({ userId, connection });
        await client.query("COMMIT");
        return result;
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      }
    };
    try {
      for (const [userId, enabled, alias] of [
        [ids.disabled, false, "自定义管家"],
        [ids.incomplete, true, "旧管家"],
      ]) {
        await client.query(
          "UPDATE user_agents SET enabled = $2, granted_scopes = '[\"profile:read\"]'::jsonb WHERE user_id = $1 AND agent_id = 'miaoxun-butler'",
          [userId, enabled],
        );
        await client.query(
          "UPDATE chat_threads SET status_text = '已停用', kind = 'direct' WHERE user_id = $1 AND agent_id = 'miaoxun-butler'",
          [userId],
        );

        assert.deepEqual(await reconcile(userId), {
          added: false,
          enabled: true,
          grantedScopes: fullScopes,
        });
        const grant = await client.query("SELECT alias, enabled, granted_scopes FROM user_agents WHERE user_id = $1", [userId]);
        assert.deepEqual(grant.rows, [{ alias, enabled: true, granted_scopes: fullScopes }]);
        const threads = await client.query("SELECT status_text, kind FROM chat_threads WHERE user_id = $1", [userId]);
        assert.deepEqual(threads.rows, [{ status_text: "在线 · Agent", kind: "agent" }]);
        const events = await client.query("SELECT event_type, payload FROM usage_events WHERE user_id = $1", [userId]);
        assert.deepEqual(events.rows, [{
          event_type: "agent.access.default_granted",
          payload: { grantedScopes: fullScopes, source: "account_default" },
        }]);

        const before = await client.query(snapshotSql, [userId]);
        await reconcile(userId);
        const after = await client.query(snapshotSql, [userId]);
        assert.deepEqual(after.rows, before.rows);
      }
    } finally {
      client.release();
    }
  });
}
