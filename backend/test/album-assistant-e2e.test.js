import assert from "node:assert/strict";
import test from "node:test";
import { albumAssistantE2EHeaders, sendAlbumMessageAndWait } from "../scripts/album-assistant-e2e.js";
import { requireAIClientContract, requireAgentWorkspaceContract } from "../src/ai-client-contract.js";

const workspaceId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const inputId = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const replyId = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const mediaId = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
const runId = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";
const args = { token: "isolated-fixture", threadId: "thread", content: "找照片", clientMessageId: "stable-message-key" };
const workspace = (status, overrides = {}) => ({
  id: workspaceId, executionMode: "direct", status,
  origin: { kind: "agent_conversation", threadId: args.threadId, inputMessageId: inputId,
    agentId: "album-manager", agentVersion: "test-version", capability: "media.select" },
  result: status === "succeeded" ? { kind: "media_selection", title: "实际选材",
    assets: [{ id: mediaId, version: "a".repeat(64), kind: "image", matchedFrameTimestampMs: null }],
    retrievalRunIds: [runId] } : null,
  error: null,
  ...overrides,
});
const dispatched = () => ({ messages: [
  { id: inputId, threadId: args.threadId, senderType: "user", content: args.content, clientMessageId: args.clientMessageId },
  { id: replyId, threadId: args.threadId, senderType: "agent", content: "已创建任务，可在妙页查看进展和成果。",
    metadata: { agentDispatch: { version: 1, kind: "workspace" }, agentWorkspace: { id: workspaceId } } },
] });

test("real-provider checks declare the current AI and workspace contracts without starting the CLI on import", () => {
  let accepted = 0;
  const req = { get: key => albumAssistantE2EHeaders[key] };
  requireAIClientContract(req, null, () => { accepted++; });
  requireAgentWorkspaceContract(req, null, () => { accepted++; });
  assert.equal(accepted, 2);
  assert.equal(albumAssistantE2EHeaders["X-Miaoxun-Retrieval-Contract"], "2");
});

test("professional Album messages poll only their direct workspace and replay the exact saved request after selection succeeds", async () => {
  const calls = [];
  const responses = [dispatched(), workspace("queued"), workspace("running"), workspace("succeeded"), dispatched()];
  const result = await sendAlbumMessageAndWait({ ...args, pause: async () => {}, api: async (route, options) => {
    calls.push({ route, ...options });
    return responses.shift();
  } });
  assert.deepEqual(result, { ...dispatched(), workspace: workspace("succeeded") });
  assert.deepEqual(calls.map(call => [call.route, call.method || "GET", call.expected || 200]), [
    ["/api/threads/thread/messages", "POST", 201],
    [`/api/agent-workspaces/${workspaceId}`, "GET", 200],
    [`/api/agent-workspaces/${workspaceId}`, "GET", 200],
    [`/api/agent-workspaces/${workspaceId}`, "GET", 200],
    ["/api/threads/thread/messages", "POST", 200],
  ]);
  assert.deepEqual(calls[0].body, calls[4].body);
  assert.equal(calls[0].body.clientMessageId, args.clientMessageId);
  assert.ok(calls.every(call => call.token === args.token));
});

for (const kind of ["legacy-task", "reply", "clarify"]) {
  test(`a ${kind} response is not accepted as a new Album selection`, async () => {
    let calls = 0;
    const response = kind === "legacy-task" ? { task: { id: "old-task", status: "succeeded" } } : dispatched();
    if (kind !== "legacy-task") response.messages[1].metadata.agentDispatch.kind = kind;
    await assert.rejects(sendAlbumMessageAndWait({ ...args, api: async () => {
      calls++;
      return response;
    } }), assert.AssertionError);
    assert.equal(calls, 1);
  });
}

for (const state of ["failed", "interrupted", "cancelled", "awaiting_confirmation", "waiting_input"]) {
  test(`an unexpected ${state} Album workspace stops without resubmitting a paid operation`, async () => {
    const calls = [];
    await assert.rejects(sendAlbumMessageAndWait({ ...args, pause: async () => {}, api: async (route, options) => {
      calls.push({ route, ...options });
      return calls.length === 1 ? dispatched() : workspace(state);
    } }), new RegExp(`without a result: ${state}`));
    assert.equal(calls.filter(call => call.method === "POST").length, 1);
    assert.equal(calls.length, 2);
  });
}

