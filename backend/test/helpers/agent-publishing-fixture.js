import assert from "node:assert/strict";
import { getAgent } from "../../../agents/registry.js";
import { computeAgentReleaseContractHash } from "../../../shared/agent-catalog.js";
import { query, withTransaction } from "../../src/db.js";
import { createAgentReleaseRepository } from "../../src/agent-release-repository.js";
import { createProductCatalogRepository } from "../../src/product-catalog-repository.js";

async function assertDisposableDatabase(queryFn) {
  const [database] = await queryFn("SELECT current_database() AS name, host(inet_server_addr()) AS address");
  assert.match(database.name, /_migration_test$/, "Publishing fixtures require a disposable migration test database");
  assert.ok(["127.0.0.1", "::1"].includes(database.address), "Publishing fixtures require loopback PostgreSQL");
}

// Test teardown only: synthetic users are removed by their suite after this
// explicit FK order. Production account deletion has its own privacy workflow.
export async function cleanupPublishedAgentConsent({ userIds, queryFn = query }) {
  if (!userIds.length) return;
  await assertDisposableDatabase(queryFn);
  await queryFn(`DELETE FROM entitlement_status_history WHERE entitlement_id IN
    (SELECT id FROM user_entitlements WHERE user_id = ANY(?::text[]))`, [userIds]);
  await queryFn("DELETE FROM user_entitlements WHERE user_id = ANY(?::text[])", [userIds]);
}

