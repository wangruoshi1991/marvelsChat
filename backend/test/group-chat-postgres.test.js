import assert from "node:assert/strict";
import crypto from "node:crypto";
import test, { before, beforeEach, after } from "node:test";
import express from "express";
import sharp from "sharp";
import { query, closeDatabase } from "../src/db.js";
import { authenticate, hashToken } from "../src/auth.js";
import { config } from "../src/config.js";
import { createGroupChat } from "../src/group-chat-repository.js";
import { ensureFriendThreadForUser } from "../src/message-repository.js";
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
const createForwardTarget = title => createGroupChat({ userId: owner.id, ...createBody({ title }) });
async function create(overrides = {}) {
  const response = await request("/api/chat-groups", { body: createBody(overrides) });
  assert.equal(response.status, 201, JSON.stringify(response));
  assert.equal(response.data.thread.kind, "group");
  assert.ok(response.data.thread.groupId);
  const rows = await query("SELECT id,user_id FROM chat_threads WHERE group_id=?", [response.data.thread.groupId]);
  return { thread: response.data.thread, groupId: response.data.thread.groupId, threads: new Map(rows.map(row => [row.user_id, row.id])) };
}
const send = (group, person, body) => request(`/api/threads/${group.threads.get(person.id)}/messages`, { person, body: { content: "隔离测试群消息", clientMessageId: crypto.randomUUID(), ...body } });
const forward = (source, targetThreadId, { person = owner, clientMessageId = crypto.randomUUID() } = {}) =>
  request(`/api/threads/${source.threadId}/messages/${source.id}/forward`, {
    person, body: { targetThreadId, clientMessageId },
  });
const upload = (threadId, kind, filename, mimeType, body) => request(`/api/threads/${threadId}/attachments/upload`, {
  body,
  headers: {
    "Content-Type": "application/octet-stream",
    "Idempotency-Key": crypto.randomUUID(),
    "X-Miaoxun-Filename": filename,
    "X-Miaoxun-Attachment-Kind": kind,
    "X-Miaoxun-Attachment-Mime": mimeType,
  },
});

function audioFixture() {
  const box = (type, ...parts) => {
    const data = Buffer.concat(parts);
    const header = Buffer.alloc(8);
    header.writeUInt32BE(data.length + 8);
    header.write(type, 4, "ascii");
    return Buffer.concat([header, data]);
  };
  const trackDuration = Buffer.alloc(24);
  trackDuration.writeUInt32BE(24000, 12);
  trackDuration.writeUInt32BE(36000, 16);
  const trackHandler = Buffer.alloc(20);
  trackHandler.write("soun", 8);
  return Buffer.concat([
    box("ftyp", Buffer.from("M4A \0\0\0\0isom")),
    box("moov", box("trak", box("mdia", box("mdhd", trackDuration), box("hdlr", trackHandler)))),
    box("mdat", Buffer.from("test-only-aac-bytes")),
  ]);
}

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

integration("forwarding copies exact content once and binds the client key to source and destination", async () => {
  const sourceGroup = await create();
  const targetGroup = await createForwardTarget("转发目标");
  const quoted = (await send(sourceGroup, owner, { content: "源会话的引用" })).data.messages[0];
  const source = (await send(sourceGroup, owner, {
    content: "原样  保留\n第二行",
    replyToMessageId: quoted.id,
  })).data.messages[0];
  realtime = [];
  const key = { clientMessageId: crypto.randomUUID() };
  const results = await Promise.all([
    forward(source, targetGroup.thread.id, key),
    forward(source, targetGroup.thread.id, key),
  ]);
  assert.deepEqual(results.map(result => result.status).sort(), [200, 201]);
  assert.deepEqual(results[0].data, results[1].data);
  const message = results[0].data.messages[0];
  assert.equal(message.content, source.content);
  assert.deepEqual(message.metadata, { senderUserId: owner.id, forwarded: true });
  assert.equal(message.threadId, targetGroup.thread.id);
  const recipients = await query("SELECT t.unread_count,m.* FROM chat_messages m JOIN chat_threads t ON t.id=m.thread_id WHERE m.client_message_id=?", [key.clientMessageId]);
  assert.equal(recipients.length, 3);
  assert.ok(recipients.every(row => Number(row.unread_count) === Number(row.user_id !== owner.id)));
  assert.equal(realtime.length, 2);
  assert.ok(realtime.every(item => item.event.message.metadata.forwarded === true));
  assert.equal((await forward(quoted, targetGroup.thread.id, key)).status, 409);
  assert.equal((await forward(source, sourceGroup.thread.id, key)).status, 409);
  assert.equal((await forward(source, targetGroup.thread.id, { person: first })).status, 404);
  const [firstTarget] = await query("SELECT id FROM chat_threads WHERE group_id=? AND user_id=?", [targetGroup.groupId, first.id]);
  assert.equal((await forward(source, firstTarget.id)).status, 404);
  const alternateKey = { clientMessageId: crypto.randomUUID() };
  const conflicting = await Promise.all([
    forward(source, targetGroup.thread.id, alternateKey),
    forward(quoted, sourceGroup.thread.id, alternateKey),
  ]);
  assert.deepEqual(conflicting.map(result => result.status).sort(), [201, 409]);
  assert.equal((await query("SELECT COUNT(*)::int AS total FROM chat_messages WHERE client_message_id=?", [alternateKey.clientMessageId]))[0].total, 3);
});

