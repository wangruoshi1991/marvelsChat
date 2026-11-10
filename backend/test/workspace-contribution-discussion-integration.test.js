import assert from "node:assert/strict";
import crypto from "node:crypto";
import test, { after, before, beforeEach } from "node:test";
import express from "express";
import { query, closeDatabase } from "../src/db.js";
import { authenticate, hashToken } from "../src/auth.js";
import { getAgent } from "../../agents/registry.js";
import { createAgentWorkspaceService } from "../src/agent-workspace-service.js";
import { contributionDiscussionPlan } from "../src/contribution-discussion-plan.js";
import { discussionHistoryHash } from "../src/workspace-discussion-history.js";
import { listAgentHistoryBeforeInput, listThreadsForUser, listMessagesForThreads } from "../src/message-repository.js";
import { publicMessagesByThread } from "../src/public-message.js";
import { registerMessageRoutes } from "../src/routes/message-routes.js";
import { registerAgentWorkspaceRoutes } from "../src/routes/agent-workspace-routes.js";
import { createRequestErrorHandler } from "../src/request-observability.js";
import { seedPublishedAgentConsent, cleanupPublishedAgentConsent } from "./helpers/agent-publishing-fixture.js";

const enabled = process.env.RUN_WORKSPACE_CONTRIBUTION_DISCUSSION_INTEGRATION === "1";
const integration = (name, run) => test(name, { skip: !enabled && "Requires a migrated disposable loopback *_migration_test PostgreSQL database" }, run);
const owners = [], publications = [];
const service = createAgentWorkspaceService();
const selectedBody = "SELECTED_CONTRIBUTION_STORYBOARD_FIRST_SCENE";
const otherBody = "OTHER_AGENT_CONTRIBUTION_NOT_SELECTED";
const sourceBody = "SOURCE_RAW_BODY_NOT_AUTOMATICALLY_READ_FOR_DISCUSSION";
const privateChat = "PRIVATE_AGENT_CHAT_NOT_SHARED_WITH_CONTRIBUTION_DISCUSSION";
const replyBody = "本次讨论针对选定分镜：先铺垫人物，再交代修伞动机。";
const receipt = { provider: "isolated-contribution-discussion-fixture", latencyMs: 1,
  tokenUsage: { prompt: 2, completion: 3, total: 5 } };
const agentKeys = ["miaoxun-butler", "comic-diary", "video-production"];
const agents = Object.fromEntries(await Promise.all(agentKeys.map(async key => [key, await getAgent(key)])));
let server, origin, fixture, invocations, modelCalls, runtime;
const deferred = () => { let resolve; const promise = new Promise(done => { resolve = done; }); return { resolve, promise }; };
const modelResult = () => ({ reply: replyBody, ...receipt });
const selector = workspace => ({ id: workspace.id, revision: workspace.revision, currentRound: workspace.currentRound, nodeId: workspace.nodeId });
const body = (workspace = fixture.workspace, content = "就这份分镜解释一下开场，不修改原任务") => ({ content, clientMessageId: crypto.randomUUID(), workspaceContext: selector(workspace) });
const invokeRuntime = async options => { invocations++; return runtime(options); };
const errorCode = result => result.error?.details?.code;

before(async () => {
  if (!enabled) return;
  const url = new URL(process.env.DATABASE_URL);
  assert.ok(["127.0.0.1", "localhost", "[::1]"].includes(url.hostname));
  assert.match(url.pathname, /_migration_test$/);
  assert.match((await query("SELECT current_database() AS name"))[0].name, /_migration_test$/);
  const app = express(); app.use(express.json());
  registerMessageRoutes(app, { authenticate, asyncHandler: fn => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next),
    getOnlineUserIds: () => [], sendRealtimeToUser() {}, runAgentRuntime: invokeRuntime });
  registerAgentWorkspaceRoutes(app, { authenticate,
    asyncHandler: fn => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next), service });
  app.use(createRequestErrorHandler({ production: true, logger: { error() {} } }));
  await new Promise(resolve => { server = app.listen(0, "127.0.0.1", resolve); });
  origin = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  if (!enabled) return;
  await new Promise(resolve => server?.close(resolve));
  await cleanupPublishedAgentConsent({ userIds: owners });
  await query("DELETE FROM users WHERE id = ANY(?::text[])", [owners]);
  for (const publication of publications.reverse()) await publication.cleanup();
  await closeDatabase();
});

