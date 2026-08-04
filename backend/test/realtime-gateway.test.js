import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import test from "node:test";

process.env.DEFAULT_ADMIN_PASSWORD ||= "test-only-password";

const { createRealtimeGateway } = await import("../src/realtime-gateway.js");

test("closing realtime removes the HTTP upgrade listener", async () => {
  const server = new EventEmitter();
  const gateway = createRealtimeGateway(server);

  assert.equal(server.listenerCount("upgrade"), 1);
  await gateway.close();
  assert.equal(server.listenerCount("upgrade"), 0);
});
