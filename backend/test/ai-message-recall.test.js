import assert from "node:assert/strict";
import crypto from "node:crypto";
import test, { before, after, beforeEach } from "node:test";
import express from "express";
import { query, closeDatabase } from "../src/db.js";
import { authenticate, hashToken } from "../src/auth.js";
import { registerMessageRoutes } from "../src/routes/message-routes.js";
import { createRequestErrorHandler } from "../src/request-observability.js";
import { createMessageTaskExecutor } from "../src/ai-message-task-service.js";
import { createAITaskRunner } from "../src/ai-task-runner.js";
import { getAITask } from "../src/ai-task-repository.js";
import { getAgent } from "../../agents/registry.js";

const enabled = process.env.RUN_AI_MESSAGE_RECALL_INTEGRATION === "1" || process.env.RUN_AI_TASK_INTEGRATION === "1";
const integration = (name, work) => test(name, {
  skip: !enabled && "Set RUN_AI_MESSAGE_RECALL_INTEGRATION=1 with a migrated disposable PostgreSQL database",
}, work);
const owner = crypto.randomUUID();
const peer = crypto.randomUUID();
const outsider = crypto.randomUUID();
const agentThread = crypto.randomUUID();
const directThread = crypto.randomUUID();
const peerThread = crypto.randomUUID();
const unrelatedThread = crypto.randomUUID();
const token = crypto.randomBytes(32).toString("hex");
const peerToken = crypto.randomBytes(32).toString("hex");
const otherToken = crypto.randomBytes(32).toString("hex");
const realtime = [];
const logger = { error() {} };
let server;
let origin;

before(async () => {
  if (!enabled) return;
  const [db] = await query("SELECT current_database() AS name");
  assert.match(db.name, /_migration_test$/, "Never use a product database for this suite");
  for (const [id, authToken, label] of [[owner, token, "Owner"], [peer, peerToken, "Peer"], [outsider, otherToken, "Outsider"]]) {
    await query(`INSERT INTO users (id,email,password_hash,display_name,ai_id) VALUES (?, ?, 'test-only', ?, ?)`,
      [id, `${id}@example.invalid`, `Recall ${label}`, String(crypto.randomInt(100000000000, 999999999999))]);
    await query("INSERT INTO user_profiles (user_id,nickname,avatar_text) VALUES (?, ?, 'T')", [id, `Recall ${label}`]);
    await query(`INSERT INTO auth_sessions (id,user_id,token_hash,expires_at) VALUES (?, ?, ?, CURRENT_TIMESTAMP + INTERVAL '1 hour')`,
      [crypto.randomUUID(), id, hashToken(authToken)]);
  }
  await query("INSERT INTO chat_threads (id,user_id,title,agent_id,kind) VALUES (?, ?, 'Recall Agent', 'album-manager', 'agent')", [agentThread, owner]);
  for (const [id, userId, peerUserId] of [[directThread, owner, peer], [peerThread, peer, owner], [unrelatedThread, outsider, peer]]) {
    await query("INSERT INTO chat_threads (id,user_id,title,peer_user_id,kind) VALUES (?, ?, 'Recall direct', ?, 'direct')", [id, userId, peerUserId]);
  }
  for (const [follower, followed] of [[owner, peer], [peer, owner]]) {
    await query(`INSERT INTO social_relationships (id,follower_user_id,followed_user_id,relation_type,status)
      VALUES (?, ?, ?, 'friend', 'active')`, [crypto.randomUUID(), follower, followed]);
  }
  await query(`INSERT INTO user_agents (user_id,agent_id,enabled,granted_scopes)
    VALUES (?, 'album-manager', true, ?::jsonb)`, [owner, JSON.stringify((await getAgent("album-manager")).permissions)]);
  await query(`INSERT INTO media_retrieval_profiles (user_id,index_state,consent_version,consent_granted_at)
    VALUES (?, 'enabled', 'media-retrieval-consent-v1', CURRENT_TIMESTAMP)`, [owner]);
  const app = express();
  app.use(express.json());
  const asyncHandler = handler => (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next);
  registerMessageRoutes(app, {
    authenticate, asyncHandler, getOnlineUserIds: () => [],
    sendRealtimeToUser: (userId, event) => realtime.push({ userId, event }),
  });
  app.use(createRequestErrorHandler({ production: true, logger }));
  await new Promise(resolve => { server = app.listen(0, "127.0.0.1", resolve); });
  origin = `http://127.0.0.1:${server.address().port}`;
});