async function makeOwner() {
  const userId = crypto.randomUUID(), token = crypto.randomBytes(32).toString("hex");
  owners.push(userId);
  await query("INSERT INTO users(id,email,password_hash,display_name,ai_id) VALUES (?,?,'isolated-test-only',?,?)",
    [userId, `${userId}@example.invalid`, `Contribution ${userId}`, String(crypto.randomInt(100000000000, 999999999999))]);
  await query("INSERT INTO user_profiles(user_id,nickname,avatar_text) VALUES (?,'private-profile-not-model','C')", [userId]);
  const threads = {};
  for (const agentId of agentKeys) {
    threads[agentId] = crypto.randomUUID();
    await query("INSERT INTO user_agents(user_id,agent_id,enabled,granted_scopes) VALUES (?,?,true,?::jsonb)", [userId, agentId, JSON.stringify(agents[agentId].permissions)]);
    await query("INSERT INTO chat_threads(id,user_id,title,agent_id,kind) VALUES (?,?,'Contribution discussion',?,'agent')", [threads[agentId], userId, agentId]);
  }
  await query("INSERT INTO auth_sessions(id,user_id,token_hash,expires_at) VALUES (?,?,?,clock_timestamp()+INTERVAL '1 hour')", [crypto.randomUUID(), userId, hashToken(token)]);
  publications.push(await seedPublishedAgentConsent({ userId, agentKeys }));
  const sourceId = crypto.randomUUID();
  await query("INSERT INTO chat_messages(id,user_id,thread_id,sender_type,sender_name,content) VALUES (?,?,?,'user','Fixture',?)", [sourceId, userId, threads['miaoxun-butler'], sourceBody]);
  await query("INSERT INTO chat_messages(id,user_id,thread_id,sender_type,sender_name,content) VALUES (?,?,?,'user','Fixture',?)", [crypto.randomUUID(), userId, threads['comic-diary'], privateChat]);
  return { userId, token, threads, threadId: threads['comic-diary'], sourceId };
}

async function makeWorkspace(owner) {
  const workspace = await service.submitAgentWorkspace({ user: { id: owner.userId }, goal: "为虚构修伞故事设计分镜和视频脚本", contextRefs: [{ kind: "chat-message", id: owner.sourceId }],
    source: { page: "miao", module: "task-composer" }, idempotencyKey: crypto.randomUUID() });
  const nodeId = crypto.randomUUID(), otherNodeId = crypto.randomUUID();
  const artifact = { kind: "text_result", title: "修伞故事分镜", content: selectedBody };
  await query("UPDATE agent_workspace_nodes SET status='succeeded' WHERE workspace_id=?", [workspace.id]);
  for (const [id, key, agentId, capability, content] of [[nodeId, "storyboard", "comic-diary", "comic.storyboard", selectedBody], [otherNodeId, "video", "video-production", "video.script", otherBody]]) {
    await query(`INSERT INTO agent_workspace_nodes(id,workspace_id,user_id,round_number,node_key,agent_id,agent_version,capability,goal,status,context_ref_indexes,result)
      VALUES (?,?,?,1,?,?,?,?,?,'succeeded','[0]'::jsonb,?::jsonb)`, [id, workspace.id, owner.userId, key, agentId, agents[agentId].version, capability,
      "完成本节点的明确文字目标", JSON.stringify({ artifact: { ...artifact, content }, sourceReferences: workspace.contextRefs })]);
  }
  await query("UPDATE agent_workspaces SET status='succeeded',summary='隔离测试节点已完成',result=?::jsonb WHERE id=?", [JSON.stringify({ resultKey: "storyboard", artifact, sourceReferences: workspace.contextRefs }), workspace.id]);
  return { ...workspace, nodeId, otherNodeId };
}

