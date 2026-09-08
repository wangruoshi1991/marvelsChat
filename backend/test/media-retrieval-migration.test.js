import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test, { after, before } from "node:test";
import { fileURLToPath } from "node:url";
import pg from "pg";
import { createConnectionAdapter } from "../src/db.js";
import { createMediaRetrievalRepository } from "../src/media-retrieval-repository.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const backendDir = path.resolve(__dirname, "..");
const migrationPath = path.join(backendDir, "database", "027_media_retrieval_agent.sql");
const lifecycleMigrationPath = path.join(backendDir, "database", "028_media_retrieval_lifecycle_hardening.sql");
const provenanceMigrationPath = path.join(backendDir, "database", "029_media_retrieval_embedding_provenance.sql");
const composePath = path.join(backendDir, "docker-compose.test.yml");
const integrationEnabled = process.env.RUN_MEDIA_RETRIEVAL_MIGRATION_INTEGRATION === "1";
const externalDatabaseUrl = String(process.env.MEDIA_RETRIEVAL_MIGRATION_DATABASE_URL || "").trim();
const composeProject = `media-retrieval-product-${process.pid}`;

let databaseUrl = "";
let client;
let composeStarted = false;

const dockerAvailable = () => {
  try {
    execFileSync("docker", ["info"], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
};

const runCompose = (args) => {
  try {
    return execFileSync(
      "docker",
      ["compose", "-p", composeProject, "-f", composePath, ...args],
      { cwd: backendDir, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] },
    ).trim();
  } catch (error) {
    const detail = String(error.stderr || error.stdout || error.message || "").trim();
    throw new Error(`Disposable pgvector database failed: ${detail}`, { cause: error });
  }
};

const runAllMigrations = () => {
  try {
    execFileSync("npm", ["run", "db:migrate"], {
      cwd: backendDir,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
      env: {
        ...process.env,
        NODE_ENV: "test",
        DEFAULT_ADMIN_ENABLED: "false",
        DATABASE_URL: databaseUrl,
      },
    });
  } catch (error) {
    const detail = String(error.stderr || error.stdout || error.message || "").trim();
    throw new Error(`Migration run failed: ${detail}`, { cause: error });
  }
};

const assertDisposableExternalDatabase = async () => {
  const probe = new pg.Client({ connectionString: externalDatabaseUrl });
  let connected = false;
  try {
    await probe.connect();
    connected = true;
    const result = await probe.query(
      `SELECT current_database() AS database_name,
              (SELECT COUNT(*)::int FROM pg_tables WHERE schemaname = 'public') AS public_table_count`,
    );
    const databaseName = String(result.rows[0]?.database_name || "");
    if (!databaseName.endsWith("_migration_test")) {
      throw new Error("External migration database name must end with _migration_test.");
    }
    if (Number(result.rows[0]?.public_table_count) !== 0) {
      throw new Error("External migration database must have an empty public schema.");
    }
  } finally {
    if (connected) await probe.end();
  }
};

const vectorLiteral = (value) => `[${Array.from({ length: 1024 }, () => value).join(",")}]`;

const insertUser = async ({ id, email, displayName, aiId }) => {
  await client.query(
    `INSERT INTO users (id, email, password_hash, display_name, ai_id)
    VALUES ($1, $2, 'test-password-hash', $3, $4)`,
    [id, email, displayName, aiId],
  );
};

const insertAsset = async ({ id, userId, caption }) => {
  await client.query(
    `INSERT INTO station_media_assets
      (id, user_id, kind, storage_provider, storage_key, caption, status)
    VALUES ($1, $2, 'image', 'test', $3, $4, 'uploaded')`,
    [id, userId, `test/${id}.jpg`, caption],
  );
};

const insertReadySegment = async ({ id, userId, assetId, fingerprint, vectorValue }) => {
  await client.query(
    `INSERT INTO media_retrieval_segments
      (id, user_id, media_asset_id, segment_index, source_kind, descriptor,
       embedding, state, processing_version, content_fingerprint)
    VALUES ($1, $2, $3, 0, 'image', $4::jsonb, $5::vector, 'ready', 'product-v1', $6)`,
    [id, userId, assetId, JSON.stringify({ summary: "yellow dress", ocrText: [] }), vectorLiteral(vectorValue), fingerprint],
  );
};

const createRepository = () => {
  const connection = createConnectionAdapter(client);
  return createMediaRetrievalRepository({
    query: connection.query,
    withTransaction: async (work) => {
      await client.query("BEGIN");
      try {
        const result = await work(connection);
        await client.query("COMMIT");
        return result;
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      }
    },
  });
};

test("product migrations use the reserved 027-029 range and contain no PrivSearch schema", async () => {
  const [core, lifecycle, provenance] = await Promise.all([
    readFile(migrationPath, "utf8"),
    readFile(lifecycleMigrationPath, "utf8"),
    readFile(provenanceMigrationPath, "utf8"),
  ]);

  assert.match(core, /CREATE EXTENSION IF NOT EXISTS vector/i);
  assert.match(core, /CREATE TABLE IF NOT EXISTS agent_run_events/i);
  assert.match(core, /CREATE TABLE IF NOT EXISTS media_retrieval_segments/i);
  assert.match(core, /embedding vector\(1024\)/i);
  assert.match(lifecycle, /ADD COLUMN IF NOT EXISTS index_epoch/i);
  assert.match(lifecycle, /ADD COLUMN IF NOT EXISTS lease_expires_at/i);
  assert.match(lifecycle, /CREATE UNIQUE INDEX IF NOT EXISTS uniq_media_retrieval_ready_segment/i);
  assert.match(lifecycle, /CREATE TABLE IF NOT EXISTS media_retrieval_segment_staging/i);
  assert.match(provenance, /descriptor_provenance JSONB/i);
  assert.match(provenance, /embedding_provenance JSONB/i);
  assert.doesNotMatch(`${core}\n${lifecycle}\n${provenance}`, /privsearch/i);
});

if (integrationEnabled) {
  before(async () => {
    if (externalDatabaseUrl) {
      await assertDisposableExternalDatabase();
      databaseUrl = externalDatabaseUrl;
    } else {
      if (!dockerAvailable()) throw new Error("Docker is required for the pgvector integration gate.");
      runCompose(["up", "--wait", "--quiet-pull"]);
      composeStarted = true;
      const published = runCompose(["port", "postgres", "5432"]);
      const port = Number(published.match(/:(\d+)\s*$/m)?.[1]);
      if (!port) throw new Error("Disposable pgvector database did not publish a port.");
      databaseUrl = `postgresql://postgres:postgres@127.0.0.1:${port}/marvels_chat_test`;
    }
    runAllMigrations();
    runAllMigrations();
    client = new pg.Client({ connectionString: databaseUrl });
    await client.connect();
  });

  after(async () => {
    await client?.end();
    if (composeStarted) runCompose(["down", "--volumes", "--remove-orphans"]);
  });

  test("full main plus product migrations are repeatable and install the product-only pgvector schema", async () => {
    const extension = await client.query("SELECT extname FROM pg_extension WHERE extname = 'vector'");
    assert.deepEqual(extension.rows, [{ extname: "vector" }]);

    const dimension = await client.query(
      `SELECT atttypmod
      FROM pg_attribute
      WHERE attrelid = 'media_retrieval_segments'::regclass
        AND attname = 'embedding'`,
    );
    assert.equal(Number(dimension.rows[0]?.atttypmod), 1024);

    const indexes = await client.query(
      `SELECT indexdef FROM pg_indexes
      WHERE schemaname = 'public' AND indexname = 'idx_media_retrieval_segments_embedding_cosine'`,
    );
    assert.match(indexes.rows[0]?.indexdef || "", /USING hnsw.*vector_cosine_ops/i);

    const researchTables = await client.query(
      `SELECT to_regclass('public.privsearch_snapshot_manifests') AS manifests,
              to_regclass('public.privsearch_snapshot_content') AS content`,
    );
    assert.deepEqual(researchTables.rows, [{ manifests: null, content: null }]);
  });

  test("real pgvector retrieval is owner-scoped and product purge leaves zero derived residue", async () => {
    const userA = "11111111-1111-4111-8111-111111111111";
    const userB = "22222222-2222-4222-8222-222222222222";
    const assetA = "33333333-3333-4333-8333-333333333333";
    const assetB = "44444444-4444-4444-8444-444444444444";

    await insertUser({ id: userA, email: "product-a@example.test", displayName: "Product A", aiId: "000001000001" });
    await insertUser({ id: userB, email: "product-b@example.test", displayName: "Product B", aiId: "000002000002" });
    await insertAsset({ id: assetA, userId: userA, caption: "yellow dress" });
    await insertAsset({ id: assetB, userId: userB, caption: "yellow dress" });
    await client.query(
      `INSERT INTO media_retrieval_profiles
        (user_id, consent_version, consent_granted_at, index_state)
      VALUES
        ($1, 'media-retrieval-consent-v1', CURRENT_TIMESTAMP, 'enabled'),
        ($2, 'media-retrieval-consent-v1', CURRENT_TIMESTAMP, 'enabled')`,
      [userA, userB],
    );
    await insertReadySegment({
      id: "55555555-5555-4555-8555-555555555555",
      userId: userA,
      assetId: assetA,
      fingerprint: "a".repeat(64),
      vectorValue: 0.1,
    });
    await insertReadySegment({
      id: "66666666-6666-4666-8666-666666666666",
      userId: userB,
      assetId: assetB,
      fingerprint: "b".repeat(64),
      vectorValue: 0.2,
    });

    const repository = createRepository();
    const hits = await repository.searchMediaRetrievalSegments({
      userId: userA,
      vector: Array.from({ length: 1024 }, () => 0.1),
      lexicalTerms: ["yellow", "dress"],
      limit: 20,
    });
    assert.deepEqual(hits.map((hit) => hit.mediaAssetId), [assetA]);

    await assert.rejects(
      insertReadySegment({
        id: "77777777-7777-4777-8777-777777777777",
        userId: userA,
        assetId: assetA,
        fingerprint: "c".repeat(64),
        vectorValue: 0.3,
      }),
      (error) => error?.code === "23505",
    );

    const purge = await repository.purgeMediaRetrievalArtifacts({ userId: userA });
    assert.equal(purge.residueCount, 0);
    const residue = await client.query(
      `SELECT user_id, COUNT(*)::int AS total
      FROM media_retrieval_segments
      GROUP BY user_id
      ORDER BY user_id`,
    );
    assert.deepEqual(residue.rows, [{ user_id: userB, total: 1 }]);

    await client.query("UPDATE station_media_assets SET deleted_at = CURRENT_TIMESTAMP WHERE id = $1", [assetB]);
    const afterDelete = await client.query(
      "SELECT COUNT(*)::int AS total FROM media_retrieval_segments WHERE user_id = $1",
      [userB],
    );
    assert.equal(afterDelete.rows[0].total, 0);
  });
} else {
  test("pgvector product migration integration requires explicit opt-in", {
    skip: "set RUN_MEDIA_RETRIEVAL_MIGRATION_INTEGRATION=1; optionally provide MEDIA_RETRIEVAL_MIGRATION_DATABASE_URL",
  }, () => {});
}
