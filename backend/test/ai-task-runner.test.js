import assert from "node:assert/strict";
import test from "node:test";
import { createAITaskRunner, taskFailure } from "../src/ai-task-runner.js";
import { buildSiteDraftResponse } from "../src/site-builder-service.js";

test("worker claims queued work once, persists failure and never retries the provider", async () => {
  let calls = 0;
  let queued = true;
  const records = [];
  const repository = {
    recoverInterruptedAITasks: async () => records.push("recover"),
    claimAITask: async () => queued ? (queued = false, { id: "task", kind: "site_draft", claimToken: "claim" }) : null,
    heartbeatAITask: async () => true,
    finishAITask: async value => records.push(value),
  };
  const runner = createAITaskRunner({ repository, logger: { error() {} }, executors: {
    site_draft: async () => { calls++; throw Object.assign(new Error("secret-provider-body"), { status: 504 }); },
  } });
  assert.equal(await runner.runOnce(), true);
  assert.equal(await runner.runOnce(), false);
  assert.equal(calls, 1);
  assert.equal(records[1].status, "interrupted");
  assert.equal(records[1].claimToken, "claim");
  assert.doesNotMatch(JSON.stringify(records), /secret-provider-body/);
});
test("safe task errors distinguish revoked access and stale context without provider details", () => {
  assert.equal(taskFailure({ status: 403, message: "secret" }).code, "AI_ACCESS_REVOKED");
  assert.equal(taskFailure({ status: 409, details: { code: "AI_CONTEXT_CHANGED" } }).code, "AI_CONTEXT_CHANGED");
  assert.equal(taskFailure({ status: 409, details: { code: "AI_EXECUTION_DEADLINE_EXCEEDED" } }).code, "AI_EXECUTION_DEADLINE_EXCEEDED");
  assert.doesNotMatch(JSON.stringify(taskFailure(new Error("secret"))), /secret/);
});

test("a lost site generation response persists interrupted and is never automatically dispatched again", async () => {
  let queued = true;
  let providerCalls = 0;
  let completed;
  const runner = createAITaskRunner({
    repository: {
      recoverInterruptedAITasks: async () => {},
      claimAITask: async () => queued ? (queued = false, { id: "task", kind: "site_draft", claimToken: "claim" }) : null,
      finishAITask: async value => { completed = value; },
    },
    logger: { error() {} },
    executors: { site_draft: () => buildSiteDraftResponse({
      prompt: "生成主页", modelStatus: { configured: true },
      runAgent: async () => { providerCalls++; throw new TypeError("secret-provider-body"); },
    }) },
  });
  await runner.runOnce();
  await runner.runOnce();
  assert.equal(providerCalls, 1);
  assert.equal(completed.status, "interrupted");
  assert.equal(completed.error.code, "AI_PROVIDER_RESULT_UNKNOWN");
  assert.doesNotMatch(JSON.stringify(completed), /secret-provider-body/);
});

test("shutdown during recovery prevents a new claim", async () => {
  let releaseRecovery;
  let claims = 0;
  const runner = createAITaskRunner({
    repository: {
      recoverInterruptedAITasks: () => new Promise(resolve => { releaseRecovery = resolve; }),
      claimAITask: async () => { claims++; return null; },
    },
    executors: {},
  });
  runner.start();
  const stopping = runner.stop();
  releaseRecovery();
  await stopping;
  assert.equal(claims, 0);
  assert.equal(runner.getState().state, "stopped");
  assert.equal(runner.getState().activeTask, false);
  assert.equal(runner.getState().lastSuccessfulPollAt, null);
});

test("shutdown during a claim never starts the provider or requeues the claim", async () => {
  let releaseClaim;
  let claimStarted;
  let providerCalls = 0;
  const started = new Promise(resolve => { claimStarted = resolve; });
  const runner = createAITaskRunner({
    repository: {
      recoverInterruptedAITasks: async () => {},
      claimAITask: () => new Promise(resolve => { releaseClaim = resolve; claimStarted(); }),
    },
    executors: { site_draft: async () => { providerCalls++; } },
  });
  runner.start();
  await started;
  const stopping = runner.stop();
  releaseClaim({ id: "task", kind: "site_draft", claimToken: "claim" });
  await stopping;
  assert.equal(providerCalls, 0);
  assert.equal(runner.getState().activeTask, false);
  assert.ok(runner.getState().lastSuccessfulPollAt);
});

test("shutdown waits for the current execution and does not claim another task", async () => {
  let releaseExecution;
  let executionStarted;
  let claims = 0;
  const started = new Promise(resolve => { executionStarted = resolve; });
  const runner = createAITaskRunner({
    repository: {
      recoverInterruptedAITasks: async () => {},
      claimAITask: async () => { claims++; return { id: "task", kind: "site_draft", claimToken: "claim" }; },
    },
    executors: { site_draft: () => new Promise(resolve => { releaseExecution = resolve; executionStarted(); }) },
  });
  runner.start();
  await started;
  assert.equal(runner.getState().activeTask, true);
  let stopped = false;
  const stopping = runner.stop().then(() => { stopped = true; });
  await Promise.resolve();
  assert.equal(stopped, false);
  releaseExecution();
  await stopping;
  assert.equal(claims, 1);
  assert.equal(runner.getState().state, "stopped");
  assert.equal(runner.getState().activeTask, false);
});

test('queue claims only the registered executable kinds', async()=>{
  let filter;
  const runner=createAITaskRunner({executors:{agent_message:async()=>{}},repository:{
    recoverInterruptedAITasks:async()=>{},claimAITask:async options=>{filter=options;return null;},
  }});
  await runner.runOnce();
  assert.deepEqual(filter,{kinds:['agent_message']});
});
