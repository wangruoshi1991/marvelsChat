import assert from "node:assert/strict";
import test from "node:test";
import { albumAssistantE2EHeaders, sendAlbumMessageAndWait } from "../scripts/album-assistant-e2e.js";
import { requireAIClientContract } from "../src/ai-client-contract.js";

const task = (status, overrides = {}) => ({
  id: "task", kind: "agent_message", agentId: "album-manager", threadId: "thread", status,
  artifacts: status === "succeeded" ? [{ kind: "message", id: "reply", threadId: "thread" }] : [],
  ...overrides,
});
const completed = () => ({ task: task("succeeded"), messages: [
  { id: "input", threadId: "thread", senderType: "user", content: "找照片" },
  { id: "reply", threadId: "thread", senderType: "agent", content: "找到照片。" },
] });
const args = { token: "isolated-fixture", threadId: "thread", content: "找照片", clientMessageId: "stable-message-key" };

test("real-provider checks share the current AI contract header without starting the CLI on import", () => {
  let accepted = false;
  requireAIClientContract({ get: key => albumAssistantE2EHeaders[key] }, null, () => { accepted = true; });
  assert.equal(accepted, true);
  assert.equal(albumAssistantE2EHeaders["X-Miaoxun-Retrieval-Contract"], "2");
});

test("queued Album messages poll one task and replay the same input only after its saved reply succeeds", async () => {
  const calls = [];
  const responses = [{ task: task("queued") }, task("running"), task("succeeded"), completed()];
  const result = await sendAlbumMessageAndWait({ ...args, pause: async () => {}, api: async (route, options) => {
    calls.push({ route, ...options });
    return responses.shift();
  } });
  assert.deepEqual(result, completed());
  assert.deepEqual(calls.map(call => [call.route, call.method || "GET", call.expected || 200]), [
    ["/api/threads/thread/messages", "POST", 202],
    ["/api/tasks/task", "GET", 200],
    ["/api/tasks/task", "GET", 200],
    ["/api/threads/thread/messages", "POST", 200],
  ]);
  assert.deepEqual(calls[0].body, calls[3].body);
  assert.equal(calls[0].body.clientMessageId, args.clientMessageId);
  assert.ok(calls.every(call => call.token === args.token));
});

test("the retired synchronous response is not accepted as an Album task result", async () => {
  let calls = 0;
  await assert.rejects(sendAlbumMessageAndWait({ ...args, api: async () => {
    calls++;
    return { messages: completed().messages };
  } }), /durable task/);
  assert.equal(calls, 1);
});

for (const state of ["failed", "interrupted", "cancelled", "awaiting_confirmation"]) {
  test(`a ${state} Album task stops the check without resubmitting a paid operation`, async () => {
    const calls = [];
    await assert.rejects(sendAlbumMessageAndWait({ ...args, pause: async () => {}, api: async (route, options) => {
      calls.push({ route, ...options });
      return calls.length === 1 ? { task: task("queued") } : task(state);
    } }), new RegExp(`without a result: ${state}`));
    assert.equal(calls.filter(call => call.method === "POST").length, 1);
    assert.equal(calls.length, 2);
  });
}

test("a task deadline stops polling without resubmission or an invented result", async () => {
  let elapsed = 0;
  const calls = [];
  await assert.rejects(sendAlbumMessageAndWait({ ...args, timeoutMs: 10, pollMs: 5,
    now: () => elapsed, pause: async ms => { elapsed += ms; }, api: async (route, options) => {
      calls.push({ route, ...options });
      return calls.length === 1 ? { task: task("queued") } : task("running");
    },
  }), /QA deadline/);
  assert.equal(elapsed, 10);
  assert.equal(calls.filter(call => call.method === "POST").length, 1);
});

test("a response for another task is rejected before reading or replaying its result", async () => {
  let calls = 0;
  await assert.rejects(sendAlbumMessageAndWait({ ...args, pause: async () => {}, api: async () => {
    calls++;
    return calls === 1 ? { task: task("queued") } : task("succeeded", { id: "different-task" });
  } }), assert.AssertionError);
  assert.equal(calls, 2);
});

test("success requires the exact persisted reply artifact, not an unrelated Agent message", async () => {
  let calls = 0;
  await assert.rejects(sendAlbumMessageAndWait({ ...args, api: async () => {
    calls++;
    return calls === 1 ? { task: task("succeeded") } : {
      ...completed(), messages: [{ id: "unrelated", threadId: "thread", senderType: "agent", content: "别的回复" }],
    };
  } }), assert.AssertionError);
  assert.equal(calls, 2);
});
