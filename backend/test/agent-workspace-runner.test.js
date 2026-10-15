import assert from "node:assert/strict";
import test from "node:test";
import { createAgentWorkspaceRunner, workspaceFailure } from "../src/agent-workspace-runner.js";

const logger = { error() {} };
const claim = (id = "one") => ({ workspace: { id: "workspace" }, node: { id, claimToken: `claim-${id}` } });
const deferred = () => { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; };

test("workspace runner persists unknown results once and never repeats provider dispatch", async () => {
  const queued = [claim()];
  const failures = [];
  let calls = 0;
  const runner = createAgentWorkspaceRunner({ logger,
    repository: { recoverInterruptedWorkspaceNodes: async () => {}, claimWorkspaceNode: async () => queued.shift() || null,
      failWorkspaceNode: async failure => failures.push(failure) },
    execute: async () => { calls++; throw Object.assign(new Error("secret-provider-response"), { status: 504 }); },
  });
  assert.equal(await runner.runOnce(), true);
  assert.equal(await runner.runOnce(), false);
  assert.equal(calls, 1); assert.equal(failures.length, 1);
  assert.equal(failures[0].interrupted, true);
  assert.equal(failures[0].error.code, "AI_PROVIDER_RESULT_UNKNOWN");
  assert.doesNotMatch(JSON.stringify(failures), /secret-provider-response/);
});

test("workspace runner allows independent calls up to its hard concurrency bound", async () => {
  const queued = [claim("one"), claim("two"), claim("three")];
  const executing = [];
  const release = deferred();
  const started = deferred();
  const runner = createAgentWorkspaceRunner({ logger, maxConcurrent: 2,
    repository: { recoverInterruptedWorkspaceNodes: async () => {}, claimWorkspaceNode: async () => queued.shift() },
    execute: async value => { executing.push(value.node.id); if (executing.length === 2) started.resolve(); await release.promise; },
  });
  const one = runner.runOnce(); const two = runner.runOnce();
  await started.promise;
  assert.equal(runner.getState().activeNodes, 2);
  assert.equal(await runner.runOnce(), false);
  assert.equal(queued.length, 1);
  release.resolve();
  await Promise.all([one, two]);
  assert.equal(runner.getState().activeNodes, 0);
  await runner.runOnce();
  assert.deepEqual(executing, ["one", "two", "three"]);
});

test("shutdown during workspace recovery does not claim or dispatch new work", async () => {
  const recovery = deferred();
  let claims = 0;
  const runner = createAgentWorkspaceRunner({ logger, maxConcurrent: 1,
    repository: { recoverInterruptedWorkspaceNodes: () => recovery.promise,
      claimWorkspaceNode: async () => { claims++; return claim(); } }, execute: async () => assert.fail("No execution during shutdown"),
  });
  runner.start();
  const stopped = runner.stop();
  recovery.resolve();
  await stopped;
  assert.equal(claims, 0); assert.equal(runner.getState().state, "stopped");
});

test("shutdown while a workspace claim commits leaves it to lease recovery without requeue", async () => {
  const pendingClaim = deferred(); const started = deferred();
  let executions = 0;
  const runner = createAgentWorkspaceRunner({ logger, maxConcurrent: 1,
    repository: { recoverInterruptedWorkspaceNodes: async () => {}, claimWorkspaceNode: async () => { started.resolve(); return pendingClaim.promise; } },
    execute: async () => { executions++; },
  });
  runner.start(); await started.promise;
  const stopped = runner.stop(); pendingClaim.resolve(claim()); await stopped;
  assert.equal(executions, 0); assert.equal(runner.getState().state, "stopped");
  assert.ok(runner.getState().lastSuccessfulPollAt);
});

test("shutdown waits for all active workspace nodes before reporting stopped", async () => {
  const done = [deferred(), deferred()]; const started = deferred();
  let calls = 0;
  const runner = createAgentWorkspaceRunner({ logger,
    repository: { recoverInterruptedWorkspaceNodes: async () => {}, claimWorkspaceNode: async () => claim(String(calls)) },
    execute: async () => { const index = calls++; if (calls === 2) started.resolve(); await done[index].promise; },
  });
  runner.start(); await started.promise;
  let finished = false;
  const stopped = runner.stop().then(() => { finished = true; });
  done[0].resolve(); await Promise.resolve(); await Promise.resolve();
  assert.equal(finished, false);
  done[1].resolve(); await stopped;
  assert.equal(calls, 2); assert.equal(runner.getState().state, "stopped");
});

test("known workspace failures preserve actionable codes without exposing provider or document text", () => {
  for (const code of ["WORKSPACE_DEADLINE_EXCEEDED", "WORKSPACE_MEDIA_NOT_FOUND", "WORKSPACE_ACCESS_REVOKED", "WORKSPACE_MODEL_RESULT_UNKNOWN"]) {
    const failure = workspaceFailure({ details: { code }, message: "private-source-content" });
    assert.equal(failure.code, code);
    assert.doesNotMatch(failure.message, /private-source-content/);
  }
  assert.equal(workspaceFailure({ status: 403 }).code, "AI_ACCESS_REVOKED");
  assert.equal(workspaceFailure(new TypeError("private-provider-details")).code, "AI_PROVIDER_RESULT_UNKNOWN");
});

test("failure to settle a stale lease is logged safely and never retried", async () => {
  const logs = []; let calls = 0; let claims = 0;
  const runner = createAgentWorkspaceRunner({ logger: { error: entry => logs.push(JSON.parse(entry)) },
    repository: { recoverInterruptedWorkspaceNodes: async () => {}, claimWorkspaceNode: async () => claims++ ? null : claim(),
      failWorkspaceNode: async () => { throw Object.assign(new Error("private database details"), { details: { code: "WORKSPACE_LEASE_LOST" } }); } },
    execute: async () => { calls++; throw new Error("private input"); },
  });
  await runner.runOnce(); await runner.runOnce();
  assert.equal(calls, 1);
  assert.equal(logs[0].code, "WORKSPACE_LEASE_LOST");
  assert.doesNotMatch(JSON.stringify(logs), /private/);
});

test("workspace runner rejects missing executors and unbounded concurrency", () => {
  assert.throws(() => createAgentWorkspaceRunner(), /executor/);
  assert.throws(() => createAgentWorkspaceRunner({ execute() {}, maxConcurrent: 100 }), /concurrency/);
});