beforeEach(async () => {
  if (!enabled) return;
  fixture = await makeOwner(); fixture.workspace = await makeWorkspace(fixture);
  invocations = 0; modelCalls = 0;
  runtime = async options => { assert.equal(options.mode, "chat"); await options.beforeModelCall(); modelCalls++; return modelResult(); };
});

async function send(input, owner = fixture, threadId = owner.threadId, contract = "6") {
  const response = await fetch(`${origin}/api/threads/${threadId}/messages`, { method: "POST", headers: {
    Authorization: `Bearer ${owner.token}`, "Content-Type": "application/json", "X-Miaoxun-AI-Contract": "1",
    ...(contract === null ? {} : { "X-Miaoxun-Agent-Workspace": contract }),
  }, body: JSON.stringify(input) });
  return { status: response.status, ...await response.json() };
}
async function readReply(messageId, owner = fixture, threadId = owner.threadId) {
  const response = await fetch(`${origin}/api/threads/${threadId}/messages/${messageId}/contribution-discussion`, { headers: {
    Authorization: `Bearer ${owner.token}`, "X-Miaoxun-AI-Contract": "1", "X-Miaoxun-Agent-Workspace": "6",
  } });
  const text = await response.text();
  return { status: response.status, ...(text.trim().startsWith("{") ? JSON.parse(text) : { text }) };
}
const snapshot = () => query("SELECT id,revision,current_round,status,result FROM agent_workspaces WHERE user_id=? ORDER BY id", [fixture.userId]);

integration("same Agent conversation discusses only the explicitly selected authorized text and never changes the task", async () => {
  const input = body(), before = await snapshot();
  runtime = async options => {
    assert.equal(options.agentId, "comic-diary"); assert.equal(options.mode, "chat"); assert.equal(options.tools, undefined);
    assert.equal(options.user, null); assert.equal(options.thread, null); assert.deepEqual(options.messages, []);
    assert.ok(options.appContext.contributionDiscussion);
    const shared = JSON.stringify(options.appContext);
    assert.match(shared, new RegExp(selectedBody));
    for (const secret of [otherBody, sourceBody, privateChat, fixture.userId, fixture.workspace.id, fixture.workspace.nodeId]) assert.ok(!shared.includes(secret));
    await options.beforeModelCall(); modelCalls++; return modelResult();
  };
  const result = await send({ ...input, clientContext: { profileSnapshot: { nickname: "forged-client-profile" } } });
  assert.equal(result.status, 201, JSON.stringify(result));
  const output = result.data.messages.at(-1);
  assert.equal(output.threadId, fixture.threadId);
  assert.equal(output.metadata.workspaceContext.nodeId, fixture.workspace.nodeId);
  assert.deepEqual(output.metadata.contributionDiscussion, { state: "available" });
  assert.ok(!JSON.stringify(result).includes(replyBody));
  assert.deepEqual((await readReply(output.id)).data, { content: replyBody });
  assert.deepEqual(await snapshot(), before);
  assert.equal((await query("SELECT count(*)::int AS n FROM chat_threads WHERE user_id=? AND agent_id='comic-diary'", [fixture.userId]))[0].n, 1);
  const publicHistory = publicMessagesByThread(await listMessagesForThreads(fixture.userId, [fixture.threadId]));
  assert.ok(!JSON.stringify(publicHistory).includes(replyBody));
  const preview = (await listThreadsForUser(fixture.userId)).find(item => item.id === fixture.threadId);
  assert.ok(!JSON.stringify(preview).includes(replyBody));
});

