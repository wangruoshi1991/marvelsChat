import assert from "node:assert/strict";
import crypto from "node:crypto";
import test from "node:test";
import { getAgent } from "../../agents/registry.js";
import { listExecutableWorkspaceCapabilities } from "../src/agent-workspace-capabilities.js";
import { validateSpecialistDispatch, specialistRequestSource } from "../src/specialist-dispatch.js";
import { messageSchema } from "../src/schemas.js";
import { messageRequestFingerprint } from "../src/message-request.js";
import { publicMessage } from "../src/public-message.js";

const agent = await getAgent("file-preprocessor");
const capabilities = listExecutableWorkspaceCapabilities({ registeredAgents: [agent], grants: [{ agentId: agent.key,
  enabled: true, grantedScopes: agent.permissions }] });
const context = { agentId: agent.key, capabilities };

test("specialist dispatch accepts consultation, clarification and only its own real executor", () => {
  for (const decision of [{ type: "reply", reply: "可以讨论摘要结构。" }, { type: "clarify", question: "请提供要整理的原文。" },
    { type: "workspace", capability: "text.summarize" }]) {
    assert.deepEqual(validateSpecialistDispatch(JSON.stringify(decision), context), decision);
  }
  const literal = JSON.stringify({ title: "Example", summary: "Literal JSON", frames: [] });
  assert.equal(validateSpecialistDispatch({ type: "reply", reply: literal }, context).reply, literal);
});

test("specialist classifier cannot rewrite a goal, impersonate an Agent or expand authority", () => {
  for (const decision of ["ordinary text", null, [], { type: "workspace", capability: "site.compose" },
    { type: "workspace", capability: "text.summarize", agentId: agent.key },
    { type: "workspace", capability: "text.summarize", goal: "invented from private history" },
    { type: "workspace", capability: "text.summarize", contextRefs: [] },
    { type: "workspace", capability: "text.summarize", permissions: ["all"] },
    { type: "reply", reply: "", capability: "text.summarize" },
    { type: "clarify", question: "Choose?", operation: "continue" }]) {
    assert.throws(() => validateSpecialistDispatch(decision, context), error => error.details.code === "SPECIALIST_DISPATCH_INVALID");
  }
  assert.throws(() => validateSpecialistDispatch({ type: "workspace", capability: "text.summarize" },
    { agentId: "site-builder", capabilities }), error => error.status === 502);
});

test("professional resets are explicit semantic input and cannot be mixed with other workflows", () => {
  const input = messageSchema.parse({ content: "A new request", clientMessageId: crypto.randomUUID() });
  assert.notEqual(messageRequestFingerprint({ ...input, agentContextReset: true }), messageRequestFingerprint(input));
  assert.equal(messageRequestFingerprint({ ...input, agentContextReset: false }), messageRequestFingerprint(input));
  const selector = { id: crypto.randomUUID(), revision: 1, currentRound: 1 };
  for (const value of [true, false]) {
    assert.equal(messageSchema.safeParse({ ...input, agentContextReset: value, butlerContextReset: false }).success, false);
    assert.equal(messageSchema.safeParse({ ...input, agentContextReset: value, workspaceContext: selector }).success, false);
  }
  assert.deepEqual(specialistRequestSource(input), { currentPage: "messages.agent" });
  assert.throws(() => specialistRequestSource({ clientContext: { currentPage: "x".repeat(81) } }), error => error.status === 400);
});

test("public specialist metadata exposes only workflow markers and explicitly selected context", () => {
  const metadata = publicMessage({ metadata: { agentDispatch: { version: 1, kind: "clarify", provider: "private" },
    agentContextReset: true, agentWorkspace: { id: "workspace", origin: "private" },
    agentClarification: { requestMessageIds: ["private-user-input"], contextRefs: [], source: { currentPage: "messages.agent", extra: "private" } },
    specialistMessage: { version: 1, mode: "dispatch", state: "dispatched", history: ["private"], authorityCeiling: ["private"] },
  } }).metadata;
  assert.deepEqual(metadata, { agentDispatch: { version: 1, kind: "clarify" }, agentContextReset: true,
    agentWorkspace: { id: "workspace" }, agentClarification: { contextRefs: [], source: { currentPage: "messages.agent" } } });
  assert.doesNotMatch(JSON.stringify(metadata), /private|requestMessageIds|specialistMessage/);
  for (const agentDispatch of [{ version: 2, kind: "reply" }, { version: 1, kind: "execute" }, { version: 1 }]) {
    assert.equal(publicMessage({ metadata: { agentDispatch } }).metadata.agentDispatch, undefined);
  }
});
