import assert from "node:assert/strict";
import test from "node:test";
import { agentIdentityCard } from "../src/components/agent-identity-card.js";
import { dataTable } from "../src/components/data-table.js";
import { hasPermission, visibleModules } from "../src/permissions.js";
import { createRouter, routeFromLocation, ROUTES } from "../src/router.js";

test("modular router normalizes admin paths and rejects unknown modules", () => {
  assert.equal(routeFromLocation({ pathname: "/admin/monitoring" }), "monitoring");
  assert.equal(routeFromLocation({ pathname: "/admin/does-not-exist" }), "overview");
  assert.deepEqual(ROUTES, ["overview", "accounts", "agents", "products", "tasks", "monitoring", "audit", "system"]);
  const calls = [];
  const router = createRouter({ location: { pathname: "/admin/overview" }, history: { pushState() {} }, onRoute: (name) => calls.push(name) });
  assert.equal(router.navigate("products"), "products");
  assert.deepEqual(calls, ["products"]);
});

test("permissions filter navigation without treating non-admin wildcard as admin", () => {
  assert.equal(hasPermission({ role: "user", adminPermissions: ["*"] }, "users:read"), false);
  assert.deepEqual(visibleModules({ role: "admin", adminPermissions: ["users:read", "audit:read"] }), ["overview", "accounts", "monitoring", "audit"]);
});

test("identity cards stop rendering when the server contract is incomplete", () => {
  const html = agentIdentityCard({ key: "album-manager", displayName: "相册助手" });
  assert.match(html, /身份合同错误/);
  assert.doesNotMatch(html, /相册助手/);
  const complete = agentIdentityCard({ key: "album-manager", displayName: "相册助手", description: "真实描述", mark: "相", shape: "circle", colors: { background: "#111" }, source: "catalog", updatedAt: "2026-10-29T00:00:00Z" });
  assert.match(complete, /相册助手/);
  assert.match(complete, /album-manager/);
});

test("shared table keeps unknown values explicit and shows a real-data empty state", () => {
  assert.match(dataTable({ columns: [{ key: "cost", label: "成本", format: (value) => value == null ? "未知" : value }], rows: [{ cost: null }] }), /未知/);
  assert.match(dataTable({ columns: [{ key: "id", label: "任务" }], rows: [] }), /暂无真实数据/);
});
