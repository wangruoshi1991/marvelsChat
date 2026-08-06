import assert from "node:assert/strict";
import test from "node:test";
import { createGracefulShutdown } from "../src/server-shutdown.js";

const silentLogger = { info: () => {}, error: () => {} };

test("graceful shutdown drains HTTP, realtime, and jobs before closing the database", async () => {
  const events = [];
  let finishHttp;
  let finishJob;
  const server = {
    listening: true,
    close: (callback) => {
      events.push("http:start");
      finishHttp = callback;
    },
    closeIdleConnections: () => events.push("http:idle"),
    closeAllConnections: () => events.push("http:force"),
  };
  const controller = createGracefulShutdown({
    server,
    realtimeGateway: { close: async () => { events.push("realtime:close"); } },
    jobRunner: {
      stop: async () => {
        events.push("runner:start");
        await new Promise((resolve) => { finishJob = resolve; });
        events.push("runner:stop");
      },
    },
    closeDatabase: async () => events.push("database:close"),
    logger: silentLogger,
    timeoutMs: 1000,
  });

  const first = controller.shutdown("SIGTERM");
  const second = controller.shutdown("SIGINT");
  assert.equal(first, second);
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(events.includes("database:close"), false);

  finishHttp();
  finishJob();
  await first;

  assert.equal(events.filter((event) => event === "realtime:close").length, 1);
  assert.equal(events.filter((event) => event === "runner:start").length, 1);
  assert.equal(events.at(-1), "database:close");
  assert.equal(events.includes("http:force"), false);
});

test("graceful shutdown forces HTTP connections and closes the database on timeout", async () => {
  const events = [];
  const controller = createGracefulShutdown({
    server: {
      listening: true,
      close: () => events.push("http:start"),
      closeIdleConnections: () => {},
      closeAllConnections: () => events.push("http:force"),
    },
    realtimeGateway: { close: async () => {} },
    jobRunner: { stop: async () => new Promise(() => {}) },
    closeDatabase: async () => events.push("database:close"),
    logger: silentLogger,
    timeoutMs: 5,
  });

  await assert.rejects(() => controller.shutdown("SIGTERM"), /timed out/i);
  assert.equal(events.includes("http:force"), true);
  assert.equal(events.at(-1), "database:close");
});