// Explicit test setup for synthetic users. This helper follows the production
// repository lifecycle and consent projection; it never changes access checks.
// Call after a suite's conversation fixtures exist to reuse their real threads.
export async function seedPublishedAgentConsent({
  userId, agentKeys, queryFn = query, transaction = withTransaction,
}) {
  await assertDisposableDatabase(queryFn);
  const releaseRepository = createAgentReleaseRepository({ query: queryFn, withTransaction: transaction });
  const productRepository = createProductCatalogRepository({ query: queryFn, withTransaction: transaction });
  const publications = [];
  const snapshots = [];

  for (const agentKey of [...new Set(agentKeys)]) {
    const runtime = await getAgent(agentKey);
    assert.ok(runtime, `Missing test Agent registration: ${agentKey}`);
    const agent = { ...runtime, readiness: { ready: true, missing: [] } };
    const identity = {
      key: agent.key, avatarKind: "agent-mark", displayName: agent.name,
      description: agent.description || "", mark: agent.identity.mark,
      shape: agent.identity.shape, colors: agent.identity.colors,
      published: false, source: "admin", updatedAt: "2026-11-02T00:00:00.000Z",
    };
    const contractHash = computeAgentReleaseContractHash({ key: agent.key, version: agent.version, permissions: agent.permissions, identity });
    const [registry] = await queryFn("SELECT * FROM agent_registry WHERE agent_key = ?", [agent.key]);
    const [catalog] = await queryFn("SELECT * FROM agent_catalog WHERE agent_id = ?", [agent.key]);
    let [existingRelease] = await queryFn("SELECT id, catalog_status FROM agent_releases WHERE agent_key = ? AND version = ? AND contract_hash = ?", [agent.key, agent.version, contractHash]);
    const createdRelease = !existingRelease;
    if (!existingRelease) {
      const created = await releaseRepository.createDraft({ agent, identity, actorUserId: userId, requestId: `fixture-release-${agent.key}-${contractHash.slice(0, 32)}` });
      existingRelease = { id: created.release.id, catalog_status: created.release.catalogStatus };
      await releaseRepository.transition({ releaseId: created.release.id, toStatus: "review", actorUserId: userId, reason: "explicit_test_fixture_review" });
      await releaseRepository.transition({ releaseId: created.release.id, toStatus: "published", actorUserId: userId, reason: "explicit_test_fixture_publish" });
    } else {
      assert.equal(existingRelease.catalog_status, "published", "An existing fixture release must already be published");
    }
    const releaseId = String(existingRelease.id).trim();
    const productKey = `integration-${contractHash.slice(0, 40)}`;
    let product = await productRepository.getProduct(productKey, { publishedOnly: true });
    const createdProduct = !product;
    if (!product) {
      const productIdentity = { ...identity, key: productKey, displayName: `${agent.name} test product` };
      product = await productRepository.createProduct({
        productKey, version: "1.0.0", displayName: productIdentity.displayName,
        description: productIdentity.description, identity: productIdentity,
        supportedPlatforms: ["ios", "android"], createdBy: userId,
        dependencies: [{ agentKey: agent.key, agentReleaseId: releaseId, version: agent.version, scopes: agent.permissions }],
      });
      await productRepository.transitionProduct({ productId: product.id, productVersionId: product.productVersionId, toStatus: "review", actorUserId: userId, reason: "explicit_test_fixture_review" });
      product = await productRepository.transitionProduct({ productId: product.id, productVersionId: product.productVersionId, toStatus: "published", actorUserId: userId, reason: "explicit_test_fixture_publish" });
    }
    const entitlement = await productRepository.createEntitlement({
      userId, productId: product.id, productVersionId: product.productVersionId,
      grantedScopes: agent.permissions, consentVersion: "explicit-integration-test-consent-v1",
      idempotencyKey: `fixture-consent-${userId}-${contractHash.slice(0, 32)}`,
    });
    publications.push({ agentKey: agent.key, releaseId, productId: product.id, productVersionId: product.productVersionId, entitlementId: entitlement.id });
    snapshots.push({ agentKey: agent.key, registry, catalog, createdProduct, createdRelease, productId: product.id, releaseId });
  }

  return {
    publications,
    async cleanup() {
      // Suites remove their synthetic users first. Never delete another
      // fixture user's still-referenced publication or alter their consent.
      for (const snapshot of snapshots.reverse()) {
        if (!snapshot.createdRelease && !snapshot.createdProduct) continue;
        const [references] = await queryFn("SELECT COUNT(*)::int AS count FROM user_entitlements WHERE product_id = ?", [snapshot.productId]);
        if (references.count) continue;
        if (snapshot.createdProduct) {
          await queryFn("DELETE FROM product_status_history WHERE product_id = ?", [snapshot.productId]);
          await queryFn("DELETE FROM products WHERE id = ?", [snapshot.productId]);
        }
        const [dependencies] = await queryFn("SELECT COUNT(*)::int AS count FROM product_agent_dependencies WHERE agent_release_id = ?", [snapshot.releaseId]);
        if (dependencies.count) continue;
        if (snapshot.createdRelease) {
          await queryFn("DELETE FROM agent_release_status_history WHERE release_id = ?", [snapshot.releaseId]);
          await queryFn("DELETE FROM agent_releases WHERE id = ?", [snapshot.releaseId]);
        }
        if (snapshot.registry) {
          const row = snapshot.registry;
          await queryFn(`UPDATE agent_registry SET version = ?, contract_hash = ?, declared_scopes = ?::jsonb,
            readiness = ?::jsonb, registration_status = ?, source = ?, removed_at = ?, updated_at = ? WHERE agent_key = ?`,
          [row.version, row.contract_hash, JSON.stringify(row.declared_scopes), JSON.stringify(row.readiness), row.registration_status, row.source, row.removed_at, row.updated_at, snapshot.agentKey]);
        } else await queryFn("DELETE FROM agent_registry WHERE agent_key = ?", [snapshot.agentKey]);
        if (snapshot.catalog) {
          const row = snapshot.catalog;
          await queryFn(`UPDATE agent_catalog SET display_name = ?, description = ?, identity_mark = ?, identity_shape = ?,
            identity_colors = ?::jsonb, identity_avatar = ?::jsonb, status = ?, release_version = ?, contract_hash = ?, source = ?, updated_at = ? WHERE agent_id = ?`,
          [row.display_name, row.description, row.identity_mark, row.identity_shape, JSON.stringify(row.identity_colors), row.identity_avatar == null ? null : JSON.stringify(row.identity_avatar), row.status, row.release_version, row.contract_hash, row.source, row.updated_at, snapshot.agentKey]);
        } else await queryFn("DELETE FROM agent_catalog WHERE agent_id = ?", [snapshot.agentKey]);
      }
    },
  };
}
