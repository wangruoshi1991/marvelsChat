import crypto from "crypto";

const migrationLockId = 82430117;
const migrationFilenamePattern = /^\d{3}_[a-z0-9_]+\.sql$/;

export const migrationChecksum = (sql) =>
  crypto.createHash("sha256").update(sql, "utf8").digest("hex");

const validateMigrations = (migrations) => {
  const filenames = new Set();
  for (const migration of migrations) {
    if (!migrationFilenamePattern.test(migration.filename)) {
      throw new Error(`Invalid migration filename: ${migration.filename}`);
    }
    if (filenames.has(migration.filename)) {
      throw new Error(`Duplicate migration filename: ${migration.filename}`);
    }
    filenames.add(migration.filename);
  }
  return filenames;
};

const ensureMigrationLedger = async (client) => {
  await client.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      filename VARCHAR(255) PRIMARY KEY,
      checksum CHAR(64) NOT NULL,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);
};

const readAppliedMigrations = async (client) => {
  const result = await client.query(
    "SELECT filename, checksum, applied_at FROM schema_migrations ORDER BY filename",
  );
  return new Map(result.rows.map((row) => [row.filename, row]));
};

const migrationLedgerExists = async (client) => {
  const result = await client.query(
    "SELECT to_regclass('public.schema_migrations') AS table_name",
  );
  return Boolean(result.rows[0]?.table_name);
};

const assertLedgerMatchesFiles = ({ applied, migrations, filenames }) => {
  for (const filename of applied.keys()) {
    if (!filenames.has(filename)) {
      throw new Error(`Applied migration file is missing: ${filename}`);
    }
  }

  for (const migration of migrations) {
    const recorded = applied.get(migration.filename);
    if (!recorded) continue;
    const checksum = migrationChecksum(migration.sql);
    if (String(recorded.checksum).trim() !== checksum) {
      throw new Error(
        `Migration checksum mismatch: ${migration.filename}. Historical migrations must not be edited.`,
      );
    }
  }
};

const applyMigration = async (client, migration) => {
  const checksum = migrationChecksum(migration.sql);
  await client.query("BEGIN");
  try {
    await client.query(migration.sql);
    await client.query(
      "INSERT INTO schema_migrations (filename, checksum) VALUES ($1, $2)",
      [migration.filename, checksum],
    );
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  }
};

export async function applyPendingMigrations({ client, migrations }) {
  const orderedMigrations = [...migrations].sort((left, right) =>
    left.filename.localeCompare(right.filename),
  );
  const filenames = validateMigrations(orderedMigrations);
  await client.query("SELECT pg_advisory_lock($1)", [migrationLockId]);

  try {
    await ensureMigrationLedger(client);
    const applied = await readAppliedMigrations(client);
    assertLedgerMatchesFiles({ applied, migrations: orderedMigrations, filenames });

    const appliedNow = [];
    const skipped = [];
    for (const migration of orderedMigrations) {
      if (applied.has(migration.filename)) {
        skipped.push(migration.filename);
        continue;
      }
      await applyMigration(client, migration);
      appliedNow.push(migration.filename);
    }
    return { applied: appliedNow, skipped };
  } finally {
    await client.query("SELECT pg_advisory_unlock($1)", [migrationLockId]);
  }
}

export async function checkMigrationStatus({ client, migrations }) {
  const orderedMigrations = [...migrations].sort((left, right) =>
    left.filename.localeCompare(right.filename),
  );
  const filenames = validateMigrations(orderedMigrations);

  if (!(await migrationLedgerExists(client))) {
    return {
      current: false,
      appliedCount: 0,
      expectedCount: orderedMigrations.length,
      pending: orderedMigrations.map((migration) => migration.filename),
      message: "Migration ledger is missing",
    };
  }

  const applied = await readAppliedMigrations(client);
  const pending = orderedMigrations
    .filter((migration) => !applied.has(migration.filename))
    .map((migration) => migration.filename);

  try {
    assertLedgerMatchesFiles({ applied, migrations: orderedMigrations, filenames });
  } catch (error) {
    return {
      current: false,
      appliedCount: applied.size,
      expectedCount: orderedMigrations.length,
      pending,
      message: error.message,
    };
  }

  return {
    current: pending.length === 0,
    appliedCount: applied.size,
    expectedCount: orderedMigrations.length,
    pending,
  };
}
