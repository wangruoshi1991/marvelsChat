import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import test from "node:test";
import { createAITaskWorkerHeartbeat, startAITaskWorker } from "../src/ai-task-worker.js";

const state = { state: "running", activeTask: true, lastSuccessfulPollAt: "2026-10-12T01:00:00.000Z" };

test("worker liveness preserves queue progress and does not refresh success after a failed database check", async () => {
  const logs = [];
  let connected = true;
  let time = Date.parse("2026-10-12T01:00:30.000Z");
  const heartbeat = createAITaskWorkerHeartbeat({
    runner: { getState: () => state },
    logger: { log: value => logs.push(JSON.parse(value)), error: value => logs.push(JSON.parse(value)) },
    now: () => time,
    checkConnection: async () => { if (!connected) throw new Error("secret-database-host"); },
  });
  assert.equal(await heartbeat.runOnce(), true);
  assert.equal(logs[0].databaseConnected, true);
  assert.equal(logs[0].activeTask, true);
  assert.equal(logs[0].lastSuccessfulPollAt, state.lastSuccessfulPollAt);
  connected = false;
  time += 30000;
  assert.equal(await heartbeat.runOnce(), false);
  assert.equal(logs[1].databaseConnected, false);
  assert.equal(logs[1].lastDatabaseSuccessAt, logs[0].lastDatabaseSuccessAt);
  assert.equal(logs[1].lastSuccessfulPollAt, state.lastSuccessfulPollAt);
  assert.doesNotMatch(JSON.stringify(logs), /secret-database-host/);
  heartbeat.stop();
});

test("a timed-out worker database check cannot pile up queries or produce a late success", async () => {
  const logs = [];
  let checks = 0;
  let complete;
  const heartbeat = createAITaskWorkerHeartbeat({
    runner: { getState: () => state }, timeoutMs: 10,
    logger: { log: value => logs.push(JSON.parse(value)), error: value => logs.push(JSON.parse(value)) },
    checkConnection: () => { checks++; return new Promise(resolve => { complete = resolve; }); },
  });
  assert.equal(await heartbeat.runOnce(), false);
  assert.equal(logs[0].databaseConnected, false);
  assert.equal(await heartbeat.runOnce(), false);
  assert.equal(checks, 1);
  complete();
  await Promise.resolve();
  await Promise.resolve();
  assert.equal(logs.length, 1);
  heartbeat.stop();
});

test("stopping the worker heartbeat suppresses pending and future success messages", async () => {
  const logs = [];
  let complete;
  const heartbeat = createAITaskWorkerHeartbeat({
    runner: { getState: () => state },
    logger: { log: value => logs.push(value), error: value => logs.push(value) },
    checkConnection: () => new Promise(resolve => { complete = resolve; }),
  });
  const pending = heartbeat.runOnce();
  await Promise.resolve();
  heartbeat.stop();
  complete();
  assert.equal(await pending, false);
  assert.equal(await heartbeat.runOnce(), false);
  assert.deepEqual(logs, []);
});

test("the explicit worker entry starts the runner and heartbeat and handles shutdown once", async () => {
  const events = [];
  const runtime = new EventEmitter();
  runtime.exit = code => { throw new Error(`Unexpected process exit ${code}`); };
  const worker = await startAITaskWorker({
    runtime, logger: { log() {}, error() {} },
    check: async () => ({ connected: true, migrationsCurrent: true }),
    close: async () => { events.push("database-closed"); },
    createRunner: ({ executors }) => {
      assert.equal(typeof executors.agent_message, "function");
      assert.equal(typeof executors.site_draft, "function");
      return { start: () => events.push("runner-started"), stop: async () => { events.push("runner-stopped"); }, getState: () => state };
    },
    createWorkspaceRunner: ({ execute, maxConcurrent }) => {
      assert.equal(typeof execute, "function");
      assert.equal(maxConcurrent, 4);
      return { start: () => events.push("workspace-started"), stop: async () => { events.push("workspace-stopped"); },
        getState: () => ({ state: "running", activeNodes: 2, lastSuccessfulPollAt: state.lastSuccessfulPollAt }) };
    },
    createHeartbeat: ({ runner }) => {
      assert.equal(runner.getState().activeTask, true);
      assert.equal(runner.getState().activeNodes, 2);
      assert.equal(runner.getState().workspaceLastSuccessfulPollAt, state.lastSuccessfulPollAt);
      return { start: () => events.push("heartbeat-started"), stop: () => events.push("heartbeat-stopped") };
    },
    createAttachmentMaintenance: () => ({
      start: () => events.push("attachment-maintenance-started"),
      stop: async () => { events.push("attachment-maintenance-stopped"); },
    }),
  });
  assert.deepEqual(events, ["runner-started", "workspace-started", "heartbeat-started", "attachment-maintenance-started"]);
  runtime.emit("SIGTERM");
  await worker.stop();
  runtime.emit("SIGINT");
  await worker.stop();
  assert.deepEqual(events, ["runner-started", "workspace-started", "heartbeat-started", "attachment-maintenance-started", "heartbeat-stopped", "runner-stopped", "workspace-stopped", "attachment-maintenance-stopped", "database-closed"]);
});

test("the explicit worker entry refuses startup before database migrations are current", async () => {
  const runtime = {};
  let closed = false;
  const worker = await startAITaskWorker({
    runtime, logger: { error() {} },
    check: async () => ({ connected: true, migrationsCurrent: false }),
    close: async () => { closed = true; },
    createRunner: () => { throw new Error("The queue must not start"); },
    createWorkspaceRunner: () => { throw new Error("The workspace queue must not start"); },
  });
  assert.equal(worker, null);
  assert.equal(runtime.exitCode, 1);
  assert.equal(closed, true);
});