beforeEach(async () => {
  if (!enabled) return;
  await query("DELETE FROM ai_tasks WHERE user_id = ?", [owner]);
  await query("DELETE FROM chat_messages WHERE user_id IN (?, ?, ?)", [owner, peer, outsider]);
  realtime.length = 0;
});

after(async () => {
  if (!enabled) return;
  if (server) await new Promise(resolve => server.close(resolve));
  await query("DELETE FROM users WHERE id IN (?, ?, ?)", [owner, peer, outsider]);
  await closeDatabase();
});

const request = async (path, body = {}, authToken = token) => {
  const response = await fetch(`${origin}${path}`, {
    method: "POST", headers: { Authorization: `Bearer ${authToken}`, "Content-Type": "application/json", "X-Miaoxun-AI-Contract": "1" }, body: JSON.stringify(body),
  });
  return { status: response.status, ...await response.json() };
};
const send = (threadId = agentThread, clientMessageId = crypto.randomUUID()) =>
  request(`/api/threads/${threadId}/messages`, { content: "Test-only message to recall", clientMessageId });
const recall = (messageId, threadId = agentThread, authToken = token) =>
  request(`/api/threads/${threadId}/messages/${messageId}/recall`, {}, authToken);
const stored = async id => (await query("SELECT * FROM chat_messages WHERE id = ?", [id]))[0];
const insertMessage = async ({ userId = owner, threadId = agentThread, senderType = "user", metadata = { source: "app" }, clientMessageId = crypto.randomUUID() } = {}) => {
  const id = crypto.randomUUID();
  await query(`INSERT INTO chat_messages (id,user_id,thread_id,sender_type,sender_name,content,metadata,client_message_id)
    VALUES (?, ?, ?, ?, 'Test-only author', 'Test-only content', ?::jsonb, ?)`,
  [id, userId, threadId, senderType, JSON.stringify(metadata), clientMessageId]);
  return id;
};

integration("HTTP recall of an owner Agent input prevents a queued task from calling the model", async () => {
  const submitted = await send();
  assert.equal(submitted.status, 202);
  const input = submitted.data.messages[0];
  assert.equal(submitted.data.task.goal, input.content);
  assert.equal(input.metadata.source, undefined);
  assert.equal(input.metadata.persistedByApp, undefined);
  assert.equal(input.userId, undefined);
  assert.equal(input.metadata.senderUserId, undefined);
  const recalled = await recall(input.id);
  assert.equal(recalled.status, 200);
  assert.ok(recalled.data.message.recalledAt);
  assert.equal(recalled.data.message.content, "");
  assert.equal(recalled.data.message.metadata.taskId, undefined);
  assert.equal(recalled.data.message.metadata.recalledByUserId, undefined);
  assert.equal((await stored(input.id)).metadata.taskId, submitted.data.task.id);
  let calls = 0;
  const execute = createMessageTaskExecutor({ runAgentRuntime: async () => { calls++; throw new Error("Recalled input must not reach model"); } });
  await createAITaskRunner({ executors: { agent_message: execute }, logger }).runOnce();
  assert.equal(calls, 0);
  const task = await getAITask({ userId: owner, taskId: submitted.data.task.id });
  assert.equal(task.status, "failed");
  assert.equal(task.goal, "");
  assert.equal(task.error.code, "AI_INPUT_UNAVAILABLE");
  assert.equal((await query("SELECT id FROM chat_messages WHERE thread_id = ?", [agentThread])).length, 1);
  await query("UPDATE chat_messages SET created_at = CURRENT_TIMESTAMP - INTERVAL '2 minutes' WHERE id = ?", [input.id]);
  assert.equal((await recall(input.id)).data.message.recalledAt, recalled.data.message.recalledAt);
});

integration("HTTP recall while a task is running rejects the late output commit", async () => {
  const submitted = await send();
  const execute = createMessageTaskExecutor({ runAgentRuntime: async options => {
    await options.beforeModelCall();
    assert.equal((await recall(submitted.data.messages[0].id)).status, 200);
    return { reply: "Must not be delivered", provider: "test-only", latencyMs: 1, tokenUsage: { prompt: 1, completion: 1, total: 2 } };
  } });
  await createAITaskRunner({ executors: { agent_message: execute }, logger }).runOnce();
  const task = await getAITask({ userId: owner, taskId: submitted.data.task.id });
  assert.equal(task.status, "failed");
  assert.equal(task.goal, "");
  assert.equal(task.error.code, "AI_INPUT_UNAVAILABLE");
  assert.equal((await query("SELECT id FROM chat_messages WHERE thread_id = ? AND sender_type = 'agent'", [agentThread])).length, 0);
});