integration("forwarding clones image, audio and file bytes for only the direct recipients", async () => {
  const sourceGroup = await create();
  const direct = (await ensureFriendThreadForUser(first.id, owner.id)).thread;
  const directPeer = (await ensureFriendThreadForUser(owner.id, first.id)).thread;
  const image = await sharp({ create: { width: 16, height: 16, channels: 3, background: "#008877" } }).png().toBuffer();
  const uploaded = await Promise.all([
    upload(sourceGroup.thread.id, "image", "photo.png", "image/png", image),
    upload(sourceGroup.thread.id, "audio", "voice.m4a", "audio/mp4", audioFixture()),
    upload(sourceGroup.thread.id, "file", "notes.txt", "text/plain", Buffer.from("source file\n")),
  ]);
  assert.ok(uploaded.every(item => item.status === 201), JSON.stringify(uploaded));
  const original = await send(sourceGroup, owner, {
    content: "原附件说明",
    attachmentIds: uploaded.map(item => item.data.id),
  });
  assert.equal(original.status, 201);
  const [localSource] = await query("SELECT id, thread_id AS \"threadId\" FROM chat_messages WHERE thread_id = ? AND client_message_id = ?",
    [sourceGroup.threads.get(first.id), original.data.messages[0].clientMessageId]);
  const key = { person: first, clientMessageId: crypto.randomUUID() };
  realtime = [];
  const sent = await forward(localSource, direct.id, key);
  assert.equal(sent.status, 201, JSON.stringify(sent));
  const message = sent.data.messages[0];
  assert.equal(message.content, original.data.messages[0].content);
  assert.equal(message.metadata.senderUserId, first.id);
  assert.equal(message.metadata.forwarded, true);
  assert.deepEqual(message.metadata.attachments.map(item => item.kind), ["image", "audio", "file"]);
  assert.equal(message.metadata.attachments[1].durationMs, 1500);
  assert.equal(realtime.length, 1);
  assert.equal(realtime[0].userId, owner.id);
  assert.equal(realtime[0].event.threadId, directPeer.id);
  assert.equal(realtime[0].event.message.unreadSequence, 1);
  const clones = message.metadata.attachments;
  for (const [i, originalUpload] of uploaded.entries()) {
    const clone = clones[i];
    assert.notEqual(clone.id, originalUpload.data.id);
    const oldBytes = await request(originalUpload.data.downloadPath, { person: first });
    for (const recipient of [first, owner]) {
      const read = await request(clone.downloadPath, { person: recipient });
      assert.equal(read.status, 200);
      assert.deepEqual(read.content, oldBytes.content);
    }
    for (const person of [second, outsider]) {
      assert.equal((await request(clone.downloadPath, { person })).status, 404);
    }
  }
  const cloneRows = await query("SELECT user_id,thread_id FROM chat_attachments WHERE id=ANY(?::uuid[])", [clones.map(item => item.id)]);
  assert.equal(cloneRows.length, 3);
  assert.ok(cloneRows.every(row => row.user_id === first.id && row.thread_id === direct.id));

  const groupTarget = await createForwardTarget("直接聊天再转发");
  const [firstGroupTarget] = await query("SELECT id FROM chat_threads WHERE group_id=? AND user_id=?", [groupTarget.groupId, first.id]);
  const again = await forward(message, firstGroupTarget.id, { person: first });
  assert.equal(again.status, 201);
  assert.equal(again.data.messages[0].content, message.content);
  const newlyShared = again.data.messages[0].metadata.attachments[2];
  assert.notEqual(newlyShared.id, clones[2].id);
  assert.equal((await request(newlyShared.downloadPath, { person: second })).content.toString(), "source file\n");

  // Recall the original after the copy has committed. New forwards are
  // rejected, but the already delivered, separately authorized copy survives.
  const source = original.data.messages[0];
  assert.equal((await request(`/api/threads/${source.threadId}/messages/${source.id}/recall`, { body: {} })).status, 200);
  assert.equal((await request(uploaded[0].data.downloadPath, { person: first })).status, 404);
  assert.equal((await forward(localSource, direct.id, { person: first })).status, 404);
  const replay = await forward(localSource, direct.id, key);
  assert.equal(replay.status, 200);
  assert.deepEqual(replay.data, sent.data);
  assert.equal((await request(clones[0].downloadPath, { person: first })).status, 200);

  assert.equal((await request(`/api/threads/${direct.id}/messages/${message.id}/recall`, { person: first, body: {} })).status, 200);
  assert.equal((await request(clones[0].downloadPath, { person: owner })).status, 404);
  const withdrawnReceipt = await forward(localSource, direct.id, key);
  assert.equal(withdrawnReceipt.status, 200);
  assert.equal(withdrawnReceipt.data.messages[0].content, "");
  assert.equal(withdrawnReceipt.data.messages[0].metadata.attachments, undefined);
});

