import assert from "node:assert/strict";
import test from "node:test";
import {
  publicMessage,
  publicMessagesByThread,
} from "../src/public-message.js";

test("public message DTO keeps client workflow state and removes repository and model metadata", () => {
  const message = {
    id: "message-id",
    threadId: "thread-id",
    userId: "private-user-id",
    senderType: "user",
    senderName: "Tester",
    content: "Keep this selection",
    clientMessageId: "client-message-id",
    deletedAt: null,
    recalledAt: null,
    createdAt: "2026-10-14T00:00:00.000Z",
    internalRun: { id: "private-run-id" },
    metadata: {
      source: "app",
      requestFingerprint: "private-fingerprint",
      provider: "private-provider",
      tokenUsage: { total: 42 },
      taskId: "private-task-id",
      errorCode: "PRIVATE_ERROR",
      albumAssistant: {
        outcome: "found",
        retrievalRunIds: ["private-search-id"],
      },
      contextRefs: [
        {
          kind: "station-album",
          id: "album-id",
          version: "hash",
          title: "Trip",
        },
      ],
      butlerClarification: {
        inputMessageId: "private-input-id",
        contextRefs: [
          {
            kind: "station-album",
            id: "album-id",
            version: "hash",
            title: "Trip",
          },
        ],
        source: {
          currentPage: "second-floor.albums",
          module: "private-module",
        },
      },
    },
  };

  const actual = publicMessage(message);
  assert.deepEqual(Object.keys(actual), [
    "id",
    "threadId",
    "senderType",
    "senderName",
    "content",
    "metadata",
    "clientMessageId",
    "deletedAt",
    "recalledAt",
    "createdAt",
  ]);
  assert.equal(actual.metadata.source, undefined);
  assert.deepEqual(actual.metadata.contextRefs, [
    { kind: "station-album", id: "album-id", version: "hash", title: "Trip" },
  ]);
  assert.deepEqual(actual.metadata.butlerClarification, {
    contextRefs: [
      { kind: "station-album", id: "album-id", version: "hash", title: "Trip" },
    ],
    source: { currentPage: "second-floor.albums" },
  });
  assert.deepEqual(actual.metadata.albumAssistant, { outcome: "found" });
  assert.equal(actual.clientMessageId, "client-message-id");
  assert.doesNotMatch(
    JSON.stringify(actual),
    /private-user-id|private-fingerprint|private-provider|tokenUsage|private-task-id|PRIVATE_ERROR|private-search-id|private-input-id|private-module|internalRun/,
  );
});

test("bootstrap and sync message maps use the same public message projection", () => {
  const source = {
    thread: [
      {
        id: "message-id",
        threadId: "thread",
        senderType: "agent",
        senderName: "Agent",
        content: "Hello",
        userId: "private-user",
        metadata: { provider: "private" },
      },
    ],
  };
  const projected = publicMessagesByThread(source);

  assert.deepEqual(Object.keys(projected.thread[0]), [
    "id",
    "threadId",
    "senderType",
    "senderName",
    "content",
    "metadata",
    "clientMessageId",
    "deletedAt",
    "recalledAt",
    "createdAt",
  ]);
  assert.deepEqual(projected.thread[0].metadata, {});
});

test("public preview reference contains only the server-issued id and disappears after recall", () => {
  const id = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
  const message = { senderType: "agent", metadata: { uiPreferencePreview: { id, patch: { unsafe: true } } } };
  assert.deepEqual(publicMessage(message).metadata.uiPreferencePreview, { id });
  assert.equal(publicMessage({ ...message, recalledAt: "2026-11-04T00:00:00Z" }).metadata.uiPreferencePreview, undefined);
  assert.equal(publicMessage({ ...message, senderType: "user" }).metadata.uiPreferencePreview, undefined);
  assert.equal(publicMessage({ ...message, metadata: { uiPreferencePreview: { id: "not-a-uuid" } } }).metadata.uiPreferencePreview, undefined);
});
