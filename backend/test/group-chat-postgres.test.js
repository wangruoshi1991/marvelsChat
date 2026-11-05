import assert from "node:assert/strict";
import crypto from "node:crypto";
import test, { before, beforeEach, after } from "node:test";
import express from "express";
import { query, closeDatabase } from "../src/db.js";
import { authenticate, hashToken } from "../src/auth.js";
import { registerGroupChatRoutes } from "../src/routes/group-chat-routes.js";
import { registerMessageRoutes } from "../src/routes/message-routes.js";
import { registerChatAttachmentRoutes } from "../src/routes/chat-attachment-routes.js";
import { createRequestErrorHandler } from "../src/request-observability.js";

const enabled = process.env.RUN_GROUP_CHAT_POSTGRES === "1";
const integration = (name, work) => test(name, { skip: !enabled && "RUN_GROUP_CHAT_POSTGRES=1 requires a migrated loopback *_migration_test PostgreSQL database" }, work);
const people = Array.from({ length: 4 }, () => ({ id: crypto.randomUUID(), token: crypto.randomBytes(32).toString("hex") }));
const [owner, first, second, outsider] = people;
let server, origin;
let realtime = [];
const logger = { error() {} };

async function request(path, { body, person = owner, method = body === undefined ? "GET" : "POST", headers = {} } = {}) {
  const response = await fetch(`${origin}${path}`, { method,
    headers: { ...(person ? { Authorization: `Bearer ${person.token}` } : {}), "Content-Type": "application/json",
      "X-Miaoxun-AI-Contract": "1", "X-Miaoxun-Agent-Workspace": "6", ...headers },
    ...(body === undefined ? {} : { body: typeof body === "string" || Buffer.isBuffer(body) ? body : JSON.stringify(body) }) });
  const type = response.headers.get("content-type") || "";
  return { status: response.status, ...(type.includes("application/json") ? await response.json() : { content: Buffer.from(await response.arrayBuffer()) }) };
}
const createBody = overrides => ({ title: "隔离验证群聊", memberUserIds: [first.id, second.id], idempotencyKey: crypto.randomUUID(), ...overrides });
async function create(overrides = {}) {
  const response = await request("/api/chat-groups", { body: createBody(overrides) });
  assert.equal(response.status, 201, JSON.stringify(response));
  assert.equal(response.data.thread.kind, "group");
  assert.ok(response.data.thread.groupId);
  const rows = await query("SELECT id,user_id FROM chat_threads WHERE group_id=?", [response.data.thread.groupId]);
  return { thread: response.data.thread, groupId: response.data.thread.groupId, threads: new Map(rows.map(row => [row.user_id, row.id])) };
}
const send = (group, person, body) => request(`/api/threads/${group.threads.get(person.id)}/messages`, { person, body: { content: "隔离测试群消息", clientMessageId: crypto.randomUUID(), ...body } });