integration("selectors reject unsupported contracts, other Agent nodes, other accounts, stale versions and mixed inputs before model dispatch", async () => {
  const input = body();
  for (const contract of [null, "3", "5"]) assert.equal((await send(input, fixture, fixture.threadId, contract)).status, 426);
  for (const extra of [{ workspaceContext: { ...input.workspaceContext, goal: "forged" } }, { replyToMessageId: crypto.randomUUID() },
    { contextRefs: [{ kind: "chat-message", id: fixture.sourceId }] }, { agentContextReset: true }, { attachmentIds: [crypto.randomUUID()] }]) {
    assert.equal((await send({ ...input, ...extra })).status, 400, JSON.stringify(extra));
  }
  for (const patch of [{ revision: input.workspaceContext.revision + 1 }, { currentRound: 2 }, { nodeId: crypto.randomUUID() }, { nodeId: fixture.workspace.otherNodeId }]) {
    const result = await send({ ...input, workspaceContext: { ...input.workspaceContext, ...patch } });
    assert.ok([403, 404, 409].includes(result.status), JSON.stringify(result));
  }
  const outsider = await makeOwner();
  assert.equal((await send(input, outsider)).status, 404);
  assert.equal((await query("SELECT id FROM chat_messages WHERE user_id=? AND client_message_id=?", [fixture.userId, input.clientMessageId])).length, 0);
  assert.equal(invocations, 0);
});

integration("concurrent retries and accepted-key changes never redispatch or change the selected contribution", async () => {
  const input = body(), entered = deferred(), release = deferred();
  runtime = async options => { await options.beforeModelCall(); modelCalls++; entered.resolve(); await release.promise; return modelResult(); };
  const pending = send(input); await Promise.race([entered.promise, pending.then(result => assert.fail(`Request completed before model dispatch: ${JSON.stringify(result)}`))]);
  const duplicate = await send(input);
  assert.equal(duplicate.status, 409, JSON.stringify(duplicate));
  assert.equal(errorCode(duplicate), "WORKSPACE_DISCUSSION_PENDING");
  release.resolve();
  const first = await pending; assert.equal(first.status, 201, JSON.stringify(first));
  const replay = await send(input); assert.equal(replay.status, 200);
  assert.deepEqual(replay.data.messages, first.data.messages); assert.equal(modelCalls, 1);
  assert.equal((await send({ ...input, content: "改变输入但复用旧消息ID" })).status, 409);
  assert.equal((await send({ ...input, workspaceContext: { ...input.workspaceContext, nodeId: fixture.workspace.otherNodeId } })).status, 409);
  assert.equal(modelCalls, 1);
});

integration("follow-up history is scoped to this exact selected contribution and stays outside ordinary model history", async () => {
  const first = await send(body()); assert.equal(first.status, 201, JSON.stringify(first));
  const otherWorkspace = await makeWorkspace(fixture);
  runtime = async options => { assert.deepEqual(options.messages, []); await options.beforeModelCall(); modelCalls++; return modelResult(); };
  assert.equal((await send(body(otherWorkspace))).status, 201);
  runtime = async options => {
    assert.equal(options.messages.length, 2);
    assert.equal(options.messages[0].senderType, "user"); assert.equal(options.messages[1].content, replyBody);
    assert.ok(!JSON.stringify(options.messages).includes(privateChat));
    await options.beforeModelCall(); modelCalls++; return modelResult();
  };
  const third = await send(body()); assert.equal(third.status, 201, JSON.stringify(third));
  const inputId = crypto.randomUUID();
  await query("INSERT INTO chat_messages(id,user_id,thread_id,sender_type,sender_name,content) VALUES (?,?,?,'user','Fixture','普通新问题')", [inputId, fixture.userId, fixture.threadId]);
  const ordinary = await listAgentHistoryBeforeInput(fixture.userId, fixture.threadId, inputId);
  assert.equal(ordinary.some(item => item.metadata.workspaceContext?.nodeId), false);
  assert.ok(!JSON.stringify(ordinary).includes(replyBody));
  assert.ok(!JSON.stringify(ordinary).includes(privateChat), "An explicit contribution discussion is an ordinary-history boundary");
});

