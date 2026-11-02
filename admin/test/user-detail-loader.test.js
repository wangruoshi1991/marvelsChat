import assert from "node:assert/strict";
import test from "node:test";
import { createUserDetailLoader } from "../src/user-detail-loader.js";

const deferred = () => { let resolve, reject; const promise = new Promise((a, b) => { resolve = a; reject = b; }); return { promise, resolve, reject }; };

test("user detail keeps the selected account when requests complete out of order", async () => {
  const a = deferred(), b = deferred(); const states = [];
  const loader = createUserDetailLoader({ request: (path) => path.endsWith("/A") ? a.promise : b.promise, onChange: (value) => states.push(value) });
  const first = loader.open("A");
  const second = loader.open("B");
  assert.equal(states.at(-1).id, "B"); assert.equal(states.at(-1).detail, null);
  b.resolve({ user: { id: "B" } }); await second;
  a.resolve({ user: { id: "A" } }); await first;
  assert.equal(states.at(-1).detail.user.id, "B");
});

test("closing a user drawer invalidates pending reads and reopening starts empty", async () => {
  const a = deferred(); const states = [];
  const loader = createUserDetailLoader({ request: () => a.promise, onChange: (value) => states.push(value) });
  const first = loader.open("A"); loader.close();
  a.resolve({ user: { id: "A" } }); await first;
  assert.equal(states.at(-1).id, null); assert.equal(states.at(-1).detail, null);
  const second = loader.open("A");
  assert.equal(states.at(-1).loading, true); assert.equal(states.at(-1).detail, null);
  await second;
  assert.equal(states.at(-1).detail.user.id, "A");
});

test("failed detail reads retain request ID and never restore the old account", async () => {
  const states = [];
  const loader = createUserDetailLoader({ request: async (path) => { if (path.endsWith("/A")) return { user: { id: "A" } }; throw Object.assign(new Error("DB unavailable"), { requestId: "request-2" }); }, onChange: (value) => states.push(value) });
  await loader.open("A"); await loader.open("B");
  assert.equal(states.at(-1).id, "B"); assert.equal(states.at(-1).detail, null);
  assert.deepEqual(states.at(-1).error, { message: "DB unavailable", requestId: "request-2" });
  const count = states.length; loader.cancel(); await loader.refresh();
  assert.equal(states.length, count);
});