before(async () => {
  if (!enabled) return;
  const database = new URL(process.env.DATABASE_URL);
  assert.ok(["127.0.0.1", "localhost", "[::1]"].includes(database.hostname));
  assert.match(database.pathname, /_migration_test$/);
  assert.match((await query("SELECT current_database() AS name"))[0].name, /_migration_test$/);
  for (const [index, person] of people.entries()) {
    await query("INSERT INTO users(id,email,password_hash,display_name,ai_id) VALUES (?,?,'test-only',?,?)",
      [person.id, `${person.id}@example.invalid`, `Group fixture ${index}`, String(crypto.randomInt(100000000000, 999999999999))]);
    await query("INSERT INTO user_profiles(user_id,nickname,avatar_text) VALUES (?,?,'群')", [person.id, `Group fixture ${index}`]);
    await query("INSERT INTO auth_sessions(id,user_id,token_hash,expires_at) VALUES (?,?,?,CURRENT_TIMESTAMP + INTERVAL '1 hour')", [crypto.randomUUID(), person.id, hashToken(person.token)]);
  }
  for (const peer of [first, second]) for (const [from, to] of [[owner.id, peer.id], [peer.id, owner.id]]) {
    await query("INSERT INTO social_relationships(id,follower_user_id,followed_user_id,relation_type,status) VALUES (?,?,?,'friend','active')", [crypto.randomUUID(), from, to]);
  }
  const app = express();
  app.use(express.json());
  const asyncHandler = handler => (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next);
  const sendRealtimeToUser = (userId, event) => realtime.push({ userId, event });
  registerGroupChatRoutes(app, { authenticate, asyncHandler, sendRealtimeToUser });
  registerChatAttachmentRoutes(app, { authenticate, asyncHandler });
  registerMessageRoutes(app, { authenticate, asyncHandler, sendRealtimeToUser, getOnlineUserIds: () => [],
    logger, runAgentRuntime: async () => { throw new Error("Group chat must never invoke a model"); } });
  app.use(createRequestErrorHandler({ production: true, logger }));
  await new Promise(resolve => { server = app.listen(0, "127.0.0.1", resolve); });
  origin = `http://127.0.0.1:${server.address().port}`;
});
beforeEach(async () => {
  if (!enabled) return;
  await query("DELETE FROM chat_groups WHERE creator_user_id=?", [owner.id]);
  await query("UPDATE social_relationships SET status='active' WHERE follower_user_id=? OR followed_user_id=?", [owner.id, owner.id]);
  await query("UPDATE users SET status='active' WHERE id=ANY(?::text[])", [people.map(person => person.id)]);
  realtime = [];
});
after(async () => {
  if (!enabled) return;
  await new Promise(resolve => server?.close(resolve));
  await query("DELETE FROM chat_groups WHERE creator_user_id=?", [owner.id]);
  await query("DELETE FROM users WHERE id=ANY(?::text[])", [people.map(person => person.id)]);
  await closeDatabase();
});

integration("group creation persists three distinct owner conversations and notifies every member", async () => {
  const group = await create();
  assert.equal(group.threads.size, 3);
  assert.equal(new Set(group.threads.values()).size, 3);
  const members = await request(`/api/chat-groups/${group.groupId}/members`);
  assert.equal(members.status, 200);
  assert.deepEqual(members.data.map(person => person.id).sort(), [owner.id, first.id, second.id].sort());
  assert.deepEqual(realtime.map(event => event.userId).sort(), [owner.id, first.id, second.id].sort());
  assert.ok(realtime.every(item => item.event.type === "threads.changed"));
  assert.equal((await request(`/api/chat-groups/${group.groupId}/members`, { person: outsider })).status, 404);
  assert.equal((await request("/api/chat-groups", { person: null, body: createBody() })).status, 401);
});

integration("group creation rejects nonfriends, one-sided friendship, disabled peers and duplicate/self selections atomically", async () => {
  assert.equal((await request("/api/chat-groups", { body: createBody({ memberUserIds: [first.id, outsider.id] }) })).status, 403);
  for (const memberUserIds of [[first.id, first.id], [owner.id, first.id], [first.id]])
    assert.equal((await request("/api/chat-groups", { body: createBody({ memberUserIds }) })).status, 400);
  await query("UPDATE social_relationships SET status='blocked' WHERE follower_user_id=? AND followed_user_id=?", [second.id, owner.id]);
  assert.equal((await request("/api/chat-groups", { body: createBody() })).status, 403);
  await query("UPDATE social_relationships SET status='active' WHERE follower_user_id=? AND followed_user_id=?", [second.id, owner.id]);
  await query("UPDATE users SET status='disabled' WHERE id=?", [second.id]);
  assert.equal((await request("/api/chat-groups", { body: createBody() })).status, 403);
  assert.equal((await query("SELECT count(*)::int AS total FROM chat_groups WHERE creator_user_id=?", [owner.id]))[0].total, 0);
});

