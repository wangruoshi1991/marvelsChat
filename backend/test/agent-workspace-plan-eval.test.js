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