for (const revocation of ["grant", "entitlement", "source-recall", "source-change"]) {
  integration(`selected contribution ${revocation} is rechecked before dispatch and protected reads`, async () => {
    const input = body();
    const result = await send(input); assert.equal(result.status, 201, JSON.stringify(result));
    const outputId = result.data.messages.at(-1).id;
    if (revocation === "grant") await query("UPDATE user_agents SET enabled=false WHERE user_id=? AND agent_id='comic-diary'", [fixture.userId]);
    else if (revocation === "entitlement") await query("UPDATE user_entitlements SET status='disabled' WHERE user_id=?", [fixture.userId]);
    else if (revocation === "source-recall") await query("UPDATE chat_messages SET recalled_at=clock_timestamp() WHERE id=?", [fixture.sourceId]);
    else await query("UPDATE chat_messages SET content='Changed original source' WHERE id=?", [fixture.sourceId]);
    assert.ok([403, 404, 409].includes((await readReply(outputId)).status));
    assert.ok([403, 404, 409].includes((await send(body())).status));
    assert.equal(modelCalls, 1);
    assert.ok(!JSON.stringify(publicMessagesByThread(await listMessagesForThreads(fixture.userId, [fixture.threadId]))).includes(replyBody));
  });
}

integration("permission withdrawal after provider dispatch discards the response and cannot be retried into a new call", async () => {
  const input = body();
  runtime = async options => {
    await options.beforeModelCall(); modelCalls++;
    await query("UPDATE user_agents SET enabled=false WHERE user_id=? AND agent_id='comic-diary'", [fixture.userId]);
    return modelResult();
  };
  const result = await send(input); assert.equal(result.status, 403, JSON.stringify(result));
  assert.ok(!JSON.stringify(result).includes(replyBody));
  const rows = await query("SELECT content,metadata FROM chat_messages WHERE user_id=? AND thread_id=?", [fixture.userId, fixture.threadId]);
  assert.ok(!JSON.stringify(rows).includes(replyBody));
  await query("UPDATE user_agents SET enabled=true WHERE user_id=? AND agent_id='comic-diary'", [fixture.userId]);
  assert.equal((await send(input)).status, 403); assert.equal(modelCalls, 1);
});

integration("protected reply rejects a different account, thread, recalled or deleted output", async () => {
  const result = await send(body()); assert.equal(result.status, 201, JSON.stringify(result));
  const outputId = result.data.messages.at(-1).id, outsider = await makeOwner();
  assert.ok([404, 409].includes((await readReply(outputId, outsider)).status));
  assert.ok([404, 409].includes((await readReply(outputId, fixture, fixture.threads['video-production'])).status));
  for (const field of ["recalled_at", "deleted_at"]) {
    await query(`UPDATE chat_messages SET ${field}=clock_timestamp() WHERE id=?`, [outputId]);
    assert.ok([404, 409].includes((await readReply(outputId)).status));
    await query(`UPDATE chat_messages SET ${field}=NULL WHERE id=?`, [outputId]);
  }
});


integration("deleted or recalled discussion input removes access to its protected answer", async () => {
  const result = await send(body()); assert.equal(result.status, 201, JSON.stringify(result));
  const inputId = result.data.messages[0].id, outputId = result.data.messages.at(-1).id;
  for (const field of ["deleted_at", "recalled_at"]) {
    await query(`UPDATE chat_messages SET ${field}=clock_timestamp() WHERE id=?`, [inputId]);
    assert.ok([404, 409].includes((await readReply(outputId)).status));
    await query(`UPDATE chat_messages SET ${field}=NULL WHERE id=?`, [inputId]);
  }
  assert.deepEqual((await readReply(outputId)).data, { content: replyBody });
});

integration("the dispatch checkpoint rejects a grant withdrawn after admission without making a model call", async () => {
  const input = body();
  runtime = async options => {
    await query("UPDATE user_agents SET enabled=false WHERE user_id=? AND agent_id='comic-diary'", [fixture.userId]);
    await options.beforeModelCall(); modelCalls++; return modelResult();
  };
  const result = await send(input); assert.equal(result.status, 403, JSON.stringify(result));
  assert.equal(invocations, 1); assert.equal(modelCalls, 0);
  await query("UPDATE user_agents SET enabled=true WHERE user_id=? AND agent_id='comic-diary'", [fixture.userId]);
  assert.equal((await send(input)).status, 403); assert.equal(modelCalls, 0);
});

