import assert from "node:assert/strict";
import crypto from "node:crypto";
import test, { before, beforeEach, after } from "node:test";
import express from "express";
import { query, closeDatabase } from "../src/db.js";
import { authenticate, hashToken } from "../src/auth.js";
import * as repository from "../src/agent-workspace-repository.js";
import { createAgentWorkspaceService } from "../src/agent-workspace-service.js";
import { createWorkspaceCapabilityExecutor } from "../src/agent-workspace-capabilities.js";
import { registerAgentWorkspaceRoutes } from "../src/routes/agent-workspace-routes.js";
import { registerStationSiteRoutes } from "../src/routes/station-site-routes.js";
import { createRequestErrorHandler } from "../src/request-observability.js";
import { getAgent } from "../../agents/registry.js";
import { assertSiteDocument } from "../../shared/site-document.js";

import { seedPublishedAgentConsent, cleanupPublishedAgentConsent } from "./helpers/agent-publishing-fixture.js";

let publicationFixture;
const enabled = process.env.RUN_AGENT_WORKSPACE_SERVICE_INTEGRATION === "1";
const integration = (name, work) => test(name, { skip: !enabled && "Set RUN_AGENT_WORKSPACE_SERVICE_INTEGRATION=1 with a migrated loopback *_migration_test database" }, work);
const owner = crypto.randomUUID(), outsider = crypto.randomUUID();
const albumId = crypto.randomUUID(), mediaId = crypto.randomUUID(), extraMediaId = crypto.randomUUID();
const token = crypto.randomBytes(32).toString("hex"), outsiderToken = crypto.randomBytes(32).toString("hex");
const limits = { deadlineSeconds: 600 };
const receipt = { provider: "isolated-workspace-fixture", model: "test-only", tokenUsage: { prompt: 3, completion: 2, total: 5 }, latencyMs: 1 };
const code = expected => error => error.details?.code === expected;
let service, server, origin, decisions, modelCalls, siteCalls, mediaCalls, generationHook, expectedSiteCompose;
const input = overrides => ({ user: { id: owner }, goal: "生成只有个人介绍文字的私有页面", contextRefs: [], source: { page: "miao.feed", module: "task-feed" }, idempotencyKey: crypto.randomUUID(), ...overrides });
const sitePlan = (indexes = [], dependencies = []) => ({ type: "plan", summary: "直接交给建站能力处理", steps: [{ key: "compose", agentId: "site-builder", capability: "site.compose", goal: "依据已提供内容生成私有页面", dependsOn: dependencies, contextRefIndexes: indexes }] });
const complete = () => ({ type: "complete", summary: "页面已准备好，请预览确认", resultKey: "compose" });
const content = (assetIds = []) => ({ language: "zh", theme: "clean", title: "PG协作验证页面", summary: "仅测试夹具，非产品数据",
  sections: [{ type: assetIds.length ? "gallery" : "about", title: "介绍", subtitle: "", body: "仅隔离测试中的内容", assetIds, diaryEntryIds: [], actions: [] }] });
const modelCall = async (options, work) => {
  const reservation = await options.beforeModelCall();
  modelCalls++;
  const result = await work();
  await options.afterModelCall({ receipt: reservation, ...receipt });
  return result;
};
const executeNext = async () => {
  const claim = await repository.claimWorkspaceNode();
  assert.ok(claim, "Expected a persisted node to be claimable");
  assert.equal(claim.workspace.userId, owner, "Another integration suite must not share this global queue concurrently");
  return service.executeWorkspaceNode(claim);
};
const waiting = async (overrides = {}, plan = sitePlan()) => {
  decisions = [plan, complete()];
  const submitted = await service.submitAgentWorkspace(input(overrides));
  assert.equal(submitted.status, "queued");
  await executeNext(); await executeNext();
  return executeNext();
};
const confirm = (workspace, overrides = {}) => service.decideAgentWorkspace({ userId: owner, workspaceId: workspace.id,
  revision: workspace.revision, operation: "confirm", approvalId: workspace.approval.id, ...overrides });
