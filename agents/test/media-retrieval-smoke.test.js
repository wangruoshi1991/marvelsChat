import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { smokeAgent } from "../scripts/agent-smoke.js";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

test("media-retrieval mock smoke proves critical privacy, budget, and retrieval paths without a provider", async () => {
  const report = await smokeAgent({
    repoRoot,
    agentKey: "media-retrieval",
    environment: "local",
  });

  assert.equal(report.status, "passed");
  assert.deepEqual(report.errors, []);
  assert.ok(report.evidence.includes("mode:mock"));
  assert.ok(report.evidence.some((item) => item.startsWith("cases:")));
  assert.ok(report.evidence.every((item) => !/api[_-]?key|token|signed|url/i.test(item)));
});
