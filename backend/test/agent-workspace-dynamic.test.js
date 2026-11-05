import assert from "node:assert/strict";
import test from "node:test";
import { validateWorkspaceDecision } from "../src/agent-workspace-plan.js";
import { createAgentWorkspaceRunner } from "../src/agent-workspace-runner.js";

const workspace = (nodes = []) => ({
  currentRound: 1,
  rounds: [{ number: 1, baseResultNodeId: null }],
  contextRefs: [],
  nodes,
});

const capability = (agentId, name, dependencyKinds = []) => ({
  agentId,
  agentVersion: "1.0.0",
  capability: name,
  inputKinds: [],
  dependencyKinds,
  outputKind: "text_result",
});

const step = (key, agentId, capabilityName, dependsOn = []) => ({
  key,
  agentId,
  capability: capabilityName,
  goal: `完成 ${key}`,
  dependsOn,
  contextRefIndexes: [],
});

test("workspace plans choose one or many authorized Agents from the graph", () => {
  const catalogue = [
    capability("agent-a", "text.a"),
    capability("agent-b", "text.b"),
    capability("agent-c", "text.c"),
    capability("agent-d", "text.d"),
  ];
  for (const count of [1, 2, 3, 4]) {
    const steps = catalogue.slice(0, count).map((entry, index) =>
      step(`node-${index + 1}`, entry.agentId, entry.capability));
    const decision = validateWorkspaceDecision(
      { type: "plan", summary: `规划 ${count} 个 Agent`, steps },
      { workspace: workspace(), catalogue },
    );
    assert.equal(decision.nodes.length, count);
    assert.deepEqual(
      decision.nodes.map(node => node.agentId),
      steps.map(node => node.agentId),
    );
    assert.ok(decision.nodes.every(node => node.dependencies.length === 0));
  }
});

test("workspace plans accept the full twenty-node graph limit without truncating participants", () => {
  const catalogue = Array.from({ length: 20 }, (_unused, index) =>
    capability(`agent-${index + 1}`, `text.node-${index + 1}`),
  );
  const steps = catalogue.map((entry, index) =>
    step(`node-${index + 1}`, entry.agentId, entry.capability),
  );
  const decision = validateWorkspaceDecision(
    { type: "plan", summary: "按任务实际需要同时分派二十个独立 Agent", steps },
    { workspace: workspace(), catalogue },
  );
  assert.equal(decision.nodes.length, 20);
  assert.deepEqual(
    decision.nodes.map(node => node.agentId),
    catalogue.map(entry => entry.agentId),
  );
  assert.ok(decision.nodes.every(node => node.dependencies.length === 0));
});

test("workspace plans preserve a mixed DAG: independent roots run before one dependent synthesis", () => {
  const catalogue = [
    capability("agent-a", "text.a"),
    capability("agent-b", "text.b"),
    capability("agent-c", "text.c"),
    capability("agent-synth", "text.synthesize", ["text_result"]),
  ];
  const decision = validateWorkspaceDecision(
    {
      type: "plan",
      summary: "三个独立结果完成后再汇总",
      steps: [
        step("a", "agent-a", "text.a"),
        step("b", "agent-b", "text.b"),
        step("c", "agent-c", "text.c"),
        step("synthesis", "agent-synth", "text.synthesize", ["a", "b", "c"]),
      ],
    },
    { workspace: workspace(), catalogue },
  );
  assert.equal(decision.nodes.length, 4);
  assert.deepEqual(decision.nodes.slice(0, 3).map(node => node.dependencies), [[], [], []]);
  assert.deepEqual(decision.nodes[3].dependencies, ["a", "b", "c"]);
});

test("workspace plans reject an undeclared dependency instead of silently serializing or dropping it", () => {
  const catalogue = [capability("agent-a", "text.a"), capability("agent-b", "text.b", ["text_result"])]
    .map(entry => entry);
  assert.throws(
    () => validateWorkspaceDecision(
      {
        type: "plan",
        summary: "依赖必须真实存在",
        steps: [step("a", "agent-a", "text.a"), step("b", "agent-b", "text.b", ["missing"])],
      },
      { workspace: workspace(), catalogue },
    ),
    error => error.details?.code === "WORKSPACE_PLAN_INVALID",
  );
});

test("workspace runner starts as many independent claims as the configured concurrency limit", async () => {
  const claims = ["one", "two", "three", "four"].map(id => ({
    workspace: { id: "workspace" },
    node: { id, claimToken: `claim-${id}` },
  }));
  const started = [];
  let release;
  const gate = new Promise(resolve => { release = resolve; });
  let allStarted;
  const allStartedPromise = new Promise(resolve => { allStarted = resolve; });
  const runner = createAgentWorkspaceRunner({
    logger: { error() {} },
    maxConcurrent: 4,
    repository: {
      recoverInterruptedWorkspaceNodes: async () => {},
      claimWorkspaceNode: async () => claims.shift() || null,
    },
    execute: async claim => {
      started.push(claim.node.id);
      if (started.length === 4) allStarted();
      await gate;
    },
  });
  const calls = [runner.runOnce(), runner.runOnce(), runner.runOnce(), runner.runOnce()];
  await allStartedPromise;
  assert.equal(runner.getState().activeNodes, 4);
  assert.deepEqual([...started].sort(), ["four", "one", "three", "two"]);
  assert.equal(await runner.runOnce(), false);
  release();
  await Promise.all(calls);
  assert.equal(runner.getState().activeNodes, 0);
});
