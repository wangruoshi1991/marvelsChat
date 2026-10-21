import assert from "node:assert/strict";
import crypto from "node:crypto";
import test, { before, beforeEach, after } from "node:test";
import { query, withTransaction, closeDatabase } from "../src/db.js";
import * as repository from "../src/agent-workspace-repository.js";

const enabled = process.env.RUN_AGENT_WORKSPACE_INTEGRATION === "1";
const integration = (name, work) => test(name, { skip: !enabled && "Set RUN_AGENT_WORKSPACE_INTEGRATION=1 with a migrated disposable PostgreSQL database" }, work);
const owner = crypto.randomUUID();
const outsider = crypto.randomUUID();
const limits = { deadlineSeconds: 600 };
const source = { page: "miao", module: "task-composer" };
const submission = overrides => ({ userId: owner, goal: "Find suitable media and compose a private page", source, contextRefs: [],
  authority: { "miaoxun-butler": ["agents:invoke"], "album-manager": ["album:read"] },
  input: { privateRequestData: "must never enter DTO" }, coordinatorVersion: "0.2.0", limits,
  idempotencyKey: crypto.randomUUID(), requestHash: "a".repeat(64), ...overrides });
const create = overrides => withTransaction(connection => repository.createWorkspaceInTransaction(connection, submission(overrides)));
const get = workspaceId => repository.getAgentWorkspace({ userId: owner, workspaceId });
const selection = () => ({ artifact: { kind: "media_selection", title: "Selected media", assets: [{ id: crypto.randomUUID(),
  version: "2026-10-12T10:00:00.000Z", kind: "image", matchedFrameTimestampMs: null }], retrievalRunIds: [crypto.randomUUID()] },
  privateScopeSnapshot: { scopes: ["album:read"] } });
const draft = () => ({ artifact: { kind: "site_draft", id: crypto.randomUUID(), title: "Private page" },
  profileHash: "a".repeat(64), resourcesHash: "b".repeat(64) });
const specialist = (key, dependencies = [], capability = "media.select") => ({ key, dependencies,
  agentId: capability === "media.select" ? "album-manager" : "site-builder", agentVersion: "0.2.0", capability,
  goal: `Execute ${key}`, contextRefIndexes: [] });
const finish = (claim, args = {}) => repository.finishWorkspaceNode({ nodeId: claim.node.id, claimToken: claim.node.claimToken, ...args });
const receipt = { provider: "isolated-test-provider", model: "isolated-test-model", tokenUsage: { prompt: 10, completion: 5, total: 15 }, latencyMs: 7 };
const receive = (claim, callNumber = 1, value = receipt) => repository.recordWorkspaceModelCall({ nodeId: claim.node.id,
  claimToken: claim.node.claimToken, callNumber, receipt: value });
const plan = (claim, definitions, coordinator = true) => finish(claim, { summary: "Plan ready", complete: async (connection, { workspace }) => {
  await repository.insertWorkspaceNodes(connection, workspace, definitions);
  if (coordinator) await repository.queueWorkspaceCoordinator(connection, workspace, { dependencies: definitions.map(node => node.key) });
  return { summary: "Working on the goal", status: "running" };
} });
const approvalFor = result => ({ id: crypto.randomUUID(), draftId: result.artifact.id, draftHash: "c".repeat(64),
  profileHash: result.profileHash, resourcesHash: result.resourcesHash, expiresAt: new Date(Date.now() + 60000).toISOString() });

before(async () => {
  if (!enabled) return;
  const [database] = await query("SELECT current_database() AS name");
  assert.match(database.name, /_migration_test$/, "Never run workspace fixtures against a product database");
  for (const userId of [owner, outsider]) await query(`INSERT INTO users(id,email,password_hash,display_name,ai_id)
    VALUES (?, ?, 'isolated-test-only', ?, ?)`, [userId, `${userId}@example.invalid`, `Workspace verification ${userId.slice(0, 8)}`, String(crypto.randomInt(100000000000, 999999999999))]);
});
beforeEach(async () => { if (enabled) {
  await query("DELETE FROM agent_workspace_submissions WHERE user_id IN (?, ?)", [owner, outsider]);
  await query("DELETE FROM agent_workspaces WHERE user_id IN (?, ?)", [owner, outsider]);
} });
after(async () => {
  if (!enabled) return;
  await query("DELETE FROM users WHERE id IN (?, ?)", [owner, outsider]);
  await closeDatabase();
});

