import assert from "node:assert/strict";
import test from "node:test";
import { registerAdminReleaseRoutes } from "../src/routes/admin-release-routes.js";
import { createSafeErrorResponse } from "../src/request-observability.js";

const releaseId = "00000000-0000-4000-8000-000000000001";
const release = { id: releaseId, agentKey: "sample-agent", version: "1.0.0", catalogStatus: "published" };

function detailHandler(dependencies) {
  const routes = new Map();
  const app = Object.fromEntries(["get", "post", "patch"].map((method) => [method, (path, ...handlers) => routes.set(`${method} ${path}`, handlers.at(-1))]));
  registerAdminReleaseRoutes(app, { authenticate: () => {}, requireAdmin: () => () => {}, asyncHandler: (handler) => handler, ...dependencies });
  return routes.get("get /api/admin/agent-releases/:id");
}

test("release detail returns camelCase associated products and persistent history through its read dependencies", async () => {
  const calls = [];
  const handler = detailHandler({
    readRelease: async (id) => { assert.equal(id, releaseId); return release; },
    runQuery: async (sql, params) => {
      calls.push({ sql, params });
      if (sql.includes("agent_release_status_history")) return [{ id: "history-1", from_status: "review", to_status: "published", reason: null, request_id: "request-1", actor_email: "operator@example.invalid", created_at: "2026-11-02T00:00:00.000Z" }];
      if (sql.includes("product_agent_dependencies")) return [{ id: "product-1", product_key: "daily-plan", display_name: "每日计划", version: "1.0.0", status: "published" }];
      throw new Error(`Unexpected query: ${sql}`);
    },
  });
  let response;
  await handler({ params: { id: releaseId }, user: { role: "admin", adminPermissions: ["*"] } }, { json: (value) => { response = value; } });
  assert.deepEqual(response.data.release, release);
  assert.deepEqual(response.data.products, [{ id: "product-1", productKey: "daily-plan", displayName: "每日计划", version: "1.0.0", status: "published" }]);
  assert.deepEqual(response.data.history[0], { id: "history-1", fromStatus: "review", toStatus: "published", reason: null, requestId: "request-1", actorEmail: "operator@example.invalid", createdAt: "2026-11-02T00:00:00.000Z" });
  assert.ok(calls.every((call) => call.params.length === 1 && call.params[0] === releaseId));
});

test("release detail rejects malformed UUIDs with HTTP 400 before accessing the database", async () => {
  let reads = 0;
  const handler = detailHandler({ readRelease: async () => { reads += 1; return release; }, runQuery: async () => { reads += 1; return []; } });
  await assert.rejects(handler({ params: { id: "invalid-id" } }, { json: () => assert.fail("invalid UUID must not succeed") }), (error) => createSafeErrorResponse(error, { production: true }).status === 400);
  assert.equal(reads, 0);
});

test("release detail reports missing releases as HTTP 404 without loading associations", async () => {
  const handler = detailHandler({ readRelease: async () => null, runQuery: async () => assert.fail("missing release must not load associations") });
  await assert.rejects(handler({ params: { id: releaseId } }, {}), (error) => error.status === 404 && error.details?.code === "RELEASE_NOT_FOUND");
});

test("release managers without products:read cannot load or infer associated product records", async () => {
  let productReads = 0;
  const handler = detailHandler({ readRelease: async () => release, runQuery: async (sql) => {
    if (sql.includes("product_agent_dependencies")) { productReads += 1; return [{ product_key: "restricted-product" }]; }
    return [];
  } });
  let response;
  await handler({ params: { id: releaseId }, user: { role: "admin", adminPermissions: ["agents:manage"] } }, { json: (value) => { response = value; } });
  assert.deepEqual(response.data.products, []);
  assert.equal(response.data.productsVisible, false);
  assert.equal(productReads, 0);
});
