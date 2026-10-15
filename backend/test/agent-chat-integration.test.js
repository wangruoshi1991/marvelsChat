import assert from "node:assert/strict";
import crypto from "node:crypto";
import test, { after, before, beforeEach } from "node:test";
import express from "express";
import { getAgent } from "../../agents/registry.js";
import { authenticate, hashToken } from "../src/auth.js";
import { closeDatabase, query } from "../src/db.js";
import { registerMessageRoutes } from "../src/routes/message-routes.js";
import { createRequestErrorHandler } from "../src/request-observability.js";

const enabled = process.env.RUN_AI_TASK_INTEGRATION === "1";
const integration = (name, run) => test(name, { skip: !enabled && "Requires migrated disposable PostgreSQL" }, run);
const owner = crypto.randomUUID();
const token = crypto.randomBytes(32).toString("hex");
const threads = new Map(["virtual-character", "site-builder", "album-manager"].map(key => [key, crypto.randomUUID()]));
const calls = [];
let server;
let origin;

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
    const agent = await getAgent(key);
    await query("INSERT INTO user_agents(user_id,agent_id,enabled,granted_scopes) VALUES (?,?,true,?::jsonb)",
      [owner, key, JSON.stringify(agent.permissions)]);
    await query("INSERT INTO chat_threads(id,user_id,title,agent_id,kind) VALUES (?,?,'Chat fixture',?,'agent')", [threadId, owner, key]);
  }
  await query("INSERT INTO media_retrieval_profiles(user_id,index_state,consent_version,consent_granted_at) VALUES (?,'enabled','media-retrieval-consent-v1',clock_timestamp())", [owner]);
  const app = express();
  app.use(express.json());
  registerMessageRoutes(app, { authenticate, asyncHandler: handler => (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next),
    getOnlineUserIds: () => [], sendRealtimeToUser() {}, runAgentRuntime: async options => {
      await options.beforeModelCall();
      const agent = await getAgent(options.agentId);
      const prompt = await agent[options.mode](options);
      calls.push({ agentId: options.agentId, mode: options.mode, prompt });
      return { reply: "可以先讨论风格和内容。", provider: "isolated-chat-fixture", latencyMs: 1 };
    } });
  app.use(createRequestErrorHandler({ production: true, logger: { error() {} } }));
  await new Promise(resolve => { server = app.listen(0, "127.0.0.1", resolve); });
  origin = `http://127.0.0.1:${server.address().port}`;
});

beforeEach(() => { calls.length = 0; });
after(async () => {
  if (!enabled) return;
  if (server) await new Promise(resolve => server.close(resolve));
  await query("DELETE FROM users WHERE id = ?", [owner]);
  await closeDatabase();
});

const send = async (key, overrides = {}) => {
  const response = await fetch(`${origin}/api/threads/${threads.get(key)}/messages`, {
    method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", "X-Miaoxun-AI-Contract": "1" },
    body: JSON.stringify({ content: "我们先讨论一下风格", clientMessageId: crypto.randomUUID(), ...overrides }),
  });
  return { status: response.status, ...await response.json() };
};

for (const key of ["virtual-character", "site-builder"]) {
  integration(`${key} ordinary messages use its explicit conversation method`, async () => {
    const result = await send(key);
    assert.equal(result.status, 201);
    assert.equal(result.data.messages.at(-1).content, "可以先讨论风格和内容。");
    assert.equal(calls.length, 1);
    assert.equal(calls[0].agentId, key);
    assert.equal(calls[0].mode, "chat");
    assert.match(calls[0].prompt.system, /自然/);
    assert.doesNotMatch(calls[0].prompt.system, /只返回一个合法 JSON 对象/);
  });
}

integration("missing chat support is rejected before storing a message or invoking a generation plan", async t => {
  const agent = await getAgent("site-builder");
  const original = agent.chat;
  agent.chat = undefined;
  t.after(() => { agent.chat = original; });
  const clientMessageId = crypto.randomUUID();
  const result = await send(agent.key, { clientMessageId });
  assert.equal(result.status, 422);
  assert.equal(result.error.details.code, "AI_AGENT_MODE_UNSUPPORTED");
  assert.equal(result.error.message, "此 Agent 当前不支持普通对话。");
  assert.equal(calls.length, 0);
  assert.deepEqual(await query("SELECT id FROM chat_messages WHERE user_id = ? AND client_message_id = ?", [owner, clientMessageId]), []);
});

integration("album messages keep their queued task entry and never reach ordinary synchronous chat", async () => {
  const result = await send("album-manager");
  assert.equal(result.status, 202);
  assert.equal(result.data.task.kind, "agent_message");
  assert.equal(result.data.task.agentId, "album-manager");
  assert.equal(result.data.task.status, "queued");
  assert.equal(result.data.messages.length, 1);
  assert.equal(result.data.messages[0].senderType, "user");
  assert.equal(calls.length, 0);
  const [stored] = await query("SELECT input_message_id FROM ai_tasks WHERE id = ? AND user_id = ?", [result.data.task.id, owner]);
  assert.equal(stored.input_message_id, result.data.messages[0].id);
});
