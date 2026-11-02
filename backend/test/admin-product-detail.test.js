import test from "node:test";
import assert from "node:assert/strict";
import { registerAdminProductRoutes } from "../src/routes/admin-product-routes.js";

const productId = "2ea0e86b-b7c8-4d46-9622-6a3b891f1b37";
function detailRoute({ product = { id: productId }, readQuery = async () => [] } = {}) {
  const routes = new Map();
  const required = [];
  const app = Object.fromEntries(["get", "post"].map((verb) => [verb, (path, ...handlers) => routes.set(`${verb} ${path}`, handlers.at(-1))]));
  let reads = 0;
  registerAdminProductRoutes(app, {
    authenticate: () => {}, asyncHandler: (handler) => handler,
    requireAdmin: (permission) => { required.push(permission); return () => {}; },
    repository: { getProduct: async () => { reads += 1; return product; } },
    readQuery,
  });
  return { handle: routes.get("get /api/admin/products/:id"), required, reads: () => reads };
}

test("product detail returns fresh product, ordered history and numeric entitlement counts", async () => {
  const route = detailRoute({ readQuery: async (sql, params) => {
    assert.deepEqual(params, [productId]);
    if (sql.includes("product_status_history")) {
      assert.match(sql, /ORDER BY h.created_at ASC, h.id ASC/);
      return [{ id: "history", from_status: "review", to_status: "published", actor_email: "operator@example.invalid", created_at: "2026-11-02T00:00:00Z" }];
    }
    assert.match(sql, /GROUP BY status/);
    return [{ status: "enabled", count: "3" }];
  } });
  let payload;
  await route.handle({ params: { id: productId } }, { json: (value) => { payload = value; } });
  assert.equal(payload.data.product.id, productId);
  assert.equal(payload.data.history[0].toStatus, "published");
  assert.equal(payload.data.history[0].actorEmail, "operator@example.invalid");
  assert.deepEqual(payload.data.entitlementSummary, [{ status: "enabled", count: 3 }]);
  assert.equal(route.required[1], "products:read");
});

test("product detail rejects malformed IDs before any database read and returns explicit not found", async () => {
  const route = detailRoute({ product: null });
  await assert.rejects(route.handle({ params: { id: "not-a-uuid" } }, {}), (error) => error.status === 400 && error.details.code === "PRODUCT_ID_INVALID");
  assert.equal(route.reads(), 0);
  await assert.rejects(route.handle({ params: { id: productId } }, {}), (error) => error.status === 404 && error.details.code === "PRODUCT_NOT_FOUND");
  assert.equal(route.reads(), 1);
});