integration("concurrent workspace submission is atomic, idempotent and owner isolated", async () => {
  const args = submission();
  const [one, two] = await Promise.all([withTransaction(connection => repository.createWorkspaceInTransaction(connection, args)),
    withTransaction(connection => repository.createWorkspaceInTransaction(connection, args))]);
  assert.equal(one.workspace.id, two.workspace.id);
  assert.deepEqual([one.reused, two.reused].sort(), [false, true]);
  assert.equal(one.workspace.steps.length, 1);
  assert.equal(one.workspace.steps[0].key, "coordinate-1");
  assert.doesNotMatch(JSON.stringify(one.workspace), /privateRequestData|authority|claimToken|requestHash/);
  await assert.rejects(withTransaction(connection => repository.createWorkspaceInTransaction(connection, { ...args, requestHash: "b".repeat(64) })),
    error => error.details.code === "WORKSPACE_IDEMPOTENCY_CONFLICT");
  assert.equal(await repository.getAgentWorkspace({ userId: outsider, workspaceId: one.workspace.id }), null);
  assert.deepEqual(await repository.listAgentWorkspaces({ userId: outsider }), []);
  await assert.rejects(repository.mutateAgentWorkspace({ userId: outsider, workspaceId: one.workspace.id, revision: 1, operation: "cancel" }), error => error.status === 404);
  const [count] = await query("SELECT count(*)::int AS count FROM agent_workspace_nodes WHERE workspace_id = ?", [one.workspace.id]);
  assert.equal(count.count, 1);
});

integration("dynamic plan dependencies run in order and deliver one explicit terminal artifact", async () => {
  const { workspace } = await create();
  const initial = await repository.claimWorkspaceNode();
  assert.equal(initial.workspace.id, workspace.id);
  assert.equal(initial.workspace.input.privateRequestData, "must never enter DTO");
  assert.equal(initial.workspace.usage.coordinatorTurns, 1);
  await plan(initial, [specialist("find"), specialist("compose", ["find"], "site.compose")]);
  const media = await repository.claimWorkspaceNode();
  assert.equal(media.node.key, "find");
  assert.equal(await repository.claimWorkspaceNode(), null);
  await finish(media, { result: selection(), summary: "Media selected" });
  const site = await repository.claimWorkspaceNode();
  assert.equal(site.node.key, "compose");
  assert.equal(site.workspace.nodes.find(node => node.key === "find").result.artifact.kind, "media_selection");
  const result = draft();
  await finish(site, { result, summary: "Page prepared" });
  const coordinator = await repository.claimWorkspaceNode();
  assert.equal(coordinator.node.key, "coordinate-2");
  const approval = approvalFor(result);
  const pending = await finish(coordinator, { complete: async () => ({ status: "awaiting_confirmation", result, approval, summary: "Review your page" }) });
  assert.equal(pending.status, "awaiting_confirmation");
  assert.deepEqual(pending.result, result.artifact);
  assert.doesNotMatch(JSON.stringify(pending), /privateScopeSnapshot/);
  assert.equal(await repository.claimWorkspaceNode(), null);
  let applied = 0;
  const body = { userId: owner, workspaceId: workspace.id, revision: pending.revision, operation: "confirm", approvalId: approval.id,
    mutate: async () => { applied++; return { result, summary: "Saved" }; } };
  const [saved, repeated] = await Promise.all([repository.mutateAgentWorkspace(body), repository.mutateAgentWorkspace(body)]);
  assert.equal(saved.status, "succeeded"); assert.equal(repeated.status, "succeeded"); assert.equal(applied, 1);
});

integration("two independent nodes may own leases concurrently without duplicate claims", async () => {
  await create();
  await plan(await repository.claimWorkspaceNode(), [specialist("landscape"), specialist("portraits")]);
  const one = await repository.claimWorkspaceNode();
  const two = await repository.claimWorkspaceNode();
  assert.notEqual(one.node.id, two.node.id);
  assert.equal(one.workspace.id, two.workspace.id);
  assert.equal(await repository.claimWorkspaceNode(), null);
  await Promise.all([finish(one, { result: selection() }), finish(two, { result: selection() })]);
  const coordinator = await repository.claimWorkspaceNode();
  assert.equal(coordinator.node.capability, "workspace.coordinate");
  assert.equal(coordinator.workspace.nodes.filter(node => node.status === "succeeded").length, 3);
});

integration("invalid graphs, duplicate keys and cross-workspace dependencies roll back atomically", async () => {
  await create();
  const first = await repository.claimWorkspaceNode();
  for (const definitions of [
    [specialist("a", ["b"]), specialist("b", ["a"])], [specialist("same"), specialist("same")],
    [specialist("missing", ["other-workspace-node"])], [specialist("self", ["self"])],
    [{ ...specialist("bad-index"), contextRefIndexes: [0] }], [specialist("coordinate-99")],
  ]) {
    await assert.rejects(plan(first, definitions), error => error.status === 409);
    const state = await get(first.workspace.id);
    assert.equal(state.steps.length, 1);
    assert.equal(state.steps[0].status, "running");
  }
  await plan(first, [specialist("valid")]);
});

