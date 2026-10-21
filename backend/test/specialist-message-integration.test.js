import assert from "node:assert/strict";
import crypto from "node:crypto";
import test, { before, after, beforeEach } from "node:test";
import express from "express";
import { query, closeDatabase } from "../src/db.js";
import { authenticate, hashToken } from "../src/auth.js";
import { getAgent } from "../../agents/registry.js";
import { createSpecialistMessageService } from "../src/specialist-message-service.js";
import { submitAlbumMessageTask } from "../src/ai-message-task-service.js";
import { messageSchema } from "../src/schemas.js";
import { messageRequestFingerprint } from "../src/message-request.js";
import { registerMessageRoutes } from "../src/routes/message-routes.js";
import { createRequestErrorHandler } from "../src/request-observability.js";

const enabled = process.env.RUN_SPECIALIST_MESSAGE_INTEGRATION === "1";
const integration = (name, run) => test(name, { skip: !enabled && "Requires a migrated disposable loopback *_migration_test PostgreSQL database" }, run);
const owners = [];
let server, origin, fixture, runtime, invocations, modelCalls;
const modelResult = decision => ({ reply: JSON.stringify(decision), provider: "isolated-specialist-test", latencyMs: 1,
  tokenUsage: { prompt: 2, completion: 3, total: 5 } });
const invokeRuntime = async options => { invocations++; return runtime(options); };
const deferred = () => { let resolve; const promise = new Promise(done => { resolve = done; }); return { resolve, promise }; };
const body = (content = "请把这些文字整理成摘要：开会后完成报告。") => ({ content, clientMessageId: crypto.randomUUID() });
const code = response => response.error?.details?.code;

before(async () => {
  if (!enabled) return;
  const url = new URL(process.env.DATABASE_URL);
  assert.ok(["localhost", "127.0.0.1", "[::1]"].includes(url.hostname));
  assert.match(decodeURIComponent(url.pathname), /_migration_test$/);
  assert.match((await query("SELECT current_database() AS name"))[0].name, /_migration_test$/);
  const app = express(); app.use(express.json());
  registerMessageRoutes(app, { authenticate, asyncHandler: fn => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next),
    getOnlineUserIds: () => [], sendRealtimeToUser() {}, runAgentRuntime: invokeRuntime });
  app.use(createRequestErrorHandler({ production: true, logger: { error() {} } }));
  await new Promise(resolve => { server = app.listen(0, "127.0.0.1", resolve); });
  origin = `http://127.0.0.1:${server.address().port}`;
});
after(async () => {
  if (!enabled) return;
  await new Promise(resolve => server.close(resolve));
  await query("DELETE FROM users WHERE id = ANY(?::text[])", [owners]);
  await closeDatabase();
});
async function makeOwner(agentId = "file-preprocessor") {
  const userId = crypto.randomUUID(), token = crypto.randomBytes(32).toString("hex"), threadId = crypto.randomUUID();
  owners.push(userId);
  const agent = await getAgent(agentId);
  await query("INSERT INTO users(id,email,password_hash,display_name,ai_id) VALUES (?,?,'test-only',?,?)",
    [userId, `${userId}@example.invalid`, `Specialist ${userId}`, String(crypto.randomInt(100000000000, 999999999999))]);
  await query("INSERT INTO user_profiles(user_id,nickname,avatar_text) VALUES (?,'private-profile-not-model','Q')", [userId]);
  await query("INSERT INTO user_agents(user_id,agent_id,enabled,granted_scopes) VALUES (?,?,true,?::jsonb)", [userId, agentId, JSON.stringify(agent.permissions)]);
  await query("INSERT INTO chat_threads(id,user_id,title,agent_id,kind) VALUES (?,?,'Specialist fixture',?,'agent')", [threadId, userId, agentId]);
  await query("INSERT INTO auth_sessions(id,user_id,token_hash,expires_at) VALUES (?,?,?,clock_timestamp()+INTERVAL '1 hour')", [crypto.randomUUID(), userId, hashToken(token)]);
  return { userId, token, threadId, agent };
}
beforeEach(async () => {
  if (!enabled) return;
  fixture = await makeOwner(); invocations = 0; modelCalls = 0;
  runtime = async options => { assert.equal(options.mode, "dispatch"); await options.beforeModelCall(); modelCalls++;
    return modelResult({ type: "reply", reply: "可以讨论整理思路。" }); };
});
async function send(input, owner = fixture, threadId = owner.threadId, contract = "6") {
  const response = await fetch(`${origin}/api/threads/${threadId}/messages`, { method: "POST", headers: {
    Authorization: `Bearer ${owner.token}`, "Content-Type": "application/json", "X-Miaoxun-AI-Contract": "1",
    ...(contract === null ? {} : { "X-Miaoxun-Agent-Workspace": contract }),
  }, body: JSON.stringify(input) });
  return { status: response.status, ...await response.json() };
}
const inputRows = () => query("SELECT * FROM chat_messages WHERE user_id=? AND sender_type='user' ORDER BY created_at,id", [fixture.userId]);
const workspaces = () => query("SELECT * FROM agent_workspaces WHERE user_id=? ORDER BY created_at,id", [fixture.userId]);

