import assert from "node:assert/strict";
import crypto from "node:crypto";
import test, { before, after } from "node:test";
import pg from "pg";
import { getAgent } from "../../agents/registry.js";
import { createConnectionAdapter } from "../src/db.js";
import { resolveAIContextReferences } from "../src/ai-context.js";
import { createWorkspaceCapabilityExecutor, validateWorkspaceMediaSources, validateWorkspaceSiteSources } from "../src/agent-workspace-capabilities.js";

const enabled = process.env.RUN_AGENT_WORKSPACE_INTEGRATION === "1";
const integration = (name, work) => test(name, { skip: !enabled && "RUN_AGENT_WORKSPACE_INTEGRATION=1 with loopback _migration_test PostgreSQL" }, work);
let pool;
const owners = [];
const transaction = async work => {
  const client = await pool.connect();
  try { await client.query("BEGIN"); const result = await work(createConnectionAdapter(client)); await client.query("COMMIT"); return result; }
  catch (error) { await client.query("ROLLBACK"); throw error; }
  finally { client.release(); }
};
const query = async (sql, params = []) => {
  const client = await pool.connect();
  try { return await createConnectionAdapter(client).query(sql, params); } finally { client.release(); }
};
before(async () => {
  if (!enabled) return;
  const url = new URL(process.env.DATABASE_URL);
  assert.ok(["127.0.0.1", "localhost", "[::1]"].includes(url.hostname) && url.pathname.endsWith("_migration_test"), "Never run fixtures against a product database");
  pool = new pg.Pool({ connectionString: url.toString(), max: 4 });
  assert.ok((await query("SELECT filename FROM schema_migrations WHERE filename LIKE '037%'")).length, "The workspace schema must be migrated");
});
after(async () => {
  if (!enabled) return;
  // agent_runs deliberately keeps audit history after account deletion, so
  // delete only these isolated fixtures explicitly before owner cleanup.
  if (owners.length) await query("DELETE FROM agent_runs WHERE user_id = ANY(?::text[])", [owners]);
  if (owners.length) await query("DELETE FROM users WHERE id = ANY(?::text[])", [owners]);
  await pool.end();
});