integration("model receipts and dynamic continuation remain atomic beyond former count ceilings", async () => {
  await create();
  let claim = await repository.claimWorkspaceNode();
  const initial = claim;
  const reservations = await Promise.all([
    repository.reserveWorkspaceModelCall({ nodeId: claim.node.id, claimToken: claim.node.claimToken }),
    repository.reserveWorkspaceModelCall({ nodeId: claim.node.id, claimToken: claim.node.claimToken }),
  ]);
  assert.deepEqual(reservations.map(item => item.nodeModelCalls).sort(), [1, 2]);
  for (let callNumber = 1; callNumber <= 101; callNumber++) {
    if (callNumber > 2) {
      const reserved = await repository.reserveWorkspaceModelCall({ nodeId: claim.node.id, claimToken: claim.node.claimToken });
      assert.equal(reserved.nodeModelCalls, callNumber);
    }
    await receive(claim, callNumber, { ...receipt, servedModel: callNumber === 1 ? "served-test-model" : null });
  }
  assert.equal((await get(claim.workspace.id)).usage.modelCalls, 101);
  const [stored] = await query("SELECT model_calls, model_receipts FROM agent_workspace_nodes WHERE id = ?", [initial.node.id]);
  assert.equal(stored.model_calls, 101);
  assert.equal(stored.model_receipts.length, 101);
  assert.ok(stored.model_receipts.every(item => item.status === "received"));
  assert.equal(stored.model_receipts[0].servedModel, "served-test-model");
  assert.equal(stored.model_receipts[100].servedModel, null);
  for (let turn = 1; turn <= 21; turn++) {
    await plan(claim, [specialist(`step-${turn}`)]);
    await finish(await repository.claimWorkspaceNode(), { result: selection() });
    claim = await repository.claimWorkspaceNode();
    assert.equal(claim.node.key, `coordinate-${turn + 1}`);
  }
  const state = await get(claim.workspace.id);
  assert.equal(state.usage.coordinatorTurns, 22);
  assert.equal(state.steps.filter(node => node.capability !== "workspace.coordinate").length, 21);
  assert.deepEqual(state.limits, { deadlineSeconds: 600 });
});

integration("cancelling a queued workspace is idempotent and prevents dispatch", async () => {
  const { workspace } = await create();
  const decision = { userId: owner, workspaceId: workspace.id, revision: workspace.revision, operation: "cancel" };
  const cancelled = await repository.mutateAgentWorkspace(decision);
  assert.equal(cancelled.status, "cancelled");
  assert.equal(cancelled.steps[0].status, "cancelled");
  assert.equal((await repository.mutateAgentWorkspace(decision)).revision, cancelled.revision);
  assert.equal(await repository.claimWorkspaceNode(), null);
});

integration("running cancellation waits for active calls, prevents new calls and discards late publishing", async () => {
  await create();
  const initial = await repository.claimWorkspaceNode();
  await plan(initial, [specialist("one"), specialist("two")]);
  const active = await repository.claimWorkspaceNode();
  const state = await get(active.workspace.id);
  const cancelling = await repository.mutateAgentWorkspace({ userId: owner, workspaceId: state.id, revision: state.revision, operation: "cancel" });
  assert.equal(cancelling.status, "cancelling");
  assert.equal(await repository.claimWorkspaceNode(), null);
  await assert.rejects(repository.reserveWorkspaceModelCall({ nodeId: active.node.id, claimToken: active.node.claimToken }), error => error.details.code === "WORKSPACE_STATE_CHANGED");
  let committed = false;
  const cancelled = await finish(active, { result: selection(), complete: async () => { committed = true; } });
  assert.equal(cancelled.status, "cancelled"); assert.equal(committed, false);
  assert.equal(cancelled.steps.find(step => step.id === active.node.id).result, null);
});

integration("lease loss is interrupted, never requeued, and fences a late worker", async () => {
  await create();
  const claim = await repository.claimWorkspaceNode();
  await repository.reserveWorkspaceModelCall({ nodeId: claim.node.id, claimToken: claim.node.claimToken });
  await query("UPDATE agent_workspace_nodes SET lease_until = clock_timestamp() - INTERVAL '1 second' WHERE id = ?", [claim.node.id]);
  assert.equal(await repository.heartbeatWorkspaceNode({ nodeId: claim.node.id, claimToken: claim.node.claimToken }), false);
  assert.equal(await repository.recoverInterruptedWorkspaceNodes(), 1);
  assert.equal((await get(claim.workspace.id)).status, "interrupted");
  const [node] = await query("SELECT model_receipts FROM agent_workspace_nodes WHERE id = ?", [claim.node.id]);
  assert.equal(node.model_receipts[0].status, "unknown");
  assert.equal(node.model_receipts[0].callNumber, 1);
  await assert.rejects(receive(claim), error => error.details.code === "WORKSPACE_LEASE_LOST");
  assert.equal(await repository.claimWorkspaceNode(), null);
  let committed = false;
  await assert.rejects(finish(claim, { complete: async () => { committed = true; } }), error => error.details.code === "WORKSPACE_LEASE_LOST");
  assert.equal(committed, false);
});