integration("recall requires the original author and the exact owned conversation", async () => {
  const input = await insertMessage();
  assert.equal((await recall(input, agentThread, otherToken)).status, 404);
  assert.equal((await recall(input, unrelatedThread, otherToken)).status, 404);
  assert.equal((await recall(input, directThread)).status, 404);
  assert.equal((await stored(input)).recalled_at, null);
  for (const options of [
    { senderType: "agent" },
    { senderType: "system" },
    { metadata: { source: "direct", senderUserId: peer } },
    { metadata: { source: "direct" } },
    { metadata: { source: "app", senderUserId: peer } },
  ]) {
    const id = await insertMessage(options);
    assert.equal((await recall(id)).status, 403);
    assert.equal((await stored(id)).recalled_at, null);
  }
});

integration("direct recall updates only the validated peer mirror and emits one peer event", async () => {
  const clientMessageId = crypto.randomUUID();
  const sent = await send(directThread, clientMessageId);
  assert.equal(sent.status, 201);
  const original = sent.data.messages[0];
  assert.equal(original.userId, undefined);
  assert.equal(original.metadata.source, undefined);
  assert.equal(original.metadata.requestFingerprint, undefined);
  assert.equal(realtime[0].event.message.metadata.senderUserId, owner);
  assert.equal(realtime[0].event.message.userId, undefined);
  assert.equal(realtime[0].event.message.metadata.source, undefined);
  assert.equal(realtime[0].event.message.metadata.requestFingerprint, undefined);
  const [mirror] = await query("SELECT * FROM chat_messages WHERE thread_id = ? AND client_message_id = ?", [peerThread, clientMessageId]);
  assert.equal((await recall(mirror.id, peerThread, peerToken)).status, 403);
  const unrelated = await insertMessage({ userId: outsider, threadId: unrelatedThread, clientMessageId, metadata: { source: "direct", senderUserId: owner } });
  await query("UPDATE chat_messages SET created_at = CURRENT_TIMESTAMP - INTERVAL '2 minutes' WHERE id = ?", [mirror.id]);
  realtime.length = 0;
  const [first, second] = await Promise.all([recall(original.id, directThread), recall(original.id, directThread)]);
  assert.deepEqual([first.status, second.status], [200, 200]);
  assert.equal(first.data.message.recalledAt, second.data.message.recalledAt);
  const savedMirror = await stored(mirror.id);
  assert.equal(savedMirror.content, "");
  assert.equal(savedMirror.recalled_at.toISOString(), first.data.message.recalledAt);
  assert.equal((await stored(unrelated)).recalled_at, null);
  assert.equal(realtime.length, 1);
  assert.equal(realtime[0].userId, peer);
  assert.equal(realtime[0].event.type, "thread.message.updated");
  assert.equal(realtime[0].event.message.id, mirror.id);
  assert.equal(realtime[0].event.message.metadata.senderUserId, owner);
  assert.equal(realtime[0].event.message.userId, undefined);
  assert.equal(realtime[0].event.message.metadata.source, undefined);
  assert.equal(realtime[0].event.message.metadata.recalledByUserId, undefined);
});

integration("a reused peer client ID with a different original author is never recalled", async () => {
  const clientMessageId = crypto.randomUUID();
  const input = await insertMessage({ threadId: directThread, clientMessageId, metadata: { source: "app", senderUserId: owner } });
  const notMirror = await insertMessage({ userId: peer, threadId: peerThread, clientMessageId, metadata: { source: "direct", senderUserId: outsider } });
  assert.equal((await recall(input, directThread)).status, 200);
  assert.equal((await stored(notMirror)).recalled_at, null);
  assert.equal(realtime.length, 0);
});

integration("recall enforces the one-minute limit and refuses deleted or untracked inputs", async () => {
  const expired = await insertMessage();
  await query("UPDATE chat_messages SET created_at = CURRENT_TIMESTAMP - INTERVAL '61 seconds' WHERE id = ?", [expired]);
  assert.equal((await recall(expired)).status, 409);
  assert.equal((await stored(expired)).recalled_at, null);
  const recent = await insertMessage();
  await query("UPDATE chat_messages SET created_at = CURRENT_TIMESTAMP - INTERVAL '55 seconds' WHERE id = ?", [recent]);
  assert.equal((await recall(recent)).status, 200);
  const deleted = await insertMessage();
  await query("UPDATE chat_messages SET deleted_at = CURRENT_TIMESTAMP WHERE id = ?", [deleted]);
  assert.equal((await recall(deleted)).status, 404);
  const untracked = await insertMessage({ clientMessageId: null });
  assert.equal((await recall(untracked)).status, 409);
});
