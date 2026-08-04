import assert from "node:assert/strict";
import test from "node:test";

import {
  applyPendingMigrations,
  migrationChecksum,
} from "../src/migration-ledger.js";

const migration = (filename, sql) => ({ filename, sql });

class FakeClient {
  constructor({ applied = [], failSql = "" } = {}) {
    this.applied = new Map(applied.map((item) => [item.filename, item]));
    this.calls = [];
    this.failSql = failSql;
  }

  async query(sql, params = []) {
    const normalized = String(sql).trim();
    this.calls.push({ sql: normalized, params });
    if (normalized.startsWith("SELECT filename, checksum")) {
      return { rows: [...this.applied.values()] };
    }
    if (normalized.startsWith("INSERT INTO schema_migrations")) {
      this.applied.set(params[0], {
        filename: params[0],
        checksum: params[1],
      });
    }
    if (this.failSql && normalized === this.failSql) {
      throw new Error("migration failed");
    }
    return { rows: [] };
  }
}

test("pending migrations run in filename order and are recorded atomically", async () => {
  const client = new FakeClient();
  const result = await applyPendingMigrations({
    client,
    migrations: [
      migration("002_second.sql", "SELECT 'second'"),
      migration("001_first.sql", "SELECT 'first'"),
    ],
  });

  assert.deepEqual(result, {
    applied: ["001_first.sql", "002_second.sql"],
    skipped: [],
  });
  assert.deepEqual(
    client.calls
      .filter((call) => call.sql.startsWith("SELECT '") || call.sql === "BEGIN" || call.sql === "COMMIT")
      .map((call) => call.sql),
    ["BEGIN", "SELECT 'first'", "COMMIT", "BEGIN", "SELECT 'second'", "COMMIT"],
  );
  assert.equal(client.applied.get("001_first.sql").checksum, migrationChecksum("SELECT 'first'"));
});

test("matching applied migrations are skipped", async () => {
  const sql = "SELECT 'already applied'";
  const client = new FakeClient({
    applied: [{ filename: "001_first.sql", checksum: migrationChecksum(sql) }],
  });

  const result = await applyPendingMigrations({
    client,
    migrations: [migration("001_first.sql", sql)],
  });

  assert.deepEqual(result, { applied: [], skipped: ["001_first.sql"] });
  assert.equal(client.calls.some((call) => call.sql === "BEGIN"), false);
});

test("edited or deleted historical migrations fail before schema changes", async () => {
  const editedClient = new FakeClient({
    applied: [{
      filename: "001_first.sql",
      checksum: migrationChecksum("SELECT 'original'"),
    }],
  });
  await assert.rejects(
    () => applyPendingMigrations({
      client: editedClient,
      migrations: [migration("001_first.sql", "SELECT 'edited'")],
    }),
    /checksum mismatch/,
  );
  assert.equal(editedClient.calls.some((call) => call.sql === "BEGIN"), false);

  const deletedClient = new FakeClient({
    applied: [{ filename: "001_missing.sql", checksum: "a".repeat(64) }],
  });
  await assert.rejects(
    () => applyPendingMigrations({ client: deletedClient, migrations: [] }),
    /migration file is missing/,
  );
  assert.equal(deletedClient.calls.some((call) => call.sql === "BEGIN"), false);
});

test("failed migration rolls back and always releases the advisory lock", async () => {
  const client = new FakeClient({ failSql: "SELECT 'broken'" });

  await assert.rejects(
    () => applyPendingMigrations({
      client,
      migrations: [migration("001_broken.sql", "SELECT 'broken'")],
    }),
    /migration failed/,
  );

  assert.equal(client.calls.some((call) => call.sql === "ROLLBACK"), true);
  assert.equal(
    client.calls.at(-1).sql,
    "SELECT pg_advisory_unlock($1)",
  );
});

test("migration filenames are constrained before acquiring a lock", async () => {
  const client = new FakeClient();
  await assert.rejects(
    () => applyPendingMigrations({
      client,
      migrations: [migration("1-bad-name.sql", "SELECT 1")],
    }),
    /Invalid migration filename/,
  );
  assert.equal(client.calls.length, 0);
});
