import pg from "pg";
import { config } from "./config.js";
import { HttpError } from "./http-error.js";
import { loadMigrationFiles } from "./migration-files.js";
import { checkMigrationStatus } from "./migration-ledger.js";

let pool;
let leasePool;
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

function createDatabasePool(options) {
  if (!config.db.configured) {
    throw new HttpError(
      503,
      "PostgreSQL is not configured. Set DATABASE_URL or POSTGRES_HOST/POSTGRES_USER/POSTGRES_DATABASE.",
    );
  }

  const databasePool = new Pool(config.db.databaseUrl
    ? { connectionString: config.db.databaseUrl, ...options }
    : { host: config.db.host, port: config.db.port, user: config.db.user,
        password: config.db.password, database: config.db.database, ...options });
  databasePool.on("error", error => {
    console.error(JSON.stringify({ type: "database_pool_error", errorCode: error.code || null }));
  });
  return databasePool;
}

export async function getPool() {
  return pool ??= createDatabasePool({ max: config.db.connectionLimit });
}

export async function query(sql, params = []) {
  const db = await getPool();
  const result = await db.query(prepareSql(sql), params);
  return normalizeRows(result);
}

export async function closeDatabase() {
  const activePools = [pool, leasePool];
  pool = undefined;
  leasePool = undefined;
  await Promise.all(activePools.map(active => active?.end()));
}

export async function withTransaction(work) {
  return runTransaction(await getPool(), work);
}

export async function withLeaseTransaction(work, { signal } = {}) {
  signal?.throwIfAborted();
  // Bound connection setup and checkout without changing regular API queries.
  leasePool ??= createDatabasePool({ max: 1, connectionTimeoutMillis: 5000 });
  return runTransaction(leasePool, work, signal);
}

async function runTransaction(db, work, signal) {
  const client = await db.connect();
  const connection = createConnectionAdapter(client);
  let discarded = false;
  const discardClient = () => {
    // A busy connection must be closed for PostgreSQL to roll back uncommitted work.
    discarded = true;
    client.release(true);
  };
  signal?.addEventListener("abort", discardClient, { once: true });

  let began = false;
  try {
    signal?.throwIfAborted();
    await client.query("BEGIN");
    began = true;
    signal?.throwIfAborted();
    const result = await work(connection);
    signal?.throwIfAborted();
    await client.query("COMMIT");
    signal?.throwIfAborted();
    return result;
  } catch (error) {
    if (!discarded && began) await client.query("ROLLBACK");
    signal?.throwIfAborted();
    throw error;
  } finally {
    signal?.removeEventListener("abort", discardClient);
    if (!discarded) client.release();
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
