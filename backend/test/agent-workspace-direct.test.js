import assert from "node:assert/strict";
import crypto from "node:crypto";
import test from "node:test";
import { createAgentWorkspaceService } from "../src/agent-workspace-service.js";
import { createWorkspaceInTransaction } from "../src/agent-workspace-repository.js";
import { workspaceFailure } from "../src/agent-workspace-runner.js";
import { HttpError } from "../src/http-error.js";

const id = () => crypto.randomUUID();
const threadId = id(), inputMessageId = id();
const request = { user: { id: id() }, threadId, inputMessageId, requestMessageIds: [inputMessageId],
  capability: "text.summarize", contextRefs: [], source: { page: "messages.agent", module: null },
  idempotencyKey: id(), authorityCeiling: [{ agentId: "file-preprocessor", capability: "text.summarize" }] };
const forbidden = () => assert.fail("Invalid direct contracts cannot access the database");

test("direct submission rejects client-authored goals, identities, invalid chains and missing admission authority", async () => {
  const service = createAgentWorkspaceService({ transaction: forbidden });
  for (const patch of [{ goal: "Invented model goal" }, { origin: {} }, { agentId: "miaoxun-butler" },
    { requestMessageIds: [] }, { requestMessageIds: [inputMessageId, inputMessageId] },
    { requestMessageIds: [id()] }, { threadId: "invalid" }, { capability: "" }]) {
    await assert.rejects(service.submitDirectAgentWorkspace({ ...request, ...patch }), { name: "ZodError" });
  }
  await assert.rejects(service.submitDirectAgentWorkspace({ ...request, authorityCeiling: [] }), error => error.details?.code === "WORKSPACE_ACCESS_REQUIRED");
});

test("direct persistence requires an honest mode, coordinator version and strict origin", async () => {
  const stored = { userId: request.user.id, goal: "Actual user request", source: request.source, contextRefs: [], authority: {},
    coordinatorVersion: null, executionMode: "direct", origin: { kind: "agent_conversation", threadId, inputMessageId,
      agentId: "file-preprocessor", agentVersion: "0.1.0", capability: "text.summarize" },
    limits: { deadlineSeconds: 600 }, idempotencyKey: id(), requestHash: "a".repeat(64) };
  for (const patch of [{ origin: null }, { coordinatorVersion: "pretend-coordinator" }, { executionMode: "coordinated" },
    { executionMode: "unsupported" }, { origin: { ...stored.origin, grantedScopes: ["agents:invoke"] } }]) {
    await assert.rejects(createWorkspaceInTransaction({ query: forbidden }, { ...stored, ...patch }), { name: "ZodError" });
  }
});

test("direct source rejection exposes a fixed explanation rather than original user text", () => {
  const failure = workspaceFailure(new HttpError(409, "private source content", { code: "WORKSPACE_ORIGIN_CHANGED" }));
  assert.equal(failure.code, "WORKSPACE_ORIGIN_CHANGED");
  assert.doesNotMatch(failure.message, /private source content/);
});