integration("expired workspace stops before another call and recovers without replay", async () => {
  await create();
  const claim = await repository.claimWorkspaceNode();
  await query("UPDATE agent_workspaces SET deadline_at = clock_timestamp() - INTERVAL '1 second' WHERE id = ?", [claim.workspace.id]);
  await assert.rejects(repository.reserveWorkspaceModelCall({ nodeId: claim.node.id, claimToken: claim.node.claimToken }), error => error.details.code === "WORKSPACE_DEADLINE_EXCEEDED");
  assert.equal(await repository.recoverInterruptedWorkspaceNodes(), 1);
  const state = await get(claim.workspace.id);
  assert.equal(state.status, "interrupted"); assert.equal(state.error.code, "WORKSPACE_DEADLINE_EXCEEDED");
  assert.equal(state.usage.modelCalls, 0);
});

integration("failed dependent execution preserves earlier artifacts and cancels undispatched nodes", async () => {
  await create();
  await plan(await repository.claimWorkspaceNode(), [specialist("find"), specialist("compose", ["find"], "site.compose")]);
  const media = await repository.claimWorkspaceNode();
  const result = selection();
  await finish(media, { result });
  const site = await repository.claimWorkspaceNode();
  const failed = await repository.failWorkspaceNode({ nodeId: site.node.id, claimToken: site.node.claimToken,
    error: { code: "AI_ACCESS_REVOKED", message: "The selected Agent authorization was withdrawn." } });
  assert.equal(failed.status, "failed");
  assert.deepEqual(failed.steps.find(step => step.key === "find").result, result.artifact);
  assert.equal(failed.steps.find(step => step.key === "coordinate-2").status, "cancelled");
  assert.equal(await repository.claimWorkspaceNode(), null);
});

integration("unknown execution results cannot be retried or accidentally republished by siblings", async () => {
  await create();
  await plan(await repository.claimWorkspaceNode(), [specialist("one"), specialist("two")]);
  const one = await repository.claimWorkspaceNode();
  const two = await repository.claimWorkspaceNode();
  await repository.failWorkspaceNode({ nodeId: one.node.id, claimToken: one.node.claimToken, interrupted: true,
    error: { code: "AI_PROVIDER_RESULT_UNKNOWN", message: "Provider result is unknown." } });
  let committed = false;
  const state = await finish(two, { result: selection(), complete: async () => { committed = true; } });
  assert.equal(state.status, "interrupted"); assert.equal(committed, false);
  assert.equal(state.steps.find(step => step.id === two.node.id).status, "cancelled");
  assert.equal(await repository.claimWorkspaceNode(), null);
});

integration("clarification replies persist once, retain usage and queue exactly one coordinator", async () => {
  await create();
  const claim = await repository.claimWorkspaceNode();
  await repository.reserveWorkspaceModelCall({ nodeId: claim.node.id, claimToken: claim.node.claimToken });
  await receive(claim);
  const waiting = await finish(claim, { result: { decision: { type: "clarify", question: "Which theme should be used?" } }, complete: async () => ({ status: "waiting_input", question: "Which theme should be used?" }) });
  assert.deepEqual(waiting.allowedActions, ["cancel", "reply"]);
  const decision = { userId: owner, workspaceId: waiting.id, revision: waiting.revision, operation: "reply", text: "Use warm colours." };
  const [one, repeated] = await Promise.all([repository.mutateAgentWorkspace(decision), repository.mutateAgentWorkspace(decision)]);
  assert.equal(one.revision, repeated.revision); assert.equal(one.steps.length, 2);
  assert.equal(one.usage.modelCalls, 1);
  await assert.rejects(repository.mutateAgentWorkspace({ ...decision, text: "Changed reply" }), error => error.details.code === "WORKSPACE_REVISION_CONFLICT");
  const next = await repository.claimWorkspaceNode();
  assert.equal(next.node.key, "coordinate-2"); assert.equal(next.workspace.followups.length, 1);
  assert.equal(next.workspace.followups[0].text, decision.text);
  assert.equal((await repository.mutateAgentWorkspace(decision)).status, "running");
});

integration("waiting input cannot extend an expired execution deadline", async () => {
  await create();
  const claim = await repository.claimWorkspaceNode();
  const waiting = await finish(claim, { result: { decision: { type: "clarify", question: "Which album?" } }, complete: async () => ({ status: "waiting_input", question: "Which album?" }) });
  await query("UPDATE agent_workspaces SET deadline_at = clock_timestamp() - INTERVAL '1 second' WHERE id = ?", [waiting.id]);
  await assert.rejects(repository.mutateAgentWorkspace({ userId: owner, workspaceId: waiting.id, revision: waiting.revision,
    operation: "reply", text: "Album one" }), error => error.details.code === "WORKSPACE_DEADLINE_EXCEEDED");
  await repository.recoverInterruptedWorkspaceNodes();
  assert.equal((await get(waiting.id)).status, "failed");
});

integration("completion and newly scheduled steps roll back together on authorization failure", async () => {
  await create();
  const claim = await repository.claimWorkspaceNode();
  await assert.rejects(finish(claim, { complete: async (connection, { workspace }) => {
    await repository.insertWorkspaceNodes(connection, workspace, [specialist("should-rollback")]);
    await connection.query("UPDATE users SET display_name = 'Unexpected mutation' WHERE id = ?", [owner]);
    throw new Error("Authorization revoked during completion");
  } }), /Authorization revoked/);
  const state = await get(claim.workspace.id);
  assert.equal(state.steps.length, 1); assert.equal(state.steps[0].status, "running");
  assert.equal((await query("SELECT display_name FROM users WHERE id = ?", [owner]))[0].display_name, `Workspace verification ${owner.slice(0, 8)}`);
});

