import assert from "node:assert/strict";
import test from "node:test";
import { createAgentReleaseRepository } from "../src/agent-release-repository.js";
import { createProductCatalogRepository } from "../src/product-catalog-repository.js";
import { computeAgentReleaseContractHash } from "../../shared/agent-catalog.js";

const releaseRow = {
  id: "release-1",
  agent_key: "demo-agent",
  version: "1.0.0",
  contract_hash: "a".repeat(64),
  declared_scopes: JSON.stringify(["messages:read"]),
  readiness: JSON.stringify({ ready: true, missing: [] }),
  identity_snapshot: JSON.stringify({ key: "demo-agent", avatarKind: "agent-mark", displayName: "演示", description: "", mark: "演", shape: "circle", colors: { background: "#123456", foreground: "#ffffff", accent: "#facc15" }, published: true, source: "registry", updatedAt: "2026-10-29T00:00:00.000Z" }),
  catalog_status: "published",
};

test("replaying an Agent release transition with the same request ID returns the original state without another write", async () => {
  const calls = [];
  const connection = { query: async (sql, params) => {
    calls.push([sql, params]);
    if (sql.startsWith("SELECT * FROM agent_releases")) return [releaseRow];
    if (sql.includes("FROM agent_release_status_history")) return [{ to_status: "published" }];
    throw new Error(`Unexpected query: ${sql}`);
  } };
  const repository = createAgentReleaseRepository();
  const result = await repository.transition({ releaseId: "release-1", toStatus: "published", requestId: "release-request-1", connection });
  assert.equal(result.catalogStatus, "published");
  assert.equal(calls.some(([sql]) => sql.startsWith("UPDATE ") || sql.startsWith("INSERT ")), false);
});

test("reusing an Agent release request ID for another transition fails explicitly", async () => {
  const connection = { query: async (sql) => {
    if (sql.startsWith("SELECT * FROM agent_releases")) return [releaseRow];
    if (sql.includes("FROM agent_release_status_history")) return [{ to_status: "published" }];
    throw new Error(`Unexpected query: ${sql}`);
  } };
  const repository = createAgentReleaseRepository();
  await assert.rejects(
    repository.transition({ releaseId: "release-1", toStatus: "unpublished", requestId: "release-request-1", connection }),
    (error) => error.details?.code === "IDEMPOTENCY_CONFLICT",
  );
});

test("replaying a product transition with the same request ID returns the original state without another write", async () => {
  const calls = [];
  const connection = { query: async (sql) => {
    calls.push(sql);
    if (sql.startsWith("SELECT p.*")) return [{ id: "product-1", product_key: "demo-product", display_name: "演示产品", description: "", identity_snapshot: "{}", status: "published", product_version_id: "version-1", version: "1.0.0", supported_platforms: "[\"ios\"]", version_status: "published", contract_hash: "b".repeat(64) }];
    if (sql.includes("FROM product_agent_dependencies")) return [];
    if (sql.includes("FROM product_status_history")) return [{ to_status: "published" }];
    throw new Error(`Unexpected query: ${sql}`);
  } };
  const repository = createProductCatalogRepository({ withTransaction: async (work) => work(connection) });
  const result = await repository.transitionProduct({ productId: "product-1", toStatus: "published", requestId: "product-request-1" });
  assert.equal(result.status, "published");
  assert.equal(calls.some((sql) => sql.startsWith("UPDATE ") || sql.startsWith("INSERT ")), false);
});

