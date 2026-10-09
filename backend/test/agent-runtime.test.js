import assert from "node:assert/strict";
import test from "node:test";
import { config } from "../src/config.js";
import { runAgent, testModelRuntime } from "../src/agent-runtime.js";

const configure = (t) => {
  const previous = config.newApi;
  config.newApi = {
    baseUrl: "https://provider.invalid/v1",
    apiKey: "test-key",
    model: "test-model",
    timeoutMs: 20,
  };
  t.after(() => { config.newApi = previous; });
};

test("Agent timeout also covers a stalled provider response body", async (t) => {
  configure(t);
  t.mock.method(globalThis, "fetch", async (_url, { signal }) => ({
    ok: true,
    status: 200,
    text: () => new Promise((_resolve, reject) => {
      signal.addEventListener("abort", () => reject(signal.reason), { once: true });
    }),
  }));
  await assert.rejects(testModelRuntime(), (error) => error.status === 504);
});

test("Agent runtime preserves a valid reply and usage", async (t) => {
  configure(t);
  t.mock.method(globalThis, "fetch", async () => new Response(JSON.stringify({
    choices: [{ message: { content: "A real provider reply" } }],
    usage: { prompt_tokens: 4, completion_tokens: 3, total_tokens: 7 },
  })));
  const result = await testModelRuntime();
  assert.equal(result.reply, "A real provider reply");
  assert.deepEqual(result.tokenUsage, { prompt: 4, completion: 3, total: 7 });
});

for (const body of ["not json", "null", '"unexpected string"']) {
  test(`Agent runtime rejects malformed provider response ${body}`, async (t) => {
    configure(t);
    t.mock.method(globalThis, "fetch", async () => new Response(body));
    await assert.rejects(testModelRuntime(), (error) => error.status === 502);
  });
}

for (const anthropic of [false, true]) {
  test(`album conversation executes a validated ${anthropic ? "Anthropic" : "OpenAI"} tool and accumulates usage`, async t => {
    configure(t);
    config.newApi.timeoutMs = 1000;
    if (anthropic) config.newApi.baseUrl = "https://provider.invalid/anthropic";
    const bodies = [];
    let outcome = null;
    const execute = t.mock.fn(async () => {
      outcome = "found";
      return { state: "found", results: [{ kind: "image", mediaAssetId: "owned" }] };
    });
    t.mock.method(globalThis, "fetch", async (_url, options) => {
      bodies.push(JSON.parse(options.body));
      return new Response(JSON.stringify(anthropic ? {
        content: bodies.length === 1 ? [{ type: "tool_use", id: "call-1", name: "search_media", input: { query: "海边照片" } }]
          : [{ type: "text", text: "找到素材。" }],
        usage: { input_tokens: 10, output_tokens: 5 },
      } : {
        choices: [{ message: bodies.length === 1 ? { role: "assistant", content: null,
          tool_calls: [{ id: "call-1", type: "function", function: { name: "search_media", arguments: '{"query":"海边照片"}' } }] }
          : { role: "assistant", content: "找到素材。" } }],
        usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
      }));
    });
    const result = await runAgent({ agentId: "album-manager", input: "继续找", user: { id: "owner" },
      messages: [{ senderType: "user", content: "要海边照片" }, { senderType: "agent", content: "什么时间？" }, { senderType: "user", content: "继续找" }],
      tools: { definitions: [{ name: "search_media", parameters: { type: "object" } }], execute, metadata: () => ({ outcome }) } });
    assert.equal(result.reply, "找到素材。");
    assert.deepEqual(result.tokenUsage, { prompt: 20, completion: 10, total: 30 });
    assert.equal(execute.mock.calls.length, 1);
    assert.ok(JSON.stringify(bodies[0]).includes("要海边照片"));
    assert.ok(JSON.stringify(bodies[1]).includes("owned"));
    assert.deepEqual(bodies[0].tool_choice, anthropic ? { type: "auto" } : "auto");
    assert.deepEqual(bodies[1].tool_choice, anthropic ? { type: "none" } : "none");
  });
}

test("tools are never executable in an unrelated agent conversation", async t => {
  configure(t);
  t.mock.method(globalThis, "fetch", async () => new Response(JSON.stringify({ choices: [{ message: {
    tool_calls: [{ id: "x", function: { name: "search_media", arguments: "{}" } }],
  } }] })));
  await assert.rejects(runAgent({ agentId: "album-manager", input: "test", user: {} }), error => error.status === 502);
});

test("a provider cannot dispatch another tool after a search outcome", async t => {
  configure(t);
  let outcome = null;
  const execute = t.mock.fn(async () => { outcome = "empty"; return { state: outcome, results: [] }; });
  t.mock.method(globalThis, "fetch", async () => new Response(JSON.stringify({ choices: [{ message: {
    role: "assistant", tool_calls: [{ id: "again", function: { name: "search_media", arguments: '{"query":"照片"}' } }],
  } }], usage: {} })));
  await assert.rejects(runAgent({ agentId: "album-manager", input: "找照片", user: {},
    tools: { definitions: [{ name: "search_media" }], execute, metadata: () => ({ outcome }) } }), error => error.status === 502);
  assert.equal(execute.mock.calls.length, 1);
});
