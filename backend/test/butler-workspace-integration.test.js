import assert from "node:assert/strict";
import crypto from "node:crypto";
import test, { before, after, beforeEach } from "node:test";
import express from "express";
import { query, closeDatabase } from "../src/db.js";
import { authenticate, hashToken } from "../src/auth.js";
import { registerMessageRoutes } from "../src/routes/message-routes.js";
import { registerAgentWorkspaceRoutes } from "../src/routes/agent-workspace-routes.js";
import { createRequestErrorHandler } from "../src/request-observability.js";
import { completeAgentMessageOnce } from "../src/message-repository.js";
import { createAgentWorkspaceService } from "../src/agent-workspace-service.js";
import { createAgentWorkspaceRunner } from "../src/agent-workspace-runner.js";
import { getAgent } from "../../agents/registry.js";
import { computeAgentReleaseContractHash } from "../../shared/agent-catalog.js";
import { computeProductContractHash } from "../src/product-catalog-repository.js";
import { HttpError } from "../src/http-error.js";

const enabled = process.env.RUN_AI_TASK_INTEGRATION === "1";
const integration = (name, work) => test(name, { skip: !enabled && "Requires migrated disposable PostgreSQL" }, work);
const owner = crypto.randomUUID();
const outsider = crypto.randomUUID();
const threadId = crypto.randomUUID();
const albumId = crypto.randomUUID();
const token = crypto.randomBytes(32).toString("hex");
const otherToken = crypto.randomBytes(32).toString("hex");
const butlerScopes = (await getAgent("miaoxun-butler")).permissions;
const albumScopes = (await getAgent("album-manager")).permissions;
const siteScopes = (await getAgent("site-builder")).permissions;
const taskDecision = { type: "workspace", capabilities: [
  { agentId: "album-manager", capability: "media.select" }, { agentId: "site-builder", capability: "site.compose" },
] };
let server;
let origin;
let calls;
let runtime;
let uiPreviewCalls;
let uiPrepare;
let uiPersist;
const logger = { error() {} };

const publicationIds = {
  "miaoxun-butler": { release: "11111111-1111-4111-8111-111111111111", product: "21111111-1111-4111-8111-111111111111", version: "31111111-1111-4111-8111-111111111111", entitlement: "41111111-1111-4111-8111-111111111111" },
  "album-manager": { release: "12222222-2222-4222-8222-222222222222", product: "22222222-2222-4222-8222-222222222222", version: "32222222-2222-4222-8222-222222222222", entitlement: "42222222-2222-4222-8222-222222222222" },
  "site-builder": { release: "13333333-3333-4333-8333-333333333333", product: "23333333-3333-4333-8333-333333333333", version: "33333333-3333-4333-8333-333333333333", entitlement: "43333333-3333-4333-8333-333333333333" },
};

async function seedPublishedProduct(agentKey) {
  const agent = await getAgent(agentKey);
  const ids = publicationIds[agentKey];
  const releaseIdentity = {
    key: agent.key, avatarKind: "agent-mark", displayName: agent.name, description: agent.description,
    mark: agent.identity.mark, shape: agent.identity.shape, colors: agent.identity.colors,
    published: true, source: "registry", updatedAt: "2026-10-30T00:00:00.000Z",
  };
  const releaseHash = computeAgentReleaseContractHash({ key: agent.key, version: agent.version, permissions: agent.permissions, identity: releaseIdentity });
  await query(`INSERT INTO agent_registry
    (agent_key, version, contract_hash, declared_scopes, readiness, registration_status, source)
    VALUES (?, ?, ?, ?::jsonb, '{"ready":true,"missing":[]}'::jsonb, 'registered', 'registry')
    ON CONFLICT (agent_key) DO UPDATE SET version = EXCLUDED.version, contract_hash = EXCLUDED.contract_hash,
      declared_scopes = EXCLUDED.declared_scopes, readiness = EXCLUDED.readiness, registration_status = 'registered', removed_at = NULL`,
  [agent.key, agent.version, releaseHash, JSON.stringify(agent.permissions)]);
  await query(`UPDATE agent_catalog SET display_name = ?, description = ?, identity_mark = ?, identity_shape = ?,
      identity_colors = ?::jsonb, status = 'published', release_version = ?, contract_hash = ?, source = 'registry'
    WHERE agent_id = ?`, [agent.name, agent.description, agent.identity.mark, agent.identity.shape, JSON.stringify(agent.identity.colors), agent.version, releaseHash, agent.key]);
  await query(`INSERT INTO agent_releases
    (id, agent_key, version, contract_hash, declared_scopes, readiness, identity_snapshot, catalog_status, published_at)
    VALUES (?, ?, ?, ?, ?::jsonb, '{"ready":true,"missing":[]}'::jsonb, ?::jsonb, 'published', CURRENT_TIMESTAMP)`,
  [ids.release, agent.key, agent.version, releaseHash, JSON.stringify(agent.permissions), JSON.stringify(releaseIdentity)]);
  const productIdentity = {
    key: agent.key, avatarKind: "agent-mark", displayName: agent.name, description: agent.description,
    mark: agent.identity.mark, shape: agent.identity.shape, colors: agent.identity.colors,
    published: false, source: "admin", updatedAt: "2026-10-30T00:00:00.000Z",
  };
  const product = {
    productKey: agent.key, version: agent.version, displayName: agent.name, description: agent.description,
    identity: productIdentity, supportedPlatforms: ["ios", "android"],
    dependencies: [{ agentKey: agent.key, agentReleaseId: ids.release, version: agent.version, scopes: agent.permissions, contractHash: releaseHash }],
  };
  const productHash = computeProductContractHash(product);
  await query(`INSERT INTO products (id, product_key, display_name, description, identity_snapshot, status)
    VALUES (?, ?, ?, ?, ?::jsonb, 'published')`, [ids.product, agent.key, agent.name, agent.description, JSON.stringify(productIdentity)]);
  await query(`INSERT INTO product_versions (id, product_id, version, supported_platforms, status, contract_hash, display_name, description, identity_snapshot)
    VALUES (?, ?, ?, '["ios","android"]'::jsonb, 'published', ?, ?, ?, ?::jsonb)`, [ids.version, ids.product, agent.version, productHash, agent.name, agent.description, JSON.stringify(productIdentity)]);
  await query(`INSERT INTO product_agent_dependencies (product_version_id, agent_key, agent_release_id, version, required_scopes)
    VALUES (?, ?, ?, ?, ?::jsonb)`, [ids.version, agent.key, ids.release, agent.version, JSON.stringify(agent.permissions)]);
  await query(`INSERT INTO user_entitlements
    (id, user_id, product_id, product_version_id, status, granted_scopes, contract_hash, consent_version, idempotency_key)
    VALUES (?, ?, ?, ?, 'enabled', ?::jsonb, ?, 'fixture-consent-v1', ?)`,
  [ids.entitlement, owner, ids.product, ids.version, JSON.stringify(agent.permissions), productHash, `fixture-${agent.key}-enable`]);
  return { agent, ids, productHash };
}

