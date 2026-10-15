import assert from "node:assert/strict";
import crypto from "node:crypto";
import test, { before, after } from "node:test";
import { query, closeDatabase } from "../src/db.js";
import { listAgentHistoryBeforeInput } from "../src/message-repository.js";
import { agentChatHistory } from "../../agents/chat-history.js";

const enabled = process.env.RUN_MESSAGE_HISTORY_INTEGRATION === "1";
const integration = (name, work) => test(name, {
  skip: !enabled && "Set RUN_MESSAGE_HISTORY_INTEGRATION=1 with a migrated disposable PostgreSQL database",
}, work);
const owner = crypto.randomUUID();
const otherOwner = crypto.randomUUID();
const threadId = crypto.randomUUID();
const otherThreadId = crypto.randomUUID();

before(async () => {
  if (!enabled) return;
  const connection = new URL(process.env.DATABASE_URL);
  assert.ok(["127.0.0.1", "localhost", "[::1]"].includes(connection.hostname), "Use a loopback test database only");
  const [database] = await query("SELECT current_database() AS name");
  assert.match(database.name, /_migration_test$/, "Never use a product database for this suite");
  for (const id of [owner, otherOwner]) {
    await query("INSERT INTO users (id, email, password_hash, display_name, ai_id) VALUES (?, ?, 'test-only', ?, ?)",
      [id, `${id}@example.invalid`, `History ${id.slice(0, 8)}`, String(crypto.randomInt(100000000000, 999999999999))]);
  }
  await query("INSERT INTO chat_threads (id, user_id, title, agent_id, kind) VALUES (?, ?, 'History test', 'album-manager', 'agent'), (?, ?, 'Other history test', 'album-manager', 'agent')",
    [threadId, owner, otherThreadId, otherOwner]);
});

after(async () => {
  if (!enabled) return;
  await query("DELETE FROM users WHERE id IN (?, ?)", [owner, otherOwner]);
  await closeDatabase();
});

const insert = (id, senderType, content, timestamp, state = null) => query(
  `INSERT INTO chat_messages (id, user_id, thread_id, sender_type, sender_name, content, created_at, recalled_at, deleted_at)
   VALUES (?, ?, ?, ?, 'History test', ?, ?::timestamptz, ?::timestamptz, ?::timestamptz)`,
  [id, owner, threadId, senderType, content, timestamp,
    state === "recalled" ? timestamp : null, state === "deleted" ? timestamp : null],
);

integration("Agent history uses the exact input row boundary across microseconds and equal timestamps", async () => {
  const ids = {
    priorRepeated: "ffffffff-ffff-4fff-8fff-fffffffffff1",
    priorAnswer: "ffffffff-ffff-4fff-8fff-fffffffffff2",
    sameTimePrior: "00000000-0000-4000-8000-000000000001",
    input: "88888888-8888-4888-8888-888888888888",
    sameTimeFuture: "ffffffff-ffff-4fff-8fff-fffffffffff3",
    nextMicrosecond: "00000000-0000-4000-8000-000000000002",
  };
  await insert(ids.priorRepeated, "user", "重复的需求", "2026-10-14T01:00:00.123001Z");
  await insert(ids.priorAnswer, "agent", "之前的回答", "2026-10-14T01:00:00.123800Z");
  await insert(ids.sameTimePrior, "user", "重复的需求", "2026-10-14T01:00:00.123900Z");
  await insert(ids.input, "user", "重复的需求", "2026-10-14T01:00:00.123900Z");
  await insert(ids.sameTimeFuture, "agent", "同时间后续消息", "2026-10-14T01:00:00.123900Z");
  await insert(ids.nextMicrosecond, "user", "后一微秒消息", "2026-10-14T01:00:00.123901Z");
  await insert(crypto.randomUUID(), "user", "撤回的消息", "2026-10-14T01:00:00.123850Z", "recalled");
  await insert(crypto.randomUUID(), "agent", "删除的消息", "2026-10-14T01:00:00.123851Z", "deleted");

  const [input] = await query("SELECT created_at FROM chat_messages WHERE id = ?", [ids.input]);
  assert.equal(input.created_at.toISOString(), "2026-10-14T01:00:00.123Z", "The PG driver loses timestamp microseconds in JS Date");
  const history = await listAgentHistoryBeforeInput(owner, threadId, ids.input);
  assert.deepEqual(history.map(message => message.id), [ids.priorRepeated, ids.priorAnswer, ids.sameTimePrior]);
  assert.deepEqual(agentChatHistory(history), [
    { role: "user", content: "重复的需求" },
    { role: "assistant", content: "之前的回答" },
    { role: "user", content: "重复的需求" },
  ]);
  assert.deepEqual((await listAgentHistoryBeforeInput(owner, threadId, ids.input, 2)).map(message => message.id), [ids.priorAnswer, ids.sameTimePrior]);
  assert.deepEqual(await listAgentHistoryBeforeInput(otherOwner, threadId, ids.input), []);
  assert.deepEqual(await listAgentHistoryBeforeInput(owner, otherThreadId, ids.input), []);
  assert.deepEqual(await listAgentHistoryBeforeInput(owner, threadId, crypto.randomUUID()), []);
});