test("disabling a product rejects an idempotency key that already enabled it", async () => {
  const entitlement = {
    id: "entitlement-1",
    user_id: "user-1",
    product_id: "product-1",
    product_version_id: "version-1",
    status: "enabled",
    granted_scopes: "[]",
    contract_hash: "b".repeat(64),
    idempotency_key: "same-request",
  };
  const connection = { query: async (sql) => {
    if (sql.startsWith("SELECT product_version_id FROM user_entitlements")) return [{ product_version_id: "version-1" }];
    if (sql.startsWith("SELECT p.*")) return [{
      id: "product-1", product_key: "demo-product", display_name: "演示产品", description: "",
      identity_snapshot: "{}", status: "published", product_version_id: "version-1", version: "1.0.0",
      supported_platforms: "[\"ios\"]", version_status: "published", contract_hash: "b".repeat(64),
    }];
    if (sql.includes("FROM product_agent_dependencies")) return [];
    if (sql.includes("SELECT id FROM users")) return [{ id: "user-1" }];
    if (sql.includes("idempotency_key = ?")) return [entitlement];
    if (sql.includes("product_version_id = ?")) return [entitlement];
    throw new Error(`Unexpected query: ${sql}`);
  } };
  const repository = createProductCatalogRepository({ withTransaction: async (work) => work(connection) });
  await assert.rejects(
    repository.disableEntitlement({ userId: "user-1", productId: "product-1", idempotencyKey: "same-request" }),
    (error) => error.details?.code === "IDEMPOTENCY_CONFLICT",
  );
});

test("registry sync preserves a published operator identity for the same runtime version and scopes", async () => {
  const operatorIdentity = {
    key: "demo-agent", avatarKind: "agent-mark", displayName: "运营名称", description: "后台配置",
    mark: "运", shape: "circle", colors: { background: "#123456", foreground: "#ffffff", accent: "#facc15" },
    published: true, source: "admin", updatedAt: "2026-10-29T00:00:00.000Z",
  };
  const operatorHash = computeAgentReleaseContractHash({ key: "demo-agent", version: "1.0.0", permissions: ["messages:read"], identity: operatorIdentity });
  const curated = {
    id: "release-admin", catalog_status: "published", contract_hash: operatorHash,
    declared_scopes: JSON.stringify(["messages:read"]), identity_snapshot: JSON.stringify(operatorIdentity),
  };
  const calls = [];
  const connection = { query: async (sql) => {
    calls.push(sql);
    if (sql.startsWith("INSERT INTO agent_registry")) return [];
    if (sql.startsWith("SELECT id, catalog_status, contract_hash, identity_snapshot, declared_scopes")) {
      return sql.includes("contract_hash = ?") ? [] : [curated];
    }
    if (sql.startsWith("UPDATE agent_releases SET declared_scopes")) return [];
    throw new Error(`Unexpected query: ${sql}`);
  } };
  const repository = createAgentReleaseRepository({ withTransaction: async (work) => work(connection) });
  const [release] = await repository.syncRegisteredAgents([{
    key: "demo-agent", version: "1.0.0", name: "代码名称", description: "代码描述",
    permissions: ["messages:read"], identity: {
      avatarKind: "agent-mark", mark: "码", shape: "circle",
      colors: { background: "#111111", foreground: "#ffffff", accent: "#eeeeee" },
    },
    readiness: { ready: true, missing: [] },
  }]);
  assert.equal(release.releaseId, "release-admin");
  assert.equal(release.contractHash, operatorHash);
  assert.equal(calls.some((sql) => sql.startsWith("INSERT INTO agent_catalog")), false);
  assert.equal(calls.some((sql) => sql.startsWith("INSERT INTO agent_releases")), false);
});

