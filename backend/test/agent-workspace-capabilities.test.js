import assert from "node:assert/strict";
import test from "node:test";
import crypto from "node:crypto";
import { getAgent, listAgents } from "../../agents/registry.js";
import { createWorkspaceCapabilityExecutor, listExecutableWorkspaceCapabilities, listUnavailableWorkspaceCapabilities,
  validateWorkspaceSiteSources, validateWorkspaceMediaSources, collectWorkspaceTextSources, validateWorkspaceTextSources,
  parseWorkspaceTextArtifact } from "../src/agent-workspace-capabilities.js";
import { hashSiteDocumentValue } from "../src/site-document-repository.js";
import { MediaRetrievalServiceError } from "../src/media-retrieval-user-service.js";

const ids = { user: "00000000-0000-4000-8000-000000000001", album: "00000000-0000-4000-8000-000000000002",
  photo: "00000000-0000-4000-8000-000000000003", diary: "00000000-0000-4000-8000-000000000004",
  run: "00000000-0000-4000-8000-000000000005", extra: "00000000-0000-4000-8000-000000000006" };
const photo = { id: ids.photo, kind: "image", caption: "来自真实测试存储行", original_filename: "image.jpg", content_revision_at: "2026-10-12T00:00:00.000Z" };
const album = { id: ids.album, title: "所选相册", description: "所选范围" };
const diary = { id: ids.diary, title: "所选日记", body: "正文" };
const version = row => crypto.createHash("sha256").update(JSON.stringify(row)).digest("hex");
const ref = (kind, row) => ({ kind, id: row.id, version: version(row) });
const deliveryRow = { id: ids.photo, kind: "image", albumId: ids.album, caption: photo.caption, originalFilename: "image.jpg", tags: [], contentRevision: photo.content_revision_at, updatedAt: "original" };
const artifact = () => ({ kind: "media_selection", title: "已找到的素材", assets: [{ id: ids.photo, version: hashSiteDocumentValue(deliveryRow), kind: "image", matchedFrameTimestampMs: null }], retrievalRunIds: [ids.run] });
const document = ({ assets = [], diaries = [] } = {}) => ({ language: "zh", theme: "clean", title: "结构页面", summary: "页面草稿",
  sections: [{ type: "gallery", title: "精选", subtitle: "", body: "", assetIds: assets, diaryEntryIds: diaries, actions: [] }] });