integration("concurrent creation reuses the same group and rejects an altered request for the key", async () => {
  const body = createBody();
  const responses = await Promise.all([request("/api/chat-groups", { body }), request("/api/chat-groups", { body: { ...body, memberUserIds: [...body.memberUserIds].reverse() } })]);
  assert.deepEqual(responses.map(result => result.status).sort(), [200, 201]);
  assert.equal(responses[0].data.thread.id, responses[1].data.thread.id);
  assert.equal((await request("/api/chat-groups", { body: { ...body, title: "Changed request" } })).status, 409);
  assert.equal((await query("SELECT count(*)::int AS total FROM chat_groups WHERE creator_user_id=?", [owner.id]))[0].total, 1);
  assert.equal(realtime.length, 3);
});

integration("group sending commits one copy per member with real author identity and independent unread state", async () => {
  const group = await create(); realtime = [];
  const sent = await send(group, owner, { content: "发给全部成员的消息" });
  assert.equal(sent.status, 201);
  assert.equal(sent.data.messages[0].metadata.senderUserId, owner.id);
  const rows = await query("SELECT m.*,t.unread_count FROM chat_messages m JOIN chat_threads t ON t.id=m.thread_id WHERE t.group_id=?", [group.groupId]);
  assert.equal(rows.length, 3);
  for (const row of rows) {
    assert.equal(row.content, "发给全部成员的消息");
    assert.equal(row.sender_type, "user");
    assert.equal(row.metadata.senderUserId, owner.id);
    assert.equal(row.metadata.groupId, group.groupId);
    assert.equal(row.metadata.source, row.user_id === owner.id ? "app" : "group");
    assert.equal(Number(row.unread_count), row.user_id === owner.id ? 0 : 1);
  }
  assert.equal(realtime.length, 2);
  assert.ok(realtime.every(item => item.event.type === "thread.message"));
  assert.equal((await request(`/api/threads/${group.threads.get(first.id)}/messages`, { person: outsider })).status, 404);
  assert.equal((await request(`/api/threads/${group.threads.get(first.id)}/read`, { person: first, body: {} })).status, 200);
  const counters = await query("SELECT user_id,unread_count FROM chat_threads WHERE group_id=?", [group.groupId]);
  assert.equal(Number(counters.find(row => row.user_id === first.id).unread_count), 0);
  assert.equal(Number(counters.find(row => row.user_id === second.id).unread_count), 1);
});

integration("concurrent send retries neither duplicate recipient copies nor increment unread twice", async () => {
  const group = await create(); realtime = [];
  const body = { content: "唯一一次交付", clientMessageId: crypto.randomUUID() };
  const responses = await Promise.all([send(group, owner, body), send(group, owner, body)]);
  assert.deepEqual(responses.map(result => result.status).sort(), [200, 201]);
  assert.equal(responses[0].data.messages[0].id, responses[1].data.messages[0].id);
  assert.equal((await send(group, owner, { ...body, content: "Changed message" })).status, 409);
  assert.equal((await query("SELECT count(*)::int AS total FROM chat_messages WHERE client_message_id=?", [body.clientMessageId]))[0].total, 3);
  assert.equal(realtime.length, 2);
  const rows = await query("SELECT unread_count FROM chat_threads WHERE group_id=? AND user_id<>?", [group.groupId, owner.id]);
  assert.ok(rows.every(row => Number(row.unread_count) === 1));
});

integration("an exited member cannot send or inspect current membership and receives no later message copies", async () => {
  const group = await create();
  assert.equal((await request(`/api/chat-groups/${group.groupId}/membership`, { person: first, method: "DELETE" })).status, 200);
  assert.equal((await send(group, first, {})).status, 403);
  assert.equal((await request(`/api/chat-groups/${group.groupId}/members`, { person: first })).status, 404);
  assert.equal((await send(group, owner, {})).status, 201);
  assert.equal((await query("SELECT count(*)::int AS total FROM chat_messages WHERE thread_id=?", [group.threads.get(first.id)]))[0].total, 0);
  const members = await request(`/api/chat-groups/${group.groupId}/members`);
  assert.deepEqual(members.data.map(person => person.id).sort(), [owner.id, second.id].sort());
});

