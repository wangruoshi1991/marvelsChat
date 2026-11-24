import test from "node:test";
import assert from "node:assert/strict";

test("admin requests reject unsuccessful or malformed acknowledgements", async t => {
  t.mock.method(globalThis, "fetch");
  const savedWindow = globalThis.window;
  globalThis.window = { location: { protocol: "https:", origin: "https://example.invalid" } };
  t.after(() => { globalThis.window = savedWindow; });
  const { request } = await import("../src/platform.js");

  for (const body of ["<html>loading</html>", "", "{}", '["item"]', '{"error":{"message":"error"}}']) {
    globalThis.fetch.mock.mockImplementation(async () => new Response(body, { headers: { "X-Request-ID": "trace-1" } }));
    await assert.rejects(request("/api/admin/tasks"), error =>
      error.message.includes("响应格式") && error.requestId === "trace-1");
  }
  globalThis.fetch.mock.mockImplementation(async () => new Response('{"data":null}'));
  assert.equal(await request("/api/admin/tasks"), null);
  globalThis.fetch.mock.mockImplementation(async () => new Response('{"data":[]}'));
  assert.deepEqual(await request("/api/admin/tasks"), []);
  globalThis.fetch.mock.mockImplementation(async () => new Response("<html>blocked</html>", { status: 403 }));
  await assert.rejects(request("/api/admin/tasks"), error =>
    error.status === 403 && !error.message.includes("<html>"));
  globalThis.fetch.mock.mockImplementation(async () => Response.json(
    { error: { message: "权限不足", requestId: "trace-2" } }, { status: 403 }));
  await assert.rejects(request("/api/admin/tasks"), error =>
    error.status === 403 && error.message === "权限不足" && error.requestId === "trace-2");
});

test("a failed identity request clears the administrator session only when unauthenticated", async () => {
  const savedWindow = globalThis.window;
  const savedSessionStorage = globalThis.sessionStorage;
  const savedFetch = globalThis.fetch;
  const store = new Map();
  globalThis.window = { location: { protocol: "https:", origin: "https://example.invalid" } };
  globalThis.sessionStorage = { getItem: (key) => store.get(key) || null, setItem: (key, value) => store.set(key, value), removeItem: (key) => store.delete(key) };
  globalThis.fetch = async () => { throw new Error("offline"); };
  try {
    const { authProvider, writeAuth, readAuth } = await import("../src/platform.js");
    writeAuth({ token: "session-token", user: { id: "admin" } });
    const result = await authProvider.check();
    assert.equal(result.authenticated, true);
    assert.equal(readAuth().token, "session-token");
    assert.ok(result.error);
    globalThis.fetch = async () => Response.json({ error: { message: "Forbidden" } }, { status: 403 });
    const forbidden = await authProvider.check();
    assert.equal(forbidden.authenticated, true);
    assert.equal(forbidden.error.status, 403);
    assert.equal(readAuth().token, "session-token");
    globalThis.fetch = async () => Response.json({ error: { message: "Expired" } }, { status: 401 });
    assert.deepEqual(await authProvider.check(), { authenticated: false, redirectTo: "/login" });
    assert.deepEqual(readAuth(), {});
    store.set("miaoxun.admin.auth.v2", "null");
    assert.deepEqual(readAuth(), {});
  } finally { globalThis.window = savedWindow; globalThis.sessionStorage = savedSessionStorage; globalThis.fetch = savedFetch; }
});

test("the React client requires a local API path and sends auth and a request ID", async t => {
  const savedSessionStorage = globalThis.sessionStorage;
  const store = new Map();
  globalThis.sessionStorage = { getItem: key => store.get(key), setItem: (key, value) => store.set(key, value) };
  t.after(() => { globalThis.sessionStorage = savedSessionStorage; });
  const { request, writeAuth } = await import("../src/platform.js");
  writeAuth({ token: "fixture-token" });
  const calls = [];
  t.mock.method(globalThis, "fetch", async (path, options) => {
    calls.push({ path, headers: new Headers(options.headers) });
    return Response.json({ data: { ok: true } });
  });
  for (const path of ["/admin/users", "https://example.invalid/api/users", "/api/%2e%2e/admin"]) {
    await assert.rejects(request(path), { name: "TypeError" });
  }
  assert.equal(calls.length, 0);
  assert.deepEqual(await request("/api/admin/users", { method: "POST", body: "{}" }), { ok: true });
  assert.equal(calls[0].path, "/api/admin/users");
  assert.equal(calls[0].headers.get("Authorization"), "Bearer fixture-token");
  assert.equal(calls[0].headers.get("Content-Type"), "application/json");
  assert.match(calls[0].headers.get("X-Request-ID"), /^[a-f0-9-]{32,36}$/i);
});

test("the React client times out while reading a response body", async t => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const { request } = await import("../src/platform.js");
  const bodyStarted = Promise.withResolvers();
  t.mock.method(globalThis, "fetch", async (_path, { headers, signal }) => ({
    ok: true,
    json: () => {
      bodyStarted.resolve({ requestId: new Headers(headers).get("X-Request-ID"), signal });
      return new Promise((_, reject) => {
        signal?.addEventListener("abort", () => reject(signal.reason), { once: true });
      });
    },
  }));
  const response = request("/api/admin/tasks");
  const { requestId, signal } = await bodyStarted.promise;
  assert.ok(signal);
  assert.equal(signal.aborted, false);
  const failure = assert.rejects(response, { isTimeout: true, requestId });
  t.mock.timers.tick(20_000);
  await failure;
});

test("the React client keeps caller cancellation distinct from a timeout", async t => {
  const { request } = await import("../src/platform.js");
  const caller = new AbortController();
  const bodyStarted = Promise.withResolvers();
  t.mock.method(globalThis, "fetch", async (_path, { signal }) => ({
    ok: true,
    json: () => {
      bodyStarted.resolve();
      return new Promise((_, reject) => {
        signal.addEventListener("abort", () => reject(signal.reason), { once: true });
      });
    },
  }));
  const response = request("/api/admin/tasks", { signal: caller.signal });
  const failure = assert.rejects(response, { name: "AbortError" });
  await bodyStarted.promise;
  caller.abort();
  await failure;
});