async function fixture() {
  const id = crypto.randomUUID(); owners.push(id);
  const f = { user: { id }, album: crypto.randomUUID(), otherAlbum: crypto.randomUUID(), photo: crypto.randomUUID(), diary: crypto.randomUUID(),
    run: crypto.randomUUID(), node: crypto.randomUUID(), workspace: crypto.randomUUID() };
  await query("INSERT INTO users(id,email,password_hash,display_name,ai_id) VALUES (?,?,'isolated-test-only',?,?)",
    [id, `${id}@example.invalid`, `Capability ${id.slice(0,8)}`, String(crypto.randomInt(100000000000, 999999999999))]);
  await query("INSERT INTO user_profiles(user_id,nickname,avatar_text) VALUES (?,'Capability verification','C')", [id]);
  await query("INSERT INTO media_retrieval_profiles(user_id,index_state,consent_version,consent_granted_at) VALUES (?,'enabled','media-retrieval-consent-v1',clock_timestamp())", [id]);
  for (const album of [f.album, f.otherAlbum]) await query("INSERT INTO station_albums(id,user_id,title) VALUES (?,?,'Selected verification album')", [album, id]);
  await query("INSERT INTO station_media_assets(id,user_id,album_id,kind,status,caption,original_filename) VALUES (?,?,?,'image','uploaded','Selected verification media','selected.jpg')", [f.photo, id, f.album]);
  await query("INSERT INTO station_diary_entries(id,user_id,title,body) VALUES (?,?,'Selected diary','Selected diary body')", [f.diary, id]);
  await query("INSERT INTO agent_runs(id,user_id,agent_id,status,run_type,lifecycle_status) VALUES (?,?,'media-retrieval','success','media-search','succeeded')", [f.run, id]);
  f.searchResponse = { agentRunId: f.run, results: [{ mediaAssetId: f.photo, kind: "image", matchedFrameTimestampMs: null }] };
  await query(`INSERT INTO agent_run_events(id,agent_run_id,user_id,sequence,lifecycle_status,event_type,payload,delivery_key)
    VALUES (?,?,?,1,'succeeded','completed',?::jsonb,?)`, [crypto.randomUUID(), f.run, id,
    JSON.stringify({ searchResponse: f.searchResponse, indexEpoch: "1" }), crypto.randomUUID()]);
  f.references = (await transaction(connection => resolveAIContextReferences({ userId: id,
    refs: [{ kind: "station-album", id: f.album }, { kind: "station-diary", id: f.diary }], grantedScopes: ["album:read", "station:read"],
    queryFn: connection.query.bind(connection), lock: true }))).references;
  f.albumRef = f.references.find(ref => ref.kind === "station-album");
  f.diaryRef = f.references.find(ref => ref.kind === "station-diary");
  f.draft = { language: "zh", theme: "gallery", title: "Private verification page", summary: "Selected sources only", sections: [{ type: "gallery", title: "Selection", subtitle: "", body: "",
    assetIds: [f.photo], diaryEntryIds: [f.diary], actions: [] }] };
  const albumAgent = await getAgent("album-manager"); const siteAgent = await getAgent("site-builder");
  f.mediaArgs = { workspace: { id: f.workspace, userId: id, contextRefs: [f.albumRef] },
    node: { id: f.node, agentId: albumAgent.key, agentVersion: albumAgent.version, capability: "media.select", goal: "Find selected material", contextRefIndexes: [0], dependencyResults: [] },
    user: f.user, assertAccess: async () => {} };
  f.siteArgs = delivery => ({ workspace: { id: f.workspace, userId: id, contextRefs: [f.albumRef, f.diaryRef] },
    node: { id: crypto.randomUUID(), agentId: siteAgent.key, agentVersion: siteAgent.version, capability: "site.compose", goal: "Compose using delivered media and diary",
      contextRefIndexes: [1], dependencyResults: [{ key: "find", result: delivery.artifact, sourceReferences: delivery.sourceReferences }] }, user: f.user, assertAccess: async () => {} });
  f.executor = createWorkspaceCapabilityExecutor({ transaction,
    runAgentRuntime: async options => { await options.tools.execute("search_media", { query: "Find selected material", albumId: f.album }); return { reply: "Selected", provider: "isolated-test", tokenUsage: null, latencyMs: 1 }; },
    retrievalService: { getMediaRetrievalStatus: async () => ({ enabled: true, availability: { canStartRun: true }, backfill: { indexedAssets: 1, totalAssets: 1, skippedAssets: 0 } }),
      searchMediaRetrieval: async () => f.searchResponse },
    generateSite: async options => {
      assert.deepEqual(options.stationContent.mediaAssets.map(asset => asset.id), [f.photo]);
      assert.deepEqual(options.stationContent.diaryEntries.map(diary => diary.id), [f.diary]);
      return { source: "model", draft: f.draft, model: { provider: "isolated-test", tokenUsage: null, latencyMs: 1 } };
    },
  });
  return f;
}

integration("professional handoff SQL proves owned completed retrieval and exact site resources", async () => {
  const f = await fixture();
  const selected = await f.executor(f.mediaArgs);
  assert.deepEqual(selected.artifact.assets.map(asset => asset.id), [f.photo]);
  assert.match(selected.artifact.assets[0].version, /^[a-f0-9]{64}$/);
  const site = await f.executor(f.siteArgs(selected));
  await transaction(connection => validateWorkspaceSiteSources(connection, f.user.id, site));
  assert.equal(site.sourceReferences.length, 3);
  assert.equal((await query("SELECT id FROM station_site_drafts WHERE user_id = ?", [f.user.id])).length, 0, "Executor returns generation; service owns persistence");
});