integration("changed selected text after dispatch is discarded rather than persisted or exposed", async () => {
  const input = body();
  runtime = async options => {
    await options.beforeModelCall(); modelCalls++;
    await query("UPDATE agent_workspace_nodes SET result=jsonb_set(result,'{artifact,content}','\"Changed selected contribution\"'::jsonb) WHERE id=?", [fixture.workspace.nodeId]);
    return modelResult();
  };
  const result = await send(input); assert.equal(result.status, 409, JSON.stringify(result));
  assert.ok(!JSON.stringify(result).includes(replyBody));
  assert.ok(!JSON.stringify(await query("SELECT content,metadata FROM chat_messages WHERE user_id=?", [fixture.userId])).includes(replyBody));
  assert.equal(modelCalls, 1);
});

integration("protected reads verify the original selected result snapshot even after a successful discussion", async () => {
  const result = await send(body()); assert.equal(result.status, 201, JSON.stringify(result));
  const outputId = result.data.messages.at(-1).id;
  await query("UPDATE agent_workspace_nodes SET result=jsonb_set(result,'{artifact,content}','\"Changed selected contribution\"'::jsonb) WHERE id=?", [fixture.workspace.nodeId]);
  assert.equal((await readReply(outputId)).status, 409);
});

integration("recalling an earlier turn invalidates later protected replies that used that turn as model history", async () => {
  const first = await send(body()); assert.equal(first.status, 201, JSON.stringify(first));
  const second = await send(body()); assert.equal(second.status, 201, JSON.stringify(second));
  const outputId = second.data.messages.at(-1).id;
  for (const messageId of [first.data.messages[0].id, first.data.messages.at(-1).id]) {
    await query("UPDATE chat_messages SET recalled_at=clock_timestamp() WHERE id=?", [messageId]);
    const response = await readReply(outputId);
    assert.ok([404, 409].includes(response.status), JSON.stringify(response));
    await query("UPDATE chat_messages SET recalled_at=NULL WHERE id=?", [messageId]);
  }
});

integration("a later discussion cannot reuse a reply derived from a now-recalled earlier turn", async () => {
  const first = await send(body()); assert.equal(first.status, 201, JSON.stringify(first));
  const second = await send(body()); assert.equal(second.status, 201, JSON.stringify(second));
  await query("UPDATE chat_messages SET recalled_at=clock_timestamp() WHERE id=?", [first.data.messages[0].id]);
  const callsBefore = modelCalls;
  const third = await send(body());
  assert.equal(third.status, 409, JSON.stringify(third));
  assert.equal(modelCalls, callsBefore);
});


test("discussion title limits match valid text artifacts and old Butler history hashes remain stable", () => {
  const context = { goal: "任务", language: "zh-CN", contribution: { title: "题".repeat(160), content: "正文" } };
  assert.ok(contributionDiscussionPlan({ system: "Agent expertise", user: "Input" }, { mode: "chat", appContext: { contributionDiscussion: context } }));
  assert.throws(() => contributionDiscussionPlan({ system: "", user: "" }, { mode: "chat", appContext: { contributionDiscussion: { ...context, contribution: { ...context.contribution, title: "题".repeat(161) } } } }), issue => issue.status === 422);
  const old = { sender_type: "user", content: "Old task discussion", metadata: { workspaceContext: { id: crypto.randomUUID(), revision: 1, currentRound: 1, goal: "Old task" }, workspaceDiscussion: { agentVersion: "0.3.3" } } };
  const previousHash = crypto.createHash("sha256").update(JSON.stringify([old.sender_type, old.content, old.metadata.workspaceContext, old.metadata.workspaceDiscussion.agentVersion])).digest("hex");
  assert.equal(discussionHistoryHash(old), previousHash);
});

