import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test, { after, before } from "node:test";
import { fileURLToPath } from "node:url";
import pg from "pg";
import { createConnectionAdapter } from "../src/db.js";
import { createMediaRetrievalRepository } from "../src/media-retrieval-repository.js";
import { createMediaRetrievalUserService } from "../src/media-retrieval-user-service.js";
import { processMediaRetrievalJob } from "../src/media-retrieval-service.js";
import { createDescriptorProvenance, createEmbeddingProvenance } from "../src/media-retrieval-provenance.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const backendDir = path.resolve(__dirname, "..");
const migrationPath = path.join(backendDir, "database", "027_media_retrieval_agent.sql");
const lifecycleMigrationPath = path.join(backendDir, "database", "028_media_retrieval_lifecycle_hardening.sql");
const provenanceMigrationPath = path.join(backendDir, "database", "029_media_retrieval_embedding_provenance.sql");
const rerankMigrationPath = path.join(backendDir, "database", "033_media_retrieval_rerank_operation.sql");
const unlimitedMigrationPath = path.join(backendDir, "database", "034_media_retrieval_unlimited_limits.sql");
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
const testEmbeddingProvenance = createEmbeddingProvenance({
  modelId: "synthetic-embedding", modelVersion: "1", dimension: 1024,
  normalization: "provider-native-dense-v1", configuration: { mode: "test-only" },
});

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
       embedding, state, processing_version, content_fingerprint, embedding_provenance)
    VALUES ($1, $2, $3, 0, 'image', $4::jsonb, $5::vector, 'ready', 'product-v1', $6, $7::jsonb)`,
    [id, userId, assetId, JSON.stringify({ summary: "yellow dress", ocrText: [] }), vectorLiteral(vectorValue), fingerprint, JSON.stringify(testEmbeddingProvenance)],
  );
};

const insertAgentRun = async ({ id, userId }) => {
  await client.query(
    `INSERT INTO agent_runs
      (id, user_id, agent_id, status, lifecycle_status, run_type)
    VALUES ($1, $2, 'media-retrieval', 'success', 'succeeded', 'index')`,
    [id, userId],
  );
};

const createRepository = () => {
  const connection = createConnectionAdapter(client);
  return createMediaRetrievalRepository({
    query: connection.query,
    withTransaction: async (work) => {
      const transactionClient = await client.connect();
      try {
        await transactionClient.query("BEGIN");
        const result = await work(createConnectionAdapter(transactionClient));
        await transactionClient.query("COMMIT");
        return result;
      } catch (error) {
        await transactionClient.query("ROLLBACK");
        throw error;
      } finally {
        transactionClient.release();
      }
    },
  });
};

test("product migrations install retrieval controls without a built-in usage ceiling", async () => {
  const [core, lifecycle, provenance, rerank, unlimited] = await Promise.all([
    readFile(migrationPath, "utf8"),
    readFile(lifecycleMigrationPath, "utf8"),
    readFile(provenanceMigrationPath, "utf8"),
    readFile(rerankMigrationPath, "utf8"),
    readFile(unlimitedMigrationPath, "utf8"),
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
  assert.match(rerank, /query-rerank/i);
  assert.match(unlimited, /user_daily_request_limit = NULL/i);
  assert.match(unlimited, /global_daily_budget_fen = NULL/i);
  assert.match(unlimited, /ALTER COLUMN amount_fen TYPE BIGINT/i);
  assert.match(core, /CREATE OR REPLACE FUNCTION media_retrieval_assert_run_owner/i);
  assert.doesNotMatch(`${core}\n${lifecycle}`, /ON DELETE SET NULL\s*\(/i);
  assert.doesNotMatch(`${core}\n${lifecycle}\n${provenance}\n${unlimited}`, /privsearch/i);
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
    client = new pg.Pool({ connectionString: databaseUrl, max: 4 });
    await client.query("SELECT 1");
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

    const controls = await client.query(
      `SELECT user_daily_request_limit, user_monthly_budget_fen, global_daily_budget_fen
      FROM media_retrieval_operator_controls WHERE id = TRUE`,
    );
    assert.deepEqual(controls.rows[0], {
      user_daily_request_limit: null,
      user_monthly_budget_fen: null,
      global_daily_budget_fen: null,
    });
  });

  test("provider reservations remain available when use and cost ceilings are unlimited", async () => {
    const userId = "60606060-6060-4060-8060-606060606060";
    const reservationId = "61616161-6161-4161-8161-616161616161";
    const repository = createRepository();
    const controls = (await client.query("SELECT * FROM media_retrieval_operator_controls WHERE id = TRUE")).rows[0];
    const today = (await client.query("SELECT (CURRENT_TIMESTAMP AT TIME ZONE 'UTC')::date AS utc_day")).rows[0].utc_day;
    const priorGlobalRollup = (await client.query(
      `SELECT action_count, reserved_fen, estimated_fen, unknown_fen
      FROM media_retrieval_cost_daily_rollups
      WHERE utc_day = $1 AND scope = 'global'`,
      [today],
    )).rows[0] || null;
    try {
      await insertUser({ id: userId, email: "unlimited-retrieval@example.test", displayName: "Unlimited Retrieval", aiId: "606060606060" });
      await repository.enableMediaRetrievalProfile({ userId, consentVersion: "media-retrieval-consent-v1" });
      const { run } = await repository.createOrGetMediaRetrievalRun({ userId, runType: "media-search" });
      await client.query(`UPDATE media_retrieval_operator_controls SET
        agent_enabled = TRUE, provider_calls_enabled = TRUE, index_requests_enabled = TRUE,
        lifecycle = 'available', user_daily_request_limit = NULL, user_monthly_budget_fen = NULL,
        global_daily_budget_fen = NULL, caption_reserve_fen = 1, embedding_reserve_fen = 1
        WHERE id = TRUE`);
      await client.query(`INSERT INTO media_retrieval_cost_daily_rollups
        (utc_day, scope, user_id, action_count, estimated_fen)
        VALUES ((CURRENT_TIMESTAMP AT TIME ZONE 'UTC')::date, 'user', $1, 100, 500000)`, [userId]);
      await client.query(`INSERT INTO media_retrieval_cost_daily_rollups
        (utc_day, scope, user_id, estimated_fen)
        VALUES ($1, 'global', NULL, 5000)
        ON CONFLICT (utc_day) WHERE scope = 'global'
        DO UPDATE SET estimated_fen = EXCLUDED.estimated_fen`, [today]);
      await client.query(`INSERT INTO media_retrieval_cost_ledger
        (id, user_id, agent_run_id, operation, disposition, amount_fen)
        VALUES ($1, $2, $3, 'query-parse', 'estimated', 500000)`, [reservationId, userId, run.id]);

      assert.equal(await repository.canEnqueueMediaRetrievalForUser({ userId }), true);
      const reservation = await repository.reserveProviderBudget({
        userId, agentRunId: run.id, operation: "query-rerank", countUserAction: true,
      });
      assert.equal(reservation.reserved, true);
      assert.equal(reservation.amountFen, 1);
    } finally {
      await client.query("DELETE FROM agent_runs WHERE user_id = $1", [userId]);
      await client.query("DELETE FROM users WHERE id = $1", [userId]);
      if (priorGlobalRollup) {
        await client.query(`UPDATE media_retrieval_cost_daily_rollups
          SET action_count = $2, reserved_fen = $3, estimated_fen = $4, unknown_fen = $5
          WHERE utc_day = $1 AND scope = 'global'`, [today, priorGlobalRollup.action_count,
          priorGlobalRollup.reserved_fen, priorGlobalRollup.estimated_fen, priorGlobalRollup.unknown_fen]);
      } else {
        await client.query("DELETE FROM media_retrieval_cost_daily_rollups WHERE utc_day = $1 AND scope = 'global'", [today]);
      }
      await client.query(`UPDATE media_retrieval_operator_controls SET
        agent_enabled = $1, provider_calls_enabled = $2, index_requests_enabled = $3,
        lifecycle = $4, user_daily_request_limit = $5, user_monthly_budget_fen = $6,
        global_daily_budget_fen = $7, caption_reserve_fen = $8, embedding_reserve_fen = $9
        WHERE id = TRUE`, [controls.agent_enabled, controls.provider_calls_enabled,
        controls.index_requests_enabled, controls.lifecycle, controls.user_daily_request_limit,
        controls.user_monthly_budget_fen, controls.global_daily_budget_fen,
        controls.caption_reserve_fen, controls.embedding_reserve_fen]);
    }
  });

  test("run ownership remains enforced while run deletion preserves derived media", async () => {
    const userA = "88888888-8888-4888-8888-888888888888";
    const userB = "99999999-9999-4999-8999-999999999999";
    const assetA = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
    const assetB = "abababab-abab-4bab-8bab-abababababab";
    const runA = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
    const jobA = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";

    await insertUser({ id: userA, email: "run-owner-a@example.test", displayName: "Run Owner A", aiId: "000003000003" });
    await insertUser({ id: userB, email: "run-owner-b@example.test", displayName: "Run Owner B", aiId: "000004000004" });
    await insertAsset({ id: assetA, userId: userA, caption: "run ownership" });
    await insertAsset({ id: assetB, userId: userB, caption: "run ownership mismatch" });
    await insertAgentRun({ id: runA, userId: userA });
    await client.query(
      `INSERT INTO media_retrieval_jobs
        (id, user_id, media_asset_id, job_type, status, content_fingerprint)
      VALUES ($1, $2, $3, 'index', 'running', $4)`,
      [jobA, userA, assetA, "d".repeat(64)],
    );

    await assert.rejects(
      client.query(
        `INSERT INTO media_retrieval_segments
          (id, user_id, media_asset_id, agent_run_id, segment_index, source_kind,
           descriptor, state, processing_version, content_fingerprint)
        VALUES ($1, $2, $3, $4, 0, 'image', '{}'::jsonb, 'ready', 'product-v1', $5)`,
        ["dddddddd-dddd-4ddd-8ddd-dddddddddddd", userB, assetB, runA, "e".repeat(64)],
      ),
      (error) => error?.code === "23503",
    );

    await client.query(
      `INSERT INTO media_retrieval_segments
        (id, user_id, media_asset_id, agent_run_id, segment_index, source_kind,
         descriptor, state, processing_version, content_fingerprint)
      VALUES ($1, $2, $3, $4, 0, 'image', '{}'::jsonb, 'ready', 'product-v1', $5)`,
      ["eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee", userA, assetA, runA, "f".repeat(64)],
    );
    await client.query(
      `INSERT INTO media_retrieval_segment_staging
        (id, user_id, agent_run_id, job_id, media_asset_id, profile_epoch,
         segment_index, source_kind, descriptor, embedding, processing_version,
         content_fingerprint)
      VALUES ($1, $2, $3, $4, $5, 1, 0, 'image', '{}'::jsonb, $6::vector,
        'product-v1', $7)`,
      ["ffffffff-ffff-4fff-8fff-ffffffffffff", userA, runA, jobA, assetA, vectorLiteral(0.4), "d".repeat(64)],
    );

    await client.query("DELETE FROM agent_runs WHERE id = $1", [runA]);
    const retained = await client.query(
      `SELECT 'ready' AS source, user_id, agent_run_id
       FROM media_retrieval_segments WHERE id = $1
       UNION ALL
       SELECT 'staging' AS source, user_id, agent_run_id
       FROM media_retrieval_segment_staging WHERE id = $2
       ORDER BY source`,
      ["eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee", "ffffffff-ffff-4fff-8fff-ffffffffffff"],
    );
    assert.deepEqual(retained.rows, [
      { source: "ready", user_id: userA, agent_run_id: null },
      { source: "staging", user_id: userA, agent_run_id: null },
    ]);

    await client.query("DELETE FROM users WHERE id = ANY($1::char(36)[])", [[userA, userB]]);
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
      embeddingProvenance: testEmbeddingProvenance,
      lexicalTerms: ["yellow", "dress"],
      limit: 20,
    });
    assert.deepEqual(hits.map((hit) => hit.mediaAssetId), [assetA]);
    for (const mismatch of [
      { configurationHash: "c".repeat(64) }, { modelId: "different-model" },
      { modelVersion: "different-version" }, { normalization: "different-normalization" },
    ]) {
      assert.deepEqual(await repository.searchMediaRetrievalSegments({ userId: userA,
        vector: Array.from({ length: 1024 }, () => 0.1),
        embeddingProvenance: { ...testEmbeddingProvenance, ...mismatch } }), []);
    }
    await client.query("UPDATE media_retrieval_segments SET embedding_provenance = NULL WHERE media_asset_id = $1", [assetA]);
    assert.deepEqual(await repository.searchMediaRetrievalSegments({ userId: userA,
      vector: Array.from({ length: 1024 }, () => 0.1), embeddingProvenance: testEmbeddingProvenance }), []);

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

  test("real product lifecycle indexes, searches, replays, tracks live assets and purges without external calls", async () => {
    const userId = "10101010-1010-4010-8010-101010101010";
    const otherUserId = "20202020-2020-4020-8020-202020202020";
    const assetId = "30303030-3030-4030-8030-303030303030";
    const otherAssetId = "40404040-4040-4040-8040-404040404040";
    const workerId = "synthetic-product-integration";
    const calls = [];
    const vector = Array.from({ length: 1024 }, () => 0.1);
    const repository = createRepository();
    const provenance = {
      descriptorProvenance: createDescriptorProvenance({
        modelId: "synthetic-caption", modelVersion: "1", configuration: { mode: "test-only" },
      }),
      embeddingProvenance: createEmbeddingProvenance({
        modelId: "synthetic-embedding", modelVersion: "1", dimension: 1024,
        normalization: "provider-native-dense-v1", configuration: { mode: "test-only" },
      }),
    };
    const provider = {
      getRuntimeStatus: () => ({ configured: true, enabled: true, providerCallsEnabled: true }),
      getIndexingProvenance: () => provenance,
      describeImage: async () => {
        calls.push("describe");
        return { summary: "yellow dress on a beach", clothing: [{ type: "dress", color: "yellow" }],
          scene: ["beach"], actions: [], objects: [], ocrText: [], qualitySignals: [] };
      },
      embedImage: async () => { calls.push("image-embedding"); return vector; },
      parseRetrievalQuery: async ({ query }) => {
        calls.push("parse");
        return { visualQuery: query, identityTerms: [], parseConfidence: "high" };
      },
      embedText: async () => { calls.push("text-embedding"); return vector; },
      rerankMediaCandidates: async ({ candidates }) => {
        calls.push("rerank");
        return candidates.map((candidate) => ({ ...candidate, matchReasons: ["semantic-match"], score: 0.8 }));
      },
    };
    const service = createMediaRetrievalUserService({
      repository, provider,
      getRuntimeStatus: async () => ({
        routeEligibility: { canRouteNewRun: true },
        publicAvailability: { state: "available", canStartRun: true, reasonCodes: [] },
      }),
    });
    const media = {
      loadOwnedMediaBytes: async () => ({ bytes: Buffer.from("synthetic-image"), mimeType: "image/jpeg" }),
      normalizeImageForProvider: async () => ({ bytes: Buffer.from("synthetic-normalized"), mimeType: "image/webp" }),
      createEphemeralProviderUrl: async () => ({ url: "https://synthetic.invalid/image.webp", cleanup: async () => {} }),
      purgeTemporaryForUser: async () => ({ residueCount: 0 }),
    };
    const processNext = async () => {
      const job = await repository.claimNextMediaRetrievalJob({ workerId });
      assert.ok(job);
      const outcome = await processMediaRetrievalJob({ job, repository, provider, media, workerId });
      assert.equal(outcome.status, "succeeded");
      return job;
    };

    const controls = (await client.query("SELECT * FROM media_retrieval_operator_controls WHERE id = TRUE")).rows[0];
    try {
      await client.query(`UPDATE media_retrieval_operator_controls SET
        agent_enabled = TRUE, index_requests_enabled = TRUE, provider_calls_enabled = TRUE,
        lifecycle = 'limited_release', user_daily_request_limit = 100,
        user_monthly_budget_fen = 2000, global_daily_budget_fen = 10000,
        caption_reserve_fen = 1, embedding_reserve_fen = 1 WHERE id = TRUE`);
      await insertUser({ id: userId, email: "lifecycle-a@example.test", displayName: "Lifecycle A", aiId: "101010101010" });
      await insertUser({ id: otherUserId, email: "lifecycle-b@example.test", displayName: "Lifecycle B", aiId: "202020202020" });
      await insertAsset({ id: assetId, userId, caption: "yellow dress on a beach" });
      await insertAsset({ id: otherAssetId, userId: otherUserId, caption: "yellow dress on a beach" });
      await client.query(`INSERT INTO media_retrieval_profiles (user_id, consent_version, consent_granted_at, index_state)
        VALUES ($1, 'media-retrieval-consent-v1', CURRENT_TIMESTAMP, 'enabled')`, [otherUserId]);
      await insertReadySegment({ id: "50505050-5050-4050-8050-505050505050", userId: otherUserId,
        assetId: otherAssetId, fingerprint: "e".repeat(64), vectorValue: 0.1 });

      const enabled = await service.enableMediaRetrieval({ userId,
        consentVersion: "media-retrieval-consent-v1", idempotencyKey: "lifecycle-enable-0001" });
      assert.equal(enabled.lifecycleStatus, "queued");
      const epoch = (await repository.getMediaRetrievalProfile({ userId })).indexEpoch;
      await repository.enableMediaRetrievalProfile({ userId, consentVersion: "media-retrieval-consent-v1" });
      assert.equal((await repository.getMediaRetrievalProfile({ userId })).indexEpoch, epoch);
      await processNext();
      const indexed = await service.getMediaRetrievalStatus({ userId });
      assert.deepEqual(indexed.backfill, { agentRunId: enabled.agentRunId,
        lifecycleStatus: "succeeded", indexedAssets: 1, skippedAssets: 0, totalAssets: 1 });

      const searchInput = { userId, query: "yellow dress on a beach", idempotencyKey: "lifecycle-search-0001" };
      const found = await service.searchMediaRetrieval(searchInput);
      assert.deepEqual(found.results.map((item) => item.mediaAssetId), [assetId]);
      assert.deepEqual(await service.searchMediaRetrieval(searchInput), found);
      assert.deepEqual(calls, ["describe", "image-embedding", "parse", "text-embedding", "rerank"]);
      await assert.rejects(service.getAgentRunEvents({ userId: otherUserId,
        agentRunId: found.agentRunId, afterSequence: 0 }), (error) => error.code === "run_not_found");

      const reindex = await service.requestMediaRetrievalReindex({ userId, scope: "all",
        mediaAssetIds: [], idempotencyKey: "lifecycle-reindex-0001" });
      for (let index = 0; index < 14; index += 1) {
        const { run } = await repository.createOrGetMediaRetrievalRun({ userId, runType: "media-search" });
        await repository.transitionMediaRetrievalRun({ userId, agentRunId: run.id,
          lifecycleStatus: "succeeded", eventType: "completed" });
      }
      const rebuilding = await service.getMediaRetrievalStatus({ userId });
      assert.equal(rebuilding.backfill.agentRunId, reindex.agentRunId);
      assert.equal(rebuilding.backfill.lifecycleStatus, "queued");
      assert.equal(rebuilding.backfill.totalAssets, 1);
      assert.equal(rebuilding.backfill.indexedAssets, 1);
      await processNext();
      assert.equal((await service.getMediaRetrievalStatus({ userId })).backfill.totalAssets, 1);

      const purge = await service.deleteMediaRetrievalIndex({ userId, idempotencyKey: "lifecycle-purge-0001" });
      await assert.rejects(repository.enableMediaRetrievalProfile({ userId,
        consentVersion: "media-retrieval-consent-v1" }), (error) => error.code === "retrieval_purge_incomplete");
      const hidden = await repository.searchMediaRetrievalSegments({ userId, vector, embeddingProvenance: testEmbeddingProvenance });
      assert.deepEqual(hidden, [], "revocation hides ready segments even before physical cleanup");
      const pending = await service.getMediaRetrievalStatus({ userId });
      assert.equal(pending.enabled, false);
      assert.equal(pending.backfill.indexedAssets, 0);
      await processNext();
      const purged = await service.getAgentRunEvents({ userId, agentRunId: purge.agentRunId, afterSequence: 0 });
      assert.equal(purged.run.lifecycleStatus, "succeeded");
      assert.ok(purged.events.length > 0);
      assert.ok(purged.events.every((event, index) => index === 0 || event.sequence > purged.events[index - 1].sequence));
      const residue = await client.query(`SELECT COUNT(*)::int AS total FROM media_retrieval_segments WHERE user_id = $1`, [userId]);
      assert.equal(residue.rows[0].total, 0);
      assert.equal((await repository.searchMediaRetrievalSegments({ userId: otherUserId, vector, embeddingProvenance: testEmbeddingProvenance })).length, 1);
    } finally {
      await client.query("DELETE FROM agent_runs WHERE user_id = ANY($1::char(36)[])", [[userId, otherUserId]]);
      await client.query("DELETE FROM users WHERE id = ANY($1::char(36)[])", [[userId, otherUserId]]);
      await client.query(`UPDATE media_retrieval_operator_controls SET
        agent_enabled = $1, index_requests_enabled = $2, provider_calls_enabled = $3,
        lifecycle = $4, user_daily_request_limit = $5, user_monthly_budget_fen = $6,
        global_daily_budget_fen = $7, caption_reserve_fen = $8, embedding_reserve_fen = $9
        WHERE id = TRUE`, [controls.agent_enabled, controls.index_requests_enabled,
        controls.provider_calls_enabled, controls.lifecycle, controls.user_daily_request_limit,
        controls.user_monthly_budget_fen, controls.global_daily_budget_fen,
        controls.caption_reserve_fen, controls.embedding_reserve_fen]);
    }
  });
  test("real search transactions reject revoked consent, stale epochs and another owner's run", async () => {
    const userId = "70707070-7070-4070-8070-707070707070";
    const otherUserId = "80808080-8080-4080-8080-808080808080";
    const repository = createRepository();
    const controls = (await client.query("SELECT * FROM media_retrieval_operator_controls WHERE id = TRUE")).rows[0];
    try {
      await insertUser({ id: userId, email: "search-race@example.test", displayName: "Search Race", aiId: "707070707070" });
      await insertUser({ id: otherUserId, email: "search-other@example.test", displayName: "Search Other", aiId: "808080808080" });
      await repository.enableMediaRetrievalProfile({ userId, consentVersion: "media-retrieval-consent-v1" });
      await client.query(`UPDATE media_retrieval_operator_controls SET agent_enabled = TRUE,
        index_requests_enabled = TRUE, provider_calls_enabled = TRUE, global_daily_budget_fen = 10000,
        user_monthly_budget_fen = 2000, caption_reserve_fen = 1 WHERE id = TRUE`);
      const { run } = await repository.createOrGetMediaRetrievalRun({ userId, runType: "media-search" });
      const payload = { searchResponse: { agentRunId: run.id, lifecycleStatus: "succeeded", method: "b7-product-baseline", results: [] } };
      const transition = { userId, agentRunId: run.id, lifecycleStatus: "succeeded", eventType: "completed", searchIndexEpoch: 1, payload };
      const reservation = await repository.reserveProviderBudget({ userId, agentRunId: run.id, operation: "query-rerank" });
      assert.equal(reservation.reserved, true, "033 accepts a real rerank reservation");
      await repository.settleProviderBudget({ reservationId: reservation.reservationId, disposition: "released", amountFen: 0 });
      await client.query("UPDATE media_retrieval_profiles SET index_state = 'purging', index_epoch = 2 WHERE user_id = $1", [userId]);
      assert.deepEqual(await repository.reserveProviderBudget({ userId, agentRunId: run.id, operation: "query-rerank" }),
        { reserved: false, reasonCode: "retrieval_not_enabled" });
      await assert.rejects(repository.transitionMediaRetrievalRun(transition), (error) => error.code === "retrieval_consent_required");
      await client.query("UPDATE media_retrieval_profiles SET index_state = 'enabled', index_epoch = 3 WHERE user_id = $1", [userId]);
      await assert.rejects(repository.transitionMediaRetrievalRun(transition), (error) => error.code === "retrieval_purge_incomplete");
      assert.equal((await repository.getAgentRunForUser({ userId, agentRunId: run.id })).lifecycleStatus, "accepted");
      assert.equal(await repository.getMediaRetrievalSearchResponse({ userId, agentRunId: run.id }), null);
      assert.equal(await repository.transitionMediaRetrievalRun({ userId: otherUserId, agentRunId: run.id,
        lifecycleStatus: "failed", eventType: "failed" }), null);
      assert.equal((await repository.getAgentRunForUser({ userId, agentRunId: run.id })).lifecycleStatus, "accepted");
      await repository.transitionMediaRetrievalRun({ ...transition, searchIndexEpoch: 3 });
      assert.deepEqual(await repository.getMediaRetrievalSearchResponse({ userId, agentRunId: run.id }), payload.searchResponse);
    } finally {
      await client.query("DELETE FROM agent_runs WHERE user_id = ANY($1::char(36)[])", [[userId, otherUserId]]);
      await client.query("DELETE FROM users WHERE id = ANY($1::char(36)[])", [[userId, otherUserId]]);
      await client.query(`UPDATE media_retrieval_operator_controls SET agent_enabled = $1, index_requests_enabled = $2,
        provider_calls_enabled = $3, global_daily_budget_fen = $4, user_monthly_budget_fen = $5, caption_reserve_fen = $6
        WHERE id = TRUE`, [controls.agent_enabled, controls.index_requests_enabled, controls.provider_calls_enabled,
        controls.global_daily_budget_fen, controls.user_monthly_budget_fen, controls.caption_reserve_fen]);
    }
  });
} else {
  test("pgvector product migration integration requires explicit opt-in", {
    skip: "set RUN_MEDIA_RETRIEVAL_MIGRATION_INTEGRATION=1; optionally provide MEDIA_RETRIEVAL_MIGRATION_DATABASE_URL",
  }, () => {});
}