integration("workspace cannot report completion while steps remain pending", async () => {
  await create();
  const claim = await repository.claimWorkspaceNode();
  await assert.rejects(finish(claim, { complete: async (connection, { workspace }) => {
    await repository.insertWorkspaceNodes(connection, workspace, [specialist("unfinished")]);
    return { status: "succeeded", result: selection() };
  } }), error => error.details.code === "WORKSPACE_STEPS_PENDING");
  assert.equal((await get(claim.workspace.id)).steps.length, 1);
});

integration("expired and mismatched confirmations perform no write and preserve the original approval", async () => {
  await create();
  const claim = await repository.claimWorkspaceNode();
  const result = draft();
  const approval = approvalFor(result);
  const pending = await finish(claim, { complete: async () => ({ status: "awaiting_confirmation", result, approval }) });
  let writes = 0;
  const body = { userId: owner, workspaceId: pending.id, revision: pending.revision, operation: "confirm", approvalId: approval.id,
    mutate: async () => { writes++; return { result }; } };
  await assert.rejects(repository.mutateAgentWorkspace({ ...body, approvalId: crypto.randomUUID() }), error => error.details.code === "WORKSPACE_APPROVAL_MISMATCH");
  await query("UPDATE agent_workspaces SET approval = jsonb_set(approval,'{expiresAt}',to_jsonb((clock_timestamp() - INTERVAL '1 second')::text)) WHERE id = ?", [pending.id]);
  await assert.rejects(repository.mutateAgentWorkspace(body), error => error.details.code === "WORKSPACE_APPROVAL_EXPIRED");
  assert.equal(writes, 0);
});

integration("owner deletion cascades all private workspace snapshots and node history", async () => {
  const disposable = crypto.randomUUID();
  await query("INSERT INTO users(id,email,password_hash,display_name,ai_id) VALUES (?, ?, 'isolated-test-only','Delete workspace',?)",
    [disposable, `${disposable}@example.invalid`, String(crypto.randomInt(100000000000, 999999999999))]);
  const { workspace } = await create({ userId: disposable });
  await query("DELETE FROM users WHERE id = ?", [disposable]);
  assert.equal((await query("SELECT id FROM agent_workspaces WHERE id = ?", [workspace.id])).length, 0);
  assert.equal((await query("SELECT id FROM agent_workspace_nodes WHERE workspace_id = ?", [workspace.id])).length, 0);
});

integration("model dispatch receipts persist before calls, are idempotent and exclude provider payloads", async () => {
  await create();
  const claim = await repository.claimWorkspaceNode();
  await assert.rejects(receive(claim), error => error.details.code === "WORKSPACE_MODEL_RECEIPT_MISSING");
  const reserved = await repository.reserveWorkspaceModelCall({ nodeId: claim.node.id, claimToken: claim.node.claimToken });
  assert.equal(reserved.nodeModelCalls, 1);
  const [dispatched] = await query("SELECT model_calls,model_receipts FROM agent_workspace_nodes WHERE id = ?", [claim.node.id]);
  assert.equal(dispatched.model_calls, 1);
  assert.equal(dispatched.model_receipts[0].status, "dispatched");
  assert.ok(dispatched.model_receipts[0].startedAt);
  await assert.rejects(finish(claim), error => error.details.code === "WORKSPACE_MODEL_RESULT_UNKNOWN");
  await assert.rejects(receive(claim, 1, { ...receipt, content: "private provider response" }), { name: "ZodError" });
  const [one, two] = await Promise.all([receive(claim), receive(claim)]);
  assert.deepEqual(one, two);
  assert.equal(one.status, "received");
  await assert.rejects(receive(claim, 1, { ...receipt, latencyMs: 8 }), error => error.details.code === "WORKSPACE_MODEL_RECEIPT_CONFLICT");
  await finish(claim, { result: { decision: { type: "clarify", question: "Choose a page theme" } }, complete: async () => ({ status: "waiting_input", question: "Choose a page theme" }) });
  const view = await get(claim.workspace.id);
  assert.doesNotMatch(JSON.stringify(view), /modelReceipts|isolated-test-provider|tokenUsage|receiptHash/);
});

integration("cancelling work still records already dispatched model receipts but sends no further calls", async () => {
  await create();
  const claim = await repository.claimWorkspaceNode();
  await repository.reserveWorkspaceModelCall({ nodeId: claim.node.id, claimToken: claim.node.claimToken });
  const state = await get(claim.workspace.id);
  await repository.mutateAgentWorkspace({ userId: owner, workspaceId: state.id, revision: state.revision, operation: "cancel" });
  const recorded = await receive(claim, 1, { provider: "isolated-test-provider", tokenUsage: null });
  assert.equal(recorded.status, "received"); assert.equal(recorded.tokenUsage, null);
  await assert.rejects(repository.reserveWorkspaceModelCall({ nodeId: claim.node.id, claimToken: claim.node.claimToken }), error => error.details.code === "WORKSPACE_STATE_CHANGED");
  const cancelled = await finish(claim);
  assert.equal(cancelled.status, "cancelled");
  const [node] = await query("SELECT model_receipts FROM agent_workspace_nodes WHERE id = ?", [claim.node.id]);
  assert.equal(node.model_receipts[0].status, "received");
});