function fixture({ mutate = null, mediaFound = true, retrievalError = null, siteDocument = document({ assets: [ids.photo] }), queryOverride = null } = {}) {
  const statements = [];
  const providerCalls = [];
  const contextCalls = [];
  const searches = [];
  let revised = false;
  const connection = { async query(sql, params) {
    statements.push({ sql, params });
    if (queryOverride) {
      const response = queryOverride(sql, params);
      if (response !== undefined) return response;
    }
    if (sql.includes("FROM media_retrieval_profiles")) return [{ index_state: "enabled", consent_version: "media-retrieval-consent-v1", index_epoch: 1 }];
    if (sql.includes("FROM user_profiles")) return [{ user_id: ids.user, nickname: revised && mutate === "profile" ? "已变化" : "昵称", ai_id: "1000", station_config: {} }];
    if (sql.includes("SELECT asset.id")) return [deliveryRow];
    if (sql.includes("FROM station_media_assets") && sql.includes('"originalFilename"')) return [{ id: ids.photo, kind: "image", caption: "来自真实测试存储行", originalFilename: "image.jpg", tags: [], contentRevision: photo.content_revision_at, updatedAt: revised && mutate === "source" ? "changed" : "original" }];
    if (sql.includes("FROM station_media_assets")) return params[0] === ids.photo ? [photo] : [];
    if (sql.includes("FROM station_albums")) return [album];
    if (sql.includes("FROM station_diary_entries") && sql.includes('"updatedAt"')) return [{ ...diary, mood: "", updatedAt: "original" }];
    if (sql.includes("FROM station_diary_entries")) return [diary];
    throw new Error(`Unexpected query: ${sql}`);
  } };
  const execute = createWorkspaceCapabilityExecutor({
    transaction: fn => fn(connection),
    runAgentRuntime: async options => {
      providerCalls.push(options);
      await options.beforeModelCall();
      await options.afterModelCall?.({ tokenUsage: { total: 4 } });
      await options.tools.execute("search_media", { query: options.input, ...(options.appContext.workspaceTask.scope === "selected-albums" ? { albumId: ids.album } : {}) });
      return { reply: "provider response never grants IDs", provider: "isolated-test", tokenUsage: { total: 4 }, latencyMs: 1 };
    },
    retrievalService: {
      getMediaRetrievalStatus: async () => ({ enabled: true, availability: { canStartRun: true }, backfill: { indexedAssets: 1, totalAssets: 1, skippedAssets: 0 } }),
      searchMediaRetrieval: async args => {
        searches.push(args);
        if (retrievalError) throw retrievalError;
        return { agentRunId: ids.run, results: mediaFound ? [{ mediaAssetId: ids.photo, kind: "image", matchedFrameTimestampMs: null }] : [] };
      },
    },
    generateSite: async options => {
      contextCalls.push(options);
      await options.beforeModelCall();
      await options.afterModelCall?.({ tokenUsage: { total: 9 } });
      revised = true;
      return { source: "model", draft: siteDocument, model: { provider: "isolated-test", tokenUsage: { total: 9 }, latencyMs: 1 } };
    },
  });
  return { execute, connection, statements, providerCalls, contextCalls, searches };
}
async function task(agentId, contextRefs = [], overrides = {}) {
  const agent = await getAgent(agentId);
  return { workspace: { id: "workspace-1", userId: ids.user, contextRefs },
    node: { id: "node-1", agentId, agentVersion: agent.version,
      capability: agent.workspaceCapabilities[0].capability, goal: "根据目标处理", contextRefIndexes: contextRefs.map((_, index) => index), dependencyResults: [], ...overrides },
    user: { id: ids.user }, assertAccess: async () => {} };
}

test("catalogue contains only typed registered and granted executors, without auto-grant", async () => {
  const agents = await listAgents();
  const grants = agents.map(agent => ({ agentId: agent.key, enabled: true, grantedScopes: agent.permissions }));
  const catalogue = listExecutableWorkspaceCapabilities({ registeredAgents: agents, grants });
  assert.deepEqual(catalogue.map(item => item.capability).sort(), ["character.advise", "comic.storyboard", "media.select", "model.advise", "site.compose", "text.summarize", "text.synthesize", "video.script"]);
  assert.deepEqual(listExecutableWorkspaceCapabilities({ registeredAgents: agents, grants: [] }), []);
  // A partial added Agent declaration is never sufficient authority.
  const partial = agents.filter(agent => agent.workspaceCapabilities?.length && agent.key !== "miaoxun-butler")
    .map(agent => ({ agentId: agent.key, enabled: true, grantedScopes: agent.permissions.slice(0, -1) }));
  assert.deepEqual(listExecutableWorkspaceCapabilities({ registeredAgents: agents, grants: partial }), []);
  const onlyCoordinator = grants.filter(grant => grant.agentId === "miaoxun-butler");
  assert.deepEqual(listExecutableWorkspaceCapabilities({ registeredAgents: agents, grants: onlyCoordinator }).map(entry => entry.capability), ["text.synthesize"]);
  const changed = structuredClone(agents);
  changed.find(agent => agent.key === "site-builder").workspaceCapabilities[0].requiredScopes.pop();
  assert.throws(() => listExecutableWorkspaceCapabilities({ registeredAgents: changed, grants }), { details: { code: "WORKSPACE_CAPABILITY_UNAVAILABLE" } });
  const albumOnly = grants.map(grant => ({ ...grant, grantedScopes: grant.grantedScopes.filter(scope => scope !== "album:read") }));
  assert.deepEqual(listExecutableWorkspaceCapabilities({ registeredAgents: agents, grants: albumOnly }).map(entry => entry.capability).sort(), ["character.advise", "model.advise", "text.summarize"]);
});

