import assert from "node:assert/strict";
import crypto from "node:crypto";
import pg from "pg";
import { parseArgs } from "node:util";
import { createConnectionAdapter } from "../src/db.js";
import { createMediaRetrievalRetrievalRepository } from "../src/media-retrieval-retrieval-repository.js";
import { createEmbeddingProvenance } from "../src/media-retrieval-provenance.js";

// Synthetic rows remain in one transaction and are always rolled back. No OSS/model calls.
const databaseUrl = process.env.ALBUM_ASSISTANT_PLAN_DATABASE_URL;
const location = new URL(databaseUrl);
assert.ok(["127.0.0.1", "localhost"].includes(location.hostname));
assert.ok(location.pathname.endsWith("_migration_test"), "Only a disposable QA database is allowed");
const client = new pg.Client({ connectionString: databaseUrl });
const owner = crypto.randomUUID();
const other = crypto.randomUUID();
const vector = Array.from({ length: 1024 }, () => 0.1);
const provenance = createEmbeddingProvenance({ modelId: "synthetic-plan", modelVersion: "1", dimension: 1024,
  normalization: "provider-native-dense-v1", configuration: { mode: "synthetic-plan-only" } });
const { values } = parseArgs({ options: {
  "owner-assets": { type: "string", default: "5" },
  "other-assets": { type: "string", default: "2000" },
  "maximum-query-ms": { type: "string", default: "500" },
} });
const positiveInteger = (value, maximum) => {
  const parsed = Number(value);
  assert.ok(Number.isSafeInteger(parsed) && parsed > 0 && parsed <= maximum, "Invalid synthetic workload size");
  return parsed;
};
const ownerAssets = positiveInteger(values["owner-assets"], 20000);
const otherAssets = positiveInteger(values["other-assets"], 100000);
const maximumQueryMs = positiveInteger(values["maximum-query-ms"], 10000);
await client.connect();
try {
  await client.query("BEGIN");
  for (const [userId, count] of [[owner, ownerAssets], [other, otherAssets]]) {
    await client.query("INSERT INTO users (id,email,password_hash,display_name,ai_id) VALUES ($1,$2,'not-a-login-hash',$3,$4)",
      [userId, `${userId}@example.invalid`, `Synthetic-${userId}`, String(crypto.randomInt(100000000000, 999999999999))]);
    await client.query("INSERT INTO media_retrieval_profiles (user_id,consent_version,consent_granted_at,index_state) VALUES ($1,'media-retrieval-consent-v1',CURRENT_TIMESTAMP,'enabled')", [userId]);
    await client.query(`INSERT INTO station_media_assets (id,user_id,kind,storage_provider,storage_key,status)
      SELECT gen_random_uuid(),$1,'image','synthetic-plan','synthetic-not-an-oss-object','uploaded' FROM generate_series(1,$2)`, [userId, count]);
    await client.query(`INSERT INTO media_retrieval_segments
      (id,user_id,media_asset_id,segment_index,source_kind,descriptor,embedding,state,processing_version,content_fingerprint,embedding_provenance)
      SELECT gen_random_uuid(),$1,id,0,'image','{"summary":"synthetic"}'::jsonb,$2::vector,'ready','synthetic-plan',$3,$4::jsonb
      FROM station_media_assets WHERE user_id=$1`, [userId, JSON.stringify(vector), "a".repeat(64), JSON.stringify(provenance)]);
  }
  await client.query("ANALYZE media_retrieval_segments");
  await client.query("ANALYZE station_media_assets");
  const adapter = createConnectionAdapter(client);
  let plan;
  const repository = createMediaRetrievalRetrievalRepository({ query: async (sql, params) => {
    const rows = await adapter.query(`EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) ${sql}`, params);
    plan = rows[0]["QUERY PLAN"][0];
    return adapter.query(sql, params);
  } });
  const latencies = [];
  let results;
  for (let iteration = 0; iteration < 10; iteration += 1) {
    const started = performance.now();
    results = await repository.searchMediaRetrievalSegments({ userId: owner, vector, embeddingProvenance: provenance, limit: 20 });
    latencies.push(performance.now() - started);
  }
  assert.equal(results.length, Math.min(20, ownerAssets), "Owner candidates remain available despite other users' corpus size");
  const expected = await client.query("SELECT id FROM station_media_assets WHERE user_id=$1", [owner]);
  assert.ok(results.every(result => expected.rows.some(row => row.id === result.mediaAssetId)));
  const indexes = [];
  const segmentIndexNodes = [];
  const ownerIndexNodes = [];
  const walk = (node, parentRelation = null) => {
    const relation = node["Relation Name"] || parentRelation;
    if (node["Index Name"]) indexes.push(node["Index Name"]);
    if (relation === "media_retrieval_segments" && node["Index Name"]) {
      segmentIndexNodes.push({ ...node, "Relation Name": relation });
    }
    if (["media_retrieval_segments", "station_media_assets"].includes(relation) &&
      node["Index Name"] && String(node["Index Cond"] || "").includes("user_id")) ownerIndexNodes.push({ ...node, "Relation Name": relation });
    for (const child of node.Plans || []) walk(child, relation);
  };
  walk(plan.Plan);
  assert.ok(
    ownerIndexNodes.length > 0,
    "Owner-scoped retrieval must use an owner index",
  );
  latencies.sort((left, right) => left - right);
  const p95Ms = latencies[Math.ceil(latencies.length * 0.95) - 1];
  assert.ok(p95Ms <= maximumQueryMs, "Owner-scoped candidate query exceeds the predeclared latency gate");
  console.log(JSON.stringify({ type: "synthetic-query-plan", totalSegments: ownerAssets + otherAssets, ownerSegments: ownerAssets,
    returned: results.length, indexes, segmentIndexNodes: segmentIndexNodes.map((node) => ({
      name: node["Index Name"], indexCond: node["Index Cond"] || null,
    })), ownerIndexNodes: ownerIndexNodes.map(node => ({ relation: node["Relation Name"], name: node["Index Name"], indexCond: node["Index Cond"] })),
    executionMs: plan["Execution Time"], sharedHitBlocks: plan.Plan["Shared Hit Blocks"],
    workloadKind: "synthetic-constant-vectors-not-quality-or-concurrency",
    ownerIndexUsed: ownerIndexNodes.length > 0,
    samples: latencies.length, p50Ms: latencies[Math.floor(latencies.length / 2)], p95Ms, maximumQueryMs }, null, 2));
} finally {
  await client.query("ROLLBACK");
  await client.end();
}
