import assert from "node:assert/strict";
import crypto from "node:crypto";
import test from "node:test";
import { registerComicRenderRoutes } from "../src/routes/comic-render-routes.js";

function fixture() {
  const routes = new Map();
  const calls = [];
  const app = Object.fromEntries(["get", "post"].map(method => [method, (path, ...handlers) => routes.set(`${method} ${path}`, handlers)]));
  const service = Object.fromEntries(["createComicRenderTask", "getComicRenderTask", "listComicRenderTasks", "listComicRenderEvents", "cancelQueuedComicRenderTask"].map(name => [name, async input => { calls.push({ name, input }); return name === "createComicRenderTask" ? { task: { id: "task" }, reused: false } : { id: "task" }; }]));
  registerComicRenderRoutes(app, { authenticate: (_req, _res, next) => next(), asyncHandler: h => h, service });
  async function run(key, { version = "1", ...request } = {}) {
    const req = { user: { id: crypto.randomUUID() }, get: () => version, params: {}, query: {}, body: {}, ...request };
    const response = { statusCode: 200, status(code) { this.statusCode = code; return this; }, json(body) { this.body = body; } };
    const handlers = routes.get(key);
    for (const handler of handlers) {
      let advanced=false;
      await handler(req,response,()=>{advanced=true;});
      if(!advanced)break;
    }
    return response;
  }
  return { run, calls };
}

test("every comic render route checks its dedicated contract before reading or submitting", async () => {
  const f = fixture();
  for (const key of ["post /api/station/comic-diaries/:comicDiaryId/render-tasks", "get /api/station/comic-diaries/:comicDiaryId/render-tasks", "get /api/station/comic-render-tasks/:taskId", "get /api/station/comic-render-tasks/:taskId/events", "post /api/station/comic-render-tasks/:taskId/cancel"]) {
    await assert.rejects(f.run(key, { version: null }), e => e.status === 426);
  }
  assert.deepEqual(f.calls, []);
});

test("submission accepts only an idempotency key and applies authenticated ownership", async () => {
  const f = fixture();
  const userId = crypto.randomUUID(), comicDiaryId = crypto.randomUUID(), idempotencyKey = crypto.randomUUID();
  const result = await f.run("post /api/station/comic-diaries/:comicDiaryId/render-tasks", { user: { id: userId }, params: { comicDiaryId }, body: { idempotencyKey } });
  assert.equal(result.statusCode, 201);
  assert.deepEqual(result.body, { data: { id: "task" }, reused: false });
  assert.deepEqual(f.calls[0].input, { userId, comicDiaryId, idempotencyKey });
  await assert.rejects(f.run("post /api/station/comic-diaries/:comicDiaryId/render-tasks", { params: { comicDiaryId }, body: { idempotencyKey, providerUrl: "https://example.invalid" } }), e => e.name === "ZodError");
});

test("queued cancellation requires an explicit integer revision", async () => {
  const f = fixture();
  const taskId = crypto.randomUUID();
  await assert.rejects(f.run("post /api/station/comic-render-tasks/:taskId/cancel", { params: { taskId }, body: {} }), e => e.name === "ZodError");
  await f.run("post /api/station/comic-render-tasks/:taskId/cancel", { params: { taskId }, body: { revision: 1 } });
  assert.equal(f.calls[0].input.taskId, taskId);
  assert.equal(f.calls[0].input.revision, 1);
});
