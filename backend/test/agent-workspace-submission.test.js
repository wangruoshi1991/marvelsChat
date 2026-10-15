import assert from "node:assert/strict";
import test from "node:test";
import { HttpError } from "../src/http-error.js";
import { classifiedWorkspaceRejection, workspaceRejectionError } from "../src/agent-workspace-submission.js";

test("durable refusals contain fixed business messages and the exact submitted nonce, never raw error text", () => {
  const original = new HttpError(409, "private provider payload", {code: "AI_CONTEXT_CHANGED"});
  const classified = classifiedWorkspaceRejection(original);
  assert.deepEqual(classified, {code: "AI_CONTEXT_CHANGED", status: 409});
  const receipt = workspaceRejectionError({...classified, idempotencyKey: "unit-submission"});
  assert.equal(receipt.status, 409);
  assert.equal(receipt.message.includes(original.message), false);
  assert.deepEqual(receipt.details, {code: "AI_CONTEXT_CHANGED", submissionOutcome: "rejected", idempotencyKey: "unit-submission"});
});
test("unknown failures, unauthorized sessions and wrong status/code pairs never become durable refusals", () => {
  for (const error of [new Error("disconnected"), new HttpError(401, "expired"), new HttpError(403, "unknown", {code: "UNKNOWN"}),
    new HttpError(503, "unavailable", {code: "WORKSPACE_ACCESS_REQUIRED"}), new HttpError(409, "conflict", {code: "WORKSPACE_IDEMPOTENCY_CONFLICT"})]) {
    assert.equal(classifiedWorkspaceRejection(error), null);
  }
  assert.throws(() => workspaceRejectionError({code: "UNKNOWN", status: 403, idempotencyKey: "unit-submission"}), /Invalid durable/);
});