test("an explicitly expected empty selection verifies the precise failure and replays its existing workspace", async () => {
  const empty = workspace("failed", { error: { code: "WORKSPACE_MEDIA_NOT_FOUND", message: "No matching media" } });
  const calls = [];
  const responses = [dispatched(), empty, dispatched()];
  const result = await sendAlbumMessageAndWait({ ...args, expectedOutcome: "empty", api: async (route, options) => {
    calls.push({ route, ...options }); return responses.shift();
  } });
  assert.deepEqual(result.workspace, empty);
  assert.equal(calls.length, 3);
  assert.deepEqual(calls[0].body, calls[2].body);
});

for (const outcome of [
  workspace("failed", { error: { code: "AI_PROVIDER_RESULT_UNKNOWN" } }),
  workspace("failed", { error: { code: "WORKSPACE_MEDIA_NOT_FOUND" }, result: workspace("succeeded").result }),
  workspace("succeeded"),
]) {
  test(`negative selection rejects ${outcome.error?.code || outcome.status} with ${outcome.result ? "a result" : "no result"}`, async () => {
    let calls = 0;
    await assert.rejects(sendAlbumMessageAndWait({ ...args, expectedOutcome: "empty", api: async () => {
      calls++; return calls === 1 ? dispatched() : outcome;
    } }), assert.AssertionError);
    assert.equal(calls, 2);
  });
}

test("a workspace deadline stops polling without resubmission or an invented result", async () => {
  let elapsed = 0;
  const calls = [];
  await assert.rejects(sendAlbumMessageAndWait({ ...args, timeoutMs: 10, pollMs: 5,
    now: () => elapsed, pause: async ms => { elapsed += ms; }, api: async (route, options) => {
      calls.push({ route, ...options });
      return calls.length === 1 ? dispatched() : workspace("running");
    },
  }), /QA deadline/);
  assert.equal(elapsed, 10);
  assert.equal(calls.filter(call => call.method === "POST").length, 1);
});

for (const patch of [
  { id: runId }, { executionMode: "coordinated" },
  ...[{ threadId: "another-thread" }, { inputMessageId: replyId }, { agentId: "miaoxun-butler" },
    { capability: "text.synthesize" }].map(change => ({ origin: { ...workspace("succeeded").origin, ...change } })),
]) {
  test(`a mismatched workspace identity ${JSON.stringify(patch)} is rejected before replay`, async () => {
    let calls = 0;
    await assert.rejects(sendAlbumMessageAndWait({ ...args, api: async () => {
      calls++; return calls === 1 ? dispatched() : workspace("succeeded", patch);
    } }), assert.AssertionError);
    assert.equal(calls, 2);
  });
}

test("a successful selection requires nonempty, versioned media and persisted retrieval provenance", async () => {
  const valid = workspace("succeeded").result;
  for (const result of [
    { ...valid, assets: [] }, { ...valid, retrievalRunIds: [] },
    { ...valid, assets: [{ ...valid.assets[0], version: "invented" }] },
    { ...valid, assets: [{ ...valid.assets[0], kind: "video", matchedFrameTimestampMs: null }] },
  ]) {
    let calls = 0;
    await assert.rejects(sendAlbumMessageAndWait({ ...args, api: async () => {
      calls++; return calls === 1 ? dispatched() : workspace("succeeded", { result });
    } }), assert.AssertionError);
    assert.equal(calls, 2);
  }
});

test("replay must preserve the exact input, saved reply and workspace reference", async () => {
  for (const mutate of [
    response => { response.messages[0].id = runId; },
    response => { response.messages[1].id = runId; },
    response => { response.messages[1].metadata.agentWorkspace.id = runId; },
  ]) {
    let calls = 0;
    const replay = dispatched(); mutate(replay);
    await assert.rejects(sendAlbumMessageAndWait({ ...args, api: async () => {
      calls++; return calls === 1 ? dispatched() : calls === 2 ? workspace("succeeded") : replay;
    } }), assert.AssertionError);
    assert.equal(calls, 3);
  }
});

test("uncertain message submission and workspace reads propagate without any automatic resubmission", async () => {
  for (const failedCall of [1, 2]) {
    let calls = 0;
    const unavailable = new Error("Isolated transport failure");
    await assert.rejects(sendAlbumMessageAndWait({ ...args, api: async () => {
      calls++;
      if (calls === failedCall) throw unavailable;
      return dispatched();
    } }), error => error === unavailable);
    assert.equal(calls, failedCall);
  }
});