test("unavailable diagnostics use the same executor validation and expose only supported capability identities and requirements without private grant data", async () => {
  const agents = await listAgents();
  const grants = agents.map(agent => ({ agentId: agent.key, enabled: true, grantedScopes: [...agent.permissions] }));
  const catalogue = listExecutableWorkspaceCapabilities({ registeredAgents: agents, grants });
  const authority = { capabilities: structuredClone(catalogue) };
  assert.deepEqual(listUnavailableWorkspaceCapabilities({ registeredAgents: agents, grants, authority }), []);
  for (const mutation of [grant => { grant.enabled = false; }, grant => { grant.grantedScopes = grant.grantedScopes.filter(scope => scope !== "album:read"); }]) {
    const changed = structuredClone(grants); mutation(changed.find(grant => grant.agentId === "site-builder"));
    const diagnostics = listUnavailableWorkspaceCapabilities({ registeredAgents: agents, grants: changed, authority });
    const site = agents.find(agent => agent.key === "site-builder");
    assert.deepEqual(diagnostics, [{ agentId: site.key, agentName: site.name, capability: "site.compose", requiredScopes: site.workspaceCapabilities[0].requiredScopes, description: site.workspaceCapabilities[0].description, reason: "authorization_required" }]);
    assert.deepEqual(Object.keys(diagnostics[0]).sort(), ["agentId", "agentName", "capability", "description", "reason", "requiredScopes"]);
    assert.deepEqual(authority.capabilities, catalogue);
    assert.equal(listExecutableWorkspaceCapabilities({ registeredAgents: agents, grants: changed }).some(entry => entry.capability === "site.compose"), false);
  }
  assert.equal(listUnavailableWorkspaceCapabilities({ registeredAgents: agents, grants: [] }).length, catalogue.length);
  const changedAgents = structuredClone(agents);
  changedAgents.find(agent => agent.key === "site-builder").workspaceCapabilities[0].requiredScopes.pop();
  assert.throws(() => listUnavailableWorkspaceCapabilities({ registeredAgents: changedAgents, grants: [] }), { details: { code: "WORKSPACE_CAPABILITY_UNAVAILABLE" } });
});

test("a valid later grant requires a new task and cannot broaden the original exact capability snapshot", async () => {
  const agents = await listAgents();
  const grants = agents.map(agent => ({ agentId: agent.key, enabled: true, grantedScopes: [...agent.permissions] }));
  const entries = listExecutableWorkspaceCapabilities({ registeredAgents: agents, grants });
  const authority = { capabilities: entries.filter(entry => entry.capability === "media.select") };
  const site = agents.find(agent => agent.key === "site-builder");
  assert.deepEqual(listUnavailableWorkspaceCapabilities({ registeredAgents: agents, grants, authority }).filter(entry => entry.agentId === site.key), [{
    agentId: site.key, agentName: site.name, capability: "site.compose", requiredScopes: site.workspaceCapabilities[0].requiredScopes, description: site.workspaceCapabilities[0].description, reason: "new_task_required",
  }]);
  assert.deepEqual(authority.capabilities.map(entry => entry.capability), ["media.select"]);
  const changedAuthority = { capabilities: structuredClone(entries) };
  changedAuthority.capabilities.find(entry => entry.capability === "site.compose").agentVersion = "0.0.0";
  assert.equal(listUnavailableWorkspaceCapabilities({ registeredAgents: agents, grants, authority: changedAuthority }).find(entry => entry.agentId === site.key).reason, "new_task_required");
  const revoked = grants.map(grant => grant.agentId === "site-builder" ? { ...grant, enabled: false } : grant);
  assert.equal(listUnavailableWorkspaceCapabilities({ registeredAgents: agents, grants: revoked, authority }).find(entry => entry.agentId === site.key).reason, "authorization_required");
});