integration("recipient storage failure rolls back every message copy and unread counter", async () => {
  const group = await create();
  await query(`CREATE FUNCTION group_fixture_fail_copy() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
    IF NEW.user_id = '${second.id}' THEN RAISE EXCEPTION 'isolated group fixture'; END IF; RETURN NEW; END $$`);
  await query("CREATE TRIGGER group_fixture_fail_copy BEFORE INSERT ON chat_messages FOR EACH ROW EXECUTE FUNCTION group_fixture_fail_copy()");
  try {
    assert.equal((await send(group, owner, {})).status, 500);
    assert.equal((await query("SELECT count(*)::int AS total FROM chat_messages WHERE thread_id=ANY(?::text[])", [[...group.threads.values()]]))[0].total, 0);
    assert.ok((await query("SELECT unread_count FROM chat_threads WHERE group_id=?", [group.groupId])).every(row => Number(row.unread_count) === 0));
  } finally {
    await query("DROP TRIGGER group_fixture_fail_copy ON chat_messages");
    await query("DROP FUNCTION group_fixture_fail_copy()");
  }
});

integration("only the original author can recall and all group copies are withdrawn together", async () => {
  const group = await create();
  const sent = await send(group, owner, {});
  const message = sent.data.messages[0];
  const [mirror] = await query("SELECT id FROM chat_messages WHERE thread_id=? AND client_message_id=?", [group.threads.get(first.id), message.clientMessageId]);
  assert.equal((await request(`/api/threads/${group.threads.get(first.id)}/messages/${mirror.id}/recall`, { person: first, body: {} })).status, 403);
  realtime = [];
  const recalled = await request(`/api/threads/${group.thread.id}/messages/${message.id}/recall`, { body: {} });
  assert.equal(recalled.status, 200);
  const rows = await query("SELECT content,recalled_at,metadata FROM chat_messages WHERE client_message_id=?", [message.clientMessageId]);
  assert.equal(rows.length, 3);
  assert.ok(rows.every(row => row.recalled_at && row.content === "" && row.metadata.recalledByUserId === owner.id));
  assert.equal(new Set(rows.map(row => new Date(row.recalled_at).toISOString())).size, 1);
  assert.equal(realtime.filter(item => item.event.type === "thread.message.updated").length, 3);
  assert.ok(realtime.some(item => item.userId === owner.id && item.event.message.id === message.id));
});

integration("group attachment sharing requires the uploader and exact conversation then grants only delivered recipients", async () => {
  const group = await create();
  const uploaded = await request(`/api/threads/${group.thread.id}/attachments/upload`, { body: Buffer.from("Only this group may read the fixture."), headers: {
    "Content-Type": "application/octet-stream", "Idempotency-Key": crypto.randomUUID(), "X-Miaoxun-Filename": "group-fixture.txt", "X-Miaoxun-Attachment-Kind": "file", "X-Miaoxun-Attachment-Mime": "text/plain",
  } });
  assert.equal(uploaded.status, 201);
  const attachment = uploaded.data;
  assert.equal((await send(group, first, { attachmentIds: [attachment.id] })).status, 404);
  const otherGroup = await create({ title: "另一个隔离群" });
  assert.equal((await send(otherGroup, owner, { attachmentIds: [attachment.id] })).status, 404);
  const sent = await send(group, owner, { attachmentIds: [attachment.id] });
  assert.equal(sent.status, 201);
  for (const person of [owner, first, second]) {
    const readable = await request(attachment.downloadPath, { person });
    assert.equal(readable.status, 200);
    assert.equal(readable.content.toString(), "Only this group may read the fixture.");
  }
  assert.equal((await request(attachment.downloadPath, { person: outsider })).status, 404);
  assert.equal((await request(`/api/threads/${group.thread.id}/messages/${sent.data.messages[0].id}/recall`, { body: {} })).status, 200);
  assert.equal((await request(attachment.downloadPath, { person: first })).status, 404);
});