integration("artifact creation in the completion transaction becomes the node handoff atomically", async () => {
  await create();
  await plan(await repository.claimWorkspaceNode(), [specialist("find")]);
  const claim = await repository.claimWorkspaceNode();
  const result = selection();
  const finished = await finish(claim, { complete: async (_connection, { node }) => {
    assert.equal(node.status, "succeeded");
    assert.equal(node.result, null);
    return { nodeResult: result, summary: "Artifact persisted" };
  } });
  assert.deepEqual(finished.steps.find(step => step.key === "find").result, result.artifact);
  const coordinator = await repository.claimWorkspaceNode();
  assert.deepEqual(coordinator.workspace.nodes.find(node => node.key === "find").result, result);
});

integration("lease expiry during a completion transaction rolls back its writes and scheduling", async () => {
  await create();
  const claim = await repository.claimWorkspaceNode();
  await query("UPDATE agent_workspace_nodes SET lease_until = clock_timestamp() + INTERVAL '50 milliseconds' WHERE id = ?", [claim.node.id]);
  await assert.rejects(finish(claim, { complete: async connection => {
    await connection.query("UPDATE users SET display_name = 'Expired completion mutation' WHERE id = ?", [owner]);
    await connection.query("SELECT pg_sleep(0.08)");
    return { status: "waiting_input", question: "Must not commit" };
  } }), error => error.details.code === "WORKSPACE_LEASE_LOST");
  assert.equal((await get(claim.workspace.id)).status, "running");
  assert.equal((await query("SELECT display_name FROM users WHERE id = ?", [owner]))[0].display_name, `Workspace verification ${owner.slice(0, 8)}`);
  await repository.recoverInterruptedWorkspaceNodes();
  assert.equal((await get(claim.workspace.id)).status, "interrupted");
});

integration("submission lookup resolves the original aggregate before mutable private input validation", async () => {
  const args = submission();
  const { workspace } = await withTransaction(connection => repository.createWorkspaceInTransaction(connection, args));
  const found = await withTransaction(connection => repository.findWorkspaceSubmission(connection, args));
  assert.deepEqual(found, workspace);
  await assert.rejects(withTransaction(connection => repository.findWorkspaceSubmission(connection, { ...args, requestHash: "b".repeat(64) })),
    error => error.details.code === "WORKSPACE_IDEMPOTENCY_CONFLICT");
  assert.equal(await withTransaction(connection => repository.findWorkspaceSubmission(connection, { ...args, userId: outsider })), null);
});

integration("model dispatch and its final permission check commit as one transaction", async () => {
  await create();
  const claim = await repository.claimWorkspaceNode();
  let checked = false;
  await assert.rejects(repository.reserveWorkspaceModelCall({ nodeId: claim.node.id, claimToken: claim.node.claimToken,
    authorize: async (connection, current) => {
      checked = true;
      assert.equal(current.workspace.id, claim.workspace.id);
      assert.equal(current.node.id, claim.node.id);
      await connection.query("UPDATE users SET display_name = 'Rejected dispatch mutation' WHERE id = ?", [owner]);
      throw new Error("Current permission check rejected dispatch");
    } }), /Current permission check/);
  assert.equal(checked, true);
  assert.equal((await get(claim.workspace.id)).usage.modelCalls, 0);
  const [node] = await query("SELECT model_calls,model_receipts FROM agent_workspace_nodes WHERE id = ?", [claim.node.id]);
  assert.equal(node.model_calls, 0); assert.deepEqual(node.model_receipts, []);
  assert.equal((await query("SELECT display_name FROM users WHERE id = ?", [owner]))[0].display_name, `Workspace verification ${owner.slice(0, 8)}`);
});

integration("unexpected failure after dispatch retains unknown billing state instead of treating it as safe failure", async () => {
  await create();
  const claim = await repository.claimWorkspaceNode();
  await repository.reserveWorkspaceModelCall({ nodeId: claim.node.id, claimToken: claim.node.claimToken });
  const state = await repository.failWorkspaceNode({ nodeId: claim.node.id, claimToken: claim.node.claimToken,
    error: { code: "AI_EXECUTION_FAILED", message: "The execution ended before a confirmed response was recorded." } });
  assert.equal(state.status, "interrupted");
  assert.equal(state.steps[0].status, "interrupted");
  assert.equal(state.error.code, "WORKSPACE_MODEL_RESULT_UNKNOWN");
  const [node] = await query("SELECT model_receipts FROM agent_workspace_nodes WHERE id = ?", [claim.node.id]);
  assert.equal(node.model_receipts[0].status, "unknown");
  assert.equal(await repository.claimWorkspaceNode(), null);
});