integration("professional HTTP execution keeps its selected Agent and creates one direct workspace without a Butler grant", async () => {
  const input = body();
  runtime = async options => {
    assert.equal(options.agentId, "file-preprocessor"); assert.equal(options.mode, "dispatch"); assert.equal(options.tools, undefined);
    assert.deepEqual(options.messages, []); assert.equal(options.appContext.profile, undefined);
    assert.deepEqual(options.appContext.specialistDispatch.requestMessages, [{ content: input.content }]);
    assert.deepEqual(options.appContext.specialistDispatch.capabilities.map(item => item.capability).sort(), ["file.summary", "text.summarize"]);
    await options.beforeModelCall(); modelCalls++; return modelResult({ type: "workspace", capability: "text.summarize" });
  };
  const result = await send({ ...input, clientContext: { profileSnapshot: { nickname: "forged-profile" }, enabledAgentIds: ["miaoxun-butler"] } });
  assert.equal(result.status, 201, JSON.stringify(result));
  const [workspace] = await workspaces(); assert.ok(workspace);
  assert.equal(workspace.goal, input.content);
  assert.deepEqual(result.data.messages.at(-1).metadata.agentDispatch, { version: 1, kind: "workspace" });
  assert.equal(result.data.messages.at(-1).metadata.agentWorkspace.id, workspace.id);
  const nodes = await query("SELECT agent_id,capability FROM agent_workspace_nodes WHERE workspace_id=?", [workspace.id]);
  assert.deepEqual(nodes, [{ agent_id: "file-preprocessor", capability: "text.summarize" }]);
  assert.equal((await query("SELECT id FROM ai_tasks WHERE user_id=?", [fixture.userId])).length, 0);
  const replay = await send(input); assert.equal(replay.status, 200); assert.deepEqual(replay.data.messages, result.data.messages);
  assert.equal(modelCalls, 1); assert.equal((await workspaces()).length, 1);
  assert.doesNotMatch(JSON.stringify(result.data.messages), /authorityCeiling|requestMessageIds|requestSnapshots|specialistMessage|forged-profile/);
});

integration("strict client contract, stable ID and mixed contexts reject before persistence", async () => {
  for (const contract of [null, "3", "4", "5"]) assert.equal((await send(body(), fixture, fixture.threadId, contract)).status, 426);
  assert.equal((await send({ content: "Missing stable key" })).status, 400);
  assert.equal((await send({ ...body(), butlerContextReset: false })).status, 400);
  assert.equal((await send({ ...body(), agentContextReset: false, butlerContextReset: true })).status, 400);
  const outsider = await makeOwner(); assert.equal((await send(body(), outsider, fixture.threadId)).status, 404);
  assert.equal((await inputRows()).length, 0); assert.equal(invocations, 0);
});

integration("ordinary reply preserves literal JSON and is marked as new dispatch content", async () => {
  const literal = JSON.stringify({ language: "zh", theme: "clean", title: "Raw example", summary: "Exact text", sections: [{ body: "Literal" }] });
  runtime = async options => { await options.beforeModelCall(); modelCalls++; return modelResult({ type: "reply", reply: literal }); };
  const result = await send(body("解释这段 JSON")); assert.equal(result.status, 201);
  assert.equal(result.data.messages.at(-1).content, literal);
  assert.deepEqual(result.data.messages.at(-1).metadata.agentDispatch, { version: 1, kind: "reply" });
  assert.equal((await workspaces()).length, 0);
});

