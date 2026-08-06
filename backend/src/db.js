import pg from "pg";
import { config } from "./config.js";
import { HttpError } from "./http-error.js";
import { loadMigrationFiles } from "./migration-files.js";
import { checkMigrationStatus } from "./migration-ledger.js";

let pool;
let expectedMigrationsPromise;

const { Pool } = pg;

function prepareSql(sql) {
  let index = 0;
  return String(sql).replace(/\?/g, () => `$${++index}`);
}

const normalizeRows = (result) => result.rows || [];

export function createConnectionAdapter(client) {
  return {
    query: async (sql, params = []) => normalizeRows(await client.query(prepareSql(sql), params)),
    execute: async (sql, params = []) => [
      normalizeRows(await client.query(prepareSql(sql), params)),
    ],
  };
}

export async function getPool() {
  if (!config.db.configured) {
    throw new HttpError(
      503,
      "PostgreSQL is not configured. Set DATABASE_URL or POSTGRES_HOST/POSTGRES_USER/POSTGRES_DATABASE.",
    );
  }

  if (!pool) {
    pool = config.db.databaseUrl
      ? new Pool({
          connectionString: config.db.databaseUrl,
          max: config.db.connectionLimit,
        })
      : new Pool({
          host: config.db.host,
          port: config.db.port,
          user: config.db.user,
          password: config.db.password,
          database: config.db.database,
          max: config.db.connectionLimit,
        });
  }

  return pool;
}

export async function query(sql, params = []) {
  const db = await getPool();
  const result = await db.query(prepareSql(sql), params);
  return normalizeRows(result);
}

export async function closeDatabase() {
  const activePool = pool;
  pool = undefined;
  if (activePool) await activePool.end();
}

export async function withTransaction(work) {
  const db = await getPool();
  const client = await db.connect();
  const connection = createConnectionAdapter(client);

  try {
    await client.query("BEGIN");
    const result = await work(connection);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function checkDatabase() {
  if (!config.db.configured) {
    return {
      configured: false,
      connected: false,
      message: "PostgreSQL is not configured",
    };
  }

  let db;
  try {
    db = await getPool();
    await db.query("SELECT 1 AS ok");
  } catch (error) {
    return {
      configured: true,
      connected: false,
      database: config.db.database,
      message: error.message,
    };
  }

  try {
    expectedMigrationsPromise ||= loadMigrationFiles();
    const migrations = await expectedMigrationsPromise;
    const migrationStatus = await checkMigrationStatus({ client: db, migrations });
    return {
      configured: true,
      connected: true,
      migrationsCurrent: migrationStatus.current,
      database: config.db.database,
      ...(!migrationStatus.current && { message: migrationStatus.message || "Database migrations are pending" }),
    };
  } catch (error) {
    return {
      configured: true,
      connected: true,
      migrationsCurrent: false,
      database: config.db.database,
      message: error.message,
    };
  }
}