integration("group messages reject Agent context, workspace discussion and unsupported reply identity", async () => {
  const group = await create();
  const workspaceContext = { id: crypto.randomUUID(), currentRound: 1, revision: 1 };
  for (const extra of [
    { contextRefs: [{ kind: "station-diary", id: crypto.randomUUID() }] },
    { workspaceContext },
    { butlerContextReset: true },
  ]) assert.equal((await send(group, owner, extra)).status, 400);
  assert.equal((await send(group, owner, { replyToMessageId: crypto.randomUUID() })).status, 404);
  assert.equal((await query("SELECT count(*)::int AS total FROM chat_messages WHERE thread_id=ANY(?::text[])", [[...group.threads.values()]]))[0].total, 0);
});

integration("group reply identities point to each recipient's local target copy", async () => {
  const group = await create();
  const firstMessage = (await send(group, owner, { content: "这条消息会被引用" })).data.messages[0];
  const [firstMirror] = await query("SELECT id FROM chat_messages WHERE thread_id=? AND client_message_id=?", [group.threads.get(first.id), firstMessage.clientMessageId]);
  const reply = await send(group, first, { content: "引用同一条群消息", replyToMessageId: firstMirror.id });
  assert.equal(reply.status, 201);
  const rows = await query("SELECT * FROM chat_messages WHERE client_message_id=?", [reply.data.messages[0].clientMessageId]);
  for (const row of rows) {
    const [target] = await query("SELECT id,thread_id FROM chat_messages WHERE thread_id=? AND client_message_id=?", [row.thread_id, firstMessage.clientMessageId]);
    assert.equal(row.metadata.replyTo.messageId, target.id);
    assert.equal(row.metadata.replyTo.content, "这条消息会被引用");
  }
});

integration("recalling a group message erases every reply snapshot and broadcasts each changed local reply", async () => {
  const group = await create();
  const original = (await send(group, owner, { content: "这段原文撤回后不能留在引用中" })).data.messages[0];
  const [mirror] = await query("SELECT id FROM chat_messages WHERE thread_id=? AND client_message_id=?", [group.threads.get(first.id), original.clientMessageId]);
  const reply = (await send(group, first, { content: "保留回复本身", replyToMessageId: mirror.id })).data.messages[0];
  const [{ cursor }] = await query("SELECT clock_timestamp() AS cursor");
  realtime = [];
  const recalled = await request(`/api/threads/${group.thread.id}/messages/${original.id}/recall`, { body: {} });
  assert.equal(recalled.status, 200);
  const replies = await query("SELECT * FROM chat_messages WHERE client_message_id=?", [reply.clientMessageId]);
  assert.equal(replies.length, 3);
  for (const row of replies) {
    assert.equal(row.content, "保留回复本身");
    assert.equal(row.metadata.replyTo.content, "");
    assert.equal(row.metadata.replyTo.recalledAt, recalled.data.message.recalledAt);
    const event = realtime.find(item => item.userId === row.user_id && item.event.message.id === row.id);
    assert.equal(event?.event.type, "thread.message.updated");
    assert.equal(event?.event.message.metadata.replyTo.content, "");
    const loaded = await request(`/api/threads/${row.thread_id}/messages`, { person: people.find(person => person.id === row.user_id) });
    assert.equal(loaded.status, 200);
    assert.ok(!JSON.stringify(loaded).includes("这段原文撤回后不能留在引用中"));
  }
  assert.equal(realtime.length, 6);
  assert.ok((await query("SELECT updated_at FROM chat_threads WHERE group_id=?", [group.groupId])).every(row => row.updated_at >= cursor));
  realtime = [];
  assert.equal((await request(`/api/threads/${group.thread.id}/messages/${original.id}/recall`, { body: {} })).status, 200);
  assert.equal(realtime.length, 0);
});

