import assert from "node:assert/strict";
import test from "node:test";

const { createAgentPublishingService } = await import("../src/agent-publishing-service.js");
const { createProductCatalogRepository } = await import("../src/product-catalog-repository.js");
const { computeAgentContractHash } = await import("../../shared/agent-catalog.js");

const product = {
  id: "product-1",
  productKey: "site-builder-product",
  status: "published",
  dependencies: [{ agentKey: "site-builder", scopes: ["station:read"] }],
};

test("Agent access is resolved through the unique published product entitlement", async () => {
  const calls = [];
  const service = createAgentPublishingService({
    productRepository: {
      listPublishedProductsForAgent: async (agentKey) => {
        assert.equal(agentKey, "site-builder");
        return [product];
      },
      createEntitlement: async (args) => {
        calls.push(["enable", args]);
        return { id: "entitlement-1", productId: args.productId, status: "enabled", grantedScopes: args.grantedScopes };
      },
      disableEntitlement: async (args) => {
        calls.push(["disable", args]);
        return { id: "entitlement-1", productId: args.productId, status: "disabled", grantedScopes: [] };
      },
    },
    recordAudit: async () => {},
  });

  const enabled = await service.setAgentAccessThroughProduct({
    userId: "user-1",
    agentKey: "site-builder",
    enabled: true,
    grantedScopes: ["station:read"],
    consentVersion: "product-consent-v1",
    idempotencyKey: "enable-0001",
  });
  assert.equal(enabled.status, "enabled");
  assert.equal(calls[0][1].productId, "product-1");

  const disabled = await service.setAgentAccessThroughProduct({
    userId: "user-1",
    agentKey: "site-builder",
    enabled: false,
    grantedScopes: [],
    idempotencyKey: "disable-0001",
  });
  assert.equal(disabled.status, "disabled");
  assert.equal(calls[1][1].productId, "product-1");
});

test("Agent access rejects missing or ambiguous product publication", async () => {
  const missing = createAgentPublishingService({
    productRepository: { listPublishedProductsForAgent: async () => [] },
  });
  await assert.rejects(
    missing.setAgentAccessThroughProduct({ userId: "u", agentKey: "unknown", enabled: true, grantedScopes: [], idempotencyKey: "request-01" }),
    { details: { code: "AGENT_PRODUCT_UNAVAILABLE" } },
  );

  const ambiguous = createAgentPublishingService({
    productRepository: {
      listPublishedProductsForAgent: async () => [product, { ...product, id: "product-2" }],
    },
  });
  await assert.rejects(
    ambiguous.setAgentAccessThroughProduct({ userId: "u", agentKey: "site-builder", enabled: true, grantedScopes: ["station:read"], idempotencyKey: "request-02" }),
    (error) => error?.details?.code === "AGENT_PRODUCT_MAPPING_AMBIGUOUS" && error.details.productIds.length === 2,
  );
});

test("Album product entitlement invokes the media lifecycle hook in the same repository transaction", async () => {
  const calls = [];
  const albumProduct = {
    id: "album-product",
    status: "published",
    dependencies: [{ agentKey: "album-manager", scopes: ["album:read"] }],
  };
  const service = createAgentPublishingService({
    productRepository: {
      listPublishedProductsForAgent: async () => [albumProduct],
      createEntitlement: async (args) => {
        calls.push(args);
        await args.afterProjection({ userId: args.userId, enabled: true, consentVersion: args.consentVersion, idempotencyKey: args.idempotencyKey, product: albumProduct, connection: {} });
        return { status: "enabled", grantedScopes: args.grantedScopes };
      },
    },
    afterProductProjection: async (args) => calls.push({ hook: args }),
  });
  await service.setAgentAccessThroughProduct({
    userId: "user-1",
    agentKey: "album-manager",
    enabled: true,
    grantedScopes: ["album:read"],
    consentVersion: "media-retrieval-consent-v1",
    idempotencyKey: "album-enable-1",
  });
  assert.equal(calls.length, 2);
  assert.equal(calls[1].hook.enabled, true);
});

