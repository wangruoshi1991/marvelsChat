import assert from "node:assert/strict";
import test from "node:test";

process.env.DEFAULT_ADMIN_ENABLED ||= "false";

const {
  assertSafeSmokeEnvironment,
  runMediaRetrievalMockSmoke,
} = await import("../scripts/media-retrieval-smoke.js");

test("media retrieval local smoke blocks dispatch before private media or provider work", async () => {
  const report = await runMediaRetrievalMockSmoke();

  assert.equal(report.status, "passed");
  assert.ok(report.evidence.includes("mode:mock"));
  assert.ok(report.evidence.includes("dispatch:blocked-before-read"));
  assert.ok(report.evidence.includes("provider-calls:0"));
  assert.ok(report.evidence.includes("temporary-artifacts:0"));
});

test("media retrieval smoke cannot run in production", () => {
  assert.throws(
    () => assertSafeSmokeEnvironment("production"),
    /production/i,
  );
  assert.doesNotThrow(() => assertSafeSmokeEnvironment("test"));
});