integration("forwarding enforces target membership, friendship and supported visible sources", async () => {
  const group = await create();
  const { groupId: targetGroupId } = await createForwardTarget("退出前可用");
  const [firstTarget] = await query("SELECT id FROM chat_threads WHERE group_id=? AND user_id=?", [targetGroupId, first.id]);
  const source = (await send(group, owner, { content: "可读的原文" })).data.messages[0];
  const [firstSource] = await query("SELECT id,thread_id AS \"threadId\" FROM chat_messages WHERE thread_id=? AND client_message_id=?", [group.threads.get(first.id), source.clientMessageId]);
  const direct = (await ensureFriendThreadForUser(owner.id, first.id)).thread;
  const [agentThread] = await query(`INSERT INTO chat_threads (id,user_id,title,status_text,avatar_text,kind,agent_id)
    VALUES (?,?,'fixture','fixture','测','agent','miaoxun-butler') RETURNING id`, [crypto.randomUUID(), owner.id]);
  const systemThread = crypto.randomUUID();
  await query(`INSERT INTO chat_threads (id,user_id,title,status_text,avatar_text,kind)
    VALUES (?,?,'fixture','fixture','测','system')`, [systemThread, owner.id]);
  for (const targetThreadId of [agentThread.id, systemThread]) {
    assert.equal((await forward(source, targetThreadId)).status, 404);
    assert.equal((await forward({ id: source.id, threadId: targetThreadId }, group.thread.id)).status, 404);
  }
  assert.equal((await request(`/api/chat-groups/${targetGroupId}/membership`, { person: first, method: "DELETE" })).status, 200);
  assert.equal((await forward(firstSource, firstTarget.id, { person: first })).status, 403);
  await query("UPDATE social_relationships SET status='blocked' WHERE follower_user_id=? AND followed_user_id=?", [first.id, owner.id]);
  assert.equal((await forward(source, direct.id)).status, 403);
  await query("UPDATE social_relationships SET status='active' WHERE follower_user_id=? AND followed_user_id=?", [first.id, owner.id]);
  await query("UPDATE users SET status='disabled' WHERE id=?", [first.id]);
  assert.equal((await forward(source, direct.id)).status, 403);
  await query("UPDATE users SET status='active' WHERE id=?", [first.id]);

  const location = await request(`/api/threads/${group.thread.id}/attachments`, {
    body: { kind: "location", latitude: 30, longitude: 120 },
    headers: { "Idempotency-Key": crypto.randomUUID() },
  });
  assert.equal(location.status, 201, JSON.stringify(location));
  const structured = (await send(group, owner, { attachmentIds: [location.data.id] })).data.messages[0];
  assert.equal((await forward(structured, direct.id)).status, 400);

  assert.equal((await request(`/api/threads/${group.thread.id}/messages/${source.id}`, { method: "DELETE" })).status, 200);
  assert.equal((await forward(source, direct.id)).status, 404);
  const sourceStatus = await request(`/api/chat-groups/${group.groupId}/membership`, { person: first, method: "DELETE" });
  assert.equal(sourceStatus.status, 200);
  const firstDirect = (await ensureFriendThreadForUser(first.id, owner.id)).thread;
  assert.equal((await forward(firstSource, firstDirect.id, { person: first })).status, 201);
});