test("media node executes isolated tools, proves stored retrieval and passes exact versioned assets", async () => {
  const f = fixture();
  let before = 0, after = 0, access = 0;
  const args = await task("album-manager", [ref("station-album", album)]);
  const output = await f.execute({ ...args, assertAccess: async () => { access += 1; }, beforeModelCall: async () => { before += 1; }, afterModelCall: async () => { after += 1; } });
  assert.deepEqual(output.artifact, artifact());
  assert.equal(before, 1); assert.equal(after, 1); assert.ok(access >= 4);
  assert.equal(f.providerCalls[0].thread, undefined);
  assert.equal(f.searches[0].albumId, ids.album);
  assert.equal(f.searches[0].idempotencyKey, "workspace:workspace-1:node-1:search");
  assert.ok(f.statements.some(entry => entry.sql.includes("asset.content_revision_at <= event.created_at")));
  assert.equal(f.statements.some(entry => /chat_messages|INSERT|UPDATE/.test(entry.sql)), false);
});

test("selected album cannot be omitted to widen search and missing owned hit cannot be handed off", async () => {
  const args = await task("album-manager", [ref("station-album", album)], { contextRefIndexes: [] });
  const f = fixture();
  await assert.rejects(f.execute(args), { details: { code: "WORKSPACE_CONTEXT_INVALID" } });
  assert.equal(f.providerCalls.length, 0);
  const stale = fixture({ queryOverride: sql => sql.includes("SELECT asset.id") ? [] : undefined });
  await assert.rejects(stale.execute(await task("album-manager")), { details: { code: "WORKSPACE_MEDIA_CHANGED" } });
});

test("empty and uncertain retrieval explicitly stop instead of producing a substitute", async () => {
  const empty = fixture({ mediaFound: false });
  await assert.rejects(empty.execute(await task("album-manager")), { details: { code: "WORKSPACE_MEDIA_NOT_FOUND" } });
  const unknown = fixture({ retrievalError: new MediaRetrievalServiceError("retrieval_unknown_charge_no_retry") });
  await assert.rejects(unknown.execute(await task("album-manager")), { details: { code: "AI_PROVIDER_RESULT_UNKNOWN" } });
});

test("site composition receives exactly dependency media and selected diary, no global library", async () => {
  const f = fixture({ siteDocument: document({ assets: [ids.photo], diaries: [ids.diary] }) });
  const args = await task("site-builder", [ref("station-diary", diary)], { dependencyResults: [{ key: "found", result: artifact(), sourceReferences: [ref("station-photo", photo)] }] });
  const output = await f.execute(args);
  assert.equal(output.generation.draft.title, "结构页面");
  assert.deepEqual(f.contextCalls[0].stationContent.mediaAssets.map(item => item.id), [ids.photo]);
  assert.deepEqual(f.contextCalls[0].stationContent.diaryEntries.map(item => item.id), [ids.diary]);
  assert.equal(output.sourceReferences.length, 2);
  assert.equal(f.statements.some(entry => /LIMIT 12|LIMIT 8|INSERT|UPDATE/.test(entry.sql)), false);
  assert.match(output.profileHash, /^[a-f0-9]{64}$/);
  await validateWorkspaceSiteSources(f.connection, ids.user, output);
});

test("text-only goal may compose directly, but selected or handed-off resources cannot disappear", async () => {
  const plain = fixture({ siteDocument: document() });
  await plain.execute(await task("site-builder"));
  assert.equal(plain.contextCalls[0].stationContent.mediaAssets.length, 0);
  const selected = fixture({ siteDocument: document() });
  await assert.rejects(selected.execute(await task("site-builder", [ref("station-photo", photo)])), { details: { code: "WORKSPACE_MEDIA_UNUSED" } });
  const omitted = fixture();
  await assert.rejects(omitted.execute(await task("site-builder", [ref("station-photo", photo)], { contextRefIndexes: [] })), { details: { code: "WORKSPACE_CONTEXT_INVALID" } });
  assert.equal(omitted.contextCalls.length, 0);
});

