import assert from "node:assert/strict";
import test from "node:test";
import { aiClientContracts, requireAIClientContract, requireSiteDocumentContract, requireAgentWorkspaceContract, requireUIPreferencesContract, rejectRetiredSiteApply } from "../src/ai-client-contract.js";
import { createSafeErrorResponse } from "../src/request-observability.js";
import { registerStationSiteRoutes } from "../src/routes/station-site-routes.js";

test("an AI client must explicitly declare the supported contract, regardless of App build", () => {
  for (const version of [undefined, "", "0", "2", "1, 2"]) {
    assert.throws(() => requireAIClientContract({ get: name => name === "X-Miaoxun-App-Build" ? "999" : version }), error => {
      const response = createSafeErrorResponse(error, { production: true, requestId: "contract-test" });
      assert.equal(response.status, 426);
      assert.equal(response.body.error.details.code, "AI_CLIENT_UPDATE_REQUIRED");
      assert.match(response.body.error.message, /更新客户端/);
      return true;
    });
  }
  let called = false;
  requireAIClientContract({ get: () => "1" }, null, () => { called = true; });
  assert.equal(called, true);
  assert.deepEqual(aiClientContracts, { aiTasks: 1, siteDocuments: 2, agentWorkspaces: 6, uiPreferences: 1 });
});

test("UI preference routes require the explicit preference contract", () => {
  for (const value of [undefined, "", "0", "2", "1, 2"]) {
    assert.throws(() => requireUIPreferencesContract({ get: () => value }), error =>
      error.status === 426 && error.details.code === "UI_PREFERENCES_CLIENT_UPDATE_REQUIRED" &&
      error.details.requiredContract === 1);
  }
  let called = false;
  requireUIPreferencesContract({ get: () => "1" }, null, () => { called = true; });
  assert.equal(called, true);
});

test("direct and coordinated workspaces require contract 6 before any business execution", () => {
  for (const value of [undefined, "", "1", "2", "3", "4", "5", "6, 5"]) {
    assert.throws(() => requireAgentWorkspaceContract({ get: () => value }), error =>
      error.status === 426 && error.details.code === "WORKSPACE_CLIENT_UPDATE_REQUIRED" &&
      error.details.requiredContract === 6);
  }
  let called = false;
  requireAgentWorkspaceContract({ get: () => "6" }, null, () => { called = true; });
  assert.equal(called, true);
});

test("site document submission separately requires a renderer capable of the saved schema", async () => {
  for (const value of [undefined, '', '1', '3', '2, 1']) {
    assert.throws(() => requireSiteDocumentContract({ get: () => value }), error =>
      error.status === 426 && error.details.code === 'SITE_DOCUMENT_CLIENT_UPDATE_REQUIRED');
  }
  let called = false;
  requireSiteDocumentContract({ get: () => '2' }, null, () => { called = true; });
  assert.equal(called, true);
  const routes = new Map();
  const app = Object.fromEntries(['get', 'post'].map(method => [method, (path, ...handlers) => routes.set(`${method} ${path}`, handlers)]));
  let submitted = 0;
  registerStationSiteRoutes(app, { authenticate(_req, _res, next) { return next(); }, asyncHandler: handler => handler,
    submit: async () => { submitted++; } });
  const handlers = routes.get('post /api/station/site-drafts');
  const req = { get: name => name === 'X-Miaoxun-AI-Contract' ? '1' : undefined, body: {} };
  const run = async () => {
    for (const handler of handlers) {
      let advanced = false;
      await handler(req, {}, () => { advanced = true; });
      if (!advanced) break;
    }
  };
  await assert.rejects(run(), error => error.status === 426 && error.details.code === 'SITE_DOCUMENT_CLIENT_UPDATE_REQUIRED');
  assert.equal(submitted, 0);
});

test("site create checks the contract before its schema and submit callback; retired apply always rejects", async () => {
  const routes = new Map();
  const app = Object.fromEntries(["get", "post"].map(method => [method, (path, ...handlers) => routes.set(`${method} ${path}`, handlers)]));
  let submitted = 0;
  registerStationSiteRoutes(app, {
    authenticate(_req, _res, next) { return next(); }, asyncHandler: handler => handler,
    submit: async () => { submitted++; },
  });
  const handlers = routes.get("post /api/station/site-drafts");
  const req = { get: () => undefined, body: { prompt: "Build45 payload", apply: false } };
  const run = async index => { if (index < handlers.length) await handlers[index](req, {}, () => run(index + 1)); };
  await assert.rejects(run(0), error => error.status === 426);
  assert.equal(submitted, 0);
  const retired = routes.get("post /api/station/site-drafts/:draftId/apply").at(-1);
  assert.equal(retired, rejectRetiredSiteApply);
  assert.throws(() => retired({ get: () => "1" }), error => error.status === 426);
});