integration("only successful explicit clarification user turns enter a task; private chat and assistant replies stay private", async () => {
  const privateMessage = body("private-earlier-conversation"); await send(privateMessage);
  const first = body("请整理这次明确提供的文字");
  runtime = async options => { await options.beforeModelCall(); modelCalls++; return modelResult({ type: "clarify", question: "private-assistant-invented-request 请补充原文。" }); };
  const clarification = await send(first); assert.equal(clarification.status, 201);
  assert.deepEqual(clarification.data.messages.at(-1).metadata.agentClarification, { contextRefs: [], source: { currentPage: "messages.agent" } });
  const second = body("这次原文：会议决定完成报告。");
  runtime = async options => {
    assert.match(JSON.stringify(options.messages), /private-earlier-conversation/);
    assert.deepEqual(options.appContext.specialistDispatch.requestMessages, [{ content: first.content }, { content: second.content }]);
    await options.beforeModelCall(); modelCalls++; return modelResult({ type: "workspace", capability: "text.summarize" });
  };
  assert.equal((await send(second)).status, 201);
  const [workspace] = await workspaces(); assert.equal(workspace.goal, `${first.content}\n\n${second.content}`);
  assert.doesNotMatch(JSON.stringify(workspace), /private-earlier-conversation|private-assistant-invented-request/);
});

integration("ordinary reply and an explicit reset each end a pending clarification chain", async () => {
  for (const reset of [false, true]) {
    runtime = async options => { await options.beforeModelCall(); return modelResult({ type: "clarify", question: "请补充原文" }); };
    await send(body("Old pending request"));
    if (!reset) {
      runtime = async options => { await options.beforeModelCall(); return modelResult({ type: "reply", reply: "这只是咨询。" }); };
      await send(body("只聊一下，不执行"));
    }
    const next = { ...body("Entirely new request"), ...(reset ? { agentContextReset: true } : {}) };
    runtime = async options => {
      assert.deepEqual(options.appContext.specialistDispatch.requestMessages, [{ content: next.content }]);
      assert.equal(options.appContext.specialistDispatch.contextReset, reset);
      await options.beforeModelCall(); return modelResult({ type: "reply", reply: "新需求已讨论" });
    };
    assert.equal((await send(next)).status, 201);
  }
});

integration("concurrent same-key retries dispatch once and a different pending message cannot join its clarification chain", async () => {
  const started = deferred(), release = deferred(), input = body();
  runtime = async options => { await options.beforeModelCall(); modelCalls++; started.resolve(); await release.promise;
    return modelResult({ type: "workspace", capability: "text.summarize" }); };
  const first = send(input); await started.promise;
  for (const retry of [input, body("A concurrent different request")]) {
    const pending = await send(retry); assert.equal(pending.status, 409); assert.equal(code(pending), "SPECIALIST_MESSAGE_PENDING");
  }
  assert.equal((await inputRows()).length, 1); assert.equal(invocations, 1);
  release.resolve(); assert.equal((await first).status, 201);
  assert.equal((await send(input)).status, 200); assert.equal(modelCalls, 1); assert.equal((await workspaces()).length, 1);
  assert.equal((await send({ ...input, content: "Changed input" })).status, 409);
});

integration("unknown calls have durable failure receipts; late model output cannot create a workspace", async () => {
  let timestamp = Date.now(); const started = deferred(), release = deferred(), input = body();
  runtime = async options => { await options.beforeModelCall(); modelCalls++; started.resolve(); await release.promise;
    return modelResult({ type: "workspace", capability: "text.summarize" }); };
  const service = createSpecialistMessageService({ runAgentRuntime: invokeRuntime, now: () => timestamp, processingTimeoutMs: 1000 });
  const args = { userId: fixture.userId, threadId: fixture.threadId, body: input };
  const first = service(args); const rejected = assert.rejects(first, error => error.details.code === "SPECIALIST_MESSAGE_INTERRUPTED");
  await started.promise; timestamp += 10000;
  await assert.rejects(service(args), error => error.details.code === "SPECIALIST_MESSAGE_INTERRUPTED");
  release.resolve(); await rejected;
  await assert.rejects(service(args), error => error.details.code === "SPECIALIST_MESSAGE_INTERRUPTED");
  // The HTTP path must use the same receipt, not generic stale-message repair.
  assert.equal(code(await send(input)), "SPECIALIST_MESSAGE_INTERRUPTED");
  assert.equal((await workspaces()).length, 0); assert.equal(modelCalls, 1); assert.equal(invocations, 1);
  assert.deepEqual(await query("SELECT status,error_message FROM agent_runs WHERE user_id=?", [fixture.userId]),
    [{ status: "error", error_message: "SPECIALIST_MESSAGE_INTERRUPTED" }]);
});

