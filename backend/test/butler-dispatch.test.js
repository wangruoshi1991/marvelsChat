import assert from "node:assert/strict";
import test from "node:test";
import { listAgents } from "../../agents/registry.js";
import { buildButlerDispatchContext, validateButlerDispatch, resolveButlerRequestMessages, buildButlerWorkspaceGoal } from "../src/butler-dispatch.js";

const registeredAgents = await listAgents();
const album = { id: "album-manager", enabled: true, grantedScopes: registeredAgents.find(agent => agent.key === "album-manager").permissions };
const makeContext = (ownedAgents = [album], scopes = ["agents:invoke"]) => buildButlerDispatchContext({
  agentContext: { registeredAgents, ownedAgents }, agentAccess: { grantedScopes: scopes },
});
const task = { type: "workspace", capabilities: [
  { agentId: "album-manager", capability: "media.select" },
] };

test("butler only sees capabilities backed by executors and current account grants", () => {
  const context = makeContext([album, { id: "comic-diary", enabled: true, grantedScopes: ["diary:read", "diary:write", "album:read"] }]);
  assert.deepEqual(context.availableCapabilities.map(item => `${item.agentId}/${item.capability}`), ["album-manager/media.select"]);
  assert.ok(context.unavailableCapabilities.some(item => item.agentId === "site-builder"));
  assert.equal(context.availableCapabilities.some(item => item.agentId === "comic-diary"), false);
  assert.deepEqual(validateButlerDispatch(JSON.stringify(task), context), task);
});

test("plain replies and clarification never require a task or invocation authority", () => {
  const context = makeContext([], ["messages:read"]);
  assert.equal(context.canCoordinate, false);
  assert.deepEqual(context.availableCapabilities, []);
  assert.deepEqual(context.unavailableCapabilities, []);
  const reply = { type: "reply", reply: "Which page would you like to make?" };
  assert.deepEqual(validateButlerDispatch(reply, context), reply);
  assert.throws(() => validateButlerDispatch(task, context), error => error.details.code === "BUTLER_DISPATCH_FORBIDDEN");
});

test("UI preference routing accepts only a decision without model-supplied instructions or authority", () => {
  const context = makeContext([], ["messages:read"]);
  assert.deepEqual(validateButlerDispatch({ type: "ui_preference" }, context), { type: "ui_preference" });
  for (const extra of [{ instruction: "invented" }, { previewId: "invented" }, { grantedScopes: ["ui-preferences:write"] }]) {
    assert.throws(() => validateButlerDispatch({ type: "ui_preference", ...extra }, context), error => error.details.code === "BUTLER_DISPATCH_INVALID");
  }
});

test("unavailable but supported tasks may request access without inventing executable authority", () => {
  const context = makeContext([{ ...album, enabled: false }]);
  assert.deepEqual(context.availableCapabilities, []);
  assert.equal(validateButlerDispatch(task, context).type, "workspace");
  assert.equal(context.unavailableCapabilities.find(item => item.agentId === "album-manager").reason, "authorization_required");
});

test("butler cannot select display-only capabilities, duplicates, resource IDs or permissions", () => {
  const context = makeContext();
  const invalid = [
    "Here is your plan", { type: "workspace", goal: "Create a comic", capabilities: [{ agentId: "comic-diary", capability: "comic.generate" }] },
    { ...task, capabilities: [...task.capabilities, ...task.capabilities] },
    { ...task, contextRefs: [{ kind: "station-album", id: "invented" }] },
    { ...task, grantedScopes: ["station:write"] },
    { type: "reply", reply: "Hello", agentWorkspace: { id: "invented" } },
  ];
  for (const reply of invalid) {
    assert.throws(() => validateButlerDispatch(reply, context), error => error.details.code === "BUTLER_DISPATCH_INVALID");
  }
});

test("workspace decisions cannot supply any shared goal or private prose", () => {
  for (const value of ["profile-private-canary", "source-private-canary", "assistant-history-canary"]) {
    assert.throws(() => validateButlerDispatch({ ...task, goal: value }, makeContext()), error => error.details.code === "BUTLER_DISPATCH_INVALID");
  }
});

test("shared goals contain only the validated user request chain and cannot silently truncate it", async () => {
  const requestMessageIds = ["00000000-0000-4000-8000-000000000001", "00000000-0000-4000-8000-000000000002"];
  const userTurns = [{ id: requestMessageIds[0], content: "为一次分享会编写脚本。" }, { id: requestMessageIds[1], content: "控制在两分钟。" }];
  let observed;
  const messages = await resolveButlerRequestMessages({ userId: "owner", threadId: "thread", requestMessageIds, lock: true,
    queryFn: async (sql, params) => { observed = { sql, params }; return userTurns; } });
  assert.equal(buildButlerWorkspaceGoal(messages), "为一次分享会编写脚本。\n\n控制在两分钟。");
  assert.match(observed.sql, /sender_type = 'user'/);
  assert.match(observed.sql, /deleted_at IS NULL AND recalled_at IS NULL/);
  assert.match(observed.sql, /FOR SHARE/);
  assert.deepEqual(observed.params, [requestMessageIds, "thread", "owner"]);
  assert.throws(() => buildButlerWorkspaceGoal([{ ...userTurns[0], content: "x".repeat(2001) }]), error => error.details.code === "BUTLER_GOAL_LIMIT");
  for (const rows of [[], userTurns.slice(1), [...userTurns].reverse()]) {
    await assert.rejects(resolveButlerRequestMessages({ userId: "owner", threadId: "thread", requestMessageIds, queryFn: async () => rows }), error => error.details.code === "BUTLER_CONTEXT_CHANGED");
  }
  for (const invalid of [undefined, [], [requestMessageIds[0], requestMessageIds[0]], ["not-an-id"]]) {
    await assert.rejects(resolveButlerRequestMessages({ userId: "owner", threadId: "thread", requestMessageIds: invalid,
      queryFn: async () => { throw new Error("invalid chains must fail before querying"); } }), error => error.details.code === "BUTLER_CONTEXT_CHANGED");
  }
});