integration("transitive provenance survives the six-pair model window and closes later replies after ancestor recall", async () => {
  const turns = [];
  for (let index = 0; index < 8; index++) {
    const result = await send(body()); assert.equal(result.status, 201, JSON.stringify(result)); turns.push(result.data.messages);
  }
  await query("UPDATE chat_messages SET recalled_at=clock_timestamp() WHERE id=?", [turns[0][0].id]);
  assert.equal((await readReply(turns.at(-1).at(-1).id)).status, 409);
  const callsBefore = modelCalls;
  assert.equal((await send(body())).status, 409); assert.equal(modelCalls, callsBefore);
});

integration("interrupted pending recovery wins over a late provider response and never dispatches twice", async () => {
  const input = body(), entered = deferred(), release = deferred();
  runtime = async options => { await options.beforeModelCall(); modelCalls++; entered.resolve(); await release.promise; return modelResult(); };
  const pending = send(input);
  await Promise.race([entered.promise, pending.then(result => assert.fail(`Request completed before model dispatch: ${JSON.stringify(result)}`))]);
  let recovered;
  try {
    await query("UPDATE chat_messages SET created_at=clock_timestamp()-INTERVAL '1 day' WHERE user_id=? AND client_message_id=?", [fixture.userId, input.clientMessageId]);
    recovered = await send(input); assert.equal(recovered.status, 409, JSON.stringify(recovered));
    assert.equal(errorCode(recovered), "WORKSPACE_DISCUSSION_INTERRUPTED");
  } finally { release.resolve(); }
  const late = await pending; assert.equal(late.status, 409, JSON.stringify(late));
  assert.equal(errorCode(late), "WORKSPACE_DISCUSSION_INTERRUPTED");
  assert.equal((await send(input)).status, 409); assert.equal(modelCalls, 1);
  assert.ok(!JSON.stringify(await query("SELECT content,metadata FROM chat_messages WHERE user_id=?", [fixture.userId])).includes(replyBody));
});


async function readContribution(nodeId, agentId = "comic-diary", owner = fixture, contributionContract = "2") {
  const response = await fetch(`${origin}/api/agent-workspaces/contributions/${agentId}${nodeId ? `/${nodeId}` : ""}`, { headers: {
    Authorization: `Bearer ${owner.token}`, "X-Miaoxun-AI-Contract": "1", "X-Miaoxun-Agent-Workspace": "6",
    ...(contributionContract === null ? {} : { "X-Miaoxun-Workspace-Contributions": contributionContract }),
  } });
  return { status: response.status, ...await response.json() };
}

integration("strict contribution reads support contracts 2 and 3 and reject other versions", async () => {
  for (const nodeId of [fixture.workspace.nodeId, undefined]) {
    for (const version of [null, "1", "4"]) assert.equal((await readContribution(nodeId, "comic-diary", fixture, version)).status, 426);
    for (const version of ["2", "3"]) assert.equal((await readContribution(nodeId, "comic-diary", fixture, version)).status, 200);
  }
  const paged = await readContribution(undefined, "comic-diary", fixture, "3");
  assert.equal(paged.data.hasMore, false);
  assert.equal(paged.data.nextCursor, null);
  const selected = (await readContribution(fixture.workspace.nodeId)).data.contribution;
  assert.deepEqual(Object.keys(selected).sort(), ["step", "workspace"]);
  assert.deepEqual(Object.keys(selected.workspace).sort(), ["currentRound", "executionMode", "goal", "id", "revision"]);
  assert.deepEqual(selected.workspace, { id: fixture.workspace.id, revision: fixture.workspace.revision,
    currentRound: 1, executionMode: "coordinated", goal: fixture.workspace.goal });
  assert.equal(selected.step.id, fixture.workspace.nodeId); assert.equal(selected.step.agentId, "comic-diary");
  assert.deepEqual(Object.keys(selected.step).sort(), ["agentId", "agentVersion", "capability", "createdAt", "dependencies", "error", "goal", "id", "key", "result", "round", "status", "summary", "updatedAt"]);
  assert.deepEqual(selected.step.result, { kind: "text_result", id: fixture.workspace.nodeId, title: "修伞故事分镜" });
  assert.ok(!JSON.stringify(selected).includes(selectedBody));
  assert.ok(!JSON.stringify(selected).includes(sourceBody));
});

