import assert from "node:assert/strict";
import test from "node:test";
import { config } from "../src/config.js";
import { modelTestSchema } from "../src/schemas.js";
import { registerAdminRoutes } from "../src/routes/admin-routes.js";

test("model test schema defaults to chat and rejects unknown roles", () => {
  assert.equal(modelTestSchema.parse({}).role, "chat");
  assert.equal(modelTestSchema.parse({ role: "planning" }).role, "planning");
  assert.equal(modelTestSchema.safeParse({ role: "vision" }).success, false);
});

test("the admin model-test route dispatches its validated role through the real runtime", async t => {
  const previous = config.newApi;
  config.newApi = { baseUrl: "https://provider.invalid/v1", apiKey: "test-key", model: "chat-model", planningModel: "planning-model", timeoutMs: 1000 };
  t.after(() => { config.newApi = previous; });
  const routes = new Map(), requestedModels = [];
  const app = Object.fromEntries(["get", "post", "patch", "delete"].map(method => [method, (path, ...handlers) => routes.set(`${method} ${path}`, handlers)]));
  const authenticate = () => {}, requireAdmin = permission => Object.assign(() => {}, { permission });
  registerAdminRoutes(app, { authenticate, requireAdmin, asyncHandler: handler => handler });
  const handlers = routes.get("post /api/admin/model-test");
  assert.equal(handlers[0], authenticate);
  assert.equal(handlers[1].permission, "model:operate");
  t.mock.method(globalThis, "fetch", async (_url, options) => {
    requestedModels.push(JSON.parse(options.body).model);
    // A completed provider rejection ends the route before any database write.
    return new Response(JSON.stringify({ error: { message: "Test-only provider rejection" } }), { status: 429 });
  });
  const handler = handlers.at(-1);
  for (const body of [{ input: "Connectivity check" }, { role: "planning" }]) {
    await assert.rejects(handler({ body }, {}), error => error.status === 429);
  }
  await assert.rejects(handler({ body: { role: "vision" } }, {}), error => error.name === "ZodError");
  assert.deepEqual(requestedModels, ["chat-model", "planning-model"]);
});

test("admin model-test never reports empty or truncated provider output as a successful connection", async t => {
  const previous = config.newApi;
  config.newApi = { baseUrl: "https://provider.invalid/v1", apiKey: "test-key", model: "chat-model", timeoutMs: 1000 };
  t.after(() => { config.newApi = previous; });
  const routes = new Map();
  const app = Object.fromEntries(["get", "post", "patch", "delete"].map(method => [method, (path, ...handlers) => routes.set(`${method} ${path}`, handlers)]));
  registerAdminRoutes(app, { authenticate: () => {}, requireAdmin: () => () => {}, asyncHandler: handler => handler });
  const handler = routes.get("post /api/admin/model-test").at(-1);
  let written = false;
  for (const choice of [
    { finish_reason: "stop", message: { content: "" } },
    { finish_reason: "stop", message: { content: null, reasoning_content: "Test-only reasoning" } },
    { finish_reason: "length", message: { content: "Partial result" } },
  ]) {
    t.mock.method(globalThis, "fetch", async () => new Response(JSON.stringify({ choices: [choice],
      usage: { prompt_tokens: 3, completion_tokens: 2, total_tokens: 5 } })));
    await assert.rejects(handler({ body: {} }, { json: () => { written = true; } }), error => error.status === 502);
  }
  assert.equal(written, false);
});
