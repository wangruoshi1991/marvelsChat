import assert from "node:assert/strict";
import crypto from "node:crypto";
import test, { before, beforeEach, after } from "node:test";
import express from "express";
import { query, closeDatabase, withTransaction } from "../src/db.js";
import { authenticate, hashToken } from "../src/auth.js";
import * as repository from "../src/agent-workspace-repository.js";
import { createAgentWorkspaceService } from "../src/agent-workspace-service.js";
import { createWorkspaceCapabilityExecutor } from "../src/agent-workspace-capabilities.js";
import { registerAgentWorkspaceRoutes } from "../src/routes/agent-workspace-routes.js";
import { registerStationSiteRoutes } from "../src/routes/station-site-routes.js";
import { getStationSiteDocumentForUser } from "../src/site-document-repository.js";
import { createStationSiteDraft, applyStationSiteDraft } from "../src/station-agent-repository.js";
import { createRequestErrorHandler } from "../src/request-observability.js";
import { getAgent, listAgents } from "../../agents/registry.js";

import { seedPublishedAgentConsent, cleanupPublishedAgentConsent } from "./helpers/agent-publishing-fixture.js";

let publicationFixture;
const enabled = process.env.RUN_AGENT_WORKSPACE_TEXT_INTEGRATION === "1";
const integration = (name, work) => test(name, { skip: !enabled && "Set RUN_AGENT_WORKSPACE_TEXT_INTEGRATION=1 with a migrated disposable loopback *_migration_test database" }, work);
const owner = crypto.randomUUID(), outsider = crypto.randomUUID();
const diaryId = crypto.randomUUID(), albumId = crypto.randomUUID(), photoId = crypto.randomUUID();
const selectedMessageId = crypto.randomUUID(), selectedThreadId = crypto.randomUUID(), privateThreadId = crypto.randomUUID();
const token = crypto.randomBytes(32).toString("hex"), outsiderToken = crypto.randomBytes(32).toString("hex");
const privateSentinel = "PRIVATE_AGENT_CONVERSATION_MUST_NOT_BE_SHARED";
const sourceBodySentinel = "PRIVATE_SOURCE_BODY_ONLY_FOR_SELECTED_NODE";
const sourceTitleSentinel = "PRIVATE_GENERATED_TITLE_ONLY_FOR_AUTHORIZED_DEPENDENCY";
const receipt = { provider: "isolated-text-fixture", model: "test-model", servedModel: "test-served-model",
  tokenUsage: { prompt: 4, completion: 3, total: 7 }, latencyMs: 1 };
const agentIds = ["miaoxun-butler", "file-preprocessor", "comic-diary", "video-production", "virtual-character", "model-3d", "site-builder"];
const code = expected => issue => issue.details?.code === expected;
const step = (key, agentId, capability, dependsOn = [], contextRefIndexes = []) => ({ key, agentId, capability,
  goal: `完成${key}的具体内容`, dependsOn, contextRefIndexes });
const plan = steps => ({ type: "plan", summary: "根据这次需求分工", steps });
const complete = resultKey => ({ type: "complete", summary: "内容已完成", resultKey });
const storyboard = (indexes = [0]) => step("story", "comic-diary", "comic.storyboard", [], indexes);
const video = dependencies => step("script", "video-production", "video.script", dependencies);
const requestBody = overrides => ({ goal: "把这份日记整理为分镜和视频脚本", contextRefs: [{ kind: "station-diary", id: diaryId }],
  source: { page: "miao", module: "task-composer" }, idempotencyKey: crypto.randomUUID(), ...overrides });
let service, server, origin, executor, decisions, runtimeCalls, coordinatorCalls, afterGeneration, outputHook, agentOverrides, siteInputs;