for (const stage of ["before", "after"]) integration(`a revoked specialist grant ${stage} the model gate prevents task creation and is rechecked on replay`, async () => {
  const input = body(); runtime = async options => {
    if (stage === "before") await query("UPDATE user_agents SET enabled=false WHERE user_id=?", [fixture.userId]);
    await options.beforeModelCall(); modelCalls++;
    if (stage === "after") await query("UPDATE user_agents SET enabled=false WHERE user_id=?", [fixture.userId]);
    return modelResult({ type: "workspace", capability: "text.summarize" });
  };
  assert.equal((await send(input)).status, 403); assert.equal((await workspaces()).length, 0);
  assert.equal(modelCalls, stage === "before" ? 0 : 1);
  assert.equal((await send(input)).status, 403); assert.equal(invocations, 1);
});

integration("changing a prior clarification user turn blocks execution instead of silently rebasing its text", async () => {
  runtime = async options => { await options.beforeModelCall(); return modelResult({ type: "clarify", question: "请补充格式" }); };
  const first = await send(body());
  await query("UPDATE chat_messages SET content='Tampered private text' WHERE id=?", [first.data.messages[0].id]);
  const result = await send(body("用列表")); assert.equal(result.status, 409); assert.equal(code(result), "SPECIALIST_CONTEXT_CHANGED");
  assert.equal((await inputRows()).length, 1); assert.equal(invocations, 1);
});

for (const stage of ["before", "after"]) integration(`a selected source recalled ${stage} the model gate blocks new work and cached replay`, async () => {
  const sourceId = crypto.randomUUID();
  await query("INSERT INTO chat_messages(id,user_id,thread_id,sender_type,sender_name,content) VALUES (?,?,?,'user','Fixture','Selected private source')",
    [sourceId, fixture.userId, fixture.threadId]);
  const input = { ...body(), contextRefs: [{ kind: "chat-message", id: sourceId }] };
  const revoke = () => query("UPDATE chat_messages SET recalled_at=clock_timestamp(),content='' WHERE id=?", [sourceId]);
  runtime = async options => {
    if (stage === "before") await revoke();
    await options.beforeModelCall(); modelCalls++;
    if (stage === "after") await revoke();
    return modelResult({ type: "workspace", capability: "text.summarize" });
  };
  assert.ok([404, 409].includes((await send(input)).status)); assert.equal((await workspaces()).length, 0);
  assert.equal(modelCalls, stage === "before" ? 0 : 1); assert.ok([404, 409].includes((await send(input)).status)); assert.equal(invocations, 1);
});

integration("Agent version changes cannot replay old receipts or silently retain an old clarification chain", async t => {
  const agent = await getAgent("file-preprocessor"), version = agent.version;
  t.after(() => { agent.version = version; });
  runtime = async options => { await options.beforeModelCall(); modelCalls++; return modelResult({ type: "clarify", question: "请补充原文" }); };
  const input = body(); assert.equal((await send(input)).status, 201);
  agent.version = "99.0.0";
  assert.equal(code(await send(input)), "AI_AGENT_VERSION_CHANGED");
  assert.equal(code(await send(body("补充后的内容"))), "AI_AGENT_VERSION_CHANGED");
  assert.equal((await inputRows()).length, 1); assert.equal(invocations, 1);
  runtime = async options => { assert.deepEqual(options.appContext.specialistDispatch.requestMessages, [{ content: "新的完整需求" }]);
    await options.beforeModelCall(); return modelResult({ type: "reply", reply: "重新讨论" }); };
  assert.equal((await send({ ...body("新的完整需求"), agentContextReset: true })).status, 201);
});

integration("missing selected albums force clarification; an explicit reset removes the old selection and user chain", async () => {
  fixture = await makeOwner("album-manager");
  const albumId = crypto.randomUUID();
  await query("INSERT INTO station_albums(id,user_id,title) VALUES (?,?,'Only selected album')", [albumId, fixture.userId]);
  runtime = async options => { await options.beforeModelCall(); return modelResult({ type: "clarify", question: "要找哪种照片？" }); };
  const first = await send({ ...body("在选中相册找照片"), contextRefs: [{ kind: "station-album", id: albumId }] });
  assert.equal(first.status, 201);
  runtime = async options => { assert.equal(options.appContext.specialistDispatch.pendingContextMissing, true);
    await options.beforeModelCall(); return modelResult({ type: "workspace", capability: "media.select" }); };
  const missing = await send(body("旅行照片")); assert.equal(missing.status, 201);
  assert.equal(missing.data.messages.at(-1).metadata.agentDispatch.kind, "clarify");
  assert.equal(missing.data.messages.at(-1).metadata.agentClarification.contextRefs[0].id, albumId);
  assert.equal((await workspaces()).length, 0);
  runtime = async options => { assert.equal(options.appContext.specialistDispatch.pendingContextMissing, false);
    assert.equal(options.appContext.specialistDispatch.contextReset, true);
    assert.deepEqual(options.appContext.specialistDispatch.requestMessages, [{ content: "重新讨论相册的功能" }]);
    await options.beforeModelCall(); return modelResult({ type: "reply", reply: "可以讨论" }); };
  assert.equal((await send({ ...body("重新讨论相册的功能"), agentContextReset: true })).status, 201);
});

