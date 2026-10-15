import assert from "node:assert/strict";
import test from "node:test";
import { registerAppRoutes } from "../src/routes/app-routes.js";
import { registerSocialRoutes } from "../src/routes/social-routes.js";

test("cold-start bootstrap projects conversation history through the public message contract", async () => {
  const routes = new Map();
  const app = Object.fromEntries(
    ["get", "post", "patch", "delete"].map((method) => [
      method,
      (path, ...handlers) => routes.set(`${method} ${path}`, handlers.at(-1)),
    ]),
  );
  const stored = {
    id: "message-id",
    threadId: "thread-id",
    userId: "private-user-id",
    senderType: "agent",
    senderName: "妙管家",
    content: "好的。",
    createdAt: "2026-10-14T00:00:00.000Z",
    metadata: {
      provider: "private-provider",
      tokenUsage: { total: 24 },
      taskId: "private-task-id",
      requestFingerprint: "private-fingerprint",
      butlerClarification: {
        inputMessageId: "private-input-id",
        contextRefs: [
          {
            kind: "station-album",
            id: "album-id",
            version: "hash",
            title: "旅行",
          },
        ],
        source: {
          currentPage: "second-floor.albums",
          module: "private-module",
        },
      },
    },
  };
  registerAppRoutes(app, {
    authenticate: (_req, _res, next) => next(),
    asyncHandler: (handler) => handler,
    getOnlineUserIds: () => [],
    sendPresenceChanged: () => undefined,
    getBootstrap: async () => ({
      source: "postgresql",
      messagesByThread: { "thread-id": [stored] },
    }),
  });

  let payload;
  await routes.get("get /api/app/bootstrap")(
    { user: { id: "user-id" } },
    {
      json: (value) => {
        payload = value;
      },
    },
  );

  const [message] = payload.data.messagesByThread["thread-id"];
  assert.equal(message.id, stored.id);
  assert.equal(message.metadata.provider, undefined);
  assert.equal(message.metadata.tokenUsage, undefined);
  assert.equal(message.metadata.taskId, undefined);
  assert.equal(message.metadata.requestFingerprint, undefined);
  assert.deepEqual(message.metadata.butlerClarification, {
    contextRefs: [
      { kind: "station-album", id: "album-id", version: "hash", title: "旅行" },
    ],
    source: { currentPage: "second-floor.albums" },
  });
  assert.doesNotMatch(
    JSON.stringify(payload),
    /private-user-id|private-provider|private-task-id|private-input-id|private-module/,
  );
});

test("opening a friend conversation uses the same public message contract as history", async () => {
  const routes = new Map();
  const app = Object.fromEntries(
    ["get", "post", "patch", "delete"].map((method) => [
      method,
      (path, ...handlers) => routes.set(`${method} ${path}`, handlers.at(-1)),
    ]),
  );
  registerSocialRoutes(app, {
    authenticate: (_req, _res, next) => next(),
    asyncHandler: (handler) => handler,
    getOnlineUserIds: () => [],
    sendNotificationChanged: () => undefined,
    sendRelationshipsChanged: () => undefined,
    recordFriendThreadOpen: async () => undefined,
    openFriendThread: async () => ({
      thread: { id: "thread-id" },
      messages: [{
        id: "message-id", threadId: "thread-id", senderType: "user",
        senderName: "Friend", content: "Hello", userId: "private-owner",
        metadata: { senderUserId: "friend-id", source: "direct", requestFingerprint: "private-fingerprint" },
      }],
    }),
  });
  let payload;
  await routes.get("post /api/social/friends/:friendUserId/thread")(
    { user: { id: "user-id" }, params: { friendUserId: "friend-id" }, ip: "127.0.0.1", get: () => "" },
    { json: (value) => { payload = value; } },
  );
  assert.deepEqual(payload.data.thread, { id: "thread-id" });
  assert.deepEqual(payload.data.messages[0].metadata, { senderUserId: "friend-id" });
  assert.equal(payload.data.messages[0].content, "Hello");
  assert.doesNotMatch(JSON.stringify(payload), /private-owner|private-fingerprint|"source"/);
});
