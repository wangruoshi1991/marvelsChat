import assert from "node:assert/strict";
import crypto from "node:crypto";
import test from "node:test";
import { createWorkspaceInTransaction, createAgentWorkspaceRepository } from "../src/agent-workspace-repository.js";

const userId = crypto.randomUUID();
const workspaceId = crypto.randomUUID();
const limits = { deadlineSeconds: 600 };
const input = { userId, goal: "A real product goal", source: { page: "miao", module: "task-composer" }, contextRefs: [],
  authority: {}, coordinatorVersion: "0.2.0", limits, idempotencyKey: crypto.randomUUID(), requestHash: "a".repeat(64) };
const forbidden = () => assert.fail("Invalid requests must not reach PostgreSQL");

test("workspace submissions reject unknown fields, invalid references and retired count limits before database access", async () => {
  for (const override of [
    { ownerId: userId }, { goal: "" }, { coordinatorVersion: "" }, { authority: [] },
    ...["maxSteps", "maxModelCalls", "maxCoordinatorTurns"].map(name => ({ limits: { ...limits, [name]: 1 } })),
    { limits: { deadlineSeconds: 0 } }, { limits: {} },
    { source: { page: "miao", module: "", privateData: "not allowed" } },
    { contextRefs: [{ kind: "station-photo", id: crypto.randomUUID(), version: "old", title: "Photo" }] },
  ]) await assert.rejects(createWorkspaceInTransaction({ query: forbidden }, { ...input, ...override }), { name: "ZodError" });
  await assert.rejects(createWorkspaceInTransaction({ query: forbidden }, { ...input, input: { text: "x".repeat(130 * 1024) } }),
    error => error.details.code === "WORKSPACE_INPUT_TOO_LARGE");
});

test("workspace decisions reject unsupported operations and incomplete confirmations before transaction access", async () => {
  const repository = createAgentWorkspaceRepository({ query: forbidden, withTransaction: forbidden });
  for (const decision of [
    { operation: "retry" }, { operation: "confirm", approvalId: "bad" }, { operation: "reply", text: "  " },
    { operation: "continue", text: "修改正文" }, { operation: "continue", text: " ", idempotencyKey: crypto.randomUUID() },
    { operation: "continue", text: "修改正文", idempotencyKey: "short" },
    { operation: "cancel", revision: 0 },
  ]) await assert.rejects(repository.mutateAgentWorkspace({ userId, workspaceId, revision: 1, ...decision }), { name: "ZodError" });
  await assert.rejects(repository.mutateAgentWorkspace({ userId, workspaceId, revision: 1, operation: "confirm", approvalId: crypto.randomUUID() }), /apply handler/);
  await assert.rejects(repository.mutateAgentWorkspace({ userId, workspaceId, revision: 1, operation: "cancel", text: "hidden instruction" }),
    error => error.details.code === "WORKSPACE_DECISION_INVALID");
  await assert.rejects(repository.mutateAgentWorkspace({ userId, workspaceId, revision: 1, operation: "continue", text: "修改正文", idempotencyKey: crypto.randomUUID() }), /authorization handler/);
  await assert.rejects(repository.mutateAgentWorkspace({ userId, workspaceId, revision: 1, operation: "reply", text: "补充", idempotencyKey: crypto.randomUUID() }),
    error => error.details.code === "WORKSPACE_DECISION_INVALID");
});

const row = overrides => {
  const stored = {
  id: workspaceId, user_id: userId, current_round: 1, execution_mode: "coordinated", origin: null, goal: "Owner goal", status: "running", revision: 2, coordinator_version: "0.2.0",
  source: input.source, context_refs: [], authority: { secretGrantSnapshot: "private" }, input: { privateInput: "private" },
  followups: [{ text: "Owner clarification" }], limits, usage: { modelCalls: 1, coordinatorTurns: 1 },
  deadline_at: new Date("2026-10-12T10:10:00Z"), summary: "Progress", question: null,
  result: { artifact: { kind: "site_draft", id: crypto.randomUUID(), title: "Page" }, privateHash: "private", resultKey: "compose" }, approval: null,
  error: null, idempotency_key: "private", request_hash: "a".repeat(64),
  created_at: new Date("2026-10-12T10:00:00Z"), updated_at: new Date("2026-10-12T10:01:00Z"),
  database_now: new Date("2026-10-12T10:01:00Z"), ...overrides,
  };
  stored.workspace_rounds = [{ workspace_id: workspaceId, user_id: userId, round_number: 1, instruction: stored.goal,
    base_result_node_id: null, result_node_id: null, status: "queued", summary: "", result: null, created_at: stored.created_at, completed_at: null }];
  return stored;
};

