import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { evaluateCase, isImplemented } from "../media-retrieval/evaluation-harness.js";
import { evaluateAgentSuite } from "../scripts/agent-eval.js";

const agentsDirectory = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const packageDirectory = path.join(agentsDirectory, "media-retrieval");

const loadSuite = async () => JSON.parse(
  await fs.readFile(path.join(packageDirectory, "evaluation-suite.json"), "utf8"),
);

test("media-retrieval evaluation harness executes every versioned synthetic case in mock mode", async () => {
  const suite = await loadSuite();

  assert.equal(isImplemented, true);
  assert.equal(suite.fixturePolicy.evidenceScope, "synthetic-contract-only");
  assert.equal(suite.fixturePolicy.empiricalQualityEvidence, false);
  assert.equal(suite.scoring.scope, "synthetic-contract-only");
  assert.equal(suite.scoring.empiricalQualityEvidence, false);
  assert.equal(suite.scoring.minimumPassingScore, 100);
  assert.equal(suite.scoring.metrics.some((metric) => /quality|correctness/i.test(metric.key)), false);
  const results = await Promise.all(
    suite.cases.map((definition) => evaluateCase({ definition, mode: "mock" })),
  );

  assert.equal(results.length, 30);
  for (const [index, result] of results.entries()) {
    const definition = suite.cases[index];
    assert.equal(result.passed, true, definition.id);
    assert.ok(Number.isInteger(result.latencyMs), definition.id);
    assert.ok(Number.isInteger(result.costFen), definition.id);
    assert.ok(Number.isInteger(result.providerCalls), definition.id);
    assert.ok(result.providerCalls <= definition.limits.maxProviderCalls, definition.id);
    assert.equal(result.costFen, 0, definition.id);
    assert.equal(result.evidenceScope, "synthetic-contract-only", definition.id);
    assert.equal(result.empiricalQualityEvidence, false, definition.id);
  }
});

test("media-retrieval evaluation harness refuses every non-mock mode", async () => {
  const [definition] = (await loadSuite()).cases;

  await assert.rejects(
    evaluateCase({ definition, mode: "paid-calibration" }),
    /mock mode/i,
  );
});

test("synthetic contract evaluation reports case coverage, not a quality score", async () => {
  const report = await evaluateAgentSuite({
    repoRoot: path.resolve(agentsDirectory, ".."),
    agentKey: "media-retrieval",
  });

  assert.equal(report.status, "passed");
  assert.ok(report.evidence.includes("contract-cases:30/30"));
  assert.ok(report.evidence.includes("evidence-scope:synthetic-contract-only"));
  assert.equal(report.evidence.some((item) => item.startsWith("score:")), false);
  assert.equal(report.gates[0].detail, "Versioned synthetic contract checks passed.");
});
