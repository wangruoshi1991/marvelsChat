import pg from "pg";
import { config } from "../src/config.js";
import { createConnectionAdapter } from "../src/db.js";
import { bootstrapDefaultAdmin } from "../src/default-admin-bootstrap.js";
import { loadMigrationFiles } from "../src/migration-files.js";
import { checkMigrationStatus } from "../src/migration-ledger.js";

const { Client } = pg;

async function createClient() {
  const client = config.db.databaseUrl
    ? new Client({ connectionString: config.db.databaseUrl })
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
      "PostgreSQL is not configured. Set DATABASE_URL or POSTGRES_* first.",
    );
  }
  if (!config.defaultAdmin.enabled) {
    throw new Error(
      "Set DEFAULT_ADMIN_ENABLED=true only for this one-time bootstrap command.",
    );
  }

  const client = await createClient();
  try {
    const migrations = await loadMigrationFiles();
    const migrationStatus = await checkMigrationStatus({ client, migrations });
    if (!migrationStatus.current) {
      throw new Error(
        `Database migrations are not current: ${migrationStatus.message || migrationStatus.pending.join(", ")}`,
      );
    }

    await client.query("BEGIN");
    let result;
    try {
      result = await bootstrapDefaultAdmin(
        createConnectionAdapter(client),
        config.defaultAdmin,
      );
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    }

    console.log(
      `${result.created ? "Created" : "Updated"} default super admin: ${config.defaultAdmin.loginName}`,
    );
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
