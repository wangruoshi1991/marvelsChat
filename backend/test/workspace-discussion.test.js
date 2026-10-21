import assert from "node:assert/strict";
import crypto from "node:crypto";
import test from "node:test";
import { messageSchema } from "../src/schemas.js";
import { messageRequestFingerprint } from "../src/message-request.js";
import { publicMessage } from "../src/public-message.js";
import { assertDiscussionReply } from "../src/workspace-discussion-service.js";
import { runAgent } from "../src/agent-runtime.js";
import { resolveAgentModelRole } from "../src/agent-model-config.js";
import { config } from "../src/config.js";

const selector = { id: crypto.randomUUID(), revision: 5, currentRound: 2 };
const input = { content: "继续讨论原任务的修改建议", clientMessageId: crypto.randomUUID(), workspaceContext: selector };

test("linked discussion accepts only a stable strict selector and rejects mixed workflows", () => {
  assert.deepEqual(messageSchema.parse(input).workspaceContext, selector);
  for (const override of [
    { clientMessageId: undefined }, { workspaceContext: { ...selector, goal: "invented" } },
    { workspaceContext: { ...selector, scopes: ["all"] } }, { workspaceContext: { ...selector, id: "fake" } },
    { workspaceContext: { ...selector, revision: 0 } }, { workspaceContext: { ...selector, currentRound: 1.2 } },
    { workspaceContext: { ...selector, revision: Number.MAX_SAFE_INTEGER + 1 } },
    { replyToMessageId: crypto.randomUUID() }, { butlerContextReset: true }, { butlerContextReset: false },
    { contextRefs: [{ kind: "chat-message", id: crypto.randomUUID() }] },
  ]) assert.equal(messageSchema.safeParse({ ...input, ...override }).success, false, JSON.stringify(override));
});

test("workspace selectors are semantic while historical unlinked message hashes stay byte-for-byte compatible", () => {
  const body = messageSchema.parse(input);
  const fingerprint = messageRequestFingerprint(body);
  for (const change of [{ id: crypto.randomUUID() }, { revision: 6 }, { currentRound: 3 }]) {
    assert.notEqual(messageRequestFingerprint({ ...body, workspaceContext: { ...selector, ...change } }), fingerprint);
  }
  assert.equal(messageRequestFingerprint({ ...body, workspaceContext: { currentRound: 2, revision: 5, id: selector.id } }), fingerprint);
  assert.equal(messageRequestFingerprint({ ...body, clientContext: { profileSnapshot: { nickname: "Untrusted" } } }), fingerprint);
  const old = messageSchema.parse({ content: "Existing text" });
  assert.equal(messageRequestFingerprint(old), crypto.createHash("sha256").update(JSON.stringify(["Existing text", null])).digest("hex"));
});

test("public messages expose only the original workspace selector and server goal", () => {
  const metadata = publicMessage({ metadata: { workspaceContext: { ...selector, goal: "Server goal", authority: "private" },
    workspaceDiscussion: { history: [{ id: "private", hash: "private" }], failure: { code: "private" } }, requestFingerprint: "private" } }).metadata;
  assert.deepEqual(metadata, { workspaceContext: { ...selector, goal: "Server goal" } });
  for (const invalid of [{ ...selector }, { ...selector, goal: "Server goal", revision: -1 }, { ...selector, goal: 12 }]) {
    assert.deepEqual(publicMessage({ metadata: { workspaceContext: invalid } }).metadata, {});
  }
});

test("discussion replies have no structured dispatch protocol", () => {
  assert.equal(assertDiscussionReply("  建议先明确标题，再到原任务确认修改。  "), "建议先明确标题，再到原任务确认修改。");
  for (const reply of ["", null, "x".repeat(16001), '{"type":"workspace","capabilities":[]}', '```json\n{"operation":"continue"}\n```', '[]']) {
    assert.throws(() => assertDiscussionReply(reply), error => error.details.code === "WORKSPACE_DISCUSSION_RESPONSE_INVALID");
  }
});

test("runtime discussion uses chat model without tools, structured output, or hidden selected content", async t => {
  const previous = config.newApi;
  config.newApi = { ...previous, baseUrl: "https://provider.invalid/v1", apiKey: "isolated-test-key", model: "discussion-test", planningModel: "forbidden-planner", timeoutMs: 1000 };
  t.after(() => { config.newApi = previous; });
  const discussion = { workspace: { goal: "讨论目标", currentRound: 2, revision: 5, status: "succeeded", summary: "成果已生成",
    participants: [], result: { kind: "text_result", title: "成果标题" } }, language: "zh-CN", resultContentRead: false };
  let calls = 0;
  t.mock.method(globalThis, "fetch", async (_url, options) => {
    calls++;
    const body = JSON.parse(options.body);
    assert.equal(body.model, "discussion-test");
    assert.equal(body.tools, undefined);
    assert.equal(body.response_format, undefined);
    assert.doesNotMatch(JSON.stringify(body), /private-source|user-id|workspace-id/);
    return new Response(JSON.stringify({ choices: [{ finish_reason: "stop", message: { content: "请在原任务确认修改建议。" } }] }));
  });
  assert.equal(resolveAgentModelRole({ mode: "discussWorkspace" }), "chat");
  const args = { agentId: "miaoxun-butler", mode: "discussWorkspace", input: "调整标题", user: null,
    appContext: { workspaceDiscussion: discussion } };
  const result = await runAgent(args);
  assert.match(result.reply, /原任务/);
  for (const forbidden of [{ tools: {} }, { appContext: { ...args.appContext, resolvedReferences: [{ content: "private-source" }] } }]) {
    await assert.rejects(runAgent({ ...args, ...forbidden }), error => error.status === 422);
  }
  assert.equal(calls, 1);
});
