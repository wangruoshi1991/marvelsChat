import pg from "pg";
import { config } from "../src/config.js";
import { loadMigrationFiles } from "../src/migration-files.js";
import { applyPendingMigrations } from "../src/migration-ledger.js";

const { Client } = pg;

const assertDatabaseName = (database) => {
  if (!/^[a-zA-Z0-9_]+$/.test(database)) {
    throw new Error("POSTGRES_DATABASE can only contain letters, numbers, or _.");
  }
};

async function createDatabaseIfNeeded() {
  assertDatabaseName(config.db.database);
  const client = new Client({
    host: config.db.host,
    port: config.db.port,
    user: config.db.user,
    password: config.db.password,
    database: "postgres",
  });

  await client.connect();
  try {
    const existing = await client.query(
      "SELECT 1 FROM pg_database WHERE datname = $1",
      [config.db.database],
    );
    if (!existing.rows.length) {
      await client.query(`CREATE DATABASE "${config.db.database}"`);
    }
  } finally {
    await client.end();
  }
}

async function createClient() {
  const client = config.db.databaseUrl
    ? new Client({
        connectionString: config.db.databaseUrl,
      })
    : new Client({
        host: config.db.host,
        port: config.db.port,
        user: config.db.user,
        password: config.db.password,
        database: config.db.database,
      });
  await client.connect();
  return client;
}

async function main() {
  if (!config.db.configured) {
    throw new Error(
      "PostgreSQL is not configured. Copy backend/.env.example to backend/.env and set POSTGRES_* values.",
    );
  }

  const migrations = await loadMigrationFiles();

  if (!config.db.databaseUrl) {
    await createDatabaseIfNeeded();
  }

  const client = await createClient();
  try {
    const databaseResult = await client.query(
      "SELECT current_database() AS database_name",
    );
    const databaseName =
      databaseResult.rows[0]?.database_name || config.db.database;
    const migrationResult = await applyPendingMigrations({
      client,
      migrations,
    });

    console.log(`PostgreSQL migration completed for ${databaseName}.`);
    console.log(
      `Schema migrations: ${migrationResult.applied.length} applied, ${migrationResult.skipped.length} unchanged.`,
    );
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
