import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import { validateWorkspaceDecision } from "../src/agent-workspace-plan.js";

// Deterministic contract evaluation is authoritative for authorization and
// structural execution. It does not assert that a production model chooses a
// good plan, nor does it make paid provider requests.
const cases = fs.readFileSync(new URL("../../agents/evals/workspace/plan-contract-v1.jsonl", import.meta.url), "utf8")
  .trim().split("\n").map(line => JSON.parse(line));
assert.equal(new Set(cases.map(item => item.id)).size, cases.length);
for (const item of cases) test(`planner contract eval ${item.id} [${item.tags.join(",")}]`, () => {
  const evaluate = () => validateWorkspaceDecision(item.input.candidate,
    { workspace: item.input.workspace, catalogue: item.input.catalogue });
  if (item.expected.accepted) {
    const decision = evaluate();
    assert.equal(decision.type, item.input.candidate.type);
    if (decision.type === "plan") assert.ok(decision.nodes.every(node => /^\d+\.\d+\.\d+$/.test(node.agentVersion)));
  } else assert.throws(evaluate, error => error.details?.code === "WORKSPACE_PLAN_INVALID");
});

test("continuation cannot complete an old result or omit its actual handoff", () => {
  const artifact = { kind: "text_result", title: "原稿", content: "原版内容" };
  const base = { id: "base-id", key: "original", round: 1, status: "succeeded", capability: "text.summarize", dependencies: [], result: { artifact } };
  const revised = { id: "new-id", key: "revised", round: 2, status: "succeeded", capability: "text.summarize", dependencies: [base.key], result: { artifact: { ...artifact, content: "修改后的内容" } } };
  const workspace = { currentRound: 2, rounds: [{ number: 2, baseResultNodeId: base.id }], contextRefs: [], nodes: [base, revised] };
  const catalogue = [{ agentId: "file-preprocessor", agentVersion: "0.3.0", capability: "text.summarize", inputKinds: [], dependencyKinds: ["text_result"], outputKind: "text_result" }];
  const validate = (candidate, overrides = {}) => validateWorkspaceDecision(candidate, { workspace: { ...workspace, ...overrides }, catalogue });
  const complete = resultKey => ({ type: "complete", summary: "已修改", resultKey });
  assert.equal(validate(complete(revised.key)).type, "complete");
  for (const [candidate, overrides] of [
    [complete(base.key), {}],
    [complete(revised.key), { nodes: [base, { ...revised, dependencies: [] }] }],
    [complete(revised.key), { nodes: [base, { ...revised, round: 1 }] }],
    [complete(revised.key), { rounds: [{ number: 2, baseResultNodeId: "missing" }] }],
  ]) assert.throws(() => validate(candidate, overrides), error => error.details?.code === "WORKSPACE_PLAN_INVALID");
  const plan = dependencies => ({ type: "plan", summary: "修改原稿", steps: [{ key: "third", agentId: "file-preprocessor", capability: "text.summarize", goal: "缩短内容", dependsOn: dependencies, contextRefIndexes: [] }] });
  assert.equal(validate(plan([base.key])).type, "plan");
  assert.equal(validate(plan([revised.key])).type, "plan");
  assert.throws(() => validate(plan([])), error => error.details?.code === "WORKSPACE_PLAN_INVALID");
});

test("a plan may select four independent specialists and a dependent synthesis node", () => {
  const catalogue = [
    ["research", "research.lookup"],
    ["writer", "writer.draft"],
    ["reviewer", "reviewer.check"],
    ["media", "media.select"],
    ["synth", "synth.combine"],
  ].map(([agentId, capability]) => ({
    agentId,
    agentVersion: "1.0.0",
    capability,
    inputKinds: [],
    dependencyKinds: capability === "synth.combine"
      ? ["text_result", "media_selection"]
      : [],
    outputKind: capability === "media.select" ? "media_selection" : "text_result",
  }));
  const steps = [
    ["research", "research.lookup"],
    ["writer", "writer.draft"],
    ["reviewer", "reviewer.check"],
    ["media", "media.select"],
  ].map(([key, capability]) => ({ key, agentId: key, capability, goal: `执行 ${key}`, dependsOn: [], contextRefIndexes: [] }));
  steps.push({ key: "synth", agentId: "synth", capability: "synth.combine", goal: "汇总所有独立成果",
    dependsOn: ["research", "writer", "reviewer", "media"], contextRefIndexes: [] });
  const decision = validateWorkspaceDecision({ type: "plan", summary: "并行处理后汇总", steps },
    { workspace: { nodes: [], contextRefs: [] }, catalogue });
  assert.equal(decision.nodes.length, 5);
  assert.deepEqual(decision.nodes.slice(0, 4).map(node => node.dependencies), [[], [], [], []]);
  assert.deepEqual(decision.nodes[4].dependencies, ["research", "writer", "reviewer", "media"]);
});
