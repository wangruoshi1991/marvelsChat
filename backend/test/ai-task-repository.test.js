import assert from "node:assert/strict";
import crypto from "node:crypto";
import test from "node:test";
import { createAITaskInTransaction, createAITaskRepository } from "../src/ai-task-repository.js";

const userId = crypto.randomUUID();
const taskId = crypto.randomUUID();
const submission = {
  userId, kind: "site_draft", agentId: "site-builder", agentVersion: "0.1.0",
  input: { prompt: "private source" }, idempotencyKey: crypto.randomUUID(), requestHash: "a".repeat(64),
};
const forbiddenQuery = async () => assert.fail("invalid input must not reach the database");
const storedTask = overrides => ({
  id: taskId, user_id: userId, contract_version: 1, kind: "site_draft", agent_id: "site-builder", agent_version: "0.1.0",
  thread_id: null, input_message_id: null, status: "queued", revision: 1, phase: "queued",
  context_refs: [], artifacts: [], approval: null, error: null, input: { prompt: "private source" },
  idempotency_key: "private-key", request_hash: "a".repeat(64), claim_token: "private-claim", lease_until: null,
  created_at: new Date("2026-01-01T00:00:00Z"), updated_at: new Date("2026-01-01T00:00:00Z"),
  database_now: new Date("2026-01-01T00:00:00Z"), ...overrides,
});

test("task creation rejects invalid source references and oversized private input before database access", async () => {
  const connection = { query: forbiddenQuery };
  for (const overrides of [
    { kind: "agent_message" },
    { threadId: crypto.randomUUID(), inputMessageId: crypto.randomUUID() },
    { phase: "completed" },
    { idempotencyKey: "short" },
    { contextRefs: [{ kind: "station-album", id: crypto.randomUUID(), title: "Album", version: "v1", rawContent: "private" }] },
  ]) {
    await assert.rejects(createAITaskInTransaction(connection, { ...submission, ...overrides }), error => error.name === "ZodError");
  }
  await assert.rejects(createAITaskInTransaction(connection, {
    ...submission, input: { prompt: "x".repeat(128 * 1024) },
  }), error => error.status === 400 && error.details.code === "AI_TASK_INPUT_TOO_LARGE");
});

test("public task projection excludes private fields and uses database time for approval actions", async () => {
  const approval = { id: crypto.randomUUID(), draftId: crypto.randomUUID(), draftHash: "b".repeat(64),
    profileHash: "c".repeat(64), expiresAt: "2026-01-01T00:01:00Z" };
  let row = storedTask({ status: "awaiting_confirmation", phase: "awaiting_confirmation", approval, display_goal: "Owner task goal" });
  const repository = createAITaskRepository({ query: async () => [row] });
  const task = await repository.getAITask({ userId, taskId });
  assert.deepEqual(Object.keys(task).sort(), ["id", "contractVersion", "kind", "agentId", "agentVersion", "goal", "threadId", "inputMessageId",
    "status", "revision", "phase", "contextRefs", "artifacts", "approval", "error", "createdAt", "updatedAt", "allowedActions"].sort());
  assert.equal(JSON.stringify(task).includes("private"), false);
  assert.equal(task.goal, "Owner task goal");
  assert.equal(task.createdAt, "2026-01-01T00:00:00.000Z");
  assert.deepEqual(task.allowedActions, ["cancel", "confirm", "reject"]);
  row = { ...row, database_now: new Date(approval.expiresAt) };
  assert.deepEqual((await repository.getAITask({ userId, taskId })).allowedActions, ["cancel", "reject"]);
});

test("unexpected private fields in stored public references fail closed", async () => {
  const row = storedTask({ context_refs: [{ kind: "station-album", id: crypto.randomUUID(), title: "Album", version: "v1", privateContent: "secret" }] });
  const repository = createAITaskRepository({ query: async () => [row] });
  await assert.rejects(repository.getAITask({ userId, taskId }), error => error.name === "ZodError");
});

test("state and decision validation reject terminal progress or incomplete confirmations before database access", async () => {
  const repository = createAITaskRepository({ query: forbiddenQuery, withTransaction: forbiddenQuery });
  await assert.rejects(repository.advanceAITask({ taskId, claimToken: crypto.randomUUID(), phase: "completed" }), error => error.name === "ZodError");
  await assert.rejects(repository.mutateAITask({ userId, taskId, revision: 1, operation: "confirm", mutate: async () => {} }), error => error.name === "ZodError");
  await assert.rejects(repository.mutateAITask({ userId, taskId, revision: 1, operation: "confirm", approvalId: crypto.randomUUID() }), /apply handler/);
  await assert.rejects(repository.listAITasks({ userId, limit: 101 }), error => error.name === "ZodError");
});