integration("album movement, edited content and altered event matches invalidate a delivered selection", async () => {
  const f = await fixture();
  const selected = await f.executor(f.mediaArgs);
  await query("UPDATE station_media_assets SET album_id = ? WHERE id = ?", [f.otherAlbum, f.photo]);
  await assert.rejects(transaction(connection => validateWorkspaceMediaSources(connection, f.user.id, selected.artifact)), error => error.details.code === "WORKSPACE_MEDIA_CHANGED");
  await assert.rejects(f.executor(f.mediaArgs), error => error.details.code === "WORKSPACE_MEDIA_CHANGED");
  await query("UPDATE station_media_assets SET album_id = ? WHERE id = ?", [f.album, f.photo]);
  const refreshed = await f.executor(f.mediaArgs);
  await query("UPDATE station_media_assets SET caption = 'Changed description' WHERE id = ?", [f.photo]);
  await assert.rejects(transaction(connection => validateWorkspaceMediaSources(connection, f.user.id, refreshed.artifact)), error => error.details.code === "WORKSPACE_MEDIA_CHANGED");
  const current = await f.executor(f.mediaArgs);
  await query("UPDATE agent_run_events SET payload = jsonb_set(payload,'{searchResponse,results}','[]'::jsonb) WHERE agent_run_id = ?", [f.run]);
  await assert.rejects(transaction(connection => validateWorkspaceMediaSources(connection, f.user.id, current.artifact)), error => error.details.code === "WORKSPACE_MEDIA_CHANGED");
});

integration("owner boundaries and a re-enabled index epoch cannot reuse an old media delivery", async () => {
  const f = await fixture(); const other = await fixture();
  const selected = await f.executor(f.mediaArgs);
  await assert.rejects(transaction(connection => validateWorkspaceMediaSources(connection, other.user.id, selected.artifact)), error => error.details.code === "WORKSPACE_MEDIA_CHANGED");
  await query("UPDATE media_retrieval_profiles SET index_epoch = index_epoch + 1 WHERE user_id = ?", [f.user.id]);
  await assert.rejects(transaction(connection => validateWorkspaceMediaSources(connection, f.user.id, selected.artifact)), error => error.details.code === "WORKSPACE_MEDIA_CHANGED");
});

integration("consent revocation blocks on delivery snapshot lock and stops later delivery", async () => {
  const f = await fixture(); const selected = await f.executor(f.mediaArgs);
  const client = await pool.connect(); const writer = await pool.connect();
  try {
    await client.query("BEGIN");
    await validateWorkspaceMediaSources(createConnectionAdapter(client), f.user.id, selected.artifact);
    await writer.query("BEGIN"); await writer.query("SET LOCAL lock_timeout = '50ms'");
    await assert.rejects(writer.query("UPDATE media_retrieval_profiles SET index_state = 'disabled' WHERE user_id = $1", [f.user.id]), error => error.code === "55P03");
    await writer.query("ROLLBACK"); await client.query("COMMIT");
    await writer.query("UPDATE media_retrieval_profiles SET index_state = 'disabled' WHERE user_id = $1", [f.user.id]);
    await assert.rejects(transaction(connection => validateWorkspaceMediaSources(connection, f.user.id, selected.artifact)), error => error.details.code === "WORKSPACE_ACCESS_REVOKED");
  } finally { await client.query("ROLLBACK"); await writer.query("ROLLBACK"); client.release(); writer.release(); }
});

integration("site source validation rejects edits before confirmation without writing a page", async () => {
  const f = await fixture(); const selected = await f.executor(f.mediaArgs); const site = await f.executor(f.siteArgs(selected));
  await query("UPDATE station_diary_entries SET body = 'Edited diary' WHERE id = ?", [f.diary]);
  await assert.rejects(transaction(connection => validateWorkspaceSiteSources(connection, f.user.id, site)), error => error.details.code === "AI_CONTEXT_CHANGED");
  const refreshed = await f.executor(f.mediaArgs);
  const diary = (await transaction(connection => resolveAIContextReferences({ userId: f.user.id, refs: [{ kind: "station-diary", id: f.diary }], grantedScopes: ["station:read"], queryFn: connection.query.bind(connection) }))).references[0];
  f.diaryRef = diary;
  const regenerated = await f.executor(f.siteArgs(refreshed));
  await query("UPDATE user_profiles SET bio = 'Changed biography' WHERE user_id = ?", [f.user.id]);
  await assert.rejects(transaction(connection => validateWorkspaceSiteSources(connection, f.user.id, regenerated)), error => error.details.code === "SITE_TASK_PROFILE_CHANGED");
  assert.equal((await query("SELECT id FROM station_site_drafts WHERE user_id = ?", [f.user.id])).length, 0);
});
