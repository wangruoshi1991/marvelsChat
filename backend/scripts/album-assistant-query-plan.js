import assert from "node:assert/strict";
import crypto from "node:crypto";
import pg from "pg";
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
await client.connect();
try {
  await client.query("BEGIN");
  for (const [userId, count] of [[owner, 5], [other, 2000]]) {
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
  const results = await repository.searchMediaRetrievalSegments({ userId: owner, vector, embeddingProvenance: provenance, limit: 10 });
  assert.equal(results.length, 5, "The owner receives all five matches regardless of other users' corpus size");
  const expected = await client.query("SELECT id FROM station_media_assets WHERE user_id=$1", [owner]);
  assert.ok(results.every(result => expected.rows.some(row => row.id === result.mediaAssetId)));
  const indexes = [];
  const segmentIndexNodes = [];
  const walk = node => {
    if (node["Index Name"]) indexes.push(node["Index Name"]);
    if (node["Relation Name"] === "media_retrieval_segments" && node["Index Name"]) {
      segmentIndexNodes.push(node);
    }
    for (const child of node.Plans || []) walk(child);
  };
  walk(plan.Plan);
  assert.ok(
    segmentIndexNodes.some((node) => String(node["Index Cond"] || "").includes("user_id")),
    "Owner filtering should use a media segment index with the owner predicate",
  );
  console.log(JSON.stringify({ type: "synthetic-query-plan", totalSegments: 2005, ownerSegments: 5,
    returned: results.length, indexes, segmentIndexNodes: segmentIndexNodes.map((node) => ({
      name: node["Index Name"], indexCond: node["Index Cond"] || null,
    })), executionMs: plan["Execution Time"], sharedHitBlocks: plan.Plan["Shared Hit Blocks"] }, null, 2));
} finally {
  await client.query("ROLLBACK");
  await client.end();
}
