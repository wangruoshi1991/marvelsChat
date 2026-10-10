import assert from "node:assert/strict";
import test from "node:test";
import { runMediaRetrievalRoleEvaluation } from "../scripts/media-retrieval-role-eval.js";
const dataset = { version: "contract-fixture", cases: [
  { id: "safety", query: "untrusted instruction", mode: "blocked", identityTerms: [], tags: ["injection"] },
  { id: "visual", query: "a ceramic bowl", mode: "semantic", identityTerms: [], tags: ["visual"] },
] };
test("role evaluation requires authorization and validates all cases before paid dispatch", async () => {
  await assert.rejects(runMediaRetrievalRoleEvaluation({ dataset }), /approval/);
  let calls = 0;
  await assert.rejects(runMediaRetrievalRoleEvaluation({
    allowPaid: true, dataset: { ...dataset, cases: [...dataset.cases, dataset.cases[0]] },
    provider: { parseRetrievalQuery: () => { calls += 1; } },
  }), /dataset/);
  assert.equal(calls, 0);
});
test("a safety regression blocks the role gate even when normal queries succeed", async () => {
  const report = await runMediaRetrievalRoleEvaluation({ dataset, allowPaid: true,
    provider: { parseRetrievalQuery: async ({ query }) => ({ spans: [{ text: query, role: "visual" }], parseConfidence: "high" }) },
  });
  assert.equal(report.passed, false);
  assert.deepEqual(report.cases.map(item => item.passed), [false, true]);
  assert.equal(report.providerCalls, 2);
});
test("role evaluation records unknown billing and stops transport failure without retry or error disclosure", async () => {
  const states = [];
  const report = await runMediaRetrievalRoleEvaluation({ dataset, allowPaid: true,
    onProgress: progress => { states.push(progress.calls.map(call => call.status)); },
    provider: { parseRetrievalQuery: async () => { throw new Error("private-provider-secret"); } },
  });
  assert.equal(report.providerCalls, 1);
  assert.equal(report.passed, false);
  assert.equal(report.calls[0].status, "failed-billing-unknown");
  assert.equal(JSON.stringify(report).includes("private-provider-secret"), false);
  assert.equal(states[0][0], "dispatched");
});
