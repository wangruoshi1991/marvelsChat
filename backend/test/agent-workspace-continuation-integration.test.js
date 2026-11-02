import assert from "node:assert/strict";
import crypto from "node:crypto";
import test, { before, beforeEach, after } from "node:test";
import express from "express";
import { query, closeDatabase, getPool, createConnectionAdapter } from "../src/db.js";
import { authenticate, hashToken } from "../src/auth.js";
import * as repository from "../src/agent-workspace-repository.js";
import { createAgentWorkspaceService } from "../src/agent-workspace-service.js";
import { createWorkspaceCapabilityExecutor } from "../src/agent-workspace-capabilities.js";
import { registerAgentWorkspaceRoutes } from "../src/routes/agent-workspace-routes.js";
import { registerStationSiteRoutes } from "../src/routes/station-site-routes.js";
import { getStationSiteDocumentForUser } from "../src/site-document-repository.js";
import { createStationSiteDraft, applyStationSiteDraft } from "../src/station-agent-repository.js";
import { createRequestErrorHandler } from "../src/request-observability.js";
import { getAgent } from "../../agents/registry.js";

import { seedPublishedAgentConsent, cleanupPublishedAgentConsent } from "./helpers/agent-publishing-fixture.js";

let publicationFixture;
const enabled = process.env.RUN_AGENT_WORKSPACE_CONTINUATION_INTEGRATION === "1";
const integration = (name, work) => test(name, { skip: !enabled && "RUN_AGENT_WORKSPACE_CONTINUATION_INTEGRATION=1 with a migrated loopback *_migration_test database" }, work);
const owner = crypto.randomUUID(), outsider = crypto.randomUUID();
const threadId = crypto.randomUUID(), messageId = crypto.randomUUID();
const token = crypto.randomBytes(32).toString("hex"), outsiderToken = crypto.randomBytes(32).toString("hex");
const agentIds = ["miaoxun-butler", "file-preprocessor", "site-builder"];
const sourceBody = "Only the selected source is available to the specialist.";
const receipt = { provider: "isolated-continuation-fixture", model: "test-model", servedModel: "test-model", tokenUsage: { prompt: 4, completion: 3, total: 7 }, latencyMs: 1 };
let service, server, origin, decisions, coordinatorCalls, textCalls, siteCalls, afterGeneration, routeErrors, beforePersistence, onCompletionQuery;
const code = expected => error => error.details?.code === expected;
const pageContent = (title, body) => ({ language: "zh", theme: "clean", title, summary: "隔离验证",
  sections: [{ type: "about", title: "内容", subtitle: "", body, assetIds: [], diaryEntryIds: [], actions: [] }] });
const plan = (key, kind = "text", dependencies = [], indexes = []) => ({ type: "plan", summary: "处理本轮需求", steps: [{ key,
  agentId: kind === "text" ? "file-preprocessor" : "site-builder", capability: kind === "text" ? "text.summarize" : "site.compose",
  goal: `本轮${key}内容`, dependsOn: dependencies, contextRefIndexes: indexes }] });
