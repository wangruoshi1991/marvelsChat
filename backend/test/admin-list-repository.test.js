import test from "node:test";
import assert from "node:assert/strict";
import { createAdminListRepository } from "../src/admin-list-repository.js";

function fakeQuery() {
  const calls = [];
  const query = async (sql, params = []) => {
    calls.push({ sql, params });
    if (sql.startsWith("SELECT COUNT(*)")) return [{ total: "3" }];
    if (sql.includes("FROM users u")) return [{ id: "u1", email: "a@example.com", display_name: "Alice", role: "user", status: "active", created_at: new Date("2026-01-01"), admin_permissions: [], thread_count: "2", message_count: "4", active_session_count: "1", agent_count: "1" }];
    if (sql.includes("FROM usage_events")) return [{ id: "e1", user_id: "u1", event_type: "admin.user.create", created_at: new Date("2026-01-01"), payload: {}, target_type: "user", target_id: "u1" }];
    if (sql.includes("FROM agent_runs")) return [{ id: "r1", user_id: "u1", agent_id: "planner", status: "success", created_at: new Date("2026-01-01") }];
    if (sql.includes("FROM agent_releases")) return [{ id: "rel1", agent_key: "planner", version: "1.0.0", catalog_status: "published", declared_scopes: [], readiness: { ready: true }, updated_at: new Date("2026-01-01") }];
    if (sql.includes("FROM product_agent_dependencies")) return [];
    if (sql.includes("FROM products p")) return [{ id: "p1", product_key: "planner", display_name: "Planner", status: "published", product_version_id: "pv1", version: "1.0.0", supported_platforms: ["ios"], version_status: "published", contract_hash: "hash" }];
    throw new Error(`Unexpected SQL: ${sql}`);
  };
  return { query, calls };
}

test("admin list pages apply search, sort, and SQL pagination", async () => {
  const fake = fakeQuery();
  const repository = createAdminListRepository(fake.query);
  const result = await repository("users", { page: 2, pageSize: 10, query: "Alice", role: "user", sortBy: "email", sortOrder: "asc" });
  assert.deepEqual(result.items[0].displayName, "Alice");
  assert.deepEqual(result.total, 3);
  assert.deepEqual(result.page, 2);
  assert.deepEqual(result.pageSize, 10);
  const pageQuery = fake.calls.find(({ sql }) => sql.includes("LIMIT ? OFFSET ?"));
  assert.deepEqual(pageQuery.params.at(-2), 10);
  assert.deepEqual(pageQuery.params.at(-1), 10);
  assert.match(pageQuery.sql, /u\.email ASC/);
  assert.match(pageQuery.sql, /u\.role = \?/);
});

test("all five admin resources expose the same page envelope", async () => {
  const repository = createAdminListRepository(fakeQuery().query);
  for (const kind of ["users", "events", "runs", "releases", "products"]) {
    const result = await repository(kind, { page: 1, pageSize: 5 });
    assert.deepEqual(Object.keys(result), ["items", "total", "page", "pageSize"]);
    assert.equal(result.pageSize, 5);
  }
});