const completedRound = async ({ workspace = null, key = "prose", dependencies = [], pending = false } = {}) => {
  if (!workspace) workspace = (await create()).workspace;
  const first = await repository.claimWorkspaceNode();
  assert.equal(first.workspace.id, workspace.id);
  await plan(first, [{ key, dependencies, agentId: "miaoxun-butler", agentVersion: "0.2.0",
    capability: "text.synthesize", goal: `Write ${key}`, contextRefIndexes: [] }]);
  const author = await repository.claimWorkspaceNode();
  const result = pending ? { ...draft(), resultKey: key } : {
    artifact: { kind: "text_result", title: `Result ${key}`, content: `Only isolated integration prose ${key}` }, resultKey: key,
    sourceReferences: [],
  };
  await finish(author, { result });
  const coordinator = await repository.claimWorkspaceNode();
  return finish(coordinator, { complete: async () => ({ status: pending ? "awaiting_confirmation" : "succeeded", result,
    summary: `Delivered ${key}`, ...(pending ? { approval: approvalFor(result) } : {}) }) });
};
const continueRound = (workspace, overrides = {}) => ({ userId: owner, workspaceId: workspace.id,
  revision: workspace.revision, operation: "continue", text: "Keep the existing content and refine its ending",
  idempotencyKey: crypto.randomUUID(), mutate: async () => ({}), ...overrides });

integration("owner continuation persists distinct rounds and exactly one acceptance across retries and later operations", async () => {
  const first = await completedRound();
  const [original] = await query("SELECT goal,context_refs,authority,usage,created_at FROM agent_workspaces WHERE id=?", [first.id]);
  await query("UPDATE agent_workspaces SET deadline_at=clock_timestamp()-INTERVAL '1 day' WHERE id=?", [first.id]);
  let authorized = 0, replays = 0;
  const body = continueRound(first, { mutate: async (_connection, old) => {
    authorized++;
    assert.equal(old.currentRound, 1);
    assert.equal(old.rounds[0].result.artifact.content, "Only isolated integration prose prose");
    return {};
  }, authorizeReplay: async () => { replays++; } });
  const [second, duplicate] = await Promise.all([repository.mutateAgentWorkspace(body), repository.mutateAgentWorkspace(body)]);
  assert.equal(second.id, first.id);
  assert.equal(duplicate.currentRound, 2);
  assert.equal(authorized, 1); assert.equal(replays, 1);
  assert.equal(second.status, "queued"); assert.equal(second.result, null); assert.equal(second.approval, null);
  assert.equal(second.currentRound, 2);
  assert.equal(second.rounds[0].status, "succeeded");
  assert.deepEqual(second.rounds[0].result, first.result);
  assert.equal(second.rounds[0].resultNodeId, first.result.id);
  assert.equal(second.rounds[1].baseResultNodeId, first.result.id);
  assert.equal(second.rounds[1].instruction, body.text);
  assert.ok(second.rounds[0].completedAt); assert.equal(second.rounds[1].completedAt, null);
  assert.doesNotMatch(JSON.stringify(second), /Only isolated integration prose/);
  assert.deepEqual(second.steps.filter(node => node.round === 1), first.steps);
  assert.equal(second.steps.filter(node => node.round === 2).length, 1);
  assert.equal(second.steps.at(-1).goal, body.text);
  const [after] = await query("SELECT goal,context_refs,authority,usage,created_at,deadline_at>clock_timestamp() AS fresh FROM agent_workspaces WHERE id=?", [first.id]);
  assert.deepEqual({ ...after, fresh: undefined }, { ...original, fresh: undefined }); assert.equal(after.fresh, true);

  const delivered = await completedRound({ workspace: second, key: "prose-v2", dependencies: ["prose"] });
  assert.equal(delivered.rounds[1].resultNodeId, delivered.result.id);
  assert.deepEqual(delivered.rounds[1].result, delivered.result);
  assert.equal(delivered.rounds[1].status, delivered.status);
  assert.equal(delivered.rounds[1].summary, delivered.summary);
  const third = await repository.mutateAgentWorkspace(continueRound(delivered, { text: "Add a concise opening" }));
  assert.equal(third.currentRound, 3);
  const replayed = await repository.mutateAgentWorkspace(body);
  assert.equal(replayed.currentRound, 3); assert.equal(replayed.revision, third.revision);
  assert.equal(authorized, 1); assert.equal(replays, 2);
  assert.equal((await query("SELECT count(*)::int AS count FROM agent_workspace_continuations WHERE workspace_id=?", [first.id]))[0].count, 2);
  assert.equal((await query("SELECT count(*)::int AS count FROM agent_workspace_nodes WHERE workspace_id=? AND status='queued'", [first.id]))[0].count, 1);
  await assert.rejects(repository.mutateAgentWorkspace({ ...body, text: "Different request" }), error => error.details.code === "WORKSPACE_IDEMPOTENCY_CONFLICT");
  await assert.rejects(repository.mutateAgentWorkspace({ ...body, authorizeReplay: async () => { throw Object.assign(new Error("revoked"), { code: "REVOKED" }); } }), { code: "REVOKED" });
});