before(async () => {
  if (!enabled) return;
  const databaseUrl = new URL(process.env.DATABASE_URL);
  assert.ok(["127.0.0.1", "localhost", "[::1]"].includes(databaseUrl.hostname), "Never connect this suite to a remote database");
  assert.match((await query("SELECT current_database() AS name"))[0].name, /_migration_test$/);
  for (const [userId, authToken] of [[owner, token], [outsider, otherToken]]) {
    await query("INSERT INTO users(id,email,password_hash,display_name,ai_id) VALUES (?, ?, 'test-only', ?, ?)",
      [userId, `${userId}@example.invalid`, `Dispatch ${userId}`, String(crypto.randomInt(100000000000, 999999999999))]);
    await query("INSERT INTO user_profiles(user_id,nickname,avatar_text) VALUES (?, 'Dispatch fixture', 'T')", [userId]);
    await query("INSERT INTO auth_sessions(id,user_id,token_hash,expires_at) VALUES (?, ?, ?, CURRENT_TIMESTAMP + INTERVAL '1 hour')", [crypto.randomUUID(), userId, hashToken(authToken)]);
  }
  await query("INSERT INTO chat_threads(id,user_id,title,agent_id,kind) VALUES (?, ?, 'Butler fixture', 'miaoxun-butler', 'agent')", [threadId, owner]);
  await query("INSERT INTO station_albums(id,user_id,title) VALUES (?, ?, 'Selected album')", [albumId, owner]);
  for (const agentKey of Object.keys(publicationIds)) await seedPublishedProduct(agentKey);
  await query("INSERT INTO user_agents(user_id,agent_id,enabled,granted_scopes) VALUES (?, 'miaoxun-butler', true, ?::jsonb), (?, 'album-manager', true, ?::jsonb), (?, 'site-builder', true, ?::jsonb)",
    [owner, JSON.stringify(butlerScopes), owner, JSON.stringify(albumScopes), owner, JSON.stringify(siteScopes)]);
  const app = express();
  app.use(express.json());
  const asyncHandler = handler => (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next);
  registerMessageRoutes(app, { authenticate, asyncHandler, getOnlineUserIds: () => [], sendRealtimeToUser() {}, runAgentRuntime: async options => {
    calls++;
    assert.equal(options.mode, "dispatch");
    await options.beforeModelCall();
    return runtime(options);
  }, uiPreferences: {
    prepare: async args => { uiPreviewCalls.prepare.push(args); return uiPrepare(args); },
    lockPreparedAuthorization: async args => { uiPreviewCalls.lock.push(args); },
    persistPrepared: async args => { uiPreviewCalls.persist.push(args); return uiPersist(args); },
  } });
  registerAgentWorkspaceRoutes(app, { authenticate, asyncHandler });
  app.use(createRequestErrorHandler({ production: true, logger }));
  await new Promise(resolve => { server = app.listen(0, "127.0.0.1", resolve); });
  origin = `http://127.0.0.1:${server.address().port}`;
});