test("foreign model references, resource edits, profile edits and stale delegated versions fail before save", async () => {
  const foreign = fixture({ siteDocument: document({ assets: [ids.extra] }) });
  await assert.rejects(foreign.execute(await task("site-builder", [ref("station-photo", photo)])), { details: { code: "SITE_BUILDER_INVALID_REFERENCES" } });
  for (const [mutate, code] of [["source", "SITE_TASK_RESOURCES_CHANGED"], ["profile", "SITE_TASK_PROFILE_CHANGED"]]) {
    const f = fixture({ mutate });
    await assert.rejects(f.execute(await task("site-builder", [ref("station-photo", photo)])), { details: { code } });
  }
  const stale = artifact(); stale.assets[0].version = "a".repeat(64);
  const f = fixture();
  await assert.rejects(f.execute(await task("site-builder", [], { dependencyResults: [{ key: "old", result: stale, sourceReferences: [ref("station-photo", photo)] }] })), { details: { code: "WORKSPACE_MEDIA_CHANGED" } });
  assert.equal(f.contextCalls.length, 0);
});

test("agent versions, revoked access and unsupported dependencies never execute a model", async () => {
  const f = fixture();
  await assert.rejects(f.execute(await task("album-manager", [], { agentVersion: "0.0.0" })), { details: { code: "WORKSPACE_AGENT_CHANGED" } });
  await assert.rejects(f.execute({ ...await task("site-builder"), assertAccess: async () => { throw new Error("revoked"); } }), /revoked/);
  await assert.rejects(f.execute(await task("site-builder", [], { dependencyResults: [{ key: "draft", result: { kind: "site_draft" } }] })), { details: { code: "WORKSPACE_DEPENDENCY_INVALID" } });
  assert.equal(f.providerCalls.length + f.contextCalls.length, 0);
});

test("delegated media type, duplicate identities and invented video timestamps fail validation", async () => {
  const f = fixture();
  for (const change of [value => { value.assets[0].kind = "video"; value.assets[0].matchedFrameTimestampMs = 3; },
    value => { value.assets.push(value.assets[0]); }, value => { value.assets[0].matchedFrameTimestampMs = 3; }]) {
    const changed = artifact(); change(changed);
    await assert.rejects(validateWorkspaceMediaSources(f.connection, ids.user, changed));
  }
});

test("album movement and microsecond content changes invalidate prior media delivery", async () => {
  for (const changed of [{ ...deliveryRow, albumId: ids.extra }, { ...deliveryRow, contentRevision: "2026-10-12 00:00:00.000001+00" }, { ...deliveryRow, updatedAt: "changed" }]) {
    const f = fixture({ queryOverride: sql => sql.includes("SELECT asset.id") ? [changed] : undefined });
    await assert.rejects(validateWorkspaceMediaSources(f.connection, ids.user, artifact()), { details: { code: "WORKSPACE_MEDIA_CHANGED" } });
  }
  const revoked = fixture({ queryOverride: sql => sql.includes("SELECT asset.id") ? [] : undefined });
  await assert.rejects(validateWorkspaceMediaSources(revoked.connection, ids.user, artifact()), { details: { code: "WORKSPACE_MEDIA_CHANGED" } });
});


test("media consent is locked through delivery and revoked grants block the handoff", async () => {
  const f = fixture();
  await validateWorkspaceMediaSources(f.connection, ids.user, artifact());
  const consentIndex = f.statements.findIndex(item => item.sql.includes("FROM media_retrieval_profiles"));
  const assetIndex = f.statements.findIndex(item => item.sql.includes("SELECT asset.id"));
  assert.ok(consentIndex < assetIndex);
  assert.match(f.statements[consentIndex].sql, /FOR SHARE/);
  const revoked = fixture({ queryOverride: sql => sql.includes("FROM media_retrieval_profiles") ? [{ index_state: "disabled" }] : undefined });
  await assert.rejects(validateWorkspaceMediaSources(revoked.connection, ids.user, artifact()), { details: { code: "WORKSPACE_ACCESS_REVOKED" } });
});