const complete = key => ({ type: "complete", summary: "本轮成果已交付", resultKey: key });
const recordCall = async (options, work) => {
  const reservation = await options.beforeModelCall();
  const reply = await work();
  await options.afterModelCall({ receipt: reservation, ...receipt });
  return { reply, ...receipt };
};
const next = async () => {
  const claim = await repository.claimWorkspaceNode();
  assert.ok(claim, "A persisted node must be claimable");
  assert.equal(claim.workspace.userId, owner, "Integration suites must not share the execution queue concurrently");
  return service.executeWorkspaceNode(claim);
};
const runRound = async () => { await next(); await next(); return next(); };
const request = async (path, body, authToken = token) => {
  const response = await fetch(`${origin}${path}`, { method: body === undefined ? "GET" : "POST",
    headers: { Authorization: `Bearer ${authToken}`, "Content-Type": "application/json", "X-Miaoxun-AI-Contract": "1", "X-Miaoxun-Agent-Workspace": "6", "X-Miaoxun-Site-Document": "2" },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
  return { status: response.status, ...await response.json() };
};
const continuation = (workspace, overrides = {}) => ({ revision: workspace.revision, operation: "continue",
  text: "保留上一版内容，按新需求修改", idempotencyKey: crypto.randomUUID(), ...overrides });
const continueWorkspace = (workspace, body = continuation(workspace)) => service.decideAgentWorkspace({ userId: owner, workspaceId: workspace.id, ...body });
const confirm = workspace => service.decideAgentWorkspace({ userId: owner, workspaceId: workspace.id,
  revision: workspace.revision, operation: "confirm", approvalId: workspace.approval.id });
const get = id => repository.getAgentWorkspace({ userId: owner, workspaceId: id });
const profile = async () => (await query("SELECT station_config FROM user_profiles WHERE user_id=?", [owner]))[0].station_config;
const preview = id => request(`/api/station/site-drafts/${id}/document`);
const create = async (kind = "text", withSource = false) => {
  decisions = [plan("first", kind, [], withSource ? [0] : []), complete("first")];
  await service.submitAgentWorkspace({ user: { id: owner }, goal: "创建第一版内容", source: { page: "miao.feed", module: "task-feed" },
    contextRefs: withSource ? [{ kind: "chat-message", id: messageId }] : [], idempotencyKey: crypto.randomUUID() });
  return runRound();
};
const prepareNext = (key = "second", kind = "text", base = "first") => { decisions = [plan(key, kind, [base]), complete(key)]; };

before(async () => {
  if (!enabled) return;
  const url = new URL(process.env.DATABASE_URL);
  assert.ok(["127.0.0.1", "localhost", "[::1]"].includes(url.hostname) && url.pathname.endsWith("_migration_test"), "Only a disposable loopback database may receive fixtures");
  assert.match((await query("SELECT current_database() AS name"))[0].name, /_migration_test$/);
  for (const [userId, authToken] of [[owner, token], [outsider, outsiderToken]]) {
    await query("INSERT INTO users(id,email,password_hash,display_name,ai_id) VALUES(?,?,'isolated-test-only',?,?)",
      [userId, `${userId}@example.invalid`, `Continuation fixture ${userId.slice(0, 8)}`, String(crypto.randomInt(100000000000, 999999999999))]);
    await query("INSERT INTO user_profiles(user_id,nickname,avatar_text) VALUES(?,'Continuation fixture','C')", [userId]);
    await query("INSERT INTO auth_sessions(id,user_id,token_hash,expires_at) VALUES(?,?,?,CURRENT_TIMESTAMP+INTERVAL '1 hour')", [crypto.randomUUID(), userId, hashToken(authToken)]);
  }
  for (const agentId of agentIds) await query("INSERT INTO user_agents(user_id,agent_id,enabled,granted_scopes) VALUES(?,?,true,?::jsonb)", [owner, agentId, JSON.stringify((await getAgent(agentId)).permissions)]);
  await query("INSERT INTO chat_threads(id,user_id,title,agent_id,kind) VALUES(?,?,'Selected continuation source','miaoxun-butler','agent')", [threadId, owner]);
  await query("INSERT INTO chat_messages(id,thread_id,user_id,sender_type,sender_name,content) VALUES(?,?,?,'user','Fixture user',?)", [messageId, threadId, owner, sourceBody]);
  publicationFixture = await seedPublishedAgentConsent({ userId: owner, agentKeys: agentIds.filter(id => id !== "miaoxun-butler") });
  const executor = createWorkspaceCapabilityExecutor({
    runAgentRuntime: options => recordCall(options, async () => {
      textCalls.push(options);
      assert.equal(options.mode, "contribute"); assert.equal(options.thread, null); assert.deepEqual(options.messages, []);
      if (afterGeneration) await afterGeneration(options);
      return `第${textCalls.length}版文字成果：${options.input}`;
    }),
    generateSite: async options => {
      await recordCall(options, async () => {
        siteCalls.push(options);
        if (afterGeneration) await afterGeneration(options);
        return "isolated page provider response";
      });
      const prior = options.siteHandoffs?.[0]?.document;
      return { source: "model", model: receipt, draft: pageContent(`页面第${siteCalls.length}版`,
        prior ? `${prior.sections[0].body}\n修改后的段落` : "第一版保留正文") };
    },
  });
  service = createAgentWorkspaceService({
    executeCapability: async options => { const output = await executor(options); if (beforePersistence) await beforePersistence(); return output; },
    repo: { ...repository, finishWorkspaceNode: args => repository.finishWorkspaceNode({ ...args,
      complete: args.complete ? (connection, state) => args.complete({ ...connection, query: async (sql, params) => {
        if (onCompletionQuery) onCompletionQuery(sql);
        return connection.query(sql, params);
      } }, state) : undefined,
    }) }, limits: { deadlineSeconds: 600 },
    run: options => recordCall(options, async () => {
      coordinatorCalls.push(options);
      assert.equal(options.mode, "coordinate");
      assert.doesNotMatch(JSON.stringify(options.appContext), new RegExp(sourceBody));
      assert.ok(decisions.length, "No unplanned coordinator call");
      const decision = decisions.shift();
      return JSON.stringify(typeof decision === "function" ? await decision(options) : decision);
    }) });
  const app = express(); app.use(express.json());
  const asyncHandler = handler => (req, res, nextHandler) => Promise.resolve(handler(req, res, nextHandler)).catch(error => { routeErrors.push(error); nextHandler(error); });
  registerAgentWorkspaceRoutes(app, { authenticate, asyncHandler, service });
  registerStationSiteRoutes(app, { authenticate, asyncHandler, readDocument: args => getStationSiteDocumentForUser({ ...args,
    authorizeWorkspaceDraft: service.authorizeWorkspaceSiteDraftRead }) });
  app.use(createRequestErrorHandler({ production: true, logger: { error() {} } }));
  await new Promise(resolve => { server = app.listen(0, "127.0.0.1", resolve); });
  origin = `http://127.0.0.1:${server.address().port}`;
});
beforeEach(async () => {
  if (!enabled) return;
  decisions = []; coordinatorCalls = []; textCalls = []; siteCalls = []; afterGeneration = null; routeErrors = [];
  beforePersistence = null; onCompletionQuery = null;
  await query("DELETE FROM agent_workspace_submissions WHERE user_id=?", [owner]);
  await query("DELETE FROM agent_workspaces WHERE user_id=?", [owner]);
  await query("DELETE FROM station_site_drafts WHERE user_id=?", [owner]);
  await query("UPDATE user_profiles SET station_config='{}'::jsonb,bio='' WHERE user_id=?", [owner]);
  await query("UPDATE users SET status='active' WHERE id=?", [owner]);
  for (const agentId of agentIds) await query("UPDATE user_agents SET enabled=true,granted_scopes=?::jsonb WHERE user_id=? AND agent_id=?", [JSON.stringify((await getAgent(agentId)).permissions), owner, agentId]);
  await query("UPDATE chat_messages SET content=?,recalled_at=NULL,deleted_at=NULL WHERE id=?", [sourceBody, messageId]);
});
after(async () => {
  if (!enabled) return;
  await new Promise(resolve => server?.close(resolve));
  await cleanupPublishedAgentConsent({ userIds: [owner, outsider] });
  await query("DELETE FROM users WHERE id IN (?,?)", [owner, outsider]);
  await publicationFixture?.cleanup(); await closeDatabase();
});

integration("HTTP text continuation keeps one workspace, immutable earlier output and accepted replay across later rounds", async () => {
  const first = await create("text", true);
  const firstText = await service.getWorkspaceText({ userId: owner, workspaceId: first.id, nodeId: first.result.id });
  const body = continuation(first);
  const [one, repeated] = await Promise.all([request(`/api/agent-workspaces/${first.id}/decision`, body), request(`/api/agent-workspaces/${first.id}/decision`, body)]);
  assert.equal(one.status, 200, routeErrors.map(error => error.stack).join("\n"));
  assert.equal(repeated.status, 200, routeErrors.map(error => error.stack).join("\n"));
  assert.equal(one.data.id, first.id); assert.equal(one.data.currentRound, 2);
  assert.equal(repeated.data.currentRound, 2); assert.equal(one.data.revision, repeated.data.revision);
  assert.equal((await get(first.id)).steps.filter(item => item.round === 2).length, 1);
  prepareNext(); const second = await runRound();
  assert.equal(second.id, first.id); assert.equal(second.currentRound, 2); assert.equal(second.status, "succeeded");
  assert.equal(second.rounds.length, 2); assert.equal(second.rounds[0].resultNodeId, first.result.id);
  assert.equal(second.rounds[1].baseResultNodeId, first.result.id); assert.equal(second.rounds[1].resultNodeId, second.result.id);
  assert.deepEqual(second.rounds.map(item => item.status), ["succeeded", "succeeded"]);
  assert.equal(second.usage.modelCalls, first.usage.modelCalls + 3);
  assert.equal(coordinatorCalls[2].input, body.text);
  assert.equal(coordinatorCalls[2].appContext.continuation.baseResultKey, "first");
  assert.equal(coordinatorCalls[2].appContext.currentRound, 2);
  assert.equal(textCalls[1].appContext.workspaceContribution.dependencies[0].content, firstText.content);
  assert.deepEqual(await service.getWorkspaceText({ userId: owner, workspaceId: first.id, nodeId: first.result.id }), firstText);
  prepareNext("third", "text", "second"); await continueWorkspace(second); const third = await runRound();
  assert.equal(third.currentRound, 3);
  await query("UPDATE user_agents SET enabled=false WHERE user_id=?", [owner]);
  await query("UPDATE chat_messages SET content='Changed after accepted continuation' WHERE id=?", [messageId]);
  const callsBefore = coordinatorCalls.length + textCalls.length;
  const replay = await request(`/api/agent-workspaces/${first.id}/decision`, body);
  assert.equal(replay.status, 200); assert.equal(replay.data.id, first.id); assert.equal((await get(first.id)).currentRound, 3);
  assert.equal(coordinatorCalls.length + textCalls.length, callsBefore);
  assert.equal((await request(`/api/agent-workspaces/${first.id}/decision`, body, outsiderToken)).status, 404);
  await query("UPDATE users SET status='disabled' WHERE id=?", [owner]);
  await assert.rejects(continueWorkspace(first, body), code("WORKSPACE_ACCESS_REVOKED"));
});

integration("saved page A continues from its real document into B and requires a distinct approval", async () => {
  const pendingA = await create("site");
  const previewA = await preview(pendingA.approval.draftId); assert.equal(previewA.status, 200);
  const savedA = await confirm(pendingA);
  const savedConfigA = await profile();
  prepareNext("second", "site"); const queuedB = await continueWorkspace(savedA);
  assert.equal(queuedB.currentRound, 2); assert.equal(queuedB.approval, null);
  await assert.rejects(confirm(pendingA), error => error.status === 409);
  const pendingB = await runRound();
  assert.equal(pendingB.status, "awaiting_confirmation");
  assert.notEqual(pendingB.approval.id, pendingA.approval.id); assert.notEqual(pendingB.approval.draftId, pendingA.approval.draftId);
  assert.deepEqual(siteCalls[1].siteHandoffs, [{ kind: "site_draft", document: previewA.data.document }]);
  assert.deepEqual(await profile(), savedConfigA);
  const historicalA = await preview(pendingA.approval.draftId);
  assert.equal(historicalA.status, 200); assert.deepEqual(historicalA.data.document, previewA.data.document);
  const previewB = await preview(pendingB.approval.draftId); assert.equal(previewB.status, 200);
  assert.match(previewB.data.document.sections[0].body, /第一版保留正文\n修改后的段落/);
  const savedB = await confirm(pendingB); assert.equal(savedB.currentRound, 2); assert.equal(savedB.status, "succeeded");
  assert.equal((await profile()).siteDraftId, pendingB.approval.draftId);
  assert.deepEqual((await preview(pendingA.approval.draftId)).data.document, previewA.data.document);
  assert.equal((await query("SELECT workspace_node_id FROM station_site_drafts WHERE id=?", [pendingA.approval.draftId]))[0].workspace_node_id, null);
  assert.equal((await query("SELECT workspace_node_id FROM station_site_drafts WHERE id=?", [pendingB.approval.draftId]))[0].workspace_node_id, null);
});

integration("continuing an unconfirmed page supersedes its approval while preserving its historical preview", async () => {
  const pendingA = await create("site");
  const original = await preview(pendingA.approval.draftId);
  prepareNext("second", "site"); await continueWorkspace(pendingA);
  await assert.rejects(confirm(pendingA), error => error.status === 409);
  assert.deepEqual(await profile(), {});
  const pendingB = await runRound();
  const older = await preview(pendingA.approval.draftId);
  assert.equal(older.status, 200); assert.deepEqual(older.data.document, original.data.document);
  await confirm(pendingB);
  assert.equal((await profile()).siteDraftId, pendingB.approval.draftId);
  assert.equal((await get(pendingA.id)).rounds[0].result.id, pendingA.result.id);
});

integration("saving another page C while B awaits confirmation cannot overwrite C", async () => {
  const pendingA = await create("site"); const savedA = await confirm(pendingA);
  prepareNext("second", "site"); await continueWorkspace(savedA); const pendingB = await runRound();
  const independent = await createStationSiteDraft({ userId: owner, prompt: "独立页面 C", draft: pageContent("独立页面 C", "用户另行保存的内容") });
  await applyStationSiteDraft({ userId: owner, draftId: independent.id });
  const profileC = await profile();
  await assert.rejects(confirm(pendingB), code("SITE_TASK_PROFILE_CHANGED"));
  assert.deepEqual(await profile(), profileC);
  assert.equal((await get(pendingB.id)).status, "awaiting_confirmation");
  assert.equal((await query("SELECT status FROM station_site_drafts WHERE id=?", [pendingB.approval.draftId]))[0].status, "draft");
});

integration("revoked contributors and changed source reject new continuation before persisting a round", async () => {
  const first = await create("text", true);
  const before = await get(first.id);
  await query("UPDATE user_agents SET enabled=false WHERE user_id=? AND agent_id='file-preprocessor'", [owner]);
  await assert.rejects(continueWorkspace(first), code("WORKSPACE_ACCESS_REVOKED"));
  await query("UPDATE user_agents SET enabled=true WHERE user_id=?", [owner]);
  await query("UPDATE chat_messages SET recalled_at=CURRENT_TIMESTAMP WHERE id=?", [messageId]);
  await assert.rejects(continueWorkspace(first), error => error.status === 404 || error.details?.code === "AI_CONTEXT_CHANGED");
  const afterState = await get(first.id);
  assert.equal(afterState.currentRound, 1); assert.equal(afterState.revision, before.revision); assert.equal(afterState.steps.length, before.steps.length);
  assert.equal(textCalls.length, 1); assert.equal(coordinatorCalls.length, 2);
  await assert.rejects(service.getWorkspaceText({ userId: owner, workspaceId: first.id, nodeId: first.result.id }), error => error.status === 404 || error.details?.code === "AI_CONTEXT_CHANGED");
});

integration("accepted continuation rechecks source and authorization before dispatch without replaying the prior generation", async () => {
  const first = await create("text", true);
  const body = continuation(first); await continueWorkspace(first, body);
  await query("UPDATE user_agents SET enabled=false WHERE user_id=? AND agent_id='file-preprocessor'", [owner]);
  const claim = await repository.claimWorkspaceNode();
  await assert.rejects(service.executeWorkspaceNode(claim), code("WORKSPACE_ACCESS_REVOKED"));
  assert.equal(textCalls.length, 1); assert.equal(coordinatorCalls.length, 2);
  const replay = await continueWorkspace(first, body); assert.equal(replay.id, first.id);
  await repository.failWorkspaceNode({ nodeId: claim.node.id, claimToken: claim.node.claimToken, error: { code: "WORKSPACE_ACCESS_REVOKED", message: "fixture revocation" } });
  const failed = await get(first.id); assert.equal(failed.status, "failed");
  await assert.rejects(continueWorkspace(failed), error => error.status === 409);
  assert.equal((await get(first.id)).rounds.length, 2);
});

integration("source change during a follow-on generation rolls back the new artifact and keeps prior history", async () => {
  const first = await create("text", true);
  prepareNext(); await continueWorkspace(first); await next();
  afterGeneration = () => query("UPDATE chat_messages SET content='Changed during follow-on generation' WHERE id=?", [messageId]);
  await assert.rejects(next(), code("AI_CONTEXT_CHANGED"));
  const current = await get(first.id);
  assert.equal(current.rounds[0].result.id, first.result.id);
  assert.equal(current.steps.find(item => item.key === "second").result, null);
  assert.equal((await query("SELECT result->'artifact'->>'content' AS content FROM agent_workspace_nodes WHERE id=?", [first.result.id]))[0].content.startsWith("第1版文字成果"), true);
});

integration("page continuation and an independent saver acquire profile before historical drafts without deadlock", async () => {
  const pendingA = await create("site"); const savedA = await confirm(pendingA);
  const independent = await createStationSiteDraft({ userId: owner, prompt: "并发页面 C", draft: pageContent("并发页面 C", "并发确认的独立内容") });
  prepareNext("second", "site"); await continueWorkspace(savedA); await next();
  const writer = await (await getPool()).connect();
  let observed;
  const profileRead = new Promise(resolve => { observed = resolve; });
  let execution;
  try {
    beforePersistence = async () => {
      await writer.query("BEGIN");
      await writer.query("SET LOCAL lock_timeout='2s'");
      await writer.query("SET LOCAL statement_timeout='5s'");
      await writer.query("SELECT user_id FROM user_profiles WHERE user_id=$1 FOR UPDATE", [owner]);
      onCompletionQuery = sql => { if (sql === "SELECT user_id FROM user_profiles WHERE user_id = ? FOR SHARE") observed(); };
    };
    execution = next().catch(error => error);
    let timeout;
    try {
      await Promise.race([profileRead, new Promise((_resolve, reject) => { timeout = setTimeout(() => reject(new Error("Expected continuation profile lock")), 5000); })]);
    } finally { clearTimeout(timeout); }
    await applyStationSiteDraft({ userId: owner, draftId: independent.id, connection: createConnectionAdapter(writer) });
    await writer.query("COMMIT");
    const failure = await execution;
    assert.equal(failure.details?.code, "SITE_TASK_PROFILE_CHANGED");
    assert.equal((await profile()).siteDraftId, independent.id);
    const current = await get(savedA.id);
    assert.equal(current.steps.find(item => item.key === "second").result, null);
    assert.equal((await query("SELECT count(*)::int AS count FROM station_site_drafts WHERE user_id=?", [owner]))[0].count, 2);
  } finally {
    await writer.query("ROLLBACK");
    writer.release();
    if (execution) await execution;
  }
});
