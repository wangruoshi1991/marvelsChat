import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test, { after, before } from "node:test";
import { fileURLToPath } from "node:url";
import pg from "pg";

const backendDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const integrationEnabled = process.env.RUN_MESSAGE_IDEMPOTENCY_INTEGRATION === "1";
const databaseUrl = String(process.env.DATABASE_URL || "");
const ownerId = "10000000-0000-4000-8000-000000000001";
const peerId = "10000000-0000-4000-8000-000000000002";
const ownerThreadId = "20000000-0000-4000-8000-000000000001";
const agentThreadId = "20000000-0000-4000-8000-000000000002";
const clientMessageId = "30000000-0000-4000-8000-000000000001";

test("message migration enforces one client ID per thread and supports social paging", async () => {
  const sql = await readFile(path.join(backendDir, "database", "032_message_idempotency_social_paging.sql"), "utf8");
  assert.match(sql, /UNIQUE INDEX[^;]+ON chat_messages\s*\(thread_id, client_message_id\)/is);
  assert.match(sql, /UNIQUE INDEX[^;]+ON chat_messages\s*\(user_id, client_message_id\)/is);
  assert.match(sql, /UNIQUE INDEX[^;]+ON agent_runs\s*\(input_message_id\)/is);
  assert.match(sql, /social_relationships\s*\(follower_user_id, relation_type, status, created_at DESC, id DESC\)/i);
  assert.match(sql, /social_relationships\s*\(followed_user_id, relation_type, status, created_at DESC, id DESC\)/i);
});

