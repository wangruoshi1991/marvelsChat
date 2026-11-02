import assert from "node:assert/strict";
import test from "node:test";
import { createProductCatalogRepository, mapProduct } from "../src/product-catalog-repository.js";

const oldIdentity = { key: "demo", avatarKind: "agent-mark", displayName: "旧名称", description: "", mark: "旧", shape: "circle", colors: { background: "#123456", foreground: "#ffffff", accent: "#facc15" }, published: false, source: "admin", updatedAt: "2026-11-02T00:00:00.000Z" };

test("product DTO reads immutable version identity and presentation snapshots", () => {
  const product = mapProduct({ id: "p1", product_key: "demo", display_name: "当前名称", identity_snapshot: { ...oldIdentity, displayName: "当前名称" }, version_display_name: oldIdentity.displayName, version_description: "原版本描述", version_identity_snapshot: oldIdentity });
  assert.equal(product.displayName, oldIdentity.displayName);
  assert.equal(product.description, "原版本描述");
  assert.deepEqual(product.identity, oldIdentity);
});

test("product version APIs expose precise version creation and draft editing", () => {
  const repository = createProductCatalogRepository();
  assert.equal(typeof repository.createProductVersion, "function");
  assert.equal(typeof repository.updateProductVersion, "function");
  assert.equal(typeof repository.listProductVersions, "function");
});

test("exact product-version detail cannot silently select a newer draft", async () => {
  const calls = [];
  const repository = createProductCatalogRepository({ query: async (sql, params) => { calls.push({ sql, params }); return []; } });
  assert.equal(await repository.getProduct("p1", { productVersionId: "v1" }), null);
  assert.ok(calls[0].sql.includes("pv.id = ?"));
  assert.ok(calls[0].params.includes("v1"));
});