integration("invalid classifier responses and foreign capabilities have durable errors and never run another Agent", async () => {
  for (const decision of [{ type: "workspace", capability: "site.compose" }, { type: "workspace", capability: "text.summarize", agentId: "miaoxun-butler" },
    { type: "workspace", capability: "text.summarize", goal: "Invented private context" }]) {
    const input = body(); runtime = async options => { await options.beforeModelCall(); modelCalls++; return modelResult(decision); };
    const result = await send(input); assert.equal(code(result), "SPECIALIST_DISPATCH_INVALID");
    const count = invocations; assert.equal(code(await send(input)), "SPECIALIST_DISPATCH_INVALID"); assert.equal(invocations, count);
  }
  assert.equal((await workspaces()).length, 0);
});

integration("workspace and response commit together; an output failure cannot leave a task running behind an error", async () => {
  const input = body();
  runtime = async options => { await options.beforeModelCall(); modelCalls++; return modelResult({ type: "workspace", capability: "text.summarize" }); };
  await query(`CREATE FUNCTION test_specialist_reply_failure() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
    IF NEW.metadata->'agentWorkspace' IS NOT NULL THEN RAISE EXCEPTION 'isolated output failure'; END IF; RETURN NEW; END; $$`);
  await query("CREATE TRIGGER test_specialist_reply_failure BEFORE INSERT ON chat_messages FOR EACH ROW EXECUTE FUNCTION test_specialist_reply_failure()");
  try {
    const result = await send(input); assert.equal(result.status, 503); assert.equal(code(result), "SPECIALIST_MESSAGE_FAILED");
    assert.equal((await workspaces()).length, 0);
    assert.equal(code(await send(input)), "SPECIALIST_MESSAGE_FAILED"); assert.equal(modelCalls, 1);
  } finally {
    await query("DROP TRIGGER test_specialist_reply_failure ON chat_messages"); await query("DROP FUNCTION test_specialist_reply_failure()");
  }
});

integration("new album messages create only a direct workspace while an accepted legacy ai_task key keeps its original target", async () => {
  fixture = await makeOwner("album-manager");
  await query("INSERT INTO media_retrieval_profiles(user_id,index_state,consent_version,consent_granted_at) VALUES (?,'enabled','media-retrieval-consent-v1',clock_timestamp())", [fixture.userId]);
  const legacyBody = messageSchema.parse(body("Legacy search request"));
  const legacy = await submitAlbumMessageTask({ user: { id: fixture.userId, displayName: "Fixture" }, thread: { id: fixture.threadId, agentId: fixture.agent.key },
    body: legacyBody, requestFingerprint: messageRequestFingerprint(legacyBody), replyMetadata: {},
    agentAccess: { agent: fixture.agent, grantedScopes: fixture.agent.permissions } });
  runtime = async () => assert.fail("A legacy key must not dispatch another model");
  const old = await send(legacyBody, fixture, fixture.threadId, "4"); assert.equal(old.status, 200);
  assert.equal(old.data.task.id, legacy.task.id); assert.equal((await workspaces()).length, 0);
  runtime = async options => { assert.equal(options.agentId, "album-manager"); assert.equal(options.tools, undefined);
    await options.beforeModelCall(); modelCalls++; return modelResult({ type: "workspace", capability: "media.select" }); };
  const fresh = await send(body("Find this week's photos")); assert.equal(fresh.status, 201, JSON.stringify(fresh));
  assert.equal((await workspaces()).length, 1);
  assert.deepEqual((await query("SELECT id FROM ai_tasks WHERE user_id=?", [fixture.userId])).map(row => row.id), [legacy.task.id]);
  assert.equal(modelCalls, 1);
});

integration("linked workspace discussion is dispatched before the new specialist classifier", async () => {
  const result = await send({ ...body(), workspaceContext: { id: crypto.randomUUID(), revision: 1, currentRound: 1 } });
  assert.equal(result.status, 404); assert.equal(code(result), "WORKSPACE_NOT_FOUND");
  assert.equal((await inputRows()).length, 0); assert.equal(invocations, 0);
});