test("public workspace snapshots expose only typed artifacts and use database time for available decisions", async () => {
  let stored = row();
  let nodes = [{ id: crypto.randomUUID(), workspace_id: workspaceId, user_id: userId, round_number: 1, node_key: "compose", agent_id: "site-builder",
    agent_version: "0.2.0", capability: "site.compose", goal: "Create page", dependencies: [], context_ref_indexes: [],
    status: "succeeded", summary: "Ready", result: stored.result, error: null, model_calls: 1,
    claim_token: "private", lease_until: "private", created_at: stored.created_at, updated_at: stored.updated_at }];
  const repository = createAgentWorkspaceRepository({ withTransaction: work => work({ query: async sql => sql.includes("FROM agent_workspaces") ? [stored] : sql.includes("FROM agent_workspace_rounds") ? stored.workspace_rounds : nodes }) });
  const view = await repository.getAgentWorkspace({ userId, workspaceId });
  assert.deepEqual(view.result, stored.result.artifact);
  assert.deepEqual(view.followups, ["Owner clarification"]);
  assert.deepEqual(view.steps[0].result, stored.result.artifact);
  assert.equal(view.currentRound, 1);
  assert.equal(view.steps[0].round, 1);
  assert.equal(view.rounds[0].instruction, stored.goal);
  assert.deepEqual(view.rounds[0].result, view.result);
  assert.equal(view.rounds[0].resultNodeId, nodes[0].id);
  assert.doesNotMatch(JSON.stringify(view), /private|authority|claimToken|leaseUntil|contextRefIndexes/);
  const approval = { id: crypto.randomUUID(), draftId: view.result.id, draftHash: "a".repeat(64), profileHash: "b".repeat(64),
    resourcesHash: "c".repeat(64), expiresAt: "2026-10-12T10:02:00Z" };
  stored = row({ status: "awaiting_confirmation", approval });
  assert.deepEqual((await repository.getAgentWorkspace({ userId, workspaceId })).allowedActions, ["cancel", "confirm", "reject", "continue"]);
  stored.database_now = new Date(approval.expiresAt);
  assert.deepEqual((await repository.getAgentWorkspace({ userId, workspaceId })).allowedActions, ["cancel", "reject", "continue"]);
  nodes = [{ ...nodes[0], result: { artifact: { ...view.result, privateField: "secret" } } }];
  await assert.rejects(repository.getAgentWorkspace({ userId, workspaceId }), { name: "ZodError" });
});

test("terminal snapshots separate the current state from historical questions and summaries", async () => {
  let stored = row({ status: "cancelled", summary: "等待补充任务信息", question: "选择哪个相册？" });
  const nodes = [{ id: crypto.randomUUID(), workspace_id: workspaceId, user_id: userId, round_number: 1, node_key: "coordinate-1",
    agent_id: "miaoxun-butler", agent_version: "0.2.2", capability: "workspace.coordinate", goal: stored.goal,
    dependencies: [], context_ref_indexes: [], status: "succeeded", summary: stored.question,
    result: { decision: { type: "clarify", question: stored.question } }, error: null, model_calls: 1,
    claim_token: null, lease_until: null, created_at: stored.created_at, updated_at: stored.updated_at }];
  const repository = createAgentWorkspaceRepository({ withTransaction: work => work({
    query: async sql => sql.includes("FROM agent_workspaces") ? [stored] : sql.includes("FROM agent_workspace_rounds") ? stored.workspace_rounds : nodes,
  }) });
  for (const status of ["cancelled", "cancelling", "failed", "interrupted"]) {
    stored = { ...stored, status };
    const view = await repository.getAgentWorkspace({ userId, workspaceId });
    assert.doesNotMatch(view.summary, /等待补充/);
    assert.equal(view.question, null); assert.equal(view.inputRequest, null);
    assert.deepEqual(view.allowedActions, []);
    assert.equal(view.steps[0].summary, "选择哪个相册？");
  }
});

test("text delivery snapshots expose free prose and reject invalid or extra public fields", async () => {
  const artifact = { kind: "text_result", title: "讨论结果", content: "第一段内容。\n\n- 一个建议\n- 另一建议" };
  const nodeId = crypto.randomUUID();
  let stored = row({ status: "succeeded", result: { artifact,
    sourceReferences: [{ kind: "chat-message", id: crypto.randomUUID(), version: "a".repeat(64), title: "Private source" }],
    resultKey: "write", provider: "privateProviderAudit" } });
  const nodes = () => [{ id: nodeId, workspace_id: workspaceId, user_id: userId, round_number: 1, node_key: "write", agent_id: "comic-diary",
    agent_version: "0.3.0", capability: "comic.storyboard", goal: "Write prose", dependencies: [], context_ref_indexes: [],
    status: "succeeded", summary: "Ready", result: stored.result, error: null, model_calls: 1,
    claim_token: null, lease_until: null, created_at: stored.created_at, updated_at: stored.updated_at }];
  const repository = createAgentWorkspaceRepository({ withTransaction: work => work({
    query: async sql => sql.includes("FROM agent_workspaces") ? [stored] : sql.includes("FROM agent_workspace_rounds") ? stored.workspace_rounds : nodes(),
  }) });
  const view = await repository.getAgentWorkspace({ userId, workspaceId });
  assert.deepEqual(view.result, { kind: "text_result", id: nodeId, title: artifact.title });
  assert.deepEqual(view.steps[0].result, view.result);
  assert.equal(view.status, "succeeded");
  assert.deepEqual(view.allowedActions, ["continue"]);
  assert.deepEqual(view.rounds[0].result, view.result);
  assert.equal(view.approval, null);
  assert.doesNotMatch(JSON.stringify(view), /sourceReferences|Private source|privateProviderAudit|第一段内容/);
  for (const invalid of [
    { ...artifact, title: " " }, { ...artifact, title: "x".repeat(161) },
    { ...artifact, content: "\n " }, { ...artifact, content: "x".repeat(16001) },
    { ...artifact, sourceReferences: [] }, { ...artifact, provider: "hidden" },
  ]) {
    stored = { ...stored, result: { artifact: invalid, resultKey: "write" } };
    await assert.rejects(repository.getAgentWorkspace({ userId, workspaceId }), { name: "ZodError" });
  }
});
