import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { getAgent, listAgents } from "../registry.js";
import { specialistDispatchVersion } from "../specialist-dispatch.js";

const specialistIds = ["album-manager", "comic-diary", "file-preprocessor", "model-3d", "site-builder", "video-production", "virtual-character"];
const contextFor = agent => ({
  agent: { id: agent.key, name: agent.name },
  capabilities: agent.workspaceCapabilities.map(capability => ({ ...capability, agentId: agent.key, agentVersion: agent.version })),
  requestMessages: [{ content: "请整理本次明确提供的文字。" }],
  pendingContextMissing: false,
  contextReset: false,
});

test("only registered specialist executors add explicit dispatch without changing their legacy modes", async () => {
  const all = await listAgents();
  assert.deepEqual(all.filter(agent => agent.key !== "miaoxun-butler" && agent.runtimeModes.includes("dispatch")).map(agent => agent.key), specialistIds);
  for (const key of specialistIds) {
    const agent = await getAgent(key);
    assert.equal(typeof agent.dispatch, "function");
    assert.ok(typeof agent.chat === "function" || key === "album-manager");
    assert.ok(typeof agent.plan === "function" || typeof agent.contribute === "function");
    await assert.rejects(agent.dispatch({ input: "执行" }), /authenticated conversation/);
    await assert.rejects(agent.dispatch({ input: "执行", appContext: { specialistDispatch: { ...contextFor(agent), agent: { id: "another-agent" } } } }), /authenticated conversation/);
  }
});

test("specialist request mode separates consultation history from the exact user request payload", async () => {
  const agent = await getAgent("file-preprocessor");
  const context = contextFor(agent);
  const plan = await agent.dispatch({
    input: "请整理本次明确提供的文字。",
    user: { displayName: "PRIVATE_PROFILE" },
    thread: { title: "PRIVATE_THREAD" },
    messages: [
      { senderType: "user", content: "仅用于专业咨询的旧消息" },
      { senderType: "agent", content: "RECALLED_SECRET", recalledAt: "2026-10-20T00:00:00Z" },
    ],
    appContext: {
      profile: { bio: "PRIVATE_PROFILE" }, ownedAgents: [{ id: "PRIVATE_AGENT" }],
      client: { language: "en", currentPage: "PRIVATE_PAGE", enabledAgentIds: ["PRIVATE_AGENT"] },
      specialistDispatch: {
        ...context, ownerId: "PRIVATE_OWNER", authority: "PRIVATE_AUTHORITY",
        requestMessages: [{ ...context.requestMessages[0], id: "PRIVATE_MESSAGE" }],
        capabilities: context.capabilities.map(item => ({ ...item, privateField: "PRIVATE_SCOPE" })),
      },
    },
  });
  const payload = JSON.parse(plan.user);
  assert.equal(payload.language, "en");
  assert.equal(payload.specialistDispatch.version, specialistDispatchVersion);
  assert.deepEqual(payload.specialistDispatch.requestMessages, context.requestMessages);
  assert.deepEqual(plan.history, [{ role: "user", content: "仅用于专业咨询的旧消息" }]);
  assert.doesNotMatch(plan.user, /仅用于专业咨询|PRIVATE_|RECALLED_SECRET/);
  assert.doesNotMatch(JSON.stringify(plan), /PRIVATE_|RECALLED_SECRET/);
  assert.equal(Object.hasOwn(plan, "tools"), false);
  assert.match(plan.system, /不能返回整理后的goal/);
  assert.match(plan.system, /普通消息不会自动选择或续作上一个任务/);
});

test("all versioned synthetic cases preserve exact input and declare a real specialist executor", async () => {
  const cases = (await readFile(new URL("../evals/specialist/dispatch-v1.jsonl", import.meta.url), "utf8")).trim().split("\n").map(JSON.parse);
  assert.equal(cases.length, 22);
  assert.equal(new Set(cases.map(item => item.id)).size, cases.length);
  for (const item of cases) {
    const agent = await getAgent(item.input.agentId);
    const context = { ...contextFor(agent), contextReset: item.input.contextReset === true,
      requestMessages: [{ content: item.input.content }] };
    const plan = await agent.dispatch({ input: item.input.content, messages: item.input.history || [],
      appContext: { client: { language: item.input.language }, specialistDispatch: context } });
    const payload = JSON.parse(plan.user);
    assert.equal(payload.input, item.input.content, item.id);
    assert.deepEqual(payload.specialistDispatch.requestMessages, context.requestMessages, item.id);
    assert.equal(payload.specialistDispatch.contextReset, context.contextReset, item.id);
    assert.ok(item.tags.length && item.rubric.length >= 3, item.id);
    if (item.expected.type === "workspace") assert.ok(agent.workspaceCapabilities.some(entry => entry.capability === item.expected.capability), item.id);
  }
});