integration("a concurrent group reply and recall cannot persist a quoted original after recall", async () => {
  const group = await create();
  for (let index = 0; index < 6; index += 1) {
    const original = (await send(group, owner, { content: `并发撤回原文 ${index}` })).data.messages[0];
    const [mirror] = await query("SELECT id FROM chat_messages WHERE thread_id=? AND client_message_id=?", [group.threads.get(first.id), original.clientMessageId]);
    const [recalled, reply] = await Promise.all([
      request(`/api/threads/${group.thread.id}/messages/${original.id}/recall`, { body: {} }),
      send(group, first, { content: "并发回复", replyToMessageId: mirror.id }),
    ]);
    assert.equal(recalled.status, 200);
    assert.ok([201, 404].includes(reply.status), JSON.stringify(reply));
    const quoted = await query("SELECT m.metadata FROM chat_messages m JOIN chat_threads t ON t.id=m.thread_id WHERE t.group_id=? AND m.metadata->'replyTo' IS NOT NULL", [group.groupId]);
    assert.ok(quoted.every(row => row.metadata.replyTo.content === "" && row.metadata.replyTo.recalledAt));
  }
});

integration("reply snapshot storage failure rolls back a group recall and every mirror", async () => {
  const group = await create();
  const original = (await send(group, owner, { content: "撤回事务不能部分提交" })).data.messages[0];
  const [mirror] = await query("SELECT id FROM chat_messages WHERE thread_id=? AND client_message_id=?", [group.threads.get(first.id), original.clientMessageId]);
  await send(group, first, { content: "引用内容", replyToMessageId: mirror.id });
  await query(`CREATE FUNCTION group_fixture_fail_quote_update() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
    IF NEW.user_id = '${second.id}' AND NEW.metadata->'replyTo'->>'recalledAt' IS NOT NULL THEN RAISE EXCEPTION 'isolated quote update fixture'; END IF; RETURN NEW; END $$`);
  await query("CREATE TRIGGER group_fixture_fail_quote_update BEFORE UPDATE ON chat_messages FOR EACH ROW EXECUTE FUNCTION group_fixture_fail_quote_update()");
  realtime = [];
  try {
    assert.equal((await request(`/api/threads/${group.thread.id}/messages/${original.id}/recall`, { body: {} })).status, 500);
    const copies = await query("SELECT content,recalled_at FROM chat_messages WHERE client_message_id=?", [original.clientMessageId]);
    assert.equal(copies.length, 3);
    assert.ok(copies.every(row => row.content === "撤回事务不能部分提交" && row.recalled_at === null));
    assert.equal(realtime.length, 0);
  } finally {
    await query("DROP TRIGGER group_fixture_fail_quote_update ON chat_messages");
    await query("DROP FUNCTION group_fixture_fail_quote_update()");
  }
});

integration("recall keeps an unrelated group's message and quote when another author reuses the client ID", async () => {
  const group = await create();
  const original = (await send(group, owner, { content: "只撤回这个群的原文" })).data.messages[0];
  const other = await create({ title: "引用隔离验证群" });
  const separate = (await send(other, first, { content: "另一个作者的独立原文", clientMessageId: original.clientMessageId })).data.messages[0];
  const [otherMirror] = await query("SELECT id FROM chat_messages WHERE thread_id=? AND client_message_id=?", [other.threads.get(second.id), separate.clientMessageId]);
  const separateReply = (await send(other, second, { content: "独立引用保留", replyToMessageId: otherMirror.id })).data.messages[0];
  assert.equal((await request(`/api/threads/${group.thread.id}/messages/${original.id}/recall`, { body: {} })).status, 200);
  const originals = await query("SELECT m.* FROM chat_messages m JOIN chat_threads t ON t.id=m.thread_id WHERE t.group_id=? AND m.client_message_id=?", [other.groupId, separate.clientMessageId]);
  assert.equal(originals.length, 3);
  assert.ok(originals.every(row => row.content === "另一个作者的独立原文" && !row.recalled_at));
  const replies = await query("SELECT metadata FROM chat_messages WHERE client_message_id=?", [separateReply.clientMessageId]);
  assert.equal(replies.length, 3);
  assert.ok(replies.every(row => row.metadata.replyTo.content === "另一个作者的独立原文" && !row.metadata.replyTo.recalledAt));
});