beforeEach(async () => {
  if (!enabled) return;
  await query("DELETE FROM agent_workspace_submissions WHERE user_id = ?", [owner]);
  await query("DELETE FROM agent_workspaces WHERE user_id = ?", [owner]);
  await query("DELETE FROM chat_messages WHERE user_id = ?", [owner]);
  await query("UPDATE user_agents SET enabled = true WHERE user_id = ?", [owner]);
  await query("UPDATE user_agents SET granted_scopes = ?::jsonb WHERE user_id = ? AND agent_id = 'miaoxun-butler'", [JSON.stringify(butlerScopes), owner]);
  await query("UPDATE user_agents SET granted_scopes = ?::jsonb WHERE user_id = ? AND agent_id = 'site-builder'", [JSON.stringify(siteScopes), owner]);
  await query("UPDATE station_albums SET description = '', deleted_at = NULL WHERE id = ?", [albumId]);
  calls = 0;
  uiPreviewCalls = { prepare: [], lock: [], persist: [] };
  uiPrepare = async args => ({ instruction: args.instruction });
  uiPersist = async () => ({ id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa" });
  runtime = async () => ({ reply: JSON.stringify(taskDecision), provider: "test-only", latencyMs: 1 });
});

after(async () => {
  if (!enabled) return;
  await new Promise(resolve => server?.close(resolve));
  await query("DELETE FROM users WHERE id IN (?, ?)", [owner, outsider]);
  await closeDatabase();
});

const request = async (path, body, authToken = token, workspaceContract = "6", uiContract = "1") => {
  const response = await fetch(`${origin}${path}`, { method: body === undefined ? "GET" : "POST", headers: {
    Authorization: `Bearer ${authToken}`, "Content-Type": "application/json", "X-Miaoxun-AI-Contract": "1", "X-Miaoxun-Site-Document": "2",
    ...(uiContract === null ? {} : { "X-Miaoxun-UI-Preferences": uiContract }),
    ...(workspaceContract === null ? {} : { "X-Miaoxun-Agent-Workspace": workspaceContract }),
  }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
  return { status: response.status, ...await response.json() };
};
const input = () => ({ content: "Please prepare a page with material from this album", clientMessageId: crypto.randomUUID(),
  clientContext: { currentPage: "second-floor.albums", language: "en" }, contextRefs: [{ kind: "station-album", id: albumId }] });
const send = body => request(`/api/threads/${threadId}/messages`, body);
const workspaces = () => query("SELECT * FROM agent_workspaces WHERE user_id = ?", [owner]);

integration("butler routes UI preference requests from persisted user text and replays the same preview", async () => {
  runtime = async () => ({ reply: JSON.stringify({ type: "ui_preference" }), provider: "test-only", latencyMs: 1 });
  const body = { content: "把妙页的卡片圆角变大", clientMessageId: crypto.randomUUID() };
  const accepted = await send(body);
  assert.equal(accepted.status, 201);
  assert.deepEqual(accepted.data.messages.at(-1).metadata.uiPreferencePreview, { id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa" });
  assert.equal(uiPreviewCalls.prepare.length, 1);
  assert.equal(uiPreviewCalls.prepare[0].instruction, body.content);
  assert.equal(uiPreviewCalls.persist.length, 1);
  assert.equal(uiPreviewCalls.lock.length, 1);
  assert.equal(uiPreviewCalls.persist[0].inputMessageId, accepted.data.messages[0].id);
  assert.equal(uiPreviewCalls.persist[0].threadId, threadId);
  assert.ok(uiPreviewCalls.persist[0].connection);
  const replay = await send(body);
  assert.equal(replay.status, 200);
  assert.deepEqual(replay.data.messages.at(-1).metadata.uiPreferencePreview, { id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa" });
  assert.equal(uiPreviewCalls.prepare.length, 1);
  assert.equal(uiPreviewCalls.persist.length, 1);
});

integration("older clients receive an update message without generating a UI preview", async () => {
  runtime = async () => ({ reply: JSON.stringify({ type: "ui_preference" }), provider: "test-only", latencyMs: 1 });
  const result = await request(`/api/threads/${threadId}/messages`, { content: "调整妙页按钮", clientMessageId: crypto.randomUUID() }, token, "6", null);
  assert.equal(result.status, 201);
  assert.match(result.data.messages.at(-1).content, /更新/);
  assert.equal(result.data.messages.at(-1).metadata.uiPreferencePreview, undefined);
  assert.equal(uiPreviewCalls.prepare.length, 0);
});

integration("an unavailable UI Agent produces an explicit message and no preview", async () => {
  runtime = async () => ({ reply: JSON.stringify({ type: "ui_preference" }), provider: "test-only", latencyMs: 1 });
  uiPrepare = async () => { throw new HttpError(503, "unavailable", { code: "UI_AGENT_UNAVAILABLE" }); };
  const result = await send({ content: "调整妙页按钮", clientMessageId: crypto.randomUUID() });
  assert.equal(result.status, 201);
  assert.match(result.data.messages.at(-1).content, /UI Agent 暂不可用/);
  assert.equal(result.data.messages.at(-1).metadata.uiPreferencePreview, undefined);
  assert.equal(uiPreviewCalls.persist.length, 0);
});

integration("UI preview is not attached when Butler authorization changes during preparation", async () => {
  runtime = async () => ({ reply: JSON.stringify({ type: "ui_preference" }), provider: "test-only", latencyMs: 1 });
  uiPrepare = async args => {
    await query("UPDATE user_agents SET enabled = false WHERE user_id = ? AND agent_id = 'miaoxun-butler'", [owner]);
    return { instruction: args.instruction };
  };
  const result = await send({ content: "调整妙页按钮", clientMessageId: crypto.randomUUID() });
  assert.equal(result.status, 201);
  assert.match(result.data.messages.at(-1).content, /授权或引用内容已变化/);
  assert.equal(result.data.messages.at(-1).metadata.uiPreferencePreview, undefined);
  assert.equal(uiPreviewCalls.persist.length, 0);
});

integration("a preference revision conflict explains why the preview was not attached", async () => {
  runtime = async () => ({ reply: JSON.stringify({ type: "ui_preference" }), provider: "test-only", latencyMs: 1 });
  uiPersist = async () => { throw new HttpError(409, "changed", { code: "UI_PREFERENCE_REVISION_CONFLICT" }); };
  const result = await send({ content: "调整妙页按钮", clientMessageId: crypto.randomUUID() });
  assert.equal(result.status, 201);
  assert.match(result.data.messages.at(-1).content, /界面偏好.*变化/);
  assert.equal(result.data.messages.at(-1).metadata.uiPreferencePreview, undefined);
});

integration("ordinary butler chat creates one persistent workspace, preserves references/source, and replays the same receipt", async () => {
  const body = input();
  const accepted = await send(body);
  assert.equal(accepted.status, 201, JSON.stringify(accepted));
  const reply = accepted.data.messages.at(-1);
  assert.match(reply.content, /created your task/);
  assert.doesNotMatch(reply.content, /capabilities|agentId|media\.select/);
  const id = reply.metadata.agentWorkspace.id;
  const [createdWorkspace] = await workspaces();
  assert.deepEqual(Object.keys(createdWorkspace.limits), ["deadlineSeconds"]);
  assert.ok(createdWorkspace.limits.deadlineSeconds >= 30);
  const listed = (await request("/api/agent-workspaces")).data;
  assert.equal(listed.length, 1);
  assert.equal(listed[0].id, id);
  assert.equal(listed[0].source.page, "second-floor.albums");
  assert.equal(listed[0].contextRefs[0].id, albumId);
  assert.equal(listed[0].contextRefs[0].title, "Selected album");
  assert.match(listed[0].contextRefs[0].version, /^[a-f0-9]{64}$/);
  assert.equal((await request(`/api/agent-workspaces/${id}`, undefined, otherToken)).status, 404);
  await query("UPDATE station_albums SET description = 'Changed after acceptance' WHERE id = ?", [albumId]);
  const replay = await send({ ...body, clientContext: { ...body.clientContext, currentPage: "miao" } });
  assert.equal(replay.status, 200);
  assert.equal(replay.data.messages.at(-1).id, reply.id);
  assert.equal(replay.data.messages.at(-1).metadata.agentWorkspace.id, id);
  assert.equal((await workspaces()).length, 1);
  assert.equal((await query("SELECT * FROM agent_workspace_submissions WHERE user_id = ?", [owner])).length, 1);
  assert.equal(calls, 1);
  assert.equal((await send({ ...body, content: "Different task" })).status, 409);
});

integration("chat-created workspaces reach the real planner and persist actual specialist participants", async () => {
  const accepted = await send(input());
  const id = accepted.data.messages.at(-1).metadata.agentWorkspace.id;
  let plannerCalls = 0;
  const service = createAgentWorkspaceService({ run: async options => {
    assert.equal(options.mode, "coordinate");
    assert.equal(options.appContext.contextRefs[0].id, albumId);
    const receipt = await options.beforeModelCall();
    plannerCalls++;
    await options.afterModelCall({ receipt, provider: "test-only", model: "fixture", servedModel: "fixture", latencyMs: 1, tokenUsage: { prompt: 1, completion: 1, total: 2 } });
    return { reply: JSON.stringify({ type: "plan", summary: "Select material, then draft the page", steps: [
      { key: "material", agentId: "album-manager", capability: "media.select", goal: "Find matching images", dependsOn: [], contextRefIndexes: [0] },
      { key: "page", agentId: "site-builder", capability: "site.compose", goal: "Prepare a page from the selected material", dependsOn: ["material"], contextRefIndexes: [] },
    ] }) };
  } });
  const runner = createAgentWorkspaceRunner({ execute: service.executeWorkspaceNode, logger });
  assert.equal(await runner.runOnce(), true);
  const workspace = (await request(`/api/agent-workspaces/${id}`)).data;
  assert.equal(plannerCalls, 1);
  assert.deepEqual(workspace.steps.filter(node => node.capability !== "workspace.coordinate").map(node => node.agentId).sort(), ["album-manager", "site-builder"]);
  assert.equal(workspace.status, "running");
  assert.equal(workspace.steps.filter(node => node.agentId !== "miaoxun-butler").every(node => node.status === "queued"), true);
});

integration("question/clarification answers remain ordinary chat and invalid or invented decisions create no task", async () => {
  runtime = async () => ({ reply: JSON.stringify({ type: "reply", reply: "Which page do you want?" }), provider: "test-only", latencyMs: 1 });
  const question = await send({ ...input(), content: "What can you help with?" });
  assert.equal(question.data.messages.at(-1).content, "Which page do you want?");
  assert.equal(question.data.messages.at(-1).metadata.agentWorkspace, undefined);
  for (const reply of ["raw model JSON is not an answer", JSON.stringify({ ...taskDecision, capabilities: [{ agentId: "comic-diary", capability: "comic.generate" }] })]) {
    runtime = async () => ({ reply, provider: "test-only", latencyMs: 1 });
    const result = await send(input());
    assert.equal(result.data.messages.at(-1).metadata.provider, undefined);
    assert.equal(result.data.messages.at(-1).metadata.errorCode, undefined);
    assert.doesNotMatch(result.data.messages.at(-1).content, /raw model JSON|comic\.generate/);
  }
  assert.equal((await workspaces()).length, 0);
});

integration("a clarification keeps the selected album and original source through the user's next answer", async () => {
  runtime = async () => ({ reply: JSON.stringify({ type: "clarify", question: "What kind of page would you like?" }), provider: "test-only", latencyMs: 1 });
  const first = await send(input());
  const pending = first.data.messages.at(-1).metadata.butlerClarification;
  assert.equal(pending.requestMessageIds, undefined);
  const [storedReply] = await query("SELECT metadata FROM chat_messages WHERE id = ?", [first.data.messages.at(-1).id]);
  assert.deepEqual(storedReply.metadata.butlerClarification.requestMessageIds, [first.data.messages[0].id]);
  assert.equal(pending.contextRefs[0].id, albumId);
  assert.equal((await workspaces()).length, 0);
  runtime = async () => ({ reply: JSON.stringify(taskDecision), provider: "test-only", latencyMs: 1 });
  const answer = await send({ content: "A travel page", clientMessageId: crypto.randomUUID(), contextRefs: pending.contextRefs,
    clientContext: { currentPage: "messages.butler", language: "en" } });
  assert.ok(answer.data.messages.at(-1).metadata.agentWorkspace.id);
  const [workspace] = await workspaces();
  assert.equal(workspace.context_refs[0].id, albumId);
  assert.equal(workspace.source.page, "second-floor.albums");
});

integration("missing clarification references cannot become a whole-library task, and ordinary questions keep the pending scope", async () => {
  runtime = async () => ({ reply: JSON.stringify({ type: "clarify", question: "What should the page show?" }), provider: "test-only", latencyMs: 1 });
  await send(input());
  runtime = async () => ({ reply: JSON.stringify({ type: "reply", reply: "The result will be previewed first." }), provider: "test-only", latencyMs: 1 });
  const ordinary = await send({ content: "Can I review it before saving?", clientMessageId: crypto.randomUUID() });
  assert.equal(ordinary.data.messages.at(-1).metadata.butlerClarification.contextRefs[0].id, albumId);
  runtime = async options => {
    assert.equal(options.appContext.dispatch.pendingContextMissing, true);
    return { reply: JSON.stringify(taskDecision), provider: "test-only", latencyMs: 1 };
  };
  const answer = await send({ content: "A travel page", clientMessageId: crypto.randomUUID() });
  assert.match(answer.data.messages.at(-1).content, /保留原来的素材引用/);
  assert.equal(answer.data.messages.at(-1).metadata.butlerClarification.contextRefs[0].id, albumId);
  assert.equal((await workspaces()).length, 0);
});

integration("explicitly clearing a pending selection allows a new request and is part of the original retry fingerprint", async () => {
  runtime = async () => ({ reply: JSON.stringify({ type: "clarify", question: "Which page?" }), provider: "test-only", latencyMs: 1 });
  await send(input());
  runtime = async options => {
    assert.equal(options.appContext.dispatch.contextReset, true);
    assert.equal(options.appContext.dispatch.pendingContextMissing, false);
    return { reply: JSON.stringify({ ...taskDecision, capabilities: [{ agentId: "site-builder", capability: "site.compose" }] }), provider: "test-only", latencyMs: 1 };
  };
  const body = { content: "Start a new text-only page", clientMessageId: crypto.randomUUID(), butlerContextReset: true };
  const created = await send(body);
  assert.ok(created.data.messages.at(-1).metadata.agentWorkspace.id);
  assert.deepEqual((await workspaces())[0].context_refs, []);
  assert.equal((await send(body)).status, 200);
  assert.equal((await send({ ...body, butlerContextReset: false })).status, 409);
});

integration("a recalled source request or changed album prevents continuing a clarification before dispatch", async () => {
  runtime = async () => ({ reply: JSON.stringify({ type: "clarify", question: "Which page?" }), provider: "test-only", latencyMs: 1 });
  const first = await send(input());
  const pending = first.data.messages.at(-1).metadata.butlerClarification;
  const reply = { content: "A travel page", clientMessageId: crypto.randomUUID(), contextRefs: pending.contextRefs };
  await query("UPDATE station_albums SET description = 'Changed since first turn' WHERE id = ?", [albumId]);
  assert.equal((await send(reply)).status, 409);
  await query("UPDATE station_albums SET description = '' WHERE id = ?", [albumId]);
  await query("UPDATE chat_messages SET recalled_at = CURRENT_TIMESTAMP WHERE id = ?", [first.data.messages[0].id]);
  assert.equal((await send(reply)).status, 409);
  assert.equal(calls, 1);
  assert.equal((await workspaces()).length, 0);
});

integration("losing only the album from a multi-reference clarification cannot broaden media retrieval", async () => {
  const diaryId = crypto.randomUUID();
  await query("INSERT INTO station_diary_entries(id,user_id,title,body) VALUES (?, ?, 'Trip notes', 'Fixture only')", [diaryId, owner]);
  runtime = async () => ({ reply: JSON.stringify({ type: "clarify", question: "What style?" }), provider: "test-only", latencyMs: 1 });
  const first = await send({ ...input(), contextRefs: [{ kind: "station-album", id: albumId }, { kind: "station-diary", id: diaryId }] });
  const diaryRef = first.data.messages.at(-1).metadata.butlerClarification.contextRefs.find(ref => ref.kind === "station-diary");
  runtime = async () => ({ reply: JSON.stringify(taskDecision), provider: "test-only", latencyMs: 1 });
  const next = await send({ content: "A travel page", clientMessageId: crypto.randomUUID(), contextRefs: [diaryRef] });
  assert.match(next.data.messages.at(-1).content, /保留原来的素材引用/);
  assert.equal(next.data.messages.at(-1).metadata.butlerClarification.contextRefs.length, 2);
  assert.equal((await workspaces()).length, 0);
});

integration("provider failures preserve the pending selection for subsequent answers", async () => {
  runtime = async () => ({ reply: JSON.stringify({ type: "clarify", question: "Which style?" }), provider: "test-only", latencyMs: 1 });
  const first = await send(input());
  const original = first.data.messages.at(-1).metadata.butlerClarification;
  runtime = async () => { throw new Error("Test-only provider failure"); };
  const failed = await send({ content: "A travel page", clientMessageId: crypto.randomUUID(), contextRefs: original.contextRefs });
  assert.deepEqual(failed.data.messages.at(-1).metadata.butlerClarification, original);
  runtime = async () => ({ reply: JSON.stringify(taskDecision), provider: "test-only", latencyMs: 1 });
  const next = await send({ content: "Continue the page", clientMessageId: crypto.randomUUID() });
  assert.match(next.data.messages.at(-1).content, /保留原来的素材引用/);
  assert.equal((await workspaces()).length, 0);
});

integration("omitting a reference version cannot replace the original pending source after it changes", async () => {
  runtime = async () => ({ reply: JSON.stringify({ type: "clarify", question: "Which style?" }), provider: "test-only", latencyMs: 1 });
  await send(input());
  await query("UPDATE station_albums SET description = 'Changed after clarification' WHERE id = ?", [albumId]);
  const result = await send({ content: "A travel page", clientMessageId: crypto.randomUUID(), contextRefs: [{ kind: "station-album", id: albumId }] });
  assert.equal(result.status, 409);
  assert.equal(result.error.details.code, "AI_CONTEXT_CHANGED");
  assert.equal(calls, 1);
  assert.equal((await workspaces()).length, 0);
});

integration("concurrent retries while dispatch is pending do not call the model or create the task twice", async () => {
  let release;
  let started;
  const ready = new Promise(resolve => { started = resolve; });
  const blocked = new Promise(resolve => { release = resolve; });
  runtime = async () => { started(); await blocked; return { reply: JSON.stringify(taskDecision), provider: "test-only", latencyMs: 1 }; };
  const body = input();
  const first = send(body);
  await ready;
  const retry = await send(body);
  assert.equal(retry.status, 409);
  release();
  assert.equal((await first).status, 201);
  assert.equal((await send(body)).status, 200);
  assert.equal(calls, 1);
  assert.equal((await workspaces()).length, 1);
});

integration("a different concurrent answer inherits the pending input snapshot and cannot broaden its album scope", async () => {
  runtime = async () => ({ reply: JSON.stringify({ type: "clarify", question: "Which page style?" }), provider: "test-only", latencyMs: 1 });
  const initial = await send(input());
  const original = initial.data.messages.at(-1).metadata.butlerClarification;
  const answerA = { content: "A travel page", clientMessageId: crypto.randomUUID(), contextRefs: original.contextRefs };
  const answerB = { content: "Continue with those photos", clientMessageId: crypto.randomUUID() };
  let release, started, secondHadMissingContext = false;
  const ready = new Promise(resolve => { started = resolve; });
  const blocked = new Promise(resolve => { release = resolve; });
  runtime = async options => {
    if (options.input === answerA.content) {
      started();
      await blocked;
    } else {
      secondHadMissingContext = options.appContext.dispatch.pendingContextMissing;
    }
    return { reply: JSON.stringify(taskDecision), provider: "test-only", latencyMs: 1 };
  };
  const pendingA = send(answerA);
  let completedA;
  try {
    await ready;
    const [storedA] = await query("SELECT metadata FROM chat_messages WHERE user_id = ? AND client_message_id = ?", [owner, answerA.clientMessageId]);
    assert.equal(storedA.metadata.source, "app");
    assert.deepEqual(storedA.metadata.butlerClarification, { ...original, requestMessageIds: [initial.data.messages[0].id] });
    const completedB = await send(answerB);
    assert.equal(completedB.status, 201);
    assert.equal(secondHadMissingContext, true);
    assert.match(completedB.data.messages.at(-1).content, /保留原来的素材引用/);
    assert.deepEqual(completedB.data.messages.at(-1).metadata.butlerClarification, original);
    assert.equal(completedB.data.messages.at(-1).metadata.agentWorkspace, undefined);
    assert.equal((await workspaces()).length, 0);
  } finally {
    release();
    completedA = await pendingA;
  }
  assert.equal(completedA.status, 201);
  const saved = await workspaces();
  assert.equal(saved.length, 1);
  assert.equal(saved[0].id, completedA.data.messages.at(-1).metadata.agentWorkspace.id);
  assert.equal(saved[0].context_refs[0].id, albumId);
  assert.equal(saved[0].source.page, "second-floor.albums");
  assert.equal(calls, 3);
});

integration("a changed source or revoked coordinator stops task creation after model dispatch", async () => {
  for (const mutate of [
    () => query("UPDATE station_albums SET description = 'Changed during dispatch' WHERE id = ?", [albumId]),
    () => query("UPDATE user_agents SET enabled = false WHERE user_id = ? AND agent_id = 'miaoxun-butler'", [owner]),
  ]) {
    await query("UPDATE station_albums SET description = '' WHERE id = ?", [albumId]);
    await query("UPDATE user_agents SET enabled = true WHERE user_id = ?", [owner]);
    runtime = async () => { await mutate(); return { reply: JSON.stringify(taskDecision), provider: "test-only", latencyMs: 1 }; };
    const result = await send(input());
    assert.match(result.data.messages.at(-1).content, /未交付结果/);
    assert.equal(result.data.messages.at(-1).metadata.agentWorkspace, undefined);
    assert.equal((await workspaces()).length, 0);
  }
});

integration("an Agent granted while dispatch runs never expands that task's authority snapshot", async () => {
  await query("UPDATE user_agents SET enabled = false WHERE user_id = ? AND agent_id = 'site-builder'", [owner]);
  runtime = async options => {
    assert.equal(options.appContext.dispatch.availableCapabilities.some(item => item.agentId === "site-builder"), false);
    await query("UPDATE user_agents SET enabled = true WHERE user_id = ? AND agent_id = 'site-builder'", [owner]);
    return { reply: JSON.stringify(taskDecision), provider: "test-only", latencyMs: 1 };
  };
  const result = await send(input());
  assert.ok(result.data.messages.at(-1).metadata.agentWorkspace.id);
  assert.equal((await workspaces())[0].authority.capabilities.some(item => item.agentId === "site-builder"), false);
});

integration("a stale-message failure winning the input lock cannot be followed by a hidden workspace", async () => {
  runtime = async () => {
    const [message] = await query("SELECT id FROM chat_messages WHERE user_id = ? AND sender_type = 'user'", [owner]);
    await completeAgentMessageOnce({ userId: owner, threadId, inputMessageId: message.id, agentId: "miaoxun-butler", senderName: "Butler fixture",
      content: "An earlier failure receipt", metadata: { provider: "test-only" }, status: "error", provider: "test-only", latencyMs: 1 });
    return { reply: JSON.stringify(taskDecision), provider: "test-only", latencyMs: 1 };
  };
  const result = await send(input());
  assert.equal(result.data.messages.at(-1).content, "An earlier failure receipt");
  assert.equal((await workspaces()).length, 0);
});

integration("workspace creation and result commit roll back together, leaving no orphan task", async () => {
  await query(`CREATE FUNCTION test_dispatch_reply_failure() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
    IF NEW.user_id = '${owner}' AND NEW.sender_type = 'agent' AND jsonb_exists(NEW.metadata, 'agentWorkspace') THEN
      RAISE EXCEPTION 'test-only injected reply write failure';
    END IF;
    RETURN NEW;
  END $$`);
  await query("CREATE TRIGGER test_dispatch_reply_failure BEFORE INSERT ON chat_messages FOR EACH ROW EXECUTE FUNCTION test_dispatch_reply_failure()");
  try {
    assert.equal((await send(input())).status, 500);
    assert.equal((await workspaces()).length, 0);
    assert.equal((await query("SELECT * FROM agent_workspace_submissions WHERE user_id = ?", [owner])).length, 0);
  } finally {
    await query("DROP TRIGGER test_dispatch_reply_failure ON chat_messages");
    await query("DROP FUNCTION test_dispatch_reply_failure()");
  }
});

integration("old clients, cross-owner conversations and removed inputs cannot create workspaces", async () => {
  assert.equal((await request(`/api/threads/${threadId}/messages`, input(), token, null)).status, 426);
  assert.equal((await request(`/api/threads/${threadId}/messages`, input(), otherToken)).status, 404);
  assert.equal(calls, 0);
  runtime = async () => {
    await query("UPDATE chat_messages SET recalled_at = CURRENT_TIMESTAMP WHERE user_id = ? AND sender_type = 'user'", [owner]);
    return { reply: JSON.stringify(taskDecision), provider: "test-only", latencyMs: 1 };
  };
  assert.equal((await send(input())).status, 404);
  assert.equal((await workspaces()).length, 0);
});

integration("private profile, source and Agent history cannot become the shared workspace goal", async () => {
  const markers = { profile: "PROFILE_ONLY_PRIVATE_CANARY", source: "SOURCE_ONLY_PRIVATE_CANARY", history: "ASSISTANT_ONLY_PRIVATE_CANARY" };
  await query("UPDATE user_profiles SET bio = ? WHERE user_id = ?", [markers.profile, owner]);
  await query("UPDATE station_albums SET description = ? WHERE id = ?", [markers.source, albumId]);
  await query("INSERT INTO chat_messages(id,user_id,thread_id,sender_type,sender_name,content,metadata) VALUES (?, ?, ?, 'agent', 'Butler fixture', ?, '{}'::jsonb)",
    [crypto.randomUUID(), owner, threadId, markers.history]);
  const body = input();
  runtime = async options => {
    assert.equal(options.appContext.profile.bio, markers.profile);
    assert.equal(options.appContext.resolvedReferences[0].description, markers.source);
    assert.ok(options.messages.some(message => message.content === markers.history));
    assert.deepEqual(options.appContext.dispatch.requestMessages, [{ content: body.content }]);
    return { reply: JSON.stringify(taskDecision), provider: "test-only", latencyMs: 1 };
  };
  const result = await send(body);
  assert.ok(result.data.messages.at(-1).metadata.agentWorkspace.id);
  const [workspace] = await workspaces();
  assert.equal(workspace.goal, body.content);
  assert.equal(Object.values(markers).some(marker => JSON.stringify(workspace).includes(marker)), false);
  await query("UPDATE user_profiles SET bio = '' WHERE user_id = ?", [owner]);
});

integration("model-authored goals including private source text are rejected rather than promoted or stripped", async () => {
  const marker = "MODEL_PRIVATE_GOAL_CANARY";
  runtime = async () => ({ reply: JSON.stringify({ ...taskDecision, goal: marker }), provider: "test-only", latencyMs: 1 });
  const result = await send(input());
  assert.equal(result.data.messages.at(-1).metadata.agentWorkspace, undefined);
  assert.equal(result.data.messages.at(-1).content.includes(marker), false);
  assert.equal((await workspaces()).length, 0);
  assert.equal(calls, 1);
});

integration("sequential clarification uses every admitted user turn and excludes all generated questions", async () => {
  runtime = async () => ({ reply: JSON.stringify({ type: "clarify", question: "QUESTION_PRIVATE_CANARY Which theme?" }), provider: "test-only", latencyMs: 1 });
  const firstBody = input();
  const first = await send(firstBody);
  const refs = first.data.messages.at(-1).metadata.butlerClarification.contextRefs;
  const secondBody = { content: "A travel page", clientMessageId: crypto.randomUUID(), contextRefs: refs };
  runtime = async () => ({ reply: JSON.stringify({ type: "clarify", question: "ANOTHER_PRIVATE_QUESTION How long?" }), provider: "test-only", latencyMs: 1 });
  const second = await send(secondBody);
  const [pending] = await query("SELECT metadata FROM chat_messages WHERE id = ?", [second.data.messages.at(-1).id]);
  assert.deepEqual(pending.metadata.butlerClarification.requestMessageIds, [first.data.messages[0].id, second.data.messages[0].id]);
  assert.equal(second.data.messages.at(-1).metadata.butlerClarification.requestMessageIds, undefined);
  runtime = async options => {
    assert.deepEqual(options.appContext.dispatch.requestMessages, [{ content: firstBody.content }, { content: secondBody.content }, { content: "Make it short" }]);
    return { reply: JSON.stringify(taskDecision), provider: "test-only", latencyMs: 1 };
  };
  const third = await send({ content: "Make it short", clientMessageId: crypto.randomUUID(), contextRefs: refs });
  const [workspace] = await workspaces();
  assert.equal(workspace.goal, [firstBody.content, secondBody.content, "Make it short"].join("\n\n"));
  assert.equal(workspace.goal.includes("PRIVATE"), false);
  assert.ok(third.data.messages.at(-1).metadata.agentWorkspace.id);
  assert.equal(calls, 3);
});

integration("a recalled middle clarification turn blocks the full chain before another dispatch", async () => {
  runtime = async () => ({ reply: JSON.stringify({ type: "clarify", question: "Which theme?" }), provider: "test-only", latencyMs: 1 });
  const first = await send(input());
  const refs = first.data.messages.at(-1).metadata.butlerClarification.contextRefs;
  const second = await send({ content: "A travel page", clientMessageId: crypto.randomUUID(), contextRefs: refs });
  await query("UPDATE chat_messages SET recalled_at = CURRENT_TIMESTAMP WHERE id = ?", [second.data.messages[0].id]);
  runtime = async () => ({ reply: JSON.stringify(taskDecision), provider: "test-only", latencyMs: 1 });
  const last = await send({ content: "Make it short", clientMessageId: crypto.randomUUID(), contextRefs: refs });
  assert.equal(last.status, 409);
  assert.equal(last.error.details.code, "BUTLER_CONTEXT_CHANGED");
  assert.equal(calls, 2);
  assert.equal((await workspaces()).length, 0);
});

integration("request chains cannot substitute Agent output or messages from another owner or thread", async () => {
  const otherThreadId = crypto.randomUUID(), otherMessageId = crypto.randomUUID();
  await query("INSERT INTO chat_threads(id,user_id,title,kind) VALUES (?, ?, 'Other fixture', 'direct')", [otherThreadId, outsider]);
  await query("INSERT INTO chat_messages(id,user_id,thread_id,sender_type,sender_name,content) VALUES (?, ?, ?, 'user', 'Other fixture', 'OTHER_OWNER_CANARY')", [otherMessageId, outsider, otherThreadId]);
  runtime = async () => ({ reply: JSON.stringify({ type: "clarify", question: "Which theme?" }), provider: "test-only", latencyMs: 1 });
  const first = await send(input());
  const refs = first.data.messages.at(-1).metadata.butlerClarification.contextRefs;
  for (const invalid of [otherMessageId, first.data.messages.at(-1).id, crypto.randomUUID()]) {
    await query("UPDATE chat_messages SET metadata = jsonb_set(metadata, '{butlerClarification,requestMessageIds}', ?::jsonb) WHERE id = ?", [JSON.stringify([first.data.messages[0].id, invalid]), first.data.messages.at(-1).id]);
    const result = await send({ content: "A travel page", clientMessageId: crypto.randomUUID(), contextRefs: refs });
    assert.equal(result.status, 409);
    assert.equal(result.error.details.code, "BUTLER_CONTEXT_CHANGED");
  }
  assert.equal(calls, 1);
  assert.equal((await workspaces()).length, 0);
});

integration("an oversized request chain reports its limit without truncation or a hidden task, and replays that result", async () => {
  runtime = async () => ({ reply: JSON.stringify({ type: "clarify", question: "Which style?" }), provider: "test-only", latencyMs: 1 });
  const first = await send({ ...input(), content: "Write a script: " + "a".repeat(1870) });
  const refs = first.data.messages.at(-1).metadata.butlerClarification.contextRefs;
  runtime = async () => ({ reply: JSON.stringify(taskDecision), provider: "test-only", latencyMs: 1 });
  const body = { content: "b".repeat(200), clientMessageId: crypto.randomUUID(), contextRefs: refs };
  const result = await send(body);
  assert.match(result.data.messages.at(-1).content, /超过2000字/);
  assert.equal(result.data.messages.at(-1).metadata.agentWorkspace, undefined);
  assert.equal((await workspaces()).length, 0);
  assert.equal((await send(body)).data.messages.at(-1).id, result.data.messages.at(-1).id);
  assert.equal(calls, 2);
});