integration("concurrent different continuation keys cannot open two rounds from the same revision", async () => {
  const first = await completedRound();
  const outcomes = await Promise.allSettled([repository.mutateAgentWorkspace(continueRound(first)), repository.mutateAgentWorkspace(continueRound(first))]);
  assert.equal(outcomes.filter(item => item.status === "fulfilled").length, 1);
  assert.equal(outcomes.find(item => item.status === "rejected").reason.details.code, "WORKSPACE_REVISION_CONFLICT");
  const current = await get(first.id);
  assert.equal(current.currentRound, 2); assert.equal(current.rounds.length, 2);
  await assert.rejects(repository.mutateAgentWorkspace(continueRound(first, { userId: outsider })), error => error.status === 404);
});

integration("continuing a pending page invalidates its old approval while preserving the old delivery", async () => {
  const first = await completedRound({ pending: true });
  const next = await repository.mutateAgentWorkspace(continueRound(first));
  assert.equal(next.rounds[0].status, "awaiting_confirmation"); assert.ok(next.rounds[0].completedAt);
  assert.deepEqual(next.rounds[0].result, first.result);
  assert.equal(next.approval, null); assert.equal(next.result, null);
  assert.equal(Object.hasOwn(next.rounds[0], "approval"), false);
  const stored = await withTransaction(connection => repository.readOwnedWorkspaceRecord(connection, { userId: owner, workspaceId: first.id }));
  assert.deepEqual(stored.rounds[0].approval, first.approval);
  assert.equal(stored.rounds[1].approval, null);
  let saves = 0;
  await assert.rejects(repository.mutateAgentWorkspace({ userId: owner, workspaceId: first.id, revision: first.revision,
    operation: "confirm", approvalId: first.approval.id, mutate: async () => { saves++; return {}; } }), error => error.details.code === "WORKSPACE_REVISION_CONFLICT");
  assert.equal(saves, 0);
});

integration("continuation authorization and state validation roll back every new round, receipt and queued step", async () => {
  const first = await completedRound();
  const body = continueRound(first);
  await assert.rejects(repository.mutateAgentWorkspace({ ...body, mutate: async () => { throw Object.assign(new Error("revoked"), { code: "REVOKED" }); } }), { code: "REVOKED" });
  await assert.rejects(repository.mutateAgentWorkspace({ ...body, mutate: async () => ({ result: { artifact: { kind: "text_result", title: "forged", content: "not a real delivery" } } }) }), /may not replace/);
  assert.deepEqual(await get(first.id), first);
  assert.equal((await query("SELECT count(*)::int AS count FROM agent_workspace_continuations WHERE workspace_id=?", [first.id]))[0].count, 0);
  const accepted = await repository.mutateAgentWorkspace(body);
  await assert.rejects(repository.mutateAgentWorkspace(continueRound(accepted)), error => error.details.code === "WORKSPACE_STATE_CHANGED");
  const cancelled = await repository.mutateAgentWorkspace({ userId: owner, workspaceId: first.id, revision: accepted.revision, operation: "cancel" });
  await assert.rejects(repository.mutateAgentWorkspace(continueRound(cancelled)), error => error.details.code === "WORKSPACE_STATE_CHANGED");
});

integration("round ownership and node membership constraints reject cross-workspace history", async () => {
  const first = await completedRound();
  await repository.mutateAgentWorkspace(continueRound(first));
  const other = await create();
  const otherNode = other.workspace.steps[0].id;
  await assert.rejects(query("UPDATE agent_workspace_rounds SET base_result_node_id=? WHERE workspace_id=? AND round_number=2", [otherNode, first.id]), error => error.code === "23503");
  await assert.rejects(query("UPDATE agent_workspace_nodes SET round_number=99 WHERE id=?", [first.result.id]), error => error.code === "23503");
  await assert.rejects(query("UPDATE agent_workspace_rounds SET user_id=? WHERE workspace_id=? AND round_number=2", [outsider, first.id]), error => error.code === "23503");
});

integration("confirmed page approval remains private audit history after a later revision starts", async () => {
  const pending = await completedRound({ pending: true });
  const saved = await repository.mutateAgentWorkspace({ userId: owner, workspaceId: pending.id,
    revision: pending.revision, operation: "confirm", approvalId: pending.approval.id, mutate: async () => ({}) });
  assert.equal(saved.approval, null);
  assert.equal(Object.hasOwn(saved.rounds[0], "approval"), false);
  const continued = await repository.mutateAgentWorkspace(continueRound(saved));
  assert.equal(continued.approval, null);
  const record = await withTransaction(connection => repository.readOwnedWorkspaceRecord(connection, { userId: owner, workspaceId: pending.id }));
  assert.deepEqual(record.rounds[0].approval, pending.approval);
  assert.equal(record.rounds[1].approval, null);
});