test("album-driven site goals require actual media dependency and never fall back to text", async () => {
  const f = fixture({ siteDocument: document() });
  const args = await task("site-builder");
  args.workspace.contextRefs = [ref("station-album", album)];
  await assert.rejects(f.execute(args), { details: { code: "WORKSPACE_CONTEXT_INVALID" } });
  assert.equal(f.contextCalls.length, 0);
});

function textFixture({ reply = "## 方案\n保留留白，再用一个近景结尾。", sourceChange = null, providerError = null } = {}) {
  const f = fixture();
  const calls = [];
  let changed = false;
  const originalQuery = f.connection.query;
  f.connection.query = async (sql, params) => {
    if (sql.includes("FROM station_diary_entries") && !sql.includes('"updatedAt"') && changed) return [{ ...diary, body: "调用期间发生变化" }];
    return originalQuery(sql, params);
  };
  const execute = createWorkspaceCapabilityExecutor({ transaction: fn => fn(f.connection), runAgentRuntime: async options => {
    calls.push(options);
    if (sourceChange === "before") changed = true;
    await options.beforeModelCall();
    if (providerError) throw providerError;
    await options.afterModelCall?.({ provider: "test-only", tokenUsage: { total: 5 } });
    if (sourceChange === "after") changed = true;
    return { reply, provider: "test-only", tokenUsage: { total: 5 }, latencyMs: 2 };
  } });
  return { ...f, execute, calls };
}

test("a multi-capability Agent synthesizes explicit text results without invoking the coordinator or private chat", async () => {
  const f = textFixture();
  let before = 0, after = 0, access = 0;
  const dependency = { key: "script", result: { kind: "text_result", title: "故事建议", content: "夕阳时出发。" }, sourceReferences: [] };
  const args = await task("miaoxun-butler", [], { capability: "text.synthesize", dependencyResults: [dependency] });
  const output = await f.execute({ ...args, beforeModelCall: async () => { before++; }, afterModelCall: async () => { after++; }, assertAccess: async () => { access++; } });
  assert.equal(output.artifact.kind, "text_result");
  assert.match(output.artifact.content, /保留留白/);
  assert.deepEqual(output.sourceReferences, []);
  assert.deepEqual(output.receipt, { provider: "test-only", tokenUsage: { total: 5 }, latencyMs: 2 });
  assert.equal(before, 1); assert.equal(after, 1); assert.ok(access >= 3);
  const options = f.calls[0];
  assert.equal(options.mode, "contribute");
  assert.equal(options.thread, null); assert.deepEqual(options.messages, []);
  assert.deepEqual(options.appContext.workspaceContribution.dependencies, [dependency.result]);
  assert.deepEqual(options.appContext.workspaceContribution.selectedContext, []);
  assert.equal(options.tools, undefined);
  assert.equal(f.statements.length, 0);
});

test("a video script inherits the complete selected diary source from an explicit storyboard handoff", async () => {
  const f = textFixture();
  const sources = [ref("station-diary", diary)];
  const dependency = { key: "story", result: { kind: "text_result", title: "分镜", content: "第一幕，抵达。" }, sourceReferences: sources };
  const output = await f.execute(await task("video-production", [], { dependencyResults: [dependency] }));
  assert.deepEqual(output.sourceReferences.map(({ kind, id, version }) => ({ kind, id, version })), sources);
  assert.match(f.calls[0].appContext.workspaceContribution.selectedContext[0].content, /正文/);
  assert.deepEqual(f.calls[0].appContext.workspaceContribution.dependencies, [dependency.result]);
  assert.equal(f.statements.some(({ sql }) => /user_profiles|chat_messages|file_assets|INSERT|UPDATE|LIMIT/.test(sql)), false);
  await validateWorkspaceTextSources(f.connection, ids.user, output, ["station:read"], sources);
});