test("direct product revocation invokes the media lifecycle hook", async () => {
  const calls = [];
  const service = createAgentPublishingService({
    productRepository: {
      disableEntitlement: async (args) => {
        calls.push(args);
        await args.afterProjection({
          userId: args.userId,
          enabled: false,
          consentVersion: null,
          idempotencyKey: args.idempotencyKey,
          product: { id: "album-product", dependencies: [{ agentKey: "album-manager" }] },
          connection: {},
        });
        return { status: "disabled", grantedScopes: [] };
      },
    },
    afterProductProjection: async (args) => calls.push({ hook: args }),
  });

  const result = await service.disableProduct({
    userId: "user-1",
    productId: "album-product",
    idempotencyKey: "album-disable-1",
  });
  assert.equal(result.status, "disabled");
  assert.equal(calls.length, 2);
  assert.equal(calls[1].hook.enabled, false);
});

function productRow(overrides = {}) {
  return {
    id: "product-1",
    product_key: "site-builder-product",
    display_name: "建站产品",
    description: "",
    identity_snapshot: JSON.stringify({ key: "site-builder-product", displayName: "建站产品" }),
    status: "published",
    product_version_id: "version-1",
    version: "1.0.0",
    supported_platforms: JSON.stringify(["ios"]),
    version_status: "published",
    contract_hash: "a".repeat(64),
    ...overrides,
  };
}

function dependencyRow(overrides = {}) {
  return {
    agent_key: "site-builder",
    agent_release_id: "release-1",
    version: "1.0.0",
    required_scopes: JSON.stringify(["station:read"]),
    // This is the result column of r.declared_scopes AS declared_scopes;
    // product_agent_dependencies itself has no declared_scopes column.
    declared_scopes: JSON.stringify(["station:read"]),
    release_contract_hash: "b".repeat(64),
    identity_snapshot: JSON.stringify({ key: "site-builder", avatarKind: "agent-mark", displayName: "建站", description: "", mark: "建", shape: "circle", colors: { background: "#123456", foreground: "#ffffff", accent: "#facc15" }, published: true, source: "registry", updatedAt: "2026-10-29T00:00:00.000Z" }),
    readiness: JSON.stringify({ ready: true, missing: [] }),
    release_status: "published",
    registry_version: "1.0.0",
    registry_declared_scopes: JSON.stringify(["station:read"]),
    registry_contract_hash: "b".repeat(64),
    registry_status: "registered",
    ...overrides,
  };
}

test("public product listing omits a published product whose release dependency is no longer current", async () => {
  const repository = createProductCatalogRepository({
    query: async (sql) => {
      if (sql.includes("FROM product_agent_dependencies")) {
        assert.match(sql, /r\.declared_scopes AS declared_scopes/);
        return [dependencyRow({ release_status: "paused" })];
      }
      return [productRow()];
    },
  });
  const products = await repository.listProducts({ includeUnpublished: false });
  assert.deepEqual(products, []);
});

test("Agent execution access fails explicitly when its published product dependency is paused", async () => {
  const repository = createProductCatalogRepository({
    query: async (sql) => {
      if (sql.startsWith("SELECT DISTINCT p.id")) return [{ id: "product-1" }];
      if (sql.includes("FROM product_agent_dependencies")) {
        assert.match(sql, /r\.declared_scopes AS declared_scopes/);
        return [dependencyRow({ release_status: "paused" })];
      }
      return [productRow()];
    },
  });
  const service = createAgentPublishingService({ productRepository: repository });
  await assert.rejects(
    service.setAgentAccessThroughProduct({ userId: "user-1", agentKey: "site-builder", enabled: true, grantedScopes: ["station:read"], idempotencyKey: "enable-0002" }),
    (error) => error?.details?.code === "AGENT_PRODUCT_UNAVAILABLE",
  );
});

