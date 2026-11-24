import assert from "node:assert/strict";
import { randomInt, randomUUID } from "node:crypto";
import test from "node:test";
import express from "express";
import { authenticate, createPlainToken, hashToken } from "../src/auth.js";
import { closeDatabase, query } from "../src/db.js";
import { acknowledgeDirectMessageDelivery, listDirectMessageReceipts } from "../src/chat-message-receipts.js";
import { recallMessageForUser } from "../src/message-repository.js";
import { registerChatMessageReceiptRoutes } from "../src/routes/chat-message-receipt-routes.js";
import { createRequestErrorHandler } from "../src/request-observability.js";

const enabled = process.env.RUN_CHAT_MESSAGE_RECEIPTS_POSTGRES === "1";
test("direct delivery receipts require a real recipient ACK in PostgreSQL", {
  skip: !enabled && "RUN_CHAT_MESSAGE_RECEIPTS_POSTGRES=1 requires a loopback *_migration_test database",
  timeout: 30000,
}, async t => {
  const database = new URL(process.env.DATABASE_URL);
  assert.ok(["localhost", "127.0.0.1"].includes(database.hostname));
  assert.match(database.pathname, /_migration_test$/);
  const users = [];
  let server;
  t.after(async () => {
    if (server) await new Promise(resolve => server.close(resolve));
    try { await query("DELETE FROM users WHERE id = ANY(?::bpchar[])", [users.map(user => user.id)]); }
    finally { await closeDatabase(); }
  });
  async function user() {
    const result = { id: randomUUID(), token: createPlainToken() };
    users.push(result);
    await query("INSERT INTO users (id,email,password_hash,display_name,ai_id) VALUES (?,?,'test',?,?)",
      [result.id, `${result.id}@receipts.example.invalid`, `Receipt ${result.id}`, String(randomInt(100000000000, 999999999999))]);
    await query("INSERT INTO auth_sessions(id,user_id,token_hash,expires_at) VALUES (?,?,?,CURRENT_TIMESTAMP + INTERVAL '1 hour')",
      [randomUUID(), result.id, hashToken(result.token)]);
    return result;
  }
  const [sender, recipient, outsider] = await Promise.all([user(), user(), user()]);
  async function conversation(owner, peer, kind = "direct", agent = null) {
    const id = randomUUID();
    await query("INSERT INTO chat_threads(id,user_id,title,kind,peer_user_id,agent_id) VALUES (?,?,'Receipts QA',?,?,?)",
      [id, owner.id, kind, peer?.id || null, agent]);
    return { id, userId: owner.id, peerId: peer?.id };
  }
  const [sentThread, receivedThread, strangerThread, groupThread, agentThread] = await Promise.all([
    conversation(sender, recipient), conversation(recipient, sender), conversation(outsider, sender),
    conversation(sender, null, "group"), conversation(sender, null, "agent", "receipts-qa"),
  ]);
  for (const [left, right] of [[sender, recipient], [recipient, sender]]) {
    await query("INSERT INTO social_relationships(id,follower_user_id,followed_user_id,relation_type) VALUES (?,?,?,'friend')",
      [randomUUID(), left.id, right.id]);
  }
  async function message(thread, source, author, clientId, extra = {}) {
    const id = randomUUID();
    await query(`INSERT INTO chat_messages(id,thread_id,user_id,sender_type,sender_name,content,metadata,client_message_id,deleted_at,recalled_at)
      VALUES (?,?,?,'user','Receipts QA','Receipt fixture',?::jsonb,?,?,?)`,
    [id, thread.id, thread.userId, JSON.stringify({ source, senderUserId: author.id }), clientId,
      extra.deleted || null, extra.recalled || null]);
    return id;
  }
  async function pair(extra = {}) {
    const client = randomUUID();
    return { client,
      sent: await message(sentThread, "app", sender, client, extra),
      received: await message(receivedThread, "direct", sender, client, extra),
    };
  }
  const ack = ids => acknowledgeDirectMessageDelivery({ userId: recipient.id, threadId: receivedThread.id, messageIds: ids });
  const status = ids => listDirectMessageReceipts({ userId: sender.id, threadId: sentThread.id, messageIds: ids });

  const app = express();
  app.use(express.json());
  registerChatMessageReceiptRoutes(app, { authenticate,
    asyncHandler: handler => (req, res, next) => Promise.resolve(handler(req, res)).catch(next),
  });
  app.use(createRequestErrorHandler({ logger: { error() {} } }));
  await new Promise(resolve => { server = app.listen(0, "127.0.0.1", resolve); });
  const request = (owner, thread, suffix, body) => fetch(
    `http://127.0.0.1:${server.address().port}/api/threads/${thread.id}/message-receipts/${suffix}`,
    { method: "POST", headers: { "Content-Type": "application/json", ...(owner ? { Authorization: `Bearer ${owner.token}` } : {}) }, body: JSON.stringify(body) },
  );

  await t.test("server fan-out and read counters never manufacture delivered status", async () => {
    const p = await pair();
    assert.deepEqual(await status([p.sent]), { receipts: [{ messageId: p.sent, status: "accepted" }] });
    await query("UPDATE chat_threads SET unread_count=0, unread_delivered=10 WHERE id=?", [receivedThread.id]);
    assert.equal((await status([p.sent])).receipts[0].status, "accepted");
    assert.deepEqual(await ack([p.received]), { acknowledgedMessageIds: [p.received] });
    assert.deepEqual(await status([p.sent]), { receipts: [{ messageId: p.sent, status: "delivered" }] });
    const response = await request(sender, sentThread, "status", { messageIds: [p.sent] });
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("cache-control"), "private, no-store");
    assert.deepEqual(await response.json(), { data: { receipts: [{ messageId: p.sent, status: "delivered" }] } });
  });
  await t.test("concurrent duplicate ACKs preserve the first server timestamp", async () => {
    const p = await pair();
    await Promise.all(Array.from({ length: 8 }, () => ack([p.received])));
    const [first] = await query("SELECT recipient_received_at FROM chat_messages WHERE id=?", [p.received]);
    await ack([p.received]);
    const [next] = await query("SELECT recipient_received_at FROM chat_messages WHERE id=?", [p.received]);
    assert.ok(first.recipient_received_at);
    assert.deepEqual(next, first);
  });
  await t.test("sender, other user, outgoing ID and crossed conversation cannot ACK", async () => {
    const p = await pair();
    assert.deepEqual(await ack([p.sent]), { acknowledgedMessageIds: [] });
    assert.deepEqual(await acknowledgeDirectMessageDelivery({ userId: sender.id, threadId: sentThread.id, messageIds: [p.received] }), { acknowledgedMessageIds: [] });
    await assert.rejects(acknowledgeDirectMessageDelivery({ userId: outsider.id, threadId: receivedThread.id, messageIds: [p.received] }), { status: 404 });
    const collision = await message(strangerThread, "direct", sender, p.client);
    await assert.rejects(acknowledgeDirectMessageDelivery({ userId: outsider.id, threadId: strangerThread.id, messageIds: [collision] }), { status: 404 });
    assert.equal((await status([p.sent])).receipts[0].status, "accepted");
    assert.deepEqual(await listDirectMessageReceipts({ userId: recipient.id, threadId: receivedThread.id, messageIds: [p.received, p.sent] }), { receipts: [] });
  });
  await t.test("deleted, recalled and unpaired received copies never advance delivery", async () => {
    const p = await pair();
    const deleted = await pair({ deleted: new Date() });
    const recalled = await pair({ recalled: new Date() });
    const unpaired = await message(receivedThread, "direct", sender, randomUUID());
    const result = await ack([p.received, deleted.received, recalled.received, unpaired]);
    assert.deepEqual(result, { acknowledgedMessageIds: [p.received] });
    assert.deepEqual((await status([deleted.sent, recalled.sent])).receipts, []);
    await query("UPDATE chat_messages SET deleted_at=CURRENT_TIMESTAMP WHERE id=?", [p.received]);
    assert.equal((await status([p.sent])).receipts[0].status, "delivered");
  });
  await t.test("recall serializes with ACK and removes sender-visible receipt", async () => {
    const p = await pair();
    await Promise.all([ack([p.received]), recallMessageForUser({ userId: sender.id, threadId: sentThread.id, messageId: p.sent })]);
    assert.deepEqual(await status([p.sent]), { receipts: [] });
    assert.deepEqual(await ack([p.received]), { acknowledgedMessageIds: [] });
  });
  await t.test("group, Agent, revoked friendship and inactive peer are denied", async () => {
    const p = await pair();
    for (const unsupported of [groupThread, agentThread]) {
      await assert.rejects(listDirectMessageReceipts({ userId: sender.id, threadId: unsupported.id, messageIds: [p.sent] }), { status: 404 });
    }
    await query("UPDATE social_relationships SET status='blocked' WHERE follower_user_id=? AND followed_user_id=? AND relation_type='friend'", [sender.id, recipient.id]);
    await assert.rejects(status([p.sent]), { status: 404 });
    await assert.rejects(ack([p.received]), { status: 404 });
    await query("UPDATE social_relationships SET status='active' WHERE follower_user_id=? AND followed_user_id=? AND relation_type='friend'", [sender.id, recipient.id]);
    await query("UPDATE users SET status='disabled' WHERE id=?", [recipient.id]);
    await assert.rejects(status([p.sent]), { status: 404 });
    await query("UPDATE users SET status='active' WHERE id=?", [recipient.id]);
  });
  await t.test("HTTP authentication, strict body and bounded batches are enforced", async () => {
    const p = await pair();
    assert.equal((await request(null, receivedThread, "delivered", { messageIds: [p.received] })).status, 401);
    assert.equal((await request(outsider, receivedThread, "delivered", { messageIds: [p.received] })).status, 404);
    for (const body of [ { messageIds: [] }, { messageIds: ["invalid"] },
      { messageIds: Array.from({ length: 51 }, () => randomUUID()) }, { messageIds: [p.received], read: true } ]) {
      assert.equal((await request(recipient, receivedThread, "delivered", body)).status, 400);
    }
    const response = await request(recipient, receivedThread, "delivered", { messageIds: [p.received, p.received] });
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { data: { acknowledgedMessageIds: [p.received] } });
  });
  await t.test("database prevents timestamps on sender copies or null metadata source", async () => {
    const p = await pair();
    await assert.rejects(query("UPDATE chat_messages SET recipient_received_at=CURRENT_TIMESTAMP WHERE id=?", [p.sent]), { code: "23514" });
    await query("UPDATE chat_messages SET metadata='{}'::jsonb WHERE id=?", [p.received]);
    await assert.rejects(query("UPDATE chat_messages SET recipient_received_at=CURRENT_TIMESTAMP WHERE id=?", [p.received]), { code: "23514" });
  });
  await t.test("losing recipient ownership clears the ACK before owner FK checks", async () => {
    const p = await pair();
    await ack([p.received]);
    await query("UPDATE chat_messages SET user_id=NULL WHERE id=?", [p.received]);
    const [row] = await query("SELECT user_id, recipient_received_at FROM chat_messages WHERE id=?", [p.received]);
    assert.deepEqual(row, { user_id: null, recipient_received_at: null });
    assert.equal((await status([p.sent])).receipts[0].status, "accepted");
  });
});