const adjustedAgent = agent => agentOverrides[agent.key] ? agentOverrides[agent.key](agent) : agent;
const loadAgent = async id => adjustedAgent(await getAgent(id));
const loadAgents = async () => (await listAgents()).map(adjustedAgent);
const recordCall = async (options, work) => {
  const reservation = await options.beforeModelCall();
  const response = await work();
  await options.afterModelCall({ receipt: reservation, ...receipt });
  return { reply: response, ...receipt };
};
const next = async () => {
  const claim = await repository.claimWorkspaceNode();
  assert.ok(claim, "Expected a persisted node");
  assert.equal(claim.workspace.userId, owner, "Global workspace queues must be exercised serially");
  return service.executeWorkspaceNode(claim);
};
const request = async (path, body, authToken = token) => {
  const response = await fetch(`${origin}${path}`, { method: body === undefined ? "GET" : "POST",
    headers: { Authorization: `Bearer ${authToken}`, "Content-Type": "application/json", "X-Miaoxun-AI-Contract": "1", "X-Miaoxun-Agent-Workspace": "6", "X-Miaoxun-Site-Document": "2" },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
  return { status: response.status, ...await response.json() };
};
const submit = async (overrides, http = false) => {
  if (!http) return service.submitAgentWorkspace({ user: { id: owner }, ...requestBody(overrides) });
  const accepted = await request("/api/agent-workspaces", requestBody(overrides));
  assert.equal(accepted.status, 202);
  return accepted.data;
};
const sourceResult = async nodeKey => (await query("SELECT result FROM agent_workspace_nodes WHERE user_id=? AND node_key=?", [owner, nodeKey]))[0].result;

before(async () => {
  if (!enabled) return;
  const url = new URL(process.env.DATABASE_URL);
  assert.ok(["127.0.0.1", "localhost", "[::1]"].includes(url.hostname) && url.pathname.endsWith("_migration_test"), "No product database may receive these fixtures");
  assert.match((await query("SELECT current_database() AS name"))[0].name, /_migration_test$/);
  for (const [id, authToken] of [[owner, token], [outsider, outsiderToken]]) {
    await query("INSERT INTO users(id,email,password_hash,display_name,ai_id) VALUES(?,?,'isolated-test-only',?,?)",
      [id, `${id}@example.invalid`, `Text collaboration ${id.slice(0, 8)}`, String(crypto.randomInt(100000000000, 999999999999))]);
    await query("INSERT INTO user_profiles(user_id,nickname,avatar_text) VALUES(?,'Text collaboration fixture','T')", [id]);
    await query("INSERT INTO auth_sessions(id,user_id,token_hash,expires_at) VALUES(?,?,?,CURRENT_TIMESTAMP+INTERVAL '1 hour')", [crypto.randomUUID(), id, hashToken(authToken)]);
  }
  for (const id of agentIds) await query("INSERT INTO user_agents(user_id,agent_id,enabled,granted_scopes) VALUES(?,?,true,?::jsonb)",
    [owner, id, JSON.stringify((await getAgent(id)).permissions)]);
  await query("INSERT INTO station_diary_entries(id,user_id,title,body) VALUES(?,?,'明确选定的日记',?)", [diaryId, owner, sourceBodySentinel]);
  await query("INSERT INTO station_albums(id,user_id,title) VALUES(?,?,'Selected text fixture album')", [albumId, owner]);
  await query("INSERT INTO station_media_assets(id,user_id,album_id,kind,mime_type,original_filename,status,caption) VALUES(?,?,?,'image','image/jpeg','selected-photo.jpg','uploaded','一条明确选定的图片说明')", [photoId, owner, albumId]);
  for (const [id, agentId] of [[selectedThreadId, "miaoxun-butler"], [privateThreadId, "comic-diary"]]) {
    await query("INSERT INTO chat_threads(id,user_id,title,agent_id,kind) VALUES(?,?,'Isolated text fixture',?,'agent')", [id, owner, agentId]);
  }
  await query("INSERT INTO chat_messages(id,thread_id,user_id,sender_type,sender_name,content) VALUES(?,?,?,'user','Fixture user',?)",
    [selectedMessageId, selectedThreadId, owner, sourceBodySentinel]);
  await query("INSERT INTO chat_messages(id,thread_id,user_id,sender_type,sender_name,content) VALUES(?,?,?,'user','Fixture user',?)",
    [crypto.randomUUID(), privateThreadId, owner, privateSentinel]);
  publicationFixture = await seedPublishedAgentConsent({ userId: owner, agentKeys: agentIds.filter(id => id !== "miaoxun-butler") });
  executor = createWorkspaceCapabilityExecutor({ loadAgent,
    generateSite: async options => {
      await recordCall(options, async () => { siteInputs.push(options); return "Provider accepted the isolated page fixture"; });
      return { source: "model", model: receipt, draft: { language: "zh", theme: "clean", title: "专业内容生成的页面", summary: "独立测试页面",
        sections: [{ type: "about", title: "内容", subtitle: "", body: options.textHandoffs.map(item => item.content).join("\n\n").slice(0, 900),
          assetIds: options.stationContent.mediaAssets.map(item => item.id), diaryEntryIds: options.stationContent.diaryEntries.map(item => item.id), actions: [] }] } };
    }, runAgentRuntime: options => recordCall(options, async () => {
    assert.equal(options.mode, "contribute");
    assert.equal(options.thread, null); assert.deepEqual(options.messages, []);
    assert.equal(Object.hasOwn(options.appContext, "stationContent"), false);
    assert.doesNotMatch(JSON.stringify(options), new RegExp(privateSentinel));
    runtimeCalls.push(options);
    if (afterGeneration) await afterGeneration(options);
    return `# ${options.agentId}的内容\n\n这是一份真实节点交付的隔离测试正文。\n\n- 有用的内容\n- 下一段自然排版`;
  }) });
  service = createAgentWorkspaceService({ loadAgent, loadAgents, limits: { deadlineSeconds: 600 },
    executeCapability: async options => {
      const output = await executor(options);
      return outputHook ? outputHook(output, options) : output;
    }, run: options => recordCall(options, async () => {
      assert.equal(options.agentId, "miaoxun-butler"); assert.equal(options.mode, "coordinate");
      assert.doesNotMatch(JSON.stringify(options), new RegExp(privateSentinel));
      assert.doesNotMatch(JSON.stringify(options), new RegExp(sourceBodySentinel));
      assert.doesNotMatch(JSON.stringify(options), new RegExp(sourceTitleSentinel));
      assert.equal(Object.hasOwn(options.appContext, "selectedContext"), false);
      assert.ok(options.appContext.contextRefs.every(ref => !Object.hasOwn(ref, "title")));
      for (const node of options.appContext.steps) {
        if (node.result?.kind === "text_result") {
          assert.deepEqual(Object.keys(node.result), ["kind", "sourceKinds"]);
          assert.ok(node.result.sourceKinds.every(kind => ["chat-message", "station-album", "station-photo", "station-diary"].includes(kind)));
        }
      }
      coordinatorCalls.push(options);
      assert.ok(decisions.length, "No unexpected planning call");
      const decision = decisions.shift();
      return JSON.stringify(typeof decision === "function" ? await decision(options) : decision);
    }) });
  const app = express(); app.use(express.json());
  const asyncHandler = handler => (req, res, nextHandler) => Promise.resolve(handler(req, res, nextHandler)).catch(nextHandler);
  registerAgentWorkspaceRoutes(app, { authenticate, asyncHandler, service });
  registerStationSiteRoutes(app, { authenticate, asyncHandler, readDocument: args => getStationSiteDocumentForUser({ ...args,
    authorizeWorkspaceDraft: service.authorizeWorkspaceSiteDraftRead }) });
  app.use(createRequestErrorHandler({ production: true, logger: { error() {} } }));
  await new Promise(resolve => { server = app.listen(0, "127.0.0.1", resolve); });
  origin = `http://127.0.0.1:${server.address().port}`;
});
beforeEach(async () => {
  if (!enabled) return;
  decisions = []; runtimeCalls = []; coordinatorCalls = []; afterGeneration = null; outputHook = null; agentOverrides = {}; siteInputs = [];
  await query("DELETE FROM agent_workspace_submissions WHERE user_id=?", [owner]);
  await query("DELETE FROM agent_workspaces WHERE user_id=?", [owner]);
  await query("DELETE FROM station_site_drafts WHERE user_id=?", [owner]);
  await query("UPDATE user_profiles SET station_config='{}'::jsonb,bio='' WHERE user_id=?", [owner]);
  await query("UPDATE users SET status='active' WHERE id=?", [owner]);
  for (const id of agentIds) await query("UPDATE user_agents SET enabled=true,granted_scopes=?::jsonb WHERE user_id=? AND agent_id=?",
    [JSON.stringify((await getAgent(id)).permissions), owner, id]);
  await query("UPDATE station_diary_entries SET body=?,deleted_at=NULL WHERE id=?", [sourceBodySentinel, diaryId]);
  await query("UPDATE station_media_assets SET caption='一条明确选定的图片说明',deleted_at=NULL,status='uploaded' WHERE id=?", [photoId]);
  await query("UPDATE chat_messages SET content=?,recalled_at=NULL,deleted_at=NULL WHERE id=?", [sourceBodySentinel, selectedMessageId]);
});
after(async () => {
  if (!enabled) return;
  await new Promise(resolve => server?.close(resolve));
  await cleanupPublishedAgentConsent({ userIds: [owner, outsider] });
  await query("DELETE FROM users WHERE id IN (?,?)", [owner, outsider]);
  await publicationFixture?.cleanup(); await closeDatabase();
});

integration("HTTP non-album non-site Agents deliver prose through a real persisted dependency graph", async () => {
  decisions = [plan([storyboard(), video(["story"])]), complete("script")];
  const submitted = await submit(undefined, true);
  assert.equal(runtimeCalls.length, 0);
  await next(); await next(); await next(); const finished = await next();
  assert.equal(finished.status, "succeeded"); assert.equal(finished.approval, null);
  assert.equal(finished.result.kind, "text_result"); assert.equal(Object.hasOwn(finished.result, "content"), false);
  assert.deepEqual(finished.steps.filter(node => node.capability !== "workspace.coordinate").map(node => node.agentId), ["comic-diary", "video-production"]);
  assert.equal(runtimeCalls.length, 2); assert.equal(coordinatorCalls.length, 2);
  const inputs = runtimeCalls[1].appContext.workspaceContribution;
  assert.equal(inputs.dependencies.length, 1); assert.match(inputs.dependencies[0].content, /^# comic-diary/);
  assert.deepEqual(inputs.selectedContext.map(ref => ref.id), [diaryId]);
  const stored = await sourceResult("script");
  assert.deepEqual(stored.sourceReferences.map(ref => ref.id), [diaryId]);
  const view = await request(`/api/agent-workspaces/${submitted.id}`);
  assert.equal(view.status, 200); assert.deepEqual(view.data.result, finished.result);
  assert.doesNotMatch(JSON.stringify(view.data), /sourceReferences|modelReceipts|claimToken|servedModel|isolated-text-fixture|authority|真实节点交付/);
  const deliveredText = await request(`/api/agent-workspaces/${submitted.id}/text/${finished.result.id}`);
  assert.equal(deliveredText.status, 200);
  assert.deepEqual(Object.keys(deliveredText.data).sort(), ["content", "id", "title"]);
  assert.match(deliveredText.data.content, /^# video-production/);
  assert.equal((await request(`/api/agent-workspaces/${submitted.id}/text/${finished.result.id}`, undefined, outsiderToken)).status, 404);
  assert.equal((await request(`/api/agent-workspaces/${submitted.id}`, undefined, outsiderToken)).status, 404);
  assert.equal((await request("/api/agent-workspaces")).data[0].status, "succeeded");
  assert.equal(await repository.claimWorkspaceNode(), null);
  const rows = await query("SELECT node_key,model_calls,model_receipts FROM agent_workspace_nodes WHERE workspace_id=? ORDER BY created_at,id", [submitted.id]);
  assert.equal(rows.length, 4); assert.ok(rows.every(node => node.model_calls === 1 && node.model_receipts[0].status === "received"));
  assert.ok(rows.every(node => node.model_receipts[0].servedModel === receipt.servedModel));
  assert.equal(finished.usage.modelCalls, 4);
});

integration("independent Agents run concurrently and synthesis receives only explicit successful dependencies", async () => {
  const summaries = [step("summary", "file-preprocessor", "text.summarize", [], [0]),
    step("appearance", "virtual-character", "character.advise", [], [0]),
    step("combined", "miaoxun-butler", "text.synthesize", ["summary", "appearance"])];
  decisions = [plan(summaries), complete("combined")];
  await submit({ goal: "整理文字并结合形象建议给出完整方案", contextRefs: [{ kind: "chat-message", id: selectedMessageId }] });
  await next();
  const first = await repository.claimWorkspaceNode(), second = await repository.claimWorkspaceNode();
  assert.ok(first && second); assert.notEqual(first.node.id, second.node.id);
  assert.equal(await repository.claimWorkspaceNode(), null);
  await Promise.all([service.executeWorkspaceNode(first), service.executeWorkspaceNode(second)]);
  await next(); const finished = await next();
  assert.equal(finished.status, "succeeded"); assert.equal(runtimeCalls.length, 3);
  const synthesis = runtimeCalls.find(options => options.agentId === "miaoxun-butler");
  assert.equal(synthesis.appContext.workspaceContribution.dependencies.length, 2);
  assert.deepEqual((await sourceResult("combined")).sourceReferences.map(ref => ref.id), [selectedMessageId]);
  assert.equal(coordinatorCalls[1].appContext.steps.some(node => node.result?.content), false);
});

integration("unrelated completed prose is not automatically shared with another specialist", async () => {
  decisions = [plan([step("summary", "file-preprocessor", "text.summarize", [], [0])]),
    plan([step("appearance", "virtual-character", "character.advise")]), complete("appearance")];
  await submit({ contextRefs: [{ kind: "chat-message", id: selectedMessageId }] });
  await next(); await next(); await next(); await next(); const finished = await next();
  assert.equal(finished.status, "succeeded");
  assert.deepEqual(runtimeCalls[1].appContext.workspaceContribution, { selectedContext: [], dependencies: [] });
  assert.deepEqual((await sourceResult("appearance")).sourceReferences, []);
});

integration("private generated titles never enter coordinator input or unrelated node goals", async () => {
  decisions = [plan([storyboard()]), plan([step("appearance", "virtual-character", "character.advise")]), complete("appearance")];
  await submit(); await next();
  outputHook = output => ({ ...output, artifact: { ...output.artifact, title: sourceTitleSentinel } });
  await next(); outputHook = null;
  await next(); await next(); const finished = await next();
  assert.equal(finished.status, "succeeded");
  assert.doesNotMatch(JSON.stringify(coordinatorCalls), new RegExp(sourceTitleSentinel));
  assert.doesNotMatch(JSON.stringify(runtimeCalls.at(-1)), new RegExp(sourceTitleSentinel));
});

integration("an advisory Agent cannot read diary-derived text through another Agent's permission", async () => {
  decisions = [plan([storyboard(), step("appearance", "virtual-character", "character.advise", ["story"])])];
  await submit(); await next(); await next();
  const callsBefore = runtimeCalls.length;
  await assert.rejects(next(), code("AI_CONTEXT_SCOPE_REQUIRED"));
  assert.equal(runtimeCalls.length, callsBefore);
  const [node] = await query("SELECT model_calls,result FROM agent_workspace_nodes WHERE user_id=? AND node_key='appearance'", [owner]);
  assert.equal(node.model_calls, 0); assert.equal(node.result, null);
});

integration("receiver cannot gain photo-derived private context through text handoff", async () => {
  decisions = [plan([storyboard([0]), step("summary", "file-preprocessor", "text.summarize", ["story"])])];
  await submit({ contextRefs: [{ kind: "station-photo", id: photoId }] }); await next(); await next();
  await assert.rejects(next(), code("AI_CONTEXT_SCOPE_REQUIRED"));
  assert.equal(runtimeCalls.length, 1);
});

integration("source changes between generation and persistence leave no committed text result", async () => {
  decisions = [plan([storyboard()])]; await submit(); await next();
  afterGeneration = async () => query("UPDATE station_diary_entries SET body='Changed while provider ran' WHERE id=?", [diaryId]);
  await assert.rejects(next(), code("AI_CONTEXT_CHANGED"));
  const [node] = await query("SELECT status,result,model_receipts FROM agent_workspace_nodes WHERE user_id=? AND node_key='story'", [owner]);
  assert.equal(node.status, "running"); assert.equal(node.result, null);
  assert.equal(node.model_receipts[0].status, "received");
});

integration("revoked own grant stops a text node before any model reservation", async () => {
  decisions = [plan([storyboard()])]; await submit(); await next();
  await query("UPDATE user_agents SET enabled=false WHERE user_id=? AND agent_id='comic-diary'", [owner]);
  await assert.rejects(next(), code("WORKSPACE_ACCESS_REVOKED"));
  assert.equal(runtimeCalls.length, 0);
  assert.equal((await query("SELECT model_calls FROM agent_workspace_nodes WHERE user_id=? AND node_key='story'", [owner]))[0].model_calls, 0);
});

integration("incomplete specialist declaration cannot use the coordinator's complete grant", async () => {
  decisions = [plan([storyboard()])]; await submit(); await next();
  const agent = await getAgent("comic-diary");
  await query("UPDATE user_agents SET granted_scopes=?::jsonb WHERE user_id=? AND agent_id='comic-diary'",
    [JSON.stringify(agent.permissions.filter(scope => scope !== "diary:write")), owner]);
  await assert.rejects(next(), code("WORKSPACE_ACCESS_REVOKED"));
  assert.equal(runtimeCalls.length, 0);
});

integration("revocation or declaration change during generation prevents text commit", async () => {
  for (const mutation of [
    async () => query("UPDATE user_agents SET enabled=false WHERE user_id=? AND agent_id='comic-diary'", [owner]),
    async () => { agentOverrides["comic-diary"] = agent => ({ ...agent, workspaceCapabilities: agent.workspaceCapabilities.map(entry => ({ ...entry, description: `${entry.description} changed` })) }); },
  ]) {
    await query("DELETE FROM agent_workspace_submissions WHERE user_id=?", [owner]);
    await query("DELETE FROM agent_workspaces WHERE user_id=?", [owner]);
    await query("UPDATE user_agents SET enabled=true WHERE user_id=?", [owner]); agentOverrides = {};
    decisions = [plan([storyboard()])]; await submit(); await next();
    afterGeneration = mutation;
    await assert.rejects(next(), code("WORKSPACE_ACCESS_REVOKED"));
    assert.equal((await query("SELECT result FROM agent_workspace_nodes WHERE user_id=? AND node_key='story'", [owner]))[0].result, null);
  }
});

integration("changed source or revoked contributor invalidates final completion using database data", async () => {
  for (const mutation of [
    () => query("UPDATE station_diary_entries SET body='Changed after delivery' WHERE id=?", [diaryId]),
    () => query("UPDATE user_agents SET enabled=false WHERE user_id=? AND agent_id='comic-diary'", [owner]),
  ]) {
    await query("DELETE FROM agent_workspace_submissions WHERE user_id=?", [owner]);
    await query("DELETE FROM agent_workspaces WHERE user_id=?", [owner]);
    await query("UPDATE station_diary_entries SET body='Source reset' WHERE id=?", [diaryId]);
    await query("UPDATE user_agents SET enabled=true WHERE user_id=?", [owner]);
    decisions = [plan([storyboard()]), complete("story")]; const submitted = await submit(); await next(); await next();
    await mutation();
    await assert.rejects(next(), issue => ["AI_CONTEXT_CHANGED", "WORKSPACE_ACCESS_REVOKED"].includes(issue.details?.code));
    assert.equal((await request(`/api/agent-workspaces/${submitted.id}`)).data.status, "running");
  }
});

integration("forged caller goals, authority and dependency content never replace persisted claim values", async () => {
  decisions = [plan([storyboard(), video(["story"])]), complete("script")];
  await submit(); await next(); await next();
  const claim = await repository.claimWorkspaceNode();
  claim.node.goal = "FORGED_GOAL"; claim.node.dependencies = []; claim.node.contextRefIndexes = [];
  claim.workspace.userId = outsider; claim.workspace.authority = {};
  claim.workspace.nodes.find(node => node.key === "story").result = { artifact: { kind: "text_result", title: "Fake", content: "FORGED_RESULT" }, sourceReferences: [] };
  await service.executeWorkspaceNode(claim);
  const received = runtimeCalls.at(-1);
  assert.equal(received.input, "完成script的具体内容");
  assert.match(received.appContext.workspaceContribution.dependencies[0].content, /^# comic-diary/);
  assert.doesNotMatch(JSON.stringify(received), /FORGED_GOAL|FORGED_RESULT/);
  assert.equal((await next()).status, "succeeded");
});

integration("omitted derived source snapshot is rejected atomically at text save", async () => {
  decisions = [plan([storyboard(), video(["story"])])]; await submit(); await next(); await next();
  outputHook = output => ({ ...output, sourceReferences: [] });
  await assert.rejects(next(), code("WORKSPACE_TEXT_SOURCES_INVALID"));
  const [node] = await query("SELECT result,status FROM agent_workspace_nodes WHERE user_id=? AND node_key='script'", [owner]);
  assert.equal(node.result, null); assert.equal(node.status, "running");
});

integration("stored missing source snapshots block downstream dispatch despite a forged caller snapshot", async () => {
  decisions = [plan([storyboard(), video(["story"])])]; await submit(); await next(); await next();
  await query("UPDATE agent_workspace_nodes SET result=jsonb_set(result,'{sourceReferences}','[]'::jsonb) WHERE user_id=? AND node_key='story'", [owner]);
  const claim = await repository.claimWorkspaceNode();
  claim.workspace.nodes.find(node => node.key === "story").result.sourceReferences = [{ kind: "station-diary", id: diaryId, version: "a".repeat(64) }];
  await assert.rejects(service.executeWorkspaceNode(claim), code("WORKSPACE_TEXT_SOURCES_INVALID"));
  assert.equal(runtimeCalls.length, 1);
  assert.equal((await query("SELECT model_calls FROM agent_workspace_nodes WHERE user_id=? AND node_key='script'", [owner]))[0].model_calls, 0);
});

integration("a changed successful dependency body is read freshly instead of trusted caller injection", async () => {
  decisions = [plan([storyboard(), video(["story"])])]; await submit(); await next(); await next();
  const claim = await repository.claimWorkspaceNode();
  const updated = "Updated persisted text from the same immutable source snapshot";
  await query("UPDATE agent_workspace_nodes SET result=jsonb_set(result,'{artifact,content}',?::jsonb) WHERE user_id=? AND node_key='story'", [JSON.stringify(updated), owner]);
  await service.executeWorkspaceNode(claim);
  assert.equal(runtimeCalls.at(-1).appContext.workspaceContribution.dependencies[0].content, updated);
});

integration("recalled selected message stops delivery and private chat remains unshared", async () => {
  decisions = [plan([step("summary", "file-preprocessor", "text.summarize", [], [0])]), complete("summary")];
  await submit({ contextRefs: [{ kind: "chat-message", id: selectedMessageId }] }); await next(); await next();
  assert.equal(runtimeCalls[0].appContext.workspaceContribution.selectedContext[0].content, sourceBodySentinel);
  await query("UPDATE chat_messages SET recalled_at=CURRENT_TIMESTAMP WHERE id=?", [selectedMessageId]);
  await assert.rejects(next(), code("AI_CONTEXT_NOT_FOUND"));
  assert.equal(coordinatorCalls.length, 1);
});

integration("text generation rejects empty or oversized output without publishing a fabricated artifact", async () => {
  for (const content of [" \n", "x".repeat(16001)]) {
    await query("DELETE FROM agent_workspace_submissions WHERE user_id=?", [owner]);
    await query("DELETE FROM agent_workspaces WHERE user_id=?", [owner]);
    decisions = [plan([storyboard()])]; await submit(); await next();
    const invalidExecutor = createWorkspaceCapabilityExecutor({ loadAgent, runAgentRuntime: options => recordCall(options, async () => content) });
    const invalidService = createAgentWorkspaceService({ loadAgent, loadAgents, executeCapability: invalidExecutor });
    const claim = await repository.claimWorkspaceNode();
    await assert.rejects(invalidService.executeWorkspaceNode(claim), code("WORKSPACE_TEXT_INVALID"));
    assert.equal((await query("SELECT result FROM agent_workspace_nodes WHERE user_id=? AND node_key='story'", [owner]))[0].result, null);
  }
});

const contentPagePlan = () => plan([
  step("summary", "file-preprocessor", "text.summarize", [], [0]),
  step("page", "site-builder", "site.compose", ["summary"]),
]);
const preparePage = async () => {
  decisions = [contentPagePlan(), complete("page")];
  const submitted = await submit({ goal: "先整理所选文字，再生成私有页面", contextRefs: [{ kind: "chat-message", id: selectedMessageId }] }, true);
  await next(); await next(); await next();
  return { submitted, pending: await next() };
};

integration("text specialist handoff composes an exact preview and requires explicit private-page confirmation", async () => {
  const { submitted, pending } = await preparePage();
  assert.equal(pending.status, "awaiting_confirmation");
  assert.equal(pending.result.kind, "site_draft"); assert.ok(pending.approval);
  assert.equal(siteInputs.length, 1); assert.equal(siteInputs[0].textHandoffs.length, 1);
  assert.match(siteInputs[0].textHandoffs[0].content, /^# file-preprocessor/);
  assert.deepEqual(siteInputs[0].stationContent.mediaAssets, []);
  assert.deepEqual(siteInputs[0].stationContent.diaryEntries, []);
  assert.deepEqual((await sourceResult("page")).sourceReferences.map(ref => ref.id), [selectedMessageId]);
  const preview = await request(`/api/station/site-drafts/${pending.approval.draftId}/document`);
  assert.equal(preview.status, 200);
  assert.match(preview.data.document.sections[0].body, /^# file-preprocessor/);
  assert.equal(preview.data.documentHash, pending.approval.draftHash);
  assert.equal((await query("SELECT station_config FROM user_profiles WHERE user_id=?", [owner]))[0].station_config.siteLayout, undefined);
  const saved = await request(`/api/agent-workspaces/${submitted.id}/decision`, { revision: pending.revision,
    operation: "confirm", approvalId: pending.approval.id });
  assert.equal(saved.status, 200); assert.equal(saved.data.status, "succeeded");
  assert.deepEqual((await query("SELECT station_config FROM user_profiles WHERE user_id=?", [owner]))[0].station_config.siteLayout, preview.data.document);
});

integration("text source change or contributor revocation blocks page confirmation without saving", async () => {
  for (const mutation of [
    () => query("UPDATE chat_messages SET content='Changed before page confirmation' WHERE id=?", [selectedMessageId]),
    () => query("UPDATE user_agents SET enabled=false WHERE user_id=? AND agent_id='file-preprocessor'", [owner]),
  ]) {
    await query("DELETE FROM agent_workspace_submissions WHERE user_id=?", [owner]);
    await query("DELETE FROM agent_workspaces WHERE user_id=?", [owner]);
    await query("DELETE FROM station_site_drafts WHERE user_id=?", [owner]);
    await query("UPDATE chat_messages SET content='Selected source reset' WHERE id=?", [selectedMessageId]);
    await query("UPDATE user_agents SET enabled=true WHERE user_id=?", [owner]);
    const { pending } = await preparePage(); await mutation();
    await assert.rejects(service.decideAgentWorkspace({ userId: owner, workspaceId: pending.id,
      revision: pending.revision, operation: "confirm", approvalId: pending.approval.id }),
    issue => ["AI_CONTEXT_CHANGED", "WORKSPACE_ACCESS_REVOKED"].includes(issue.details?.code));
    assert.equal((await query("SELECT station_config FROM user_profiles WHERE user_id=?", [owner]))[0].station_config.siteLayout, undefined);
  }
});

integration("page persistence rejects omitted inherited chat source before writing any draft", async () => {
  decisions = [contentPagePlan()];
  await submit({ contextRefs: [{ kind: "chat-message", id: selectedMessageId }] }); await next(); await next();
  outputHook = output => ({ ...output, sourceReferences: [] });
  await assert.rejects(next(), issue => ["WORKSPACE_SOURCES_CHANGED", "SITE_TASK_RESOURCES_CHANGED"].includes(issue.details?.code));
  assert.equal((await query("SELECT id FROM station_site_drafts WHERE user_id=?", [owner])).length, 0);
  assert.equal((await query("SELECT result FROM agent_workspace_nodes WHERE user_id=? AND node_key='page'", [owner]))[0].result, null);
});

integration("text body reads recheck current contributor grants while metadata and accepted replay reveal no prose", async () => {
  decisions = [plan([storyboard()]), complete("story")];
  const body = requestBody();
  const submitted = await service.submitAgentWorkspace({ user: { id: owner }, ...body });
  await next(); await next(); const finished = await next();
  const textPath = `/api/agent-workspaces/${submitted.id}/text/${finished.result.id}`;
  assert.equal((await request(textPath)).status, 200);
  await query("UPDATE user_agents SET enabled=false WHERE user_id=? AND agent_id='comic-diary'", [owner]);
  const denied = await request(textPath);
  assert.equal(denied.status, 403); assert.equal(denied.error.details.code, "WORKSPACE_ACCESS_REVOKED");
  const metadata = await request(`/api/agent-workspaces/${submitted.id}`);
  const listing = await request("/api/agent-workspaces");
  const replay = await service.submitAgentWorkspace({ user: { id: owner }, ...body });
  assert.equal(metadata.status, 200); assert.equal(listing.status, 200); assert.equal(replay.id, submitted.id);
  assert.doesNotMatch(JSON.stringify([metadata.data, listing.data, replay]), /真实节点交付|content|sourceReferences|modelReceipts/);
  assert.equal(runtimeCalls.length, 1); assert.equal(coordinatorCalls.length, 2);
});

integration("deleted or changed source and updated Agent declaration deny text body reads", async () => {
  for (const mutation of [
    () => query("UPDATE station_diary_entries SET body='Changed after final text delivery' WHERE id=?", [diaryId]),
    () => query("UPDATE station_diary_entries SET deleted_at=CURRENT_TIMESTAMP WHERE id=?", [diaryId]),
    async () => { agentOverrides["comic-diary"] = agent => ({ ...agent, version: "99.0.0" }); },
  ]) {
    await query("DELETE FROM agent_workspace_submissions WHERE user_id=?", [owner]);
    await query("DELETE FROM agent_workspaces WHERE user_id=?", [owner]);
    await query("UPDATE station_diary_entries SET body='Readable source reset',deleted_at=NULL WHERE id=?", [diaryId]); agentOverrides = {};
    decisions = [plan([storyboard()]), complete("story")]; const submitted = await submit();
    await next(); await next(); const finished = await next();
    await mutation();
    const denied = await request(`/api/agent-workspaces/${submitted.id}/text/${finished.result.id}`);
    assert.ok([403, 404, 409].includes(denied.status));
    assert.equal(denied.data, undefined);
    const metadata = await request(`/api/agent-workspaces/${submitted.id}`);
    assert.equal(metadata.status, 200); assert.equal(Object.hasOwn(metadata.data.result, "content"), false);
  }
});

integration("cancel and submission replay expose references without automatically loading completed text", async () => {
  decisions = [plan([storyboard(), video(["story"])])];
  const body = requestBody();
  const submitted = await service.submitAgentWorkspace({ user: { id: owner }, ...body });
  await next(); const withStory = await next();
  const cancelled = await service.decideAgentWorkspace({ userId: owner, workspaceId: submitted.id, revision: withStory.revision, operation: "cancel" });
  assert.equal(cancelled.status, "cancelled");
  const replay = await service.submitAgentWorkspace({ user: { id: owner }, ...body });
  assert.equal(replay.status, "cancelled");
  assert.doesNotMatch(JSON.stringify([cancelled, replay]), /真实节点交付|content|sourceReferences/);
  assert.equal(runtimeCalls.length, 1);
});

integration("text body route rejects unfinished or unrelated node identities without model calls", async () => {
  decisions = [plan([storyboard()])]; const submitted = await submit(); await next();
  const nodeId = (await query("SELECT id FROM agent_workspace_nodes WHERE user_id=? AND node_key='story'", [owner]))[0].id;
  assert.equal((await request(`/api/agent-workspaces/${submitted.id}/text/${nodeId}`)).status, 404);
  assert.equal((await request(`/api/agent-workspaces/${submitted.id}/text/${crypto.randomUUID()}`)).status, 404);
  assert.equal(runtimeCalls.length, 0);
});

integration("pending page metadata contains no prose while document reads recheck every contributor and source", async () => {
  const { pending } = await preparePage();
  const path = `/api/station/site-drafts/${pending.approval.draftId}/document`;
  const listing = await request("/api/station/site-drafts");
  assert.equal(listing.status, 200);
  assert.deepEqual(Object.keys(listing.data[0]).sort(), ["createdAt", "id", "source", "status", "title", "updatedAt"]);
  assert.doesNotMatch(JSON.stringify(listing.data), /content|sections|prompt|modelProvider|modelMissing|modelError|userId|真实节点交付/);
  for (const agentId of ["file-preprocessor", "site-builder", "miaoxun-butler"]) {
    await query("UPDATE user_agents SET enabled=false WHERE user_id=? AND agent_id=?", [owner, agentId]);
    const denied = await request(path);
    assert.equal(denied.status, 403); assert.equal(denied.error.details.code, "WORKSPACE_ACCESS_REVOKED");
    assert.equal(denied.data, undefined);
    await query("UPDATE user_agents SET enabled=true WHERE user_id=? AND agent_id=?", [owner, agentId]);
  }
  await query("UPDATE chat_messages SET content='Changed after page delivery' WHERE id=?", [selectedMessageId]);
  const changed = await request(path);
  assert.equal(changed.status, 409); assert.equal(changed.error.details.code, "AI_CONTEXT_CHANGED");
  assert.equal(changed.data, undefined);
  assert.equal((await request("/api/station/site-drafts")).status, 200);
});

integration("pending page cannot be applied outside its workspace and is removed with its owning task", async () => {
  const { submitted, pending } = await preparePage();
  await assert.rejects(applyStationSiteDraft({ userId: owner, draftId: pending.approval.draftId }), code("WORKSPACE_SITE_CONFIRMATION_REQUIRED"));
  await query("DELETE FROM agent_workspace_submissions WHERE user_id=?", [owner]);
  await query("DELETE FROM agent_workspaces WHERE id=? AND user_id=?", [submitted.id, owner]);
  assert.equal((await query("SELECT id FROM station_site_drafts WHERE id=?", [pending.approval.draftId])).length, 0);
  assert.equal((await request(`/api/station/site-drafts/${pending.approval.draftId}/document`)).status, 404);
});

integration("confirmed page remains independent after replacement, contributor withdrawal and task cleanup", async () => {
  const { submitted, pending } = await preparePage();
  const saved = await service.decideAgentWorkspace({ userId: owner, workspaceId: submitted.id, revision: pending.revision,
    operation: "confirm", approvalId: pending.approval.id });
  assert.equal(saved.status, "succeeded");
  const [bound] = await query("SELECT workspace_node_id FROM station_site_drafts WHERE id=?", [pending.approval.draftId]);
  assert.equal(bound.workspace_node_id, null);
  const standalone = await createStationSiteDraft({ userId: owner, prompt: "New independent page", draft: {
    language: "zh", theme: "clean", title: "另一份已保存页面", summary: "独立内容", sections: [
      { type: "about", title: "正文", subtitle: "", body: "用户确认的独立页面", assetIds: [], diaryEntryIds: [], actions: [] },
    ],
  } });
  await applyStationSiteDraft({ userId: owner, draftId: standalone.id });
  assert.equal((await query("SELECT status FROM station_site_drafts WHERE id=?", [pending.approval.draftId]))[0].status, "draft");
  await query("UPDATE user_agents SET enabled=false WHERE user_id=?", [owner]);
  await query("UPDATE chat_messages SET recalled_at=CURRENT_TIMESTAMP WHERE id=?", [selectedMessageId]);
  await query("DELETE FROM agent_workspace_submissions WHERE user_id=?", [owner]);
  await query("DELETE FROM agent_workspaces WHERE id=? AND user_id=?", [submitted.id, owner]);
  const preview = await request(`/api/station/site-drafts/${pending.approval.draftId}/document`);
  assert.equal(preview.status, 200); assert.match(preview.data.document.sections[0].body, /^# file-preprocessor/);
  assert.equal((await request(`/api/station/site-drafts/${pending.approval.draftId}/document`, undefined, outsiderToken)).status, 404);
});

integration("a preview metadata snapshot taken before confirmation rereads the atomic detached binding", async () => {
  const { submitted, pending } = await preparePage();
  let release, signal;
  const gate = new Promise(resolve => { release = resolve; });
  const observed = new Promise(resolve => { signal = resolve; });
  const read = getStationSiteDocumentForUser({ userId: owner, draftId: pending.approval.draftId,
    authorizeWorkspaceDraft: service.authorizeWorkspaceSiteDraftRead,
    transaction: work => withTransaction(connection => work({ ...connection, query: async (sql, params) => {
      const rows = await connection.query(sql, params);
      if (sql.includes("SELECT id, workspace_node_id FROM station_site_drafts")) { signal(); await gate; }
      return rows;
    } })),
  });
  try {
    await observed;
    await service.decideAgentWorkspace({ userId: owner, workspaceId: submitted.id, revision: pending.revision,
      operation: "confirm", approvalId: pending.approval.id });
    await query("UPDATE user_agents SET enabled=false WHERE user_id=?", [owner]);
  } finally { release(); }
  const preview = await read;
  assert.match(preview.document.sections[0].body, /^# file-preprocessor/);
});

integration("text reads return the same schema-normalized title and prose used by contribution validation", async () => {
  decisions = [plan([storyboard()]), complete("story")]; const submitted = await submit();
  await next(); await next(); const finished = await next();
  await query("UPDATE agent_workspace_nodes SET result=jsonb_set(jsonb_set(result,'{artifact,title}',?::jsonb),'{artifact,content}',?::jsonb) WHERE id=?",
    [JSON.stringify("  合法标题  "), JSON.stringify(" \n正文经过统一规范化\n "), finished.result.id]);
  const text = await request(`/api/agent-workspaces/${submitted.id}/text/${finished.result.id}`);
  assert.equal(text.status, 200); assert.deepEqual(text.data, { id: finished.result.id, title: "合法标题", content: "正文经过统一规范化" });
});
