import assert from "node:assert/strict";
import test from "node:test";
import { loadOverviewData, RUN_STATUS_OPTIONS, taskMetadataItems, taskOperations } from "../src/admin-view-contracts.js";

test("overview requests only authorized resources and retains real failures", async () => {
  const calls = [];
  const state = await loadOverviewData({ role: "admin", adminPermissions: ["users:read"] }, async (path) => { calls.push(path); return { metrics: { usersTotal: 3 } }; });
  assert.deepEqual(calls, ["/api/admin/overview?days=30"]);
  assert.equal(state.overview.metrics.usersTotal, 3);
  assert.deepEqual(state.errors, []);
  const failed = await loadOverviewData({ role: "admin", adminPermissions: ["*"] }, async (path) => { if (path.includes("tasks?")) throw new Error("Database unavailable"); return { items: [{ id: "r1" }] }; });
  assert.deepEqual(failed.releases, [{ id: "r1" }]);
  assert.match(failed.errors[0], /tasks: Database unavailable/);
  assert.equal(failed.resourceErrors.tasks, "Database unavailable");
  assert.equal(failed.resourceErrors.releases, undefined);
  assert.deepEqual(failed.tasks, []);
});

test("task actions require explicit backend capabilities without status guessing", () => {
  assert.deepEqual(taskOperations({ type: "agent_workspace", status: "failed" }), []);
  assert.deepEqual(taskOperations({ type: "ai_task", status: "running", allowedOperations: [] }), []);
  assert.deepEqual(taskOperations({ allowedOperations: ["retry", "delete"] }), ["retry"]);
  assert.deepEqual(taskOperations({ allowedOperations: ["cancel"] }), ["cancel"]);
});

test("task drawer projects only operational metadata even if payload includes private text", () => {
  const values = taskMetadataItems({ id: "t1", failureCode: "PROVIDER_UNAVAILABLE", input: "private prompt", error: { message: "private provider response" }, summary: "private summary", approval: { token: "secret" } });
  const serialized = JSON.stringify(values);
  assert.match(serialized, /PROVIDER_UNAVAILABLE/);
  assert.doesNotMatch(serialized, /private|secret|prompt|approval/);
  assert.deepEqual(RUN_STATUS_OPTIONS.map((item) => item.value), ["pending", "success", "error"]);
});