integration("exact contribution resolution reaches an authorized node beyond the latest50 without restoring rejected list entries", async () => {
  await query("UPDATE agent_workspace_nodes SET updated_at=clock_timestamp()-INTERVAL '1 day' WHERE id=?", [fixture.workspace.nodeId]);
  for (let index = 0; index < 51; index++) {
    await query(`INSERT INTO agent_workspace_nodes(id,workspace_id,user_id,round_number,node_key,agent_id,agent_version,capability,goal,status,context_ref_indexes,result)
      VALUES (?,?,?,1,?,'comic-diary',?,'comic.storyboard','额外明确节点目标','succeeded','[0]'::jsonb,?::jsonb)`,
    [crypto.randomUUID(), fixture.workspace.id, fixture.userId, `extra-${index}`, agents["comic-diary"].version,
      JSON.stringify({ artifact: { kind: "text_result", title: "额外分镜", content: "额外节点正文" }, sourceReferences: fixture.workspace.contextRefs })]);
  }
  const latest = await readContribution(); assert.equal(latest.status, 200, JSON.stringify(latest));
  assert.equal(latest.data.contributions.length, 50); assert.equal(latest.data.hasMore, true);
  assert.equal(latest.data.contributions.some(item => item.step?.id === fixture.workspace.nodeId), false);
  const exact = await readContribution(fixture.workspace.nodeId); assert.equal(exact.status, 200, JSON.stringify(exact));
  assert.equal(exact.data.contribution.step.id, fixture.workspace.nodeId);
  await query("UPDATE user_agents SET enabled=false WHERE user_id=? AND agent_id='comic-diary'", [fixture.userId]);
  assert.equal((await readContribution(fixture.workspace.nodeId)).status, 403);
  const revoked = await readContribution(); assert.equal(revoked.status, 200, JSON.stringify(revoked));
  assert.equal(revoked.data.contributions.some(item => item.step), false);
});

integration("exact contribution reads return null for missing, wrong owner, wrong Agent and coordinate nodes", async () => {
  const outsider = await makeOwner();
  for (const [nodeId, agentId, owner] of [[crypto.randomUUID(), "comic-diary", fixture],
    [fixture.workspace.nodeId, "video-production", fixture], [fixture.workspace.nodeId, "comic-diary", outsider]]) {
    const result = await readContribution(nodeId, agentId, owner); assert.equal(result.status, 200, JSON.stringify(result));
    assert.deepEqual(result.data, { contribution: null });
  }
  const [coordinate] = await query("SELECT id FROM agent_workspace_nodes WHERE workspace_id=? AND capability='workspace.coordinate'", [fixture.workspace.id]);
  const result = await readContribution(coordinate.id, "miaoxun-butler"); assert.equal(result.status, 200, JSON.stringify(result));
  assert.deepEqual(result.data, { contribution: null });
});

integration("exact contribution reads recheck source authority rather than falling back to general workspace metadata", async () => {
  assert.equal((await readContribution(fixture.workspace.nodeId)).status, 200);
  await query("UPDATE chat_messages SET content='Changed source invalidates its artifact' WHERE id=?", [fixture.sourceId]);
  const exact = await readContribution(fixture.workspace.nodeId);
  assert.ok([403, 409].includes(exact.status), JSON.stringify(exact));
  const listed = await readContribution(); assert.equal(listed.status, 200, JSON.stringify(listed));
  assert.ok(listed.data.contributions.some(item => item.id === fixture.workspace.nodeId && item.unavailable === true));
  assert.equal(listed.data.contributions.some(item => item.step?.id === fixture.workspace.nodeId), false);
});
