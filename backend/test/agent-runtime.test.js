import assert from "node:assert/strict";
import test from "node:test";
import { config } from "../src/config.js";
import { testModelRuntime } from "../src/agent-runtime.js";

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
