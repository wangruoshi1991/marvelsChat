import assert from "node:assert/strict";
import test from "node:test";
import { createMediaRetrievalModule } from "../src/modules/media-retrieval.js";

const overview = {
  runtimeStatus: {
    lifecycle: "limited_release",
    publicAvailability: { state: "available", reasonCodes: [] },
    liveness: { lastSeenAt: "2026-10-30T00:00:00.000Z" },
  },
  controls: { operatorEnabled: true, providerCallsEnabled: false, queueEnabled: true, lifecycle: "limited_release" },
  queue: { queued: 2, running: 1, blocked: 0 },
  readySegments: 12,
  cost: { reservedFen: 100, estimatedFen: 50, unknownFen: 25 },
  recentRuns: [{ runType: "index", lifecycleStatus: "succeeded", createdAt: "2026-10-30T00:00:00.000Z" }],
  diagnostics: [{ agentRunId: "run-1", operation: "embedding", stage: "http-response", failureCode: "provider_error", httpStatus: 503, schemaPaths: [] }],
};

test("media retrieval module renders real status, controls, runs and diagnostics", async () => {
  const calls = [];
  const client = async (path, options) => {
    calls.push({ path, options });
    return overview;
  };
  const module = createMediaRetrievalModule(client);
  await module.load();
  const html = module.render();
  assert.match(html, /媒体检索运行诊断/);
  assert.match(html, /limited_release/);
  assert.match(html, /run-1/);
  assert.match(html, /Provider 调用/);
  assert.match(html, /data-module-action="toggle-provider"/);
  assert.doesNotMatch(html, /<script>/);
});

test("media retrieval controls use a real PATCH endpoint", async () => {
  const calls = [];
  const module = createMediaRetrievalModule(async (path, options) => {
    calls.push({ path, options });
    return overview;
  });
  await module.load();
  module.render();
  await module.handleAction("toggle-provider", {});
  assert.equal(calls[1].path, "/api/admin/media-retrieval/controls");
  assert.equal(calls[1].options.method, "PATCH");
  assert.deepEqual(JSON.parse(calls[1].options.body), { providerCallsEnabled: true });
  assert.match(calls[1].options.headers["Idempotency-Key"], /^admin-media-retrieval-providerCallsEnabled-/);
});