integration("forwarding rolls back cloned attachments and counters when recipient insertion fails", async () => {
  const group = await create();
  const target = await createForwardTarget("转发回滚测试");
  const uploaded = await upload(group.thread.id, "file", "atomic.txt", "text/plain", Buffer.from("fixture"));
  assert.equal(uploaded.status, 201);
  const source = (await send(group, owner, { attachmentIds: [uploaded.data.id] })).data.messages[0];
  const clientMessageId = crypto.randomUUID();
  await query(`CREATE FUNCTION group_fixture_fail_forward() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
    IF NEW.user_id = '${second.id}' AND NEW.metadata->>'forwarded' = 'true' THEN RAISE EXCEPTION 'isolated forward fixture'; END IF; RETURN NEW; END $$`);
  await query("CREATE TRIGGER group_fixture_fail_forward BEFORE INSERT ON chat_messages FOR EACH ROW EXECUTE FUNCTION group_fixture_fail_forward()");
  realtime = [];
  try {
    assert.equal((await forward(source, target.thread.id, { clientMessageId })).status, 500);
    assert.deepEqual(await query("SELECT id FROM chat_messages WHERE client_message_id=?", [clientMessageId]), []);
    assert.deepEqual(await query("SELECT id FROM chat_attachments WHERE thread_id=?", [target.thread.id]), []);
    const counters = await query("SELECT unread_count,unread_delivered FROM chat_threads WHERE group_id=?", [target.groupId]);
    assert.ok(counters.every(row => Number(row.unread_count) === 0 && Number(row.unread_delivered) === 0));
    assert.equal(realtime.length, 0);
  } finally {
    await query("DROP TRIGGER group_fixture_fail_forward ON chat_messages");
    await query("DROP FUNCTION group_fixture_fail_forward()");
  }
  const sent = await forward(source, target.thread.id, { clientMessageId });
  assert.equal(sent.status, 201);
  assert.equal(sent.data.messages[0].metadata.attachments.length, 1);
});

integration("forwarding shares the per-user attachment quota with uploads", async () => {
  const group = await create();
  const firstThread = group.threads.get(first.id);
  const direct = (await ensureFriendThreadForUser(first.id, owner.id)).thread;
  const uploaded = await upload(group.thread.id, "file", "quota.txt", "text/plain", Buffer.from("a"));
  assert.equal(uploaded.status, 201);
  const source = (await send(group, owner, { attachmentIds: [uploaded.data.id] })).data.messages[0];
  const [firstSource] = await query("SELECT id,thread_id AS \"threadId\" FROM chat_messages WHERE thread_id=? AND client_message_id=?", [firstThread, source.clientMessageId]);
  // Fill only the isolated sender's count limit, leaving bytes well below it.
  await query(`INSERT INTO chat_attachments(id,user_id,thread_id,idempotency_key,request_hash,kind,filename,title,mime_type,byte_size,content)
    SELECT gen_random_uuid(),?,?,gen_random_uuid(),repeat('0',64),'file','fixture.txt','Fixture','text/plain',1,convert_to('a','UTF8')
    FROM generate_series(1,?::integer - (SELECT count(*)::integer FROM chat_attachments WHERE user_id=?))`,
  [first.id, firstThread, config.chatAttachments.userMaxCount, first.id]);
  const key = { person: first, clientMessageId: crypto.randomUUID() };
  const beforeForward = realtime.length;
  const rejected = await forward(firstSource, direct.id, key);
  assert.equal(rejected.status, 409);
  assert.equal(rejected.error.details.code, "CHAT_ATTACHMENT_USER_QUOTA");
  assert.equal(realtime.length, beforeForward);
  assert.deepEqual(await query("SELECT id FROM chat_messages WHERE client_message_id=?", [key.clientMessageId]), []);
  await query("DELETE FROM chat_attachments WHERE id=(SELECT id FROM chat_attachments WHERE user_id=? AND thread_id=? LIMIT 1)", [first.id, firstThread]);
  assert.equal((await forward(firstSource, direct.id, key)).status, 201);
});

integration("bounded read preserves a later delivery and stale preference writes conflict", async () => {
  const group = await create();
  const thread = `/api/threads/${group.threads.get(first.id)}`;
  for (let count = 0; count < 3; count++) assert.equal((await send(group, owner, {})).status, 201);
  const initial = await request(`${thread}/state`, { person: first });
  assert.deepEqual(initial.data, { unreadSequence: 3, readSequence: 0, muted: false, preferencesRevision: 0 });
  assert.equal((await send(group, owner, {})).status, 201);
  assert.equal(realtime.filter(event => event.userId === first.id).at(-1).event.message.unreadSequence, 4);
  for (const readThrough of [initial.data.unreadSequence, 2, 3]) {
    const read = await request(`${thread}/read`, { person: first, body: { readThrough } });
    assert.equal(read.status, 200);
    assert.equal(read.data.readSequence, 3);
    assert.equal(read.data.unreadSequence, 4);
  }
  assert.equal((await request(`${thread}/read`, { person: first, body: { readThrough: 5 } })).status, 409);
  assert.equal((await request(`${thread}/state`, { person: second })).status, 404);
  const mute = (muted, baseRevision) => request(`${thread}/preferences`, {
    person: first, method: "PATCH", body: { muted, baseRevision },
  });
  assert.deepEqual((await mute(false, 0)).data, { muted: false, preferencesRevision: 1 });
  assert.equal((await mute(true, 0)).status, 409);
  assert.deepEqual((await request(`${thread}/state`, { person: first })).data,
    { unreadSequence: 4, readSequence: 3, muted: false, preferencesRevision: 1 });
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
