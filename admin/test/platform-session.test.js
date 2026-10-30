import test from "node:test";
import assert from "node:assert/strict";

test("a temporary identity request failure preserves the administrator session", async () => {
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
  } finally { globalThis.window = savedWindow; globalThis.sessionStorage = savedSessionStorage; globalThis.fetch = savedFetch; }
});
