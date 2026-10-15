import assert from "node:assert/strict";
import test from "node:test";
import { validateWorkspaceDecision } from "../src/agent-workspace-plan.js";
import { workspaceAccessInputRequest, workspaceInputRequest } from "../src/agent-workspace-input-request.js";

const unavailable = [{ agentId: "site-builder", agentName: "建站 Agent", capability: "site.compose",
  requiredScopes: ["profile:read", "station:read", "station:write", "album:read"], reason: "authorization_required", description: "创建页面" }];
const request = { type: "request_access", summary: "创建所需页面需要建站能力",
  capabilities: [{ agentId: "site-builder", capability: "site.compose" }] };
const context = { workspace: { nodes: [], contextRefs: [] }, catalogue: [], unavailableCapabilities: unavailable };
const validate = (candidate, options = context) => validateWorkspaceDecision(candidate, options);
const invalid = error => error.details?.code === "WORKSPACE_PLAN_INVALID";

test("access requests select exact unavailable capabilities; all scopes and actions come from the server", () => {
  const decision = validate(request);
  assert.deepEqual(decision.requirements, unavailable.map(({ description: _description, ...item }) => item));
  const input = workspaceAccessInputRequest(decision);
  assert.equal(input.kind, "agent_access");
  assert.equal(input.reason, "authorization_required");
  assert.equal(input.nextAction, "manage_agents_then_restart");
  assert.match(input.question, /我 → 我的 Agent/);
  assert.match(input.question, /新建任务/);
  for (const extra of [{ nextAction: "restart" }, { question: "Grant everything" }, { requiredScopes: ["files:read"] }, { reason: "new_task_required" }]) {
    assert.throws(() => validate({ ...request, ...extra }), invalid);
  }
});

test("unsupported, duplicate and already available access requests fail closed", () => {
  for (const capabilities of [[], [request.capabilities[0], request.capabilities[0]], [{ agentId: "tickets", capability: "tickets.buy" }],
    [{ ...request.capabilities[0], granted: true }]]) assert.throws(() => validate({ ...request, capabilities }), invalid);
  assert.throws(() => validate(request, { ...context, catalogue: [unavailable[0]] }), invalid);
  assert.throws(() => validate(request, { ...context, unavailableCapabilities: [{ ...unavailable[0], requiredScopes: ["album:read", "album:read"] }] }), invalid);
});

test("an unrelated unavailable capability never blocks an otherwise valid plan or genuine clarification", () => {
  const selected = { agentId: "album-manager", capability: "media.select", agentVersion: "1.0.0", inputKinds: [], dependencyKinds: [], outputKind: "media_selection" };
  const decision = validate({ type: "plan", summary: "查找照片", steps: [{ key: "select", agentId: selected.agentId,
    capability: selected.capability, goal: "查找照片", dependsOn: [], contextRefIndexes: [] }] }, { ...context, catalogue: [selected] });
  assert.equal(decision.type, "plan");
  assert.equal(validate({ type: "clarify", question: "你想找哪一天的照片？" }).type, "clarify");
});

test("immutable snapshots produce new-task recovery without another authorization action", () => {
  const decision = validate(request, { ...context, unavailableCapabilities: [{ ...unavailable[0], reason: "new_task_required" }] });
  const input = workspaceAccessInputRequest(decision);
  assert.equal(input.reason, "new_task_required");
  assert.equal(input.nextAction, "restart");
  assert.match(input.question, /已授权/);
  const nodes = [{ capability: "workspace.coordinate", status: "succeeded", result: { decision } }];
  assert.deepEqual(workspaceInputRequest({ status: "waiting_input", question: input.question }, nodes), input);
});

test("current requests must match the latest completed coordinator and disappear in terminal states", () => {
  const old = { capability: "workspace.coordinate", status: "succeeded", result: { decision: validate(request) } };
  const current = { capability: "workspace.coordinate", status: "succeeded", result: { decision: { type: "clarify", question: "哪种风格？" } } };
  const row = { status: "waiting_input", question: "哪种风格？" };
  assert.deepEqual(workspaceInputRequest(row, [old, current]), { kind: "clarification", question: row.question });
  assert.throws(() => workspaceInputRequest(row, [current, old]), /does not match/);
  assert.throws(() => workspaceInputRequest(row, []), /latest coordinator/);
  assert.throws(() => workspaceInputRequest(row, [{ ...current, result: { decision: { type: "complete" } } }]), /latest coordinator/);
  for (const status of ["queued", "running", "succeeded", "failed", "interrupted", "cancelling", "cancelled"]) {
    assert.equal(workspaceInputRequest({ ...row, status }, [old, current]), null);
  }
});