test("identity updates are server-owned operator snapshots", async () => {
  const release = {
    id: "release-identity", agent_key: "demo-agent", version: "1.0.0", catalog_status: "draft",
    declared_scopes: JSON.stringify(["messages:read"]), contract_hash: "a".repeat(64),
  };
  const calls = [];
  const connection = { query: async (sql, params) => {
    calls.push([sql, params]);
    if (sql.includes("pg_advisory_xact_lock") || sql.startsWith("SELECT id FROM agent_releases")) return [];
    if (sql.includes("LIMIT 1 FOR UPDATE")) return [release];
    if (sql.startsWith("UPDATE agent_releases")) return [];
    if (sql.startsWith("UPDATE agent_catalog")) return [];
    if (sql.startsWith("INSERT INTO usage_events")) return [];
    if (sql.startsWith("SELECT * FROM agent_releases WHERE id = ?")) {
      return [{ ...release, contract_hash: params?.[0] === "release-identity" ? release.contract_hash : release.contract_hash }];
    }
    throw new Error(`Unexpected query: ${sql}`);
  } };
  const repository = createAgentReleaseRepository({ withTransaction: async (work) => work(connection) });
  const result = await repository.updateIdentity({
    releaseId: "release-identity",
    identity: {
      key: "demo-agent", avatarKind: "agent-mark", displayName: "运营名称", description: "后台配置",
      mark: "运", shape: "circle", colors: { background: "#123456", foreground: "#ffffff", accent: "#facc15" },
      published: true, source: "client-forged", updatedAt: "2020-01-01T00:00:00.000Z",
    },
    actorUserId: null,
  });
  const identityPayload = JSON.parse(calls.find(([sql]) => sql.startsWith("UPDATE agent_releases"))[1][0]);
  assert.equal(identityPayload.source, "admin");
  assert.equal(identityPayload.published, false);
  assert.notEqual(identityPayload.updatedAt, "2020-01-01T00:00:00.000Z");
  assert.equal(result.identity, null);
});

test("identity update replay is idempotent and a reused key conflicts", async () => {
  const release = {
    id: "release-identity", agent_key: "demo-agent", version: "1.0.0", catalog_status: "draft",
    declared_scopes: JSON.stringify(["messages:read"]), contract_hash: "a".repeat(64),
  };
  const identity = {
    key: "demo-agent", avatarKind: "agent-mark", displayName: "运营名称", description: "后台配置",
    mark: "运", shape: "circle", colors: { background: "#123456", foreground: "#ffffff", accent: "#facc15" },
    published: false, source: "client-forged", updatedAt: "2020-01-01T00:00:00.000Z",
  };
  const operatorIdentity = { ...identity, published: false, source: "admin", updatedAt: "2026-10-29T00:00:00.000Z" };
  const contractHash = computeAgentReleaseContractHash({ key: release.agent_key, version: release.version, permissions: ["messages:read"], identity: operatorIdentity });
  let replay = false;
  const calls = [];
  const connection = { query: async (sql, params = []) => {
    calls.push([sql, params]);
    if (sql.includes("LIMIT 1 FOR UPDATE")) return [release];
    if (sql.includes("pg_advisory_xact_lock") || sql.startsWith("SELECT id FROM agent_releases")) return [];
    if (sql.includes("FROM agent_release_status_history")) return replay ? [{ to_status: "draft", reason: `admin_identity_update:${contractHash}` }] : [];
    if (sql.startsWith("UPDATE agent_releases") || sql.startsWith("UPDATE agent_catalog") || sql.startsWith("INSERT INTO usage_events") || sql.startsWith("INSERT INTO agent_release_status_history")) return [];
    if (sql.startsWith("SELECT * FROM agent_releases WHERE id = ?")) return [release];
    throw new Error(`Unexpected query: ${sql}`);
  } };
  const repository = createAgentReleaseRepository({ withTransaction: async (work) => work(connection) });
  await repository.updateIdentity({ releaseId: release.id, identity, requestId: "identity-request-1" });
  replay = true;
  const beforeReplayWrites = calls.filter(([sql]) => /^(UPDATE|INSERT)/.test(sql)).length;
  await repository.updateIdentity({ releaseId: release.id, identity, requestId: "identity-request-1" });
  const afterReplayWrites = calls.filter(([sql]) => /^(UPDATE|INSERT)/.test(sql)).length;
  assert.equal(afterReplayWrites, beforeReplayWrites);
  replay = true;
  await assert.rejects(
    repository.updateIdentity({ releaseId: release.id, identity: { ...identity, displayName: "另一个名称" }, requestId: "identity-request-1" }),
    (error) => error.details?.code === "IDEMPOTENCY_CONFLICT",
  );
});
