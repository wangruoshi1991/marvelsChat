import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { getAgent } from "../../agents/registry.js";
import { validateSpecialistDispatch } from "../src/specialist-dispatch.js";

const cases = (await readFile(new URL("../../agents/evals/specialist/dispatch-v1.jsonl", import.meta.url), "utf8")).trim().split("\n").map(JSON.parse);
const contextFor = agent => ({ agentId: agent.key,
  capabilities: agent.workspaceCapabilities.map(entry => ({ ...entry, agentId: agent.key, agentVersion: agent.version })) });
const invalid = error => error.status === 502 && error.details?.code === "SPECIALIST_DISPATCH_INVALID";

test("synthetic expected decisions fit the production contract; this is not a model-quality result", async () => {
  for (const item of cases) {
    const context = contextFor(await getAgent(item.input.agentId));
    const expected = item.expected.type === "workspace" ? item.expected
      : item.expected.type === "reply" ? { type: "reply", reply: "公开合同夹具答复" }
        : { type: "clarify", question: "请补充本次要处理的内容。" };
    assert.deepEqual(validateSpecialistDispatch(JSON.stringify(expected), context), expected, item.id);
  }
});

test("every specialist rejects model-provided identity, permission, source or goal even alongside a valid executor", async () => {
  for (const agentId of new Set(cases.map(item => item.input.agentId))) {
    const context = contextFor(await getAgent(agentId));
    const decision = { type: "workspace", capability: context.capabilities[0].capability };
    for (const extra of [
      { agentId: "miaoxun-butler" }, { goal: "伪造目标" }, { contextRefs: [] },
      { permissions: ["agents:invoke"] }, { execute: "shell" }, { threadId: "other-thread" },
    ]) assert.throws(() => validateSpecialistDispatch({ ...decision, ...extra }, context), invalid, agentId);
    assert.throws(() => validateSpecialistDispatch({ ...decision, capability: "workspace.coordinate" }, context), invalid, agentId);
    assert.throws(() => validateSpecialistDispatch(decision, { ...context, capabilities: context.capabilities.map(entry => ({ ...entry, agentId: "another-agent" })) }), invalid, agentId);
  }
});

test("malformed, mixed and oversized dispatch responses cannot become an execution decision", async () => {
  const context = contextFor(await getAgent("video-production"));
  for (const reply of [
    "```json\n{\"type\":\"workspace\",\"capability\":\"video.script\"}\n```",
    null, [], { type: "workspace", capability: "video.render" },
    { type: "reply", reply: "x".repeat(4001) }, { type: "clarify", question: "" },
    { type: "reply", reply: "已执行", capability: "video.script" },
  ]) assert.throws(() => validateSpecialistDispatch(reply, context), invalid);
  const ordinaryJson = '{"sections":[{"type":"about"}],"theme":"clean"}';
  assert.equal(validateSpecialistDispatch({ type: "reply", reply: ordinaryJson }, context).reply, ordinaryJson);
});