test("an authorized recipient still cannot inherit text derived from sources outside its own capability scopes", async () => {
  const f = textFixture();
  const args = await task("file-preprocessor", [], { dependencyResults: [{ key: "story", result: { kind: "text_result", title: "分镜", content: "日记派生正文" }, sourceReferences: [ref("station-diary", diary)] }] });
  await assert.rejects(f.execute(args), error => error.details.code === "AI_CONTEXT_SCOPE_REQUIRED");
  assert.equal(f.calls.length, 0);
  const fakeMedia = await task("virtual-character", [], { dependencyResults: [{ key: "found", result: artifact(), sourceReferences: [ref("station-photo", photo)] }] });
  await assert.rejects(f.execute(fakeMedia), error => error.details.code === "WORKSPACE_DEPENDENCY_INVALID");
  assert.equal(f.calls.length, 0);
});

test("source set validation rejects omitted, invented, missing and conflicting lineage without silently filtering", async () => {
  const f = textFixture();
  const sources = [ref("station-diary", diary)];
  const text = { artifact: { kind: "text_result", title: "总结", content: "有来源的总结" }, sourceReferences: [] };
  await assert.rejects(validateWorkspaceTextSources(f.connection, ids.user, text, ["station:read"], sources), error => error.details.code === "WORKSPACE_TEXT_SOURCES_INVALID");
  await assert.rejects(validateWorkspaceTextSources(f.connection, ids.user, { ...text, sourceReferences: sources }, ["station:read"], []), error => error.details.code === "WORKSPACE_TEXT_SOURCES_INVALID");
  const dependency = { key: "story", result: text.artifact };
  await assert.rejects(f.execute(await task("video-production", [], { dependencyResults: [dependency] })), error => error.details.code === "WORKSPACE_TEXT_SOURCES_INVALID");
  const conflicting = { ...sources[0], version: "a".repeat(64) };
  await assert.rejects(collectWorkspaceTextSources(f.connection, ids.user, { sourceReferences: sources, dependencyResults: [{ ...dependency, sourceReferences: [conflicting] }] }, ["station:read"]), error => error.details.code === "WORKSPACE_SOURCES_CHANGED");
  assert.equal(f.calls.length, 0);
});

test("text contributions revalidate source versions immediately before dispatch and after receiving the reply", async () => {
  for (const sourceChange of ["before", "after"]) {
    const f = textFixture({ sourceChange });
    let dispatched = 0, received = 0;
    await assert.rejects(f.execute({ ...await task("comic-diary", [ref("station-diary", diary)]), beforeModelCall: async () => { dispatched++; }, afterModelCall: async () => { received++; } }), error => error.details.code === "AI_CONTEXT_CHANGED");
    assert.equal(dispatched, sourceChange === "before" ? 0 : 1);
    assert.equal(received, sourceChange === "before" ? 0 : 1);
  }
  const f = textFixture();
  let checks = 0;
  await assert.rejects(f.execute({ ...await task("file-preprocessor"), assertAccess: async () => { if (++checks > 2) throw new Error("revoked after response"); } }), /revoked after response/);
  assert.equal(f.calls.length, 1);
});

test("real selected media is inherited as metadata with its original album and asset sources", async () => {
  const f = textFixture();
  const selected = [ref("station-album", album), ref("station-photo", photo)];
  const output = await f.execute(await task("comic-diary", [], { dependencyResults: [{ key: "found", result: artifact(), sourceReferences: selected }] }));
  assert.deepEqual(output.sourceReferences.map(ref => ref.kind).sort(), ["station-album", "station-photo"]);
  assert.deepEqual(f.calls[0].appContext.workspaceContribution.dependencies, [{ kind: "media_selection", title: "已找到的素材", assets: [{ title: "image.jpg", kind: "image", caption: photo.caption }] }]);
  assert.equal(JSON.stringify(f.calls[0].appContext).includes("storageKey"), false);
});