test("Agent product mapping query keeps PostgreSQL DISTINCT ordering valid", async () => {
  let mappingSql = "";
  const repository = createProductCatalogRepository({
    query: async (sql) => {
      if (sql.includes("SELECT DISTINCT")) {
        mappingSql = sql;
        return [{ id: "product-1", product_key: "site-builder-product" }];
      }
      if (sql.startsWith("SELECT p.*")) return [productRow()];
      if (sql.includes("FROM product_agent_dependencies")) return [dependencyRow()];
      return [];
    },
  });
  const products = await repository.listPublishedProductsForAgent("site-builder", {
    userId: "user-1",
    publishedOnly: false,
  });
  assert.equal(products.length, 1);
  assert.match(mappingSql, /SELECT DISTINCT p\.id, p\.product_key/);
  assert.match(mappingSql, /ORDER BY p\.product_key/);
});

test("product contract hash includes the canonical identity snapshot", async () => {
  const identity = { key: "site-builder-product", avatarKind: "agent-mark", displayName: "建站产品", description: "", mark: "建", shape: "circle", colors: { background: "#123456", foreground: "#ffffff", accent: "#facc15" }, published: false, source: "admin", updatedAt: "2026-10-29T00:00:00.000Z" };
  const release = dependencyRow();
  const updates = [];
  const repository = createProductCatalogRepository({
    withTransaction: async (work) => work({
      query: async (sql, params = []) => {
        if (sql.startsWith("SELECT id, agent_key, version")) return [{ id: "release-1", agent_key: "site-builder", version: "1.0.0", contract_hash: release.release_contract_hash, declared_scopes: release.declared_scopes, catalog_status: "published" }];
        if (sql.startsWith("UPDATE product_versions SET contract_hash")) { updates.push(params[0]); return []; }
        if (sql.startsWith("SELECT p.*")) return [productRow({ identity_snapshot: JSON.stringify(identity), contract_hash: updates[0] })];
        if (sql.includes("FROM product_agent_dependencies")) return [release];
        return [];
      },
    }),
    randomUUID: (() => { let n = 0; return () => `id-${++n}`; })(),
  });
  await repository.createProduct({ productKey: identity.key, version: "1.0.0", displayName: identity.displayName, description: identity.description, identity, supportedPlatforms: ["ios"], dependencies: [{ agentKey: "site-builder", agentReleaseId: "release-1", version: "1.0.0", scopes: ["station:read"] }] });
  const expected = computeAgentContractHash({ productKey: identity.key, version: "1.0.0", displayName: identity.displayName, description: identity.description, identity, supportedPlatforms: ["ios"], dependencies: [{ agentKey: "site-builder", agentReleaseId: "release-1", version: "1.0.0", scopes: ["station:read"], contractHash: release.release_contract_hash }] });
  assert.equal(updates[0], expected);
});

test("product enable rejects an entitlement whose stored product contract hash is stale", async () => {
  const identity = { key: "site-builder-product", avatarKind: "agent-mark", displayName: "建站产品", description: "", mark: "建", shape: "circle", colors: { background: "#123456", foreground: "#ffffff", accent: "#facc15" }, published: false, source: "admin", updatedAt: "2026-10-29T00:00:00.000Z" };
  const connection = { query: async (sql) => {
    if (sql.startsWith("SELECT p.*")) return [productRow({ identity_snapshot: JSON.stringify(identity), contract_hash: "a".repeat(64) })];
    if (sql.includes("FROM product_agent_dependencies")) {
      assert.match(sql, /r\.declared_scopes AS declared_scopes/);
      return [dependencyRow()];
    }
    if (sql.startsWith("SELECT id FROM users")) return [{ id: "user-1" }];
    throw new Error(`Unexpected query: ${sql}`);
  } };
  const repository = createProductCatalogRepository({ withTransaction: async (work) => work(connection) });
  await assert.rejects(
    repository.createEntitlement({ userId: "user-1", productId: "product-1", grantedScopes: ["station:read"], consentVersion: "v1", idempotencyKey: "enable-0001" }),
    (error) => error?.details?.code === "PRODUCT_CONTRACT_STALE",
  );
});
