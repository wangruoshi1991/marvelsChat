import assert from "node:assert/strict";
import test from "node:test";
import { ADMIN_NAV_GROUPS, activeAdminPage, filterAdminNav, resourceHref, visibleResourcePages } from "../src/components/admin-workspace.js";

test("admin workspace exposes grouped resources without losing direct URLs", () => {
  assert.equal(activeAdminPage("/admin/products"), "products");
  assert.equal(activeAdminPage("/admin/unknown"), "overview");
  assert.equal(resourceHref("monitoring"), "/monitoring");
  assert.ok(ADMIN_NAV_GROUPS.some((group) => group.key === "publishing" && group.children.some((item) => item.key === "releases")));
});

test("admin workspace filters groups by server permissions", () => {
  const groups = filterAdminNav({ role: "admin", adminPermissions: ["users:read", "products:read"] });
  assert.deepEqual(groups.map((group) => group.key), ["workspace", "accounts", "publishing"]);
  assert.deepEqual(groups.find((group) => group.key === "publishing").children.map((item) => item.key), ["products"]);
  assert.deepEqual(filterAdminNav({ role: "user", adminPermissions: ["*"] }), []);
});

test("resource subnavigation excludes same-domain resources without permission", () => {
  const user = { role: "admin", adminPermissions: ["products:read"] };
  assert.deepEqual(visibleResourcePages(user, "products").map((page) => page.key), ["products"]);
  assert.deepEqual(visibleResourcePages(user, "products", [{ key: "releases" }, { key: "products" }]).map((page) => page.key), ["products"]);
});

