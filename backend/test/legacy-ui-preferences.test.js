import assert from "node:assert/strict";
import test from "node:test";
import { defaultUiPreferences, diffUiPreferences, normalizeUiPreferences } from "../../shared/legacy-ui-preferences.js";
import { defaultUIPreferences } from "../../shared/ui-preferences.js";
import { createUiPreferencesRepository } from "../src/ui-preferences-repository.js";
import { registerStationProfileRoutes } from "../src/routes/station-profile-routes.js";

test("legacy and UI-Agent contracts remain separate and reject unsupported data", () => {
  const original = defaultUiPreferences();
  const updated = defaultUiPreferences();
  updated.global.radius = "large";
  assert.deepEqual(diffUiPreferences(original, updated), [{ path: "$.global.radius", from: "medium", to: "large" }]);
  assert.equal(defaultUIPreferences().schemaVersion, 1);
  assert.throws(() => normalizeUiPreferences({ ...original, actions: ["delete"] }), { code: "UI_PREFERENCES_INVALID" });
  assert.throws(() => normalizeUiPreferences(defaultUIPreferences()), { code: "UI_PREFERENCES_INVALID" });
});

test("legacy writes require explicit confirmation and reject invalid input before a transaction", async () => {
  let transactions = 0;
  const repository = createUiPreferencesRepository({ transaction: async () => { transactions += 1; } });
  const input = { userId: "user-1", expectedRevision: 0, confirmed: true, preferences: defaultUiPreferences() };
  for (const invalid of [{ confirmed: false }, { expectedRevision: -1 }, { source: "other" }, { preferences: { actions: [] } }]) {
    await assert.rejects(repository.updateUserUiPreferences({ ...input, ...invalid }), error => error.status === 400);
  }
  assert.equal(transactions, 0);
});

test("legacy routes enforce authentication and scope both operations to the authenticated owner", async () => {
  const routes = new Map();
  const app = Object.fromEntries(["get", "patch", "post"].map(method => [method, (path, ...handlers) => routes.set(`${method.toUpperCase()} ${path}`, handlers)]));
  const authenticate = (_req, _res, next) => next();
  const calls = [];
  const repository = {
    getUserUiPreferences: async id => { calls.push(id); return { revision: 0 }; },
    updateUserUiPreferences: async input => { calls.push(input); return { revision: 1 }; },
  };
  registerStationProfileRoutes(app, { authenticate, asyncHandler: handler => handler, uiPreferencesRepository: repository });
  const get = routes.get("GET /api/me/ui-preferences");
  const patch = routes.get("PATCH /api/me/ui-preferences");
  assert.equal(get[0], authenticate);
  assert.equal(patch[0], authenticate);
  const req = { user: { id: "owner-1" }, body: { expectedRevision: 0, confirmed: true, preferences: defaultUiPreferences() }, get: () => "test", ip: "127.0.0.1" };
  await get[1](req, { json() {} });
  await patch[1](req, { json() {} });
  assert.equal(calls[0], "owner-1");
  assert.equal(calls[1].userId, "owner-1");
  await assert.rejects(patch[1]({ ...req, body: { ...req.body, userId: "other" } }, { json() {} }), { name: "ZodError" });
});
