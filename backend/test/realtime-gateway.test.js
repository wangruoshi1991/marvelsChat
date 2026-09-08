import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import test from "node:test";

process.env.DEFAULT_ADMIN_PASSWORD ||= "test-only-password";

const {
  createRealtimeGateway,
  reportPresenceBroadcastFailure,
} = await import("../src/realtime-gateway.js");

test("closing realtime removes the HTTP upgrade listener", async () => {
  const server = new EventEmitter();
  const gateway = createRealtimeGateway(server);

  assert.equal(server.listenerCount("upgrade"), 1);
  await gateway.close();
  assert.equal(server.listenerCount("upgrade"), 0);
});

test("presence broadcast failures emit a sanitized operations event", () => {
  const entries = [];
  reportPresenceBroadcastFailure({
    error: new Error("database password should stay private"),
    logger: { error: (entry) => entries.push(entry) },
    reason: "connected",
    userId: "user-1",
  });

  assert.deepEqual(entries, [
    {
      type: "presence_broadcast_failure",
      errorName: "Error",
      reason: "connected",
      userId: "user-1",
    },
  ]);
  assert.doesNotMatch(JSON.stringify(entries), /database password/);
});
