import assert from "node:assert/strict";
import crypto from "node:crypto";
import test from "node:test";
import { runAgent } from "../src/agent-runtime.js";
import { config } from "../src/config.js";
import { messageSchema } from "../src/schemas.js";
import { messageRequestFingerprint } from "../src/message-request.js";
import { publicMessage } from "../src/public-message.js";

test("selected contribution selectors are strict, fingerprinted and public without private reply", () => {
  const workspaceContext = { id: crypto.randomUUID(), revision: 4, currentRound: 1, nodeId: crypto.randomUUID() };
  const input = { content: "解释这一镜头", clientMessageId: crypto.randomUUID(), workspaceContext };
  const body = messageSchema.parse(input);
  assert.deepEqual(body.workspaceContext, workspaceContext);
  assert.notEqual(messageRequestFingerprint(body), messageRequestFingerprint({ ...body, workspaceContext: { ...workspaceContext, nodeId: crypto.randomUUID() } }));
  assert.equal(messageSchema.safeParse({ ...input, workspaceContext: { ...workspaceContext, content: "forged" } }).success, false);
  const published = publicMessage({ senderType: "agent", content: "协作讨论已回复", metadata: {
    workspaceContext: { ...workspaceContext, goal: "选定任务" },
    workspaceContributionDiscussion: { reply: "private-derived-answer", sourceHash: "private-hash" },
  } });
  assert.equal(published.metadata.contributionDiscussion.state, "available");
  assert.doesNotMatch(JSON.stringify(published), /private-/);
});

test("specialist contribution discussion uses selected text only and never tools or dispatch", async t => {
  const previous = config.newApi;
  config.newApi = { ...previous, baseUrl: "https://provider.invalid/v1", apiKey: "isolated-test-key", model: "contribution-test", timeoutMs: 1000 };
  t.after(() => { config.newApi = previous; });
  let calls = 0;
  t.mock.method(globalThis, "fetch", async (_url, options) => {
    calls++;
    const body = JSON.parse(options.body);
    assert.equal(body.tools, undefined);
    assert.equal(body.response_format, undefined);
    const system = body.messages.find(item => item.role === "system").content;
    assert.match(system, /只讨论选中贡献/);
    assert.match(system, /不能.*执行/);
    assert.match(JSON.stringify(body), /selected-verified-body/);
    assert.doesNotMatch(JSON.stringify(body), /other-private-chat/);
    return new Response(JSON.stringify({ choices: [{ finish_reason: "stop", message: { content: "镜头表达的是等待。" } }] }));
  });
  const args = { agentId: "comic-diary", mode: "chat", input: "为什么这样安排", user: null,
    messages: [], appContext: { contributionDiscussion: { goal: "虚构修伞故事", language: "zh-CN", contribution: { title: "分镜", content: "selected-verified-body" } } } };
  assert.match((await runAgent(args)).reply, /等待/);
  for (const change of [{ tools: {} }, { mode: "dispatch" },
    { appContext: { ...args.appContext, resolvedReferences: [{ content: "other-private-chat" }] } },
    { appContext: { contributionDiscussion: { ...args.appContext.contributionDiscussion, unregistered: true } } }]) {
    await assert.rejects(runAgent({ ...args, ...change }), error => error.status === 422);
  }
  assert.equal(calls, 1);
});