const profileConfig = async () => (await query("SELECT station_config FROM user_profiles WHERE user_id = ?", [owner]))[0].station_config;
const request = async (path, body, options = {}) => {
  const headers = { Authorization: `Bearer ${options.token || token}`, "Content-Type": "application/json", "X-Miaoxun-App-Build": "46",
    "X-Miaoxun-AI-Contract": "1", "X-Miaoxun-Agent-Workspace": "6", "X-Miaoxun-Site-Document": "2", ...options.headers };
  for (const key of Object.keys(headers)) if (headers[key] === null) delete headers[key];
  const response = await fetch(`${origin}${path}`, { method: body === undefined ? "GET" : "POST", headers, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
  return { status: response.status, ...await response.json() };
};

integration("HTTP rejected submissions return a durable exact-key receipt and replay after authorization changes", async () => {
  const { user: _user, ...body } = input();
  await query("UPDATE user_agents SET enabled=false WHERE user_id=? AND agent_id='miaoxun-butler'", [owner]);
  const rejected = await request("/api/agent-workspaces", body);
  assert.equal(rejected.status, 403);
  assert.deepEqual(rejected.error.details, { code: "WORKSPACE_ACCESS_REQUIRED", submissionOutcome: "rejected", idempotencyKey: body.idempotencyKey });
  await query("UPDATE user_agents SET enabled=true WHERE user_id=? AND agent_id='miaoxun-butler'", [owner]);
  const repeated = await request("/api/agent-workspaces", body);
  assert.equal(repeated.status, rejected.status);
  assert.deepEqual(repeated.error.details, rejected.error.details);
  const conflict = await request("/api/agent-workspaces", { ...body, goal: "Different input" });
  assert.equal(conflict.status, 409);
  assert.equal(conflict.error.details.submissionOutcome, undefined);
  const fresh = await request("/api/agent-workspaces", { ...body, idempotencyKey: crypto.randomUUID() });
  assert.equal(fresh.status, 202);
  assert.equal(modelCalls, 0);
});

before(async () => {
  if (!enabled) return;
  const url = new URL(process.env.DATABASE_URL);
  assert.ok(["127.0.0.1", "localhost", "[::1]"].includes(url.hostname) && url.pathname.endsWith("_migration_test"), "Only disposable loopback migration databases may receive fixtures");
  const [database] = await query("SELECT current_database() AS name");
  assert.match(database.name, /_migration_test$/);
  for (const [id, authToken] of [[owner, token], [outsider, outsiderToken]]) {
    await query("INSERT INTO users(id,email,password_hash,display_name,ai_id) VALUES(?,?,'isolated-test-only',?,?)", [id, `${id}@example.invalid`, `Workspace service test ${id.slice(0, 8)}`, String(crypto.randomInt(100000000000, 999999999999))]);
    await query("INSERT INTO user_profiles(user_id,nickname,avatar_text) VALUES(?, 'Workspace integration', 'W')", [id]);
    await query("INSERT INTO auth_sessions(id,user_id,token_hash,expires_at) VALUES(?,?,?,CURRENT_TIMESTAMP + INTERVAL '1 hour')", [crypto.randomUUID(), id, hashToken(authToken)]);
  }
  for (const agentId of ["miaoxun-butler", "site-builder", "album-manager"]) {
    const agent = await getAgent(agentId);
    await query("INSERT INTO user_agents(user_id,agent_id,enabled,granted_scopes) VALUES(?,?,true,?::jsonb)", [owner, agentId, JSON.stringify(agent.permissions)]);
  }
  publicationFixture = await seedPublishedAgentConsent({ userId: owner, agentKeys: ["site-builder", "album-manager"] });
  await query("INSERT INTO station_albums(id,user_id,title) VALUES(?,?,'Workspace scoped album')", [albumId, owner]);
  for (const id of [mediaId, extraMediaId]) await query("INSERT INTO station_media_assets(id,user_id,album_id,kind,mime_type,original_filename,status) VALUES(?,?,?,'image','image/jpeg','isolated-fixture.jpg','uploaded')", [id, owner, albumId]);
  await query("INSERT INTO media_retrieval_profiles(user_id,index_state,consent_version,consent_granted_at) VALUES(?,'enabled','media-retrieval-consent-v1',CURRENT_TIMESTAMP)", [owner]);
  const executor = createWorkspaceCapabilityExecutor({
    generateSite: async options => modelCall(options, async () => {
      siteCalls++;
      assert.equal(options.user.id, owner);
      assert.deepEqual(options.stationContent.albums, []);
      assert.ok(options.stationContent.mediaAssets.every(asset => asset.id === mediaId), "Only selected/delegated media is exposed, never the global library");
      assert.equal(JSON.stringify(options.stationContent).includes("storageKey"), false);
      if (generationHook) await generationHook(options);
      return { source: "model", draft: content(options.stationContent.mediaAssets.map(asset => asset.id)), model: receipt };
    }),
    runAgentRuntime: async options => modelCall(options, async () => {
      mediaCalls++;
      assert.equal(options.agentId, "album-manager");
      await options.tools.execute("search_media", { query: options.input, albumId, limit: 1 });
      return { reply: "Test model completed its real scoped tool invocation", ...receipt };
    }),
    retrievalService: {
      getMediaRetrievalStatus: async () => ({ enabled: true, availability: { canStartRun: true }, backfill: { indexedAssets: 2, totalAssets: 2, skippedAssets: 0 } }),
      searchMediaRetrieval: async options => modelCall(options, async () => {
        assert.equal(options.userId, owner); assert.equal(options.albumId, albumId);
        const runId = crypto.randomUUID();
        await query("INSERT INTO agent_runs(id,user_id,agent_id,status,run_type,lifecycle_status) VALUES(?,?,'media-retrieval','success','media-search','succeeded')", [runId, owner]);
        const [profile] = await query("SELECT index_epoch FROM media_retrieval_profiles WHERE user_id = ?", [owner]);
        const response = { agentRunId: runId, results: [{ mediaAssetId: mediaId, kind: "image", matchedFrameTimestampMs: null }] };
        await query("INSERT INTO agent_run_events(id,agent_run_id,user_id,sequence,lifecycle_status,event_type,payload,delivery_key) VALUES(?,?,?,1,'succeeded','completed',?::jsonb,?)", [crypto.randomUUID(), runId, owner, JSON.stringify({ indexEpoch: profile.index_epoch, searchResponse: response }), crypto.randomUUID()]);
        return response;
      }),
    },
  });
  service = createAgentWorkspaceService({ executeCapability: executor, limits, run: async options => modelCall(options, async () => {
    assert.equal(options.agentId, "miaoxun-butler"); assert.equal(options.mode, "coordinate");
    assert.equal(JSON.stringify(options.appContext).includes("claimToken"), false);
    assert.equal(Object.hasOwn(options.appContext, "remainingLimits"), false);
    assert.equal(options.appContext.availableCapabilities.some(entry => entry.capability === "site.compose"), expectedSiteCompose,
      "Coordinator capabilities must match the test's current grant and original authority snapshot");
    assert.ok(decisions.length, "Unexpected additional coordinator call");
    const reply = typeof decisions[0] === "function" ? await decisions.shift()(options) : decisions.shift();
    return { reply: JSON.stringify(reply), ...receipt };
  }) });
  const app = express(); app.use(express.json());
  const asyncHandler = fn => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
  registerAgentWorkspaceRoutes(app, { authenticate, asyncHandler, service });
  registerStationSiteRoutes(app, { authenticate, asyncHandler });
  app.use(createRequestErrorHandler({ production: true, logger: { error() {} } }));
  await new Promise(resolve => { server = app.listen(0, "127.0.0.1", resolve); });
  origin = `http://127.0.0.1:${server.address().port}`;
});
beforeEach(async () => {
  if (!enabled) return;
  decisions = []; modelCalls = 0; siteCalls = 0; mediaCalls = 0; generationHook = null; expectedSiteCompose = true;
  await query("DELETE FROM agent_workspace_submissions WHERE user_id = ?", [owner]);
  await query("DELETE FROM agent_workspaces WHERE user_id = ?", [owner]);
  await query("DELETE FROM station_site_drafts WHERE user_id = ?", [owner]);
  await query("DELETE FROM agent_runs WHERE user_id = ?", [owner]);
  await query("UPDATE user_profiles SET station_config = '{}'::jsonb,bio = '' WHERE user_id = ?", [owner]);
  await query("UPDATE users SET status = 'active' WHERE id = ?", [owner]);
  for (const id of ["miaoxun-butler", "site-builder", "album-manager"]) await query("UPDATE user_agents SET enabled=true,granted_scopes=?::jsonb WHERE user_id=? AND agent_id=?", [JSON.stringify((await getAgent(id)).permissions), owner, id]);
  await query("UPDATE station_media_assets SET caption='',deleted_at=NULL,status='uploaded',user_id=? WHERE id=?", [owner,mediaId]);
  await query("UPDATE media_retrieval_profiles SET index_state='enabled',consent_version='media-retrieval-consent-v1',consent_granted_at=CURRENT_TIMESTAMP WHERE user_id=?",[owner]);
});
after(async () => {
  if (!enabled) return;
  await new Promise(resolve => server?.close(resolve));
  await query("DELETE FROM agent_runs WHERE user_id IN (?,?)", [owner, outsider]);
  await cleanupPublishedAgentConsent({ userIds: [owner, outsider] });
  await query("DELETE FROM users WHERE id IN (?,?)", [owner, outsider]);
  await publicationFixture?.cleanup(); await closeDatabase();
});

integration("HTTP dynamic direct composition, complete, full preview and atomic private confirmation", async () => {
  decisions = [sitePlan(), complete()];
  const { user, ...body } = input();
  const submitted = await request("/api/agent-workspaces", body);
  assert.equal(submitted.status, 202); assert.equal(modelCalls, 0);
  const id = submitted.data.id;
  assert.equal((await request(`/api/agent-workspaces/${id}`, undefined, { token: outsiderToken })).status, 404);
  await executeNext(); await executeNext();
  const pending = await executeNext();
  assert.equal(pending.status, "awaiting_confirmation"); assert.equal(siteCalls, 1); assert.equal(mediaCalls, 0); assert.equal(modelCalls, 3);
  assert.deepEqual(pending.steps.map(step => step.capability), ["workspace.coordinate", "site.compose", "workspace.coordinate"]);
  assert.deepEqual(await profileConfig(), {});
  const preview = await request(`/api/station/site-drafts/${pending.approval.draftId}/document`);
  assert.equal(preview.status, 200); assertSiteDocument(preview.data.document);
  assert.equal(preview.data.documentHash, pending.approval.draftHash); assert.equal(preview.data.resourcesHash, pending.approval.resourcesHash);
  const decision = { revision: pending.revision, operation: "confirm", approvalId: pending.approval.id };
  assert.equal((await request(`/api/agent-workspaces/${id}/decision`, decision, { headers: { "X-Miaoxun-Site-Document": null } })).status, 426);
  const saved = await request(`/api/agent-workspaces/${id}/decision`, decision);
  assert.equal(saved.status, 200); assert.equal(saved.data.status, "succeeded");
  assert.deepEqual((await profileConfig()).siteLayout, preview.data.document);
  assert.equal((await request(`/api/agent-workspaces/${id}/decision`, decision)).data.revision, saved.data.revision);
  assert.equal((await request(`/api/agent-workspaces/${id}/decision`, decision, { headers: { "X-Miaoxun-Agent-Workspace": null } })).status, 426);
  assert.equal(modelCalls, 3); assert.equal(await repository.claimWorkspaceNode(), null);
});

integration("old workspace contract fails before writes, models and idempotent replay", async () => {
  const { user, ...body } = input();
  for (const version of [null, "0", "1", "2", "3", "4", "5"]) {
    const result = await request("/api/agent-workspaces", body, { headers: { "X-Miaoxun-Agent-Workspace": version } });
    assert.equal(result.status, 426);
  }
  assert.equal((await query("SELECT id FROM agent_workspaces WHERE user_id=?",[owner])).length, 0); assert.equal(modelCalls,0);
  const accepted = await request("/api/agent-workspaces",body); assert.equal(accepted.status,202);
  assert.equal((await request("/api/agent-workspaces",body,{headers:{"X-Miaoxun-AI-Contract":null}})).status,426);
  assert.equal((await query("SELECT id FROM agent_workspaces WHERE user_id=?",[owner])).length,1);
});

integration("clarification persists user reply and resumes coordinator using real prior history",async()=>{
  decisions=[{type:"clarify",question:"这次只需要文字介绍吗？"},options=>{assert.deepEqual(options.appContext.followups.map(item=>item.text),["是，只生成文字介绍"]);return sitePlan();},complete()];
  const submitted=await service.submitAgentWorkspace(input());const question=await executeNext();
  assert.equal(question.status,"waiting_input");assert.equal(question.question,"这次只需要文字介绍吗？");assert.equal(await repository.claimWorkspaceNode(),null);
  const reply={userId:owner,workspaceId:submitted.id,revision:question.revision,operation:"reply",text:"是，只生成文字介绍"};
  const resumed=await service.decideAgentWorkspace(reply);assert.equal(resumed.status,"queued");
  assert.equal((await service.decideAgentWorkspace(reply)).revision,resumed.revision);
  await executeNext();await executeNext();const pending=await executeNext();assert.equal(pending.status,"awaiting_confirmation");assert.equal(modelCalls,4);
});

integration("missing specialist scope is explained without exposing an executable capability", async () => {
  const siteAgent = await getAgent("site-builder");
  await query("UPDATE user_agents SET granted_scopes=?::jsonb WHERE user_id=? AND agent_id='site-builder'",
    [JSON.stringify(siteAgent.permissions.filter(scope => scope !== "messages:read")), owner]);
  expectedSiteCompose = false;
  decisions = [options => {
    assert.ok(options.appContext.availableCapabilities.some(entry => entry.capability === "media.select"));
    assert.deepEqual(options.appContext.unavailableCapabilities.filter(item => item.capability === "site.compose").map(item => ({ agentName: item.agentName, reason: item.reason })),
      [{ agentName: siteAgent.name, reason: "authorization_required" }]);
    const diagnostic = options.appContext.unavailableCapabilities.find(item => item.capability === "site.compose");
    assert.deepEqual(Object.keys(diagnostic).sort(), ["agentId", "agentName", "capability", "description", "reason", "requiredScopes"]);
    assert.equal(typeof diagnostic.description, "string"); assert.ok(diagnostic.description.length > 0);
    return { type: "request_access", summary: "生成页面需要建站能力", capabilities: [{ agentId: "site-builder", capability: "site.compose" }] };
  }];
  const submitted = await service.submitAgentWorkspace(input());
  const [stored] = await query("SELECT authority FROM agent_workspaces WHERE id=?", [submitted.id]);
  assert.equal(stored.authority.capabilities.some(entry => entry.capability === "site.compose"), false);
  const question = await executeNext();
  assert.equal(question.status, "waiting_input"); assert.equal(modelCalls, 1);
  assert.equal(siteCalls, 0); assert.equal(mediaCalls, 0);
  assert.equal((await query("SELECT id FROM station_site_drafts WHERE user_id=?", [owner])).length, 0);
  assert.equal(await repository.claimWorkspaceNode(), null);
});

integration("a coordinator with incomplete declaration cannot submit even when task scopes remain", async () => {
  const agent = await getAgent("miaoxun-butler");
  await query("UPDATE user_agents SET granted_scopes=?::jsonb WHERE user_id=? AND agent_id='miaoxun-butler'",
    [JSON.stringify(agent.permissions.filter(scope => scope !== "profile:read")), owner]);
  await assert.rejects(service.submitAgentWorkspace(input()), code("WORKSPACE_ACCESS_REQUIRED"));
  assert.equal(modelCalls, 0);
  assert.equal((await query("SELECT id FROM agent_workspaces WHERE user_id=?", [owner])).length, 0);
});

integration("a complete coordinator cannot substitute for a specialist's incomplete declaration", async () => {
  const agent = await getAgent("site-builder");
  await query("UPDATE user_agents SET granted_scopes=?::jsonb WHERE user_id=? AND agent_id='site-builder'",
    [JSON.stringify(agent.permissions.filter(scope => scope !== "messages:read")), owner]);
  expectedSiteCompose = false;
  decisions = [sitePlan()];
  const submitted = await service.submitAgentWorkspace(input());
  const [stored] = await query("SELECT authority FROM agent_workspaces WHERE id=?", [submitted.id]);
  assert.equal(stored.authority.capabilities.some(entry => entry.agentId === "site-builder"), false);
  await assert.rejects(executeNext(), code("WORKSPACE_PLAN_INVALID"));
  assert.equal(siteCalls, 0);
});

integration("an access request rejects reply even after a later grant; only a new task gains the scope", async () => {
  const siteAgent = await getAgent("site-builder");
  await query("UPDATE user_agents SET granted_scopes=?::jsonb WHERE user_id=? AND agent_id='site-builder'",
    [JSON.stringify(siteAgent.permissions.filter(scope => scope !== "album:read")), owner]);
  expectedSiteCompose = false;
  decisions = [{ type: "request_access", summary: "生成页面需要建站能力", capabilities: [{ agentId: "site-builder", capability: "site.compose" }] }];
  const submitted = await service.submitAgentWorkspace(input());
  const [original] = await query("SELECT authority FROM agent_workspaces WHERE id=?", [submitted.id]);
  const question = await executeNext();
  assert.equal(question.inputRequest.kind, "agent_access");
  assert.deepEqual(question.allowedActions, ["cancel"]);
  assert.equal(question.inputRequest.nextAction, "manage_agents_then_restart");
  assert.deepEqual(question.inputRequest.requirements[0].requiredScopes, siteAgent.workspaceCapabilities[0].requiredScopes);
  for (const grantLater of [false, true]) {
    if (grantLater) await query("UPDATE user_agents SET granted_scopes=?::jsonb WHERE user_id=? AND agent_id='site-builder'", [JSON.stringify(siteAgent.permissions), owner]);
    await assert.rejects(service.decideAgentWorkspace({ userId: owner, workspaceId: submitted.id,
      revision: question.revision, operation: "reply", text: "已授权，请继续" }), code("WORKSPACE_NEW_TASK_REQUIRED"));
  }
  const unchanged = await repository.getAgentWorkspace({ userId: owner, workspaceId: submitted.id });
  assert.equal(unchanged.revision, question.revision);
  assert.equal(await repository.claimWorkspaceNode(), null);
  const [afterReply] = await query("SELECT authority FROM agent_workspaces WHERE id=?", [submitted.id]);
  assert.deepEqual(afterReply.authority, original.authority);
  assert.equal(modelCalls, 1); assert.equal(siteCalls, 0); assert.equal(mediaCalls, 0);
  const fresh = await service.submitAgentWorkspace(input());
  const [newTask] = await query("SELECT authority FROM agent_workspaces WHERE id=?", [fresh.id]);
  assert.equal(newTask.authority.capabilities.some(entry => entry.capability === "site.compose"), true);
  const cancelled = await service.decideAgentWorkspace({ userId: owner, workspaceId: submitted.id, revision: question.revision, operation: "cancel" });
  assert.equal(cancelled.inputRequest, null); assert.equal(cancelled.question, null);
  assert.equal(cancelled.summary, "协作任务已取消");
  assert.equal(cancelled.steps[0].summary, "生成页面需要建站能力");
});

integration("a later grant during genuine clarification produces a structured new-task request", async () => {
  const siteAgent = await getAgent("site-builder");
  await query("UPDATE user_agents SET enabled=false WHERE user_id=? AND agent_id='site-builder'", [owner]);
  expectedSiteCompose = false;
  decisions = [{ type: "clarify", question: "请补充任务目标" }];
  const submitted = await service.submitAgentWorkspace(input());
  const question = await executeNext();
  assert.deepEqual(question.inputRequest, { kind: "clarification", question: "请补充任务目标" });
  await query("UPDATE user_agents SET enabled=true WHERE user_id=? AND agent_id='site-builder'", [owner]);
  decisions = [options => {
    assert.equal(options.appContext.unavailableCapabilities.find(item => item.capability === "site.compose").reason, "new_task_required");
    return { type: "request_access", summary: "文字页面需要建站能力", capabilities: [{ agentId: "site-builder", capability: "site.compose" }] };
  }];
  await service.decideAgentWorkspace({ userId: owner, workspaceId: submitted.id, revision: question.revision, operation: "reply", text: "生成文字页面" });
  const request = await executeNext();
  assert.equal(request.inputRequest.reason, "new_task_required");
  assert.equal(request.inputRequest.nextAction, "restart");
  assert.equal(request.inputRequest.requirements[0].agentName, siteAgent.name);
  assert.deepEqual(request.allowedActions, ["cancel"]);
});

integration("unrelated missing authorization does not block a supported available capability", async () => {
  await query("UPDATE user_agents SET enabled=false WHERE user_id=? AND agent_id='album-manager'", [owner]);
  const pending = await waiting();
  assert.equal(pending.status, "awaiting_confirmation");
  assert.equal(siteCalls, 1); assert.equal(mediaCalls, 0);
});

integration("an authorized coordinator can request only the needed specialist when no specialist is enabled", async () => {
  await query("UPDATE user_agents SET enabled=false WHERE user_id=? AND agent_id IN ('album-manager','site-builder')", [owner]);
  expectedSiteCompose = false;
  decisions = [options => {
    assert.equal(options.appContext.availableCapabilities.some(item => ["site.compose", "media.select"].includes(item.capability)), false);
    assert.equal(options.appContext.unavailableCapabilities.filter(item => ["site.compose", "media.select"].includes(item.capability)).length, 2);
    return { type: "request_access", summary: "创建页面需要建站能力", capabilities: [{ agentId: "site-builder", capability: "site.compose" }] };
  }];
  await service.submitAgentWorkspace(input());
  const request = await executeNext();
  assert.deepEqual(request.inputRequest.requirements.map(item => item.agentId), ["site-builder"]);
  assert.deepEqual(request.allowedActions, ["cancel"]);
  assert.equal(modelCalls, 1); assert.equal(siteCalls, 0); assert.equal(mediaCalls, 0);
});

integration("access recovery is rechecked when the coordinator finishes after a grant changes", async () => {
  await query("UPDATE user_agents SET enabled=false WHERE user_id=? AND agent_id='site-builder'", [owner]);
  expectedSiteCompose = false;
  decisions = [async options => {
    assert.equal(options.appContext.unavailableCapabilities.find(item => item.capability === "site.compose").reason, "authorization_required");
    await query("UPDATE user_agents SET enabled=true WHERE user_id=? AND agent_id='site-builder'", [owner]);
    return { type: "request_access", summary: "创建页面需要建站能力", capabilities: [{ agentId: "site-builder", capability: "site.compose" }] };
  }];
  await service.submitAgentWorkspace(input());
  const request = await executeNext();
  assert.equal(request.inputRequest.reason, "new_task_required");
  assert.equal(request.inputRequest.nextAction, "restart");
  assert.deepEqual(request.allowedActions, ["cancel"]);
});

integration("idempotent concurrent creation has one durable workflow and changed goal conflicts",async()=>{
  const args=input();const results=await Promise.all([service.submitAgentWorkspace(args),service.submitAgentWorkspace(args)]);
  assert.equal(results[0].id,results[1].id);assert.equal(modelCalls,0);
  await assert.rejects(service.submitAgentWorkspace({...args,goal:"不同目标"}),code("WORKSPACE_IDEMPOTENCY_CONFLICT"));
  assert.equal((await query("SELECT id FROM agent_workspace_nodes WHERE workspace_id=?",[results[0].id])).length,1);
});

integration("revoked coordination/specialist access stops before dispatch and cannot confirm",async()=>{
  const submitted=await service.submitAgentWorkspace(input());const claim=await repository.claimWorkspaceNode();
  await query("UPDATE user_agents SET enabled=false WHERE user_id=? AND agent_id='miaoxun-butler'",[owner]);
  await assert.rejects(service.executeWorkspaceNode(claim),code("WORKSPACE_ACCESS_REVOKED"));assert.equal(modelCalls,0);
  await repository.failWorkspaceNode({nodeId:claim.node.id,claimToken:claim.node.claimToken,error:{code:"WORKSPACE_ACCESS_REVOKED",message:"Test revoked"}});
  await query("UPDATE user_agents SET enabled=true WHERE user_id=?",[owner]);
  const pending=await waiting();await query("UPDATE user_agents SET enabled=false WHERE user_id=? AND agent_id='site-builder'",[owner]);
  await assert.rejects(confirm(pending),code("WORKSPACE_ACCESS_REVOKED"));assert.deepEqual(await profileConfig(),{});
  assert.equal((await repository.getAgentWorkspace({userId:owner,workspaceId:pending.id})).status,"awaiting_confirmation");assert.equal(submitted.status,"queued");
});

integration("profile and selected media changes invalidate confirmation without partial save",async()=>{
  const pending=await waiting({contextRefs:[{kind:"station-photo",id:mediaId}]},sitePlan([0]));
  await query("UPDATE station_media_assets SET caption='Changed after generation' WHERE id=?",[mediaId]);
  await assert.rejects(confirm(pending),code("AI_CONTEXT_CHANGED"));assert.deepEqual(await profileConfig(),{});
  await query("DELETE FROM agent_workspace_submissions WHERE user_id=?",[owner]);
  await query("DELETE FROM agent_workspaces WHERE user_id=?",[owner]);await query("DELETE FROM station_site_drafts WHERE user_id=?",[owner]);
  const plain=await waiting();await query("UPDATE user_profiles SET bio='Changed after generation' WHERE user_id=?",[owner]);
  await assert.rejects(confirm(plain),code("SITE_TASK_PROFILE_CHANGED"));assert.deepEqual(await profileConfig(),{});
});

integration("generation resource changes roll back node completion and draft persistence",async()=>{
  decisions=[sitePlan([0])];await service.submitAgentWorkspace(input({contextRefs:[{kind:"station-photo",id:mediaId}]}));await executeNext();
  generationHook=async()=>query("UPDATE station_media_assets SET caption='Changed during isolated provider call' WHERE id=?",[mediaId]);
  await assert.rejects(executeNext(),code("AI_CONTEXT_CHANGED"));
  assert.equal((await query("SELECT id FROM station_site_drafts WHERE user_id=?",[owner])).length,0);assert.deepEqual(await profileConfig(),{});
});

integration("actual scoped media handoff composes exact page and exposes only completed owned media",async()=>{
  const plan={type:"plan",summary:"先选择素材，再根据成果建站",steps:[{key:"select",agentId:"album-manager",capability:"media.select",goal:"找所选相册的照片",dependsOn:[],contextRefIndexes:[0]},...sitePlan([],['select']).steps]};
  decisions=[plan,complete()];const submitted=await service.submitAgentWorkspace(input({contextRefs:[{kind:"station-album",id:albumId}]}));
  await assert.rejects(service.getWorkspaceMedia({userId:owner,workspaceId:submitted.id,assetId:mediaId}),code("WORKSPACE_MEDIA_NOT_FOUND"));
  await executeNext();await executeNext();await executeNext();const pending=await executeNext();
  assert.equal(pending.status,"awaiting_confirmation");assert.equal(mediaCalls,1);assert.equal(siteCalls,1);assert.equal(modelCalls,5);
  const selection=pending.steps.find(step=>step.key==='select').result;assert.equal(selection.kind,'media_selection');assert.match(selection.assets[0].version,/^[a-f0-9]{64}$/);
  const media=await request(`/api/agent-workspaces/${submitted.id}/media/${mediaId}`);assert.equal(media.status,200);assert.equal(media.data.id,mediaId);assert.equal(media.data.status,'uploaded');
  assert.equal((await request(`/api/agent-workspaces/${submitted.id}/media/${extraMediaId}`)).status,404);
  assert.equal((await request(`/api/agent-workspaces/${submitted.id}/media/${mediaId}`,undefined,{token:outsiderToken})).status,404);
  const preview=await request(`/api/station/site-drafts/${pending.approval.draftId}/document`);assert.deepEqual(preview.data.mediaAssets.map(asset=>asset.id),[mediaId]);
  const saved=await confirm(pending);assert.equal(saved.status,'succeeded');assert.equal((await profileConfig()).siteDraftId,pending.approval.draftId);
});

integration("media consent epoch or content change makes completed resource inaccessible",async()=>{
  decisions=[{type:'plan',summary:'选择素材',steps:[{key:'select',agentId:'album-manager',capability:'media.select',goal:'找所选相册照片',dependsOn:[],contextRefIndexes:[0]}]},{type:'complete',summary:'素材已找到',resultKey:'select'}];
  const submitted=await service.submitAgentWorkspace(input({contextRefs:[{kind:'station-album',id:albumId}]}));await executeNext();await executeNext();const finished=await executeNext();assert.equal(finished.status,'succeeded');
  await query("UPDATE media_retrieval_profiles SET index_epoch=index_epoch+1 WHERE user_id=?",[owner]);
  await assert.rejects(service.getWorkspaceMedia({userId:owner,workspaceId:submitted.id,assetId:mediaId}),code('WORKSPACE_MEDIA_CHANGED'));
});

integration("picked album cannot be ignored by direct text-only composition",async()=>{
  decisions=[sitePlan()];await service.submitAgentWorkspace(input({contextRefs:[{kind:'station-album',id:albumId}]}));await executeNext();
  await assert.rejects(executeNext(),code('WORKSPACE_CONTEXT_INVALID'));
  assert.equal(siteCalls,0);assert.equal((await query('SELECT id FROM station_site_drafts WHERE user_id=?',[owner])).length,0);
});

integration("revoking the source Agent denies even a previously completed workspace media delivery",async()=>{
  decisions=[{type:'plan',summary:'选择素材',steps:[{key:'select',agentId:'album-manager',capability:'media.select',goal:'找所选相册照片',dependsOn:[],contextRefIndexes:[0]}]},{type:'complete',summary:'素材已找到',resultKey:'select'}];
  const submitted=await service.submitAgentWorkspace(input({contextRefs:[{kind:'station-album',id:albumId}]}));await executeNext();await executeNext();await executeNext();
  await query("UPDATE user_agents SET enabled=false WHERE user_id=? AND agent_id='album-manager'",[owner]);
  await assert.rejects(service.getWorkspaceMedia({userId:owner,workspaceId:submitted.id,assetId:mediaId}),code('WORKSPACE_ACCESS_REVOKED'));
});

integration("a lost accepted submission replays the same workflow after its selected source changes",async()=>{
  const args=input({contextRefs:[{kind:'station-photo',id:mediaId}]});const accepted=await service.submitAgentWorkspace(args);
  await query("UPDATE station_media_assets SET caption='Changed after HTTP response was lost' WHERE id=?",[mediaId]);
  const recovered=await service.submitAgentWorkspace(args);assert.equal(recovered.id,accepted.id);assert.equal(recovered.revision,accepted.revision);assert.equal(modelCalls,0);
  assert.equal((await query('SELECT id FROM agent_workspace_nodes WHERE workspace_id=?',[accepted.id])).length,1);
  const claim=await repository.claimWorkspaceNode();await assert.rejects(service.executeWorkspaceNode(claim),code('AI_CONTEXT_CHANGED'));assert.equal(modelCalls,0);
});
