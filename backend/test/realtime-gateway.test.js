import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { createServer } from "node:http";
import test from "node:test";
import WebSocket from "ws";

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

test("each realtime delivery verifies the connected session, even across independent gateways", async t => {
  const current = new Set(["phone", "tablet"]);
  const userId = "user-1";
  const openGateway = async (sessionId) => {
    const server = createServer();
    const gateway = createRealtimeGateway(server, {
      authenticateSession: async () => ({ sessionId, user: { id: userId } }),
      getActiveSessions: async ids => new Set(ids.filter(id => current.has(id))),
      loadPresenceUser: async () => null,
    });
    await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
    t.after(async () => {
      await gateway.close();
      server.close();
    });
    const socket = new WebSocket(`ws://127.0.0.1:${server.address().port}/api/realtime`, ["miaoxun.auth.synthetic"]);
    const messages = [];
    socket.on("message", data => messages.push(JSON.parse(data)));
    await new Promise((resolve, reject) => socket.once("message", resolve).once("error", reject));
    return { gateway, socket, messages };
  };

  const phone = await openGateway("phone");
  const tablet = await openGateway("tablet");
  current.delete("phone");
  const phoneClosed = new Promise(resolve => phone.socket.once("close", resolve));
  const tabletDelivered = new Promise(resolve => tablet.socket.once("message", resolve));
  await Promise.all([phone, tablet].map(({ gateway }) => gateway.sendRealtimeToUser(userId, { type: "fixture.one" })));
  await Promise.all([phoneClosed, tabletDelivered]);
  assert.deepEqual(phone.messages.map(event => event.type), ["connection.ready"]);
  assert.deepEqual(tablet.messages.map(event => event.type), ["connection.ready", "fixture.one"]);

  current.clear();
  const tabletClosed = new Promise(resolve => tablet.socket.once("close", resolve));
  await tablet.gateway.sendRealtimeToUser(userId, { type: "fixture.two" });
  await tabletClosed;
  assert.deepEqual(tablet.messages.map(event => event.type), ["connection.ready", "fixture.one"]);
});
