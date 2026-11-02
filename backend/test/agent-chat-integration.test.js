import assert from "node:assert/strict";
import crypto from "node:crypto";
import test, { after, before, beforeEach } from "node:test";
import express from "express";
import { getAgent } from "../../agents/registry.js";
import { authenticate, hashToken } from "../src/auth.js";
import { closeDatabase, query } from "../src/db.js";
import { registerMessageRoutes } from "../src/routes/message-routes.js";
import { assertAgentExecutionMode } from "../src/agent-runtime.js";
import { createRequestErrorHandler } from "../src/request-observability.js";
import { cleanupPublishedAgentConsent, seedPublishedAgentConsent } from "./helpers/agent-publishing-fixture.js";

const enabled = process.env.RUN_AI_TASK_INTEGRATION === "1";
const integration = (name, run) => test(name, { skip: !enabled && "Requires migrated disposable PostgreSQL" }, run);
const owner = crypto.randomUUID();
const token = crypto.randomBytes(32).toString("hex");
const threads = new Map(["virtual-character", "site-builder", "album-manager"].map(key => [key, crypto.randomUUID()]));
const calls = [];
let server;
let origin;
let publicationFixture;

before(async () => {
  if (!enabled) return;
  assert.ok(["127.0.0.1", "localhost", "[::1]"].includes(new URL(process.env.DATABASE_URL).hostname));
  assert.match((await query("SELECT current_database() AS name"))[0].name, /_migration_test$/);
  await query("INSERT INTO users(id,email,password_hash,display_name,ai_id) VALUES (?,?,'test-only','Chat fixture',?)",
    [owner, `${owner}@example.invalid`, String(crypto.randomInt(100000000000, 999999999999))]);
  await query("INSERT INTO user_profiles(user_id,nickname,avatar_text) VALUES (?,'Chat fixture','T')", [owner]);
  await query("INSERT INTO auth_sessions(id,user_id,token_hash,expires_at) VALUES (?,?,?,clock_timestamp() + INTERVAL '1 hour')",
    [crypto.randomUUID(), owner, hashToken(token)]);
  for (const [key, threadId] of threads) {
    await query("INSERT INTO chat_threads(id,user_id,title,agent_id,kind) VALUES (?,?,'Chat fixture',?,'agent')", [threadId, owner, key]);
  }
  await query("INSERT INTO media_retrieval_profiles(user_id,index_state,consent_version,consent_granted_at) VALUES (?,'enabled','media-retrieval-consent-v1',clock_timestamp())", [owner]);
  publicationFixture = await seedPublishedAgentConsent({ userId: owner, agentKeys: [...threads.keys()] });
  const app = express();
  app.use(express.json());
  registerMessageRoutes(app, { authenticate, asyncHandler: handler => (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next),
    getOnlineUserIds: () => [], sendRealtimeToUser() {}, runAgentRuntime: async options => {
      await options.beforeModelCall();
      const agent = await getAgent(options.agentId);
      const prompt = await agent[options.mode](options);
      calls.push({ agentId: options.agentId, mode: options.mode, prompt });
      return { reply: JSON.stringify({ type: "reply", reply: "可以先讨论风格和内容。" }), provider: "isolated-chat-fixture", latencyMs: 1 };
    } });
  app.use(createRequestErrorHandler({ production: true, logger: { error() {} } }));
  await new Promise(resolve => { server = app.listen(0, "127.0.0.1", resolve); });
  origin = `http://127.0.0.1:${server.address().port}`;
});

beforeEach(() => { calls.length = 0; });
after(async () => {
  if (!enabled) return;
  if (server) await new Promise(resolve => server.close(resolve));
  await cleanupPublishedAgentConsent({ userIds: [owner] });
  await query("DELETE FROM users WHERE id = ?", [owner]);
  await publicationFixture?.cleanup();
  await closeDatabase();
});

const send = async (key, overrides = {}) => {
  const response = await fetch(`${origin}/api/threads/${threads.get(key)}/messages`, {
    method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", "X-Miaoxun-AI-Contract": "1", "X-Miaoxun-Agent-Workspace": "6" },
    body: JSON.stringify({ content: "我们先讨论一下风格", clientMessageId: crypto.randomUUID(), ...overrides }),
  });
  return { status: response.status, ...await response.json() };
};

for (const key of ["virtual-character", "site-builder"]) {
  integration(`${key} ordinary messages use its own dispatch and return an explicit consultation receipt`, async () => {
    const result = await send(key);
    assert.equal(result.status, 201);
    assert.equal(result.data.messages.at(-1).content, "可以先讨论风格和内容。");
    assert.equal(calls.length, 1);
    assert.equal(calls[0].agentId, key);
    assert.equal(calls[0].mode, "dispatch");
    assert.deepEqual(result.data.messages.at(-1).metadata.agentDispatch, { version: 1, kind: "reply" });
    assert.match(calls[0].prompt.system, /自然/);
    assert.doesNotMatch(calls[0].prompt.system, /只返回一个合法 JSON 对象/);
  });
}

test("missing explicit chat support still cannot fall back to a generation plan", async () => {
  const agent = await getAgent("site-builder");
  assert.throws(() => assertAgentExecutionMode({ ...agent, chat: undefined }, "chat"), error =>
    error.status === 422 && error.details.code === "AI_AGENT_MODE_UNSUPPORTED" && error.message === "此 Agent 当前不支持普通对话。");
});

integration("missing dispatch support is rejected before storing a professional message or invoking a generation plan", async t => {
  const agent = await getAgent("site-builder");
  const original = agent.dispatch;
  agent.dispatch = undefined;
  t.after(() => { agent.dispatch = original; });
  const clientMessageId = crypto.randomUUID();
  const result = await send(agent.key, { clientMessageId });
  assert.equal(result.status, 422);
  assert.equal(result.error.details.code, "AI_AGENT_MODE_UNSUPPORTED");
  assert.equal(result.error.message, "Agent does not support the requested execution mode.");
  assert.equal(calls.length, 0);
  assert.deepEqual(await query("SELECT id FROM chat_messages WHERE user_id = ? AND client_message_id = ?", [owner, clientMessageId]), []);
});

integration("album consultation uses its own dispatch without queuing a legacy search task", async () => {
  const result = await send("album-manager");
  assert.equal(result.status, 201);
  assert.equal(result.data.task, undefined);
  assert.equal(result.data.messages.length, 2);
  assert.equal(result.data.messages[0].senderType, "user");
  assert.equal(result.data.messages.at(-1).content, "可以先讨论风格和内容。");
  assert.equal(calls.length, 1);
  assert.equal(calls[0].agentId, "album-manager");
  assert.equal(calls[0].mode, "dispatch");
  assert.deepEqual(result.data.messages.at(-1).metadata.agentDispatch, { version: 1, kind: "reply" });
  assert.deepEqual(await query("SELECT id FROM ai_tasks WHERE user_id = ?", [owner]), []);
  assert.deepEqual(await query("SELECT id FROM agent_workspaces WHERE user_id = ?", [owner]), []);
});