test("stored text results use the same trimmed contract and reject malformed or hidden fields", () => {
  assert.deepEqual(parseWorkspaceTextArtifact({ kind: "text_result", title: "  方案  ", content: "\n正文\n" }),
    { kind: "text_result", title: "方案", content: "正文" });
  for (const artifact of [
    { kind: "text_result", title: "方案", content: "   " },
    { kind: "text_result", title: "方案", content: "x".repeat(16001) },
    { kind: "text_result", title: "方案", content: "正文", hidden: "未声明数据" },
  ]) assert.throws(() => parseWorkspaceTextArtifact(artifact), error => error.details.code === "WORKSPACE_TEXT_INVALID");
});

test("empty, nontext and oversized model contributions fail with a receipt rather than a substitute result", async () => {
  for (const reply of ["  ", "x".repeat(16001), { text: "not a string" }]) {
    const f = textFixture({ reply });
    let after = 0;
    await assert.rejects(f.execute({ ...await task("file-preprocessor"), afterModelCall: async () => { after++; } }), error => error.details.code === "WORKSPACE_TEXT_INVALID");
    assert.equal(after, 1); assert.equal(f.calls.length, 1);
  }
  const failure = Object.assign(new Error("unknown response"), { details: { code: "AI_PROVIDER_RESULT_UNKNOWN" } });
  const f = textFixture({ providerError: failure });
  await assert.rejects(f.execute(await task("file-preprocessor")), error => error.details.code === "AI_PROVIDER_RESULT_UNKNOWN");
  assert.equal(f.calls.length, 1);
});

test("text registrations cannot invent contribution mode or use a chat method as an executor", async () => {
  const agents = await listAgents();
  const invalid = structuredClone(agents);
  invalid.find(agent => agent.key === "video-production").runtimeModes = ["chat", "plan"];
  assert.throws(() => listExecutableWorkspaceCapabilities({ registeredAgents: invalid, grants: [] }), /workspace capability declaration/);
});

test("site composition consumes an explicit professional text handoff and preserves its message lineage through preview validation", async () => {
  const message = { id: ids.extra, content: "这次活动以手作和交流为主题。", sender_name: "用户", thread_id: ids.run };
  let changed = false;
  const f = fixture({ siteDocument: document(), queryOverride: sql => sql.includes("FROM chat_messages") ? [{ ...message, content: changed ? "来源已更新" : message.content }] : undefined });
  const sources = [ref("chat-message", message)];
  const handoff = { kind: "text_result", title: "活动方案", content: "以手作和交流为主题，页面突出时间与地点。" };
  const output = await f.execute(await task("site-builder", [], { dependencyResults: [{ key: "proposal", result: handoff, sourceReferences: sources }] }));
  assert.deepEqual(f.contextCalls[0].textHandoffs, [handoff]);
  assert.deepEqual(f.contextCalls[0].stationContent.mediaAssets, []);
  assert.deepEqual(output.sourceReferences.map(({ kind, id, version }) => ({ kind, id, version })), sources);
  assert.equal(f.statements.some(({ sql }) => /LIMIT|INSERT|UPDATE/.test(sql)), false);
  await validateWorkspaceSiteSources(f.connection, ids.user, output);
  changed = true;
  await assert.rejects(validateWorkspaceSiteSources(f.connection, ids.user, output), error => error.details.code === "AI_CONTEXT_CHANGED");
});

test("site selected messages become explicit textual data while missing dependency lineage cannot be dropped", async () => {
  const message = { id: ids.extra, content: "为一次小型分享会做介绍页。", sender_name: "用户", thread_id: ids.run };
  const f = fixture({ siteDocument: document(), queryOverride: sql => sql.includes("FROM chat_messages") ? [message] : undefined });
  await f.execute(await task("site-builder", [ref("chat-message", message)]));
  assert.deepEqual(f.contextCalls[0].textHandoffs, [{ kind: "text_result", title: "聊天消息", content: message.content }]);
  const incomplete = fixture({ siteDocument: document() });
  await assert.rejects(incomplete.execute(await task("site-builder", [], { dependencyResults: [{ key: "proposal", result: { kind: "text_result", title: "文字方案", content: "正文" } }] })), error => error.details.code === "WORKSPACE_TEXT_SOURCES_INVALID");
  assert.equal(incomplete.contextCalls.length, 0);
});
