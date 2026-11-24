import assert from "node:assert/strict";
import { randomInt, randomUUID } from "node:crypto";
import test from "node:test";
import express from "express";
import { authenticate, createPlainToken, hashToken } from "../src/auth.js";
import { closeDatabase, query, withTransaction } from "../src/db.js";
import {
  createRequestErrorHandler,
  createRequestObservabilityMiddleware,
} from "../src/request-observability.js";
import { registerChatMessageSearchRoutes } from "../src/routes/chat-message-search-routes.js";
import { registerMessageRoutes } from "../src/routes/message-routes.js";

const enabled = process.env.RUN_CHAT_MESSAGE_SEARCH_POSTGRES === "1";
const threadPath = (thread) => "/api/threads/" + thread.id + "/messages";

test("conversation search uses account-local message history in PostgreSQL", {
  skip: !enabled && "RUN_CHAT_MESSAGE_SEARCH_POSTGRES=1 requires a loopback *_migration_test database",
  timeout: 20000,
}, async (t) => {
  const db = new URL(process.env.DATABASE_URL);
  assert.ok(["localhost", "127.0.0.1"].includes(db.hostname));
  assert.match(db.pathname, /_migration_test$/);

  const users = [];
  const groupId = randomUUID();
  let server;
  t.after(async () => {
    if (server) await new Promise((resolve) => server.close(resolve));
    try {
      await query("DELETE FROM chat_groups WHERE id = ?", [groupId]);
      await query("DELETE FROM users WHERE id = ANY(?::bpchar[])", [users]);
    } finally {
      await closeDatabase();
    }
  });

  async function createUser() {
    const id = randomUUID();
    const token = createPlainToken();
    const aiId = randomInt(100000000000, 999999999999).toString();
    users.push(id);
    await query(
      "INSERT INTO users (id, email, password_hash, display_name, ai_id) VALUES (?, ?, 'test', ?, ?)",
      [id, id + "@search.example.invalid", id, aiId],
    );
    await query(
      "INSERT INTO auth_sessions (id, user_id, token_hash, expires_at) VALUES (?, ?, ?, CURRENT_TIMESTAMP + INTERVAL '1 hour')",
      [randomUUID(), id, hashToken(token)],
    );
    return { id, token };
  }

  async function createThread(owner, {
    kind = "direct", id = randomUUID(), peer = null, group = null, agent = null,
  } = {}) {
    await query(
      "INSERT INTO chat_threads (id, user_id, title, kind, peer_user_id, group_id, agent_id) VALUES (?, ?, 'Search QA', ?, ?, ?, ?)",
      [id, owner.id, kind, peer?.id, group, agent],
    );
    return { id, ownerId: owner.id };
  }

  async function createMessage(thread, content, {
    id = randomUUID(), sender = "user", metadata = {},
    date = "2026-01-02T04:05:06.000001Z", deleted = null, recalled = null,
  } = {}) {
    await query(
      "INSERT INTO chat_messages (id, thread_id, user_id, sender_type, sender_name, content, metadata, created_at, deleted_at, recalled_at) VALUES (?, ?, ?, ?, 'Search QA', ?, ?::jsonb, ?, ?, ?)",
      [id, thread.id, thread.ownerId, sender, content, JSON.stringify(metadata), date, deleted, recalled],
    );
    return id;
  }

  const [owner, peer] = await Promise.all([createUser(), createUser()]);
  await query(
    "INSERT INTO chat_groups (id, creator_user_id, title, idempotency_key, request_fingerprint) VALUES (?, ?, 'Search QA', ?, ?)",
    [groupId, peer.id, randomUUID(), "0".repeat(64)],
  );
  await query(
    "INSERT INTO chat_group_members (group_id, user_id, left_at) VALUES (?, ?, CURRENT_TIMESTAMP)",
    [groupId, owner.id],
  );
  const [direct, mirror, group, agent, system, disguisedAgent] = await Promise.all([
    createThread(owner, { peer }),
    createThread(peer, { peer: owner }),
    createThread(owner, { kind: "group", group: groupId }),
    createThread(owner, { kind: "agent", agent: "search-qa" }),
    createThread(owner, { kind: "system" }),
    createThread(owner, { agent: "search-qa" }),
  ]);
  const [firstTie, secondTie] = [randomUUID(), randomUUID()].sort().reverse();
  const precise = "2026-01-02T04:05:06.000002Z";
  const [newestId, , , peerCopyId, groupResultId] = await Promise.all([
    createMessage(direct, "京都 Test-Alpha %_\\", {
      date: precise, metadata: { senderUserId: peer.id, privateTrace: "internal" },
    }),
    createMessage(direct, "test-alpha", { id: firstTie }),
    createMessage(direct, "TEST-ALPHA", { id: secondTie }),
    createMessage(mirror, "京都 test-alpha %_\\"),
    createMessage(group, "Group Test-Alpha"),
    createMessage(direct, "Test-Alpha recalled", { recalled: precise }),
    createMessage(direct, "Test-Alpha deleted", { deleted: precise }),
    createMessage(direct, "Test-Alpha agent", { sender: "agent" }),
    createMessage(direct, "Test-Alpha contribution", { metadata: { workspaceContext: { nodeId: randomUUID() } } }),
    createMessage(direct, "Test-Alpha workspace", { metadata: { agentWorkspace: { id: randomUUID() } } }),
    createMessage(direct, "Not a body match", { metadata: { replyTo: { content: "test-alpha" } } }),
    createMessage(agent, "Test-Alpha agent thread"),
    createMessage(system, "Test-Alpha system thread"),
    createMessage(disguisedAgent, "Test-Alpha direct Agent thread"),
  ]);

  const app = express();
  const logs = [];
  app.use(createRequestObservabilityMiddleware({ logger: { info: (entry) => logs.push(entry) } }));
  app.use(express.json());
  const asyncHandler = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
  registerMessageRoutes(app, { authenticate, asyncHandler, getOnlineUserIds: () => [], sendRealtimeToUser() {} });
  registerChatMessageSearchRoutes(app, { authenticate, asyncHandler });
  app.use(createRequestErrorHandler({ production: true, logger: { error: (entry) => logs.push(entry) } }));
  await new Promise((resolve) => { server = app.listen(0, "127.0.0.1", resolve); });
  const origin = "http://127.0.0.1:" + server.address().port;

  async function call(path, user, status, body) {
    const headers = user ? { Authorization: "Bearer " + user.token } : {};
    if (body !== undefined) headers["Content-Type"] = "application/json";
    const response = await fetch(origin + path, {
      method: body === undefined ? "GET" : "POST",
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(8000),
    });
    assert.equal(response.status, status);
    if (body !== undefined) assert.equal(response.headers.get("Cache-Control"), "private, no-store");
    if (body === undefined && status === 404) return null;
    const payload = await response.json();
    return payload.data ?? payload.error;
  }

  const search = (thread, user, body, status = 200) =>
    call(threadPath(thread) + "/search", user, status, body);

  await t.test("requires authentication and read access to an ordinary conversation", async () => {
    const body = { q: "test-alpha" };
    await search(direct, null, body, 401);
    for (const thread of [direct, group, { id: randomUUID() }]) {
      await search(thread, peer, body, 404);
    }
    for (const thread of [agent, system, disguisedAgent]) {
      await search(thread, owner, body, 404);
    }
    await call(threadPath(direct) + "/search?q=test-alpha", owner, 404);
  });

  await t.test("returns the same public DTOs as history and searches retained group and local peer copies", async () => {
    const { items, nextCursor } = await search(direct, owner, { q: " Test-aLPhA " });
    assert.deepEqual(items.map((item) => item.id), [newestId, firstTie, secondTie]);
    assert.equal(nextCursor, null);
    const history = await call(threadPath(direct), owner, 200);
    assert.deepEqual(items, items.map((item) => history.find((message) => item.id === message.id)));
    assert.equal(items[0].metadata.privateTrace, undefined);
    assert.deepEqual((await search(mirror, peer, { q: "test-alpha" })).items.map((item) => item.id), [peerCopyId]);
    assert.deepEqual((await search(group, owner, { q: "test-alpha" })).items.map((item) => item.id), [groupResultId]);
    assert.deepEqual(await search(direct, owner, { q: "test-beta" }), { items: [], nextCursor: null });
  });

  await t.test("matches SQL wildcard characters literally and keeps queries out of application logs", async () => {
    const result = await search(direct, owner, { q: "京都 test-alpha %_\\" });
    assert.deepEqual(result.items.map((item) => item.id), [newestId]);
    assert.ok(logs.some((entry) => entry.route === "/api/threads/:threadId/messages/search" && entry.status === 200));
    assert.ok(!JSON.stringify(logs).includes("test-alpha"));
  });

  await t.test("pages across microseconds and equal timestamps after recalled or deleted anchors", async () => {
    const first = await search(direct, owner, { q: "test-alpha", limit: 1 });
    assert.deepEqual(first.items.map((item) => item.id), [newestId]);
    assert.ok(first.nextCursor);
    await query("UPDATE chat_messages SET recalled_at = CURRENT_TIMESTAMP WHERE id = ?", [newestId]);
    const second = await search(direct, owner, { q: "test-alpha", cursor: first.nextCursor, limit: 1 });
    assert.deepEqual(second.items.map((item) => item.id), [firstTie]);
    assert.ok(second.nextCursor);
    await query("DELETE FROM chat_messages WHERE id = ?", [firstTie]);
    const third = await search(direct, owner, { q: "test-alpha", cursor: second.nextCursor, limit: 1 });
    assert.deepEqual(third.items.map((item) => item.id), [secondTie]);
    assert.equal(third.nextCursor, null);
    await search(group, owner, { q: "test-alpha", cursor: first.nextCursor }, 400);
    await search(direct, owner, { q: "test-beta", cursor: first.nextCursor }, 400);
    const malformed = JSON.parse(Buffer.from(first.nextCursor, "base64url").toString("utf8"));
    malformed[2] = "2026-02-31T04:05:06.000001Z";
    await search(direct, owner, {
      q: "test-alpha",
      cursor: Buffer.from(JSON.stringify(malformed)).toString("base64url"),
    }, 400);
  });

  await t.test("rejects empty, oversized, malformed, and unexpected input", async () => {
    for (const body of [
      { q: " " }, { q: "a".repeat(201) }, { q: "ab\u0000cd" }, { q: ["test-alpha"] },
      { q: "test-alpha", limit: "1" }, { q: "test-alpha", limit: 51 },
      { q: "test-alpha", ownerId: peer.id }, { q: "test-alpha", cursor: "not-a-cursor" },
    ]) {
      await search(direct, owner, body, 400);
    }
  });

  await t.test("cancels a blocked database search and leaves subsequent requests usable", async () => {
    await withTransaction(async (connection) => {
      await connection.query("LOCK TABLE chat_messages IN ACCESS EXCLUSIVE MODE");
      const error = await search(direct, owner, { q: "test-alpha" }, 503);
      assert.equal(error.details.code, "CHAT_SEARCH_TIMEOUT");
    });
    const { items } = await search(direct, owner, { q: "test-alpha" });
    assert.deepEqual(items.map((item) => item.id), [secondTie]);
  });
});