if (integrationEnabled) {
  let client;
  let repository;
  let closeDatabase;

  before(async () => {
    assert.ok(databaseUrl, "DATABASE_URL must point to a disposable test database");
    client = new pg.Client({ connectionString: databaseUrl });
    await client.connect();
    const { rows } = await client.query("SELECT current_database() AS name");
    assert.match(rows[0].name, /_migration_test$/);
    repository = await import("../src/message-repository.js");
    ({ closeDatabase } = await import("../src/db.js"));

    await client.query(
      `INSERT INTO users (id, email, password_hash, display_name, ai_id)
       VALUES ($1, 'message-test-owner@example.invalid', 'test', 'Owner', '900000000001'),
              ($2, 'message-test-peer@example.invalid', 'test', 'Peer', '900000000002')`,
      [ownerId, peerId],
    );
    await client.query(
      `INSERT INTO user_profiles (user_id, nickname, avatar_text)
       VALUES ($1, 'Owner', 'O'), ($2, 'Peer', 'P')`,
      [ownerId, peerId],
    );
    await client.query(
      `INSERT INTO social_relationships
         (id, follower_user_id, followed_user_id, relation_type, status)
       VALUES
         ('40000000-0000-4000-8000-000000000001', $1, $2, 'friend', 'active'),
         ('40000000-0000-4000-8000-000000000002', $2, $1, 'friend', 'active')`,
      [ownerId, peerId],
    );
    await client.query(
      `INSERT INTO chat_threads
         (id, user_id, title, peer_user_id, kind)
       VALUES ($1, $2, 'Peer', $3, 'direct')`,
      [ownerThreadId, ownerId, peerId],
    );
    await client.query(
      `INSERT INTO chat_threads
         (id, user_id, title, agent_id, kind)
       VALUES ($1, $2, 'Butler', 'miaoxun-butler', 'agent')`,
      [agentThreadId, ownerId],
    );
  });

  after(async () => {
    if (client) {
      await client.query("DELETE FROM users WHERE id IN ($1, $2)", [ownerId, peerId]);
      await client.end();
    }
    await closeDatabase?.();
  });

  test("concurrent retries write one owner message and repair the direct mirror once", async () => {
    const input = {
      userId: ownerId,
      threadId: ownerThreadId,
      senderType: "user",
      senderName: "Owner",
      content: "Hello",
      metadata: { source: "app", requestFingerprint: "same-request" },
      clientMessageId,
    };
    const [first, second] = await Promise.all([
      repository.addMessageToThreadOnce(input),
      repository.addMessageToThreadOnce(input),
    ]);
    assert.deepEqual([first.created, second.created].sort(), [false, true]);
    assert.equal(first.message.id, second.message.id);

    const ownerRows = await client.query(
      "SELECT COUNT(*)::int AS count FROM chat_messages WHERE thread_id = $1 AND client_message_id = $2",
      [ownerThreadId, clientMessageId],
    );
    assert.equal(ownerRows.rows[0].count, 1);

    const thread = { id: ownerThreadId, peerUserId: peerId };
    const mirrorInput = {
      thread,
      senderUser: { id: ownerId, displayName: "Owner" },
      content: "Hello",
      metadata: { requestFingerprint: "same-request" },
      clientMessageId,
    };
    const [peerFirst, peerSecond] = await Promise.all([
      repository.mirrorDirectMessageToPeer(mirrorInput),
      repository.mirrorDirectMessageToPeer(mirrorInput),
    ]);
    assert.deepEqual([peerFirst.created, peerSecond.created].sort(), [false, true]);
    assert.equal(peerFirst.message.id, peerSecond.message.id);
    const peerRows = await client.query(
      `SELECT COUNT(*)::int AS count
       FROM chat_messages m JOIN chat_threads t ON t.id = m.thread_id
       WHERE t.user_id = $1 AND m.client_message_id = $2`,
      [peerId, clientMessageId],
    );
    assert.equal(peerRows.rows[0].count, 1);
    const unread = await client.query(
      "SELECT unread_count FROM chat_threads WHERE id = $1",
      [peerFirst.message.threadId],
    );
    assert.equal(unread.rows[0].unread_count, 1);
  });

  test("concurrent Agent completions create one output and one run", async () => {
    const input = await repository.addMessageToThreadOnce({
      userId: ownerId,
      threadId: agentThreadId,
      senderType: "user",
      senderName: "Owner",
      content: "Tell me something",
      metadata: { source: "app", requestFingerprint: "agent-request" },
      clientMessageId: "30000000-0000-4000-8000-000000000002",
    });
    const completion = {
      userId: ownerId,
      threadId: agentThreadId,
      inputMessageId: input.message.id,
      agentId: "miaoxun-butler",
      senderName: "Butler",
      content: "One answer",
      metadata: { provider: "test" },
      status: "success",
      provider: "test",
      latencyMs: 12,
      tokenUsage: { prompt: 3, completion: 2, total: 5 },
    };
    const [first, second] = await Promise.all([
      repository.completeAgentMessageOnce(completion),
      repository.completeAgentMessageOnce(completion),
    ]);
    assert.deepEqual([first.created, second.created].sort(), [false, true]);
    assert.equal(first.outputMessage.id, second.outputMessage.id);
    assert.equal(first.agentRun.id, second.agentRun.id);
    assert.equal(first.agentRun.lifecycleStatus, "succeeded");

    const rows = await client.query(
      "SELECT COUNT(*)::int AS count FROM agent_runs WHERE input_message_id = $1",
      [input.message.id],
    );
    assert.equal(rows.rows[0].count, 1);
    const messages = await client.query(
      "SELECT COUNT(*)::int AS count FROM chat_messages WHERE id = $1",
      [first.outputMessage.id],
    );
    assert.equal(messages.rows[0].count, 1);
  });

  test("a recovered Agent failure replays one terminal failed result", async () => {
    const input = await repository.addMessageToThreadOnce({
      userId: ownerId,
      threadId: agentThreadId,
      senderType: "user",
      senderName: "Owner",
      content: "Retry safely",
      metadata: { source: "app", requestFingerprint: "failed-agent-request" },
      clientMessageId: "30000000-0000-4000-8000-000000000003",
    });
    const completion = {
      userId: ownerId,
      threadId: agentThreadId,
      inputMessageId: input.message.id,
      agentId: "miaoxun-butler",
      senderName: "Butler",
      content: "Service unavailable",
      metadata: { provider: "runtime-error", errorCode: "AGENT_RUNTIME_FAILED" },
      status: "error",
      provider: "runtime-error",
      latencyMs: 120000,
      errorMessage: "AGENT_RUNTIME_FAILED",
    };
    const first = await repository.completeAgentMessageOnce(completion);
    const replay = await repository.completeAgentMessageOnce(completion);
    assert.equal(first.created, true);
    assert.equal(replay.created, false);
    assert.equal(replay.outputMessage.id, first.outputMessage.id);
    assert.equal(replay.agentRun.id, first.agentRun.id);
    assert.equal(replay.agentRun.lifecycleStatus, "failed");
    assert.equal(replay.agentRun.errorMessage, "AGENT_RUNTIME_FAILED");
  });
}
