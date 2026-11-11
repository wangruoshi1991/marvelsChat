import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { query, closeDatabase } from "../src/db.js";
import { createAgentReleaseRepository } from "../src/agent-release-repository.js";
import { createProductCatalogRepository } from "../src/product-catalog-repository.js";
import { createAgentPublishingService } from "../src/agent-publishing-service.js";
import { assertAgentProductEntitlement } from "../src/ai-agent-access.js";

const enabled = process.env.RUN_AGENT_PRODUCT_RECONSENT_POSTGRES === "1";
const identityFor = (key, name) => ({ key, avatarKind: "agent-mark", displayName: name, description: "隔离授权升级验证", mark: "测", shape: "circle", colors: { background: "#123456", foreground: "#ffffff", accent: "#abcdef" }, published: false, source: "admin", updatedAt: "2026-11-11T00:00:00.000Z" });

test("Agent publication upgrades support explicit reconsent without unbinding", {
  skip: !enabled && "RUN_AGENT_PRODUCT_RECONSENT_POSTGRES=1 requires a dedicated loopback *_migration_test database",
}, async t => {
  const url = new URL(process.env.DATABASE_URL);
  assert.ok(["127.0.0.1", "localhost", "[::1]"].includes(url.hostname));
  assert.match(url.pathname, /_migration_test$/);
  const [database] = await query("SELECT current_database() AS name, host(inet_server_addr()) AS address");
  assert.match(database.name, /_migration_test$/);
  assert.ok(["127.0.0.1", "::1"].includes(database.address));
  const prefix = `reconsent-${randomUUID().slice(0, 8)}`;
  const userId = randomUUID();
  const key = `${prefix}-agent`;
  let agent = { key, name: "旧漫画能力", description: "隔离授权升级验证", version: "0.1.3", permissions: ["messages:read"], identity: identityFor(key, "旧漫画能力"), readiness: { ready: true, missing: [] } };
  const releases = createAgentReleaseRepository();
  const products = createProductCatalogRepository();
  const service = createAgentPublishingService({ releaseRepository: releases, productRepository: products,
    listRegisteredAgents: async () => [agent],
    getReadiness: async () => ({ [key]: { configured: true, missingEnv: [] } }),
    recordAudit: async () => {}, afterProductProjection: null });
  const publishRelease = async label => {
    const created = await service.createRelease({ agentKey: key, identity: identityFor(key, label), actorUserId: userId, requestId: `${prefix}-${agent.version}-release` });
    await service.reviewRelease({ releaseId: created.release.id, actorUserId: userId });
    return service.publishRelease({ releaseId: created.release.id, actorUserId: userId });
  };
  const publishProduct = async (productKey, release) => {
    const created = await products.createProduct({ productKey, version: "1.0.0", displayName: productKey, description: "隔离授权升级验证", identity: identityFor(productKey, productKey), supportedPlatforms: ["ios"], createdBy: userId,
      dependencies: [{ agentKey: key, agentReleaseId: release.id, version: release.version, scopes: release.declaredScopes }], requestId: `${productKey}-create` });
    await service.submitProduct({ productId: created.id, productVersionId: created.productVersionId, actorUserId: userId });
    return service.publishProduct({ productId: created.id, productVersionId: created.productVersionId, actorUserId: userId });
  };
  try {
    await query("INSERT INTO users (id,email,password_hash,display_name,ai_id) VALUES (?,?,'isolated-test-only',?,?)", [userId, `${prefix}@example.invalid`, prefix, `97${String(Math.floor(Math.random() * 1e10)).padStart(10, "0")}`]);
    const oldRelease = await publishRelease("旧漫画能力");
    const oldProduct = await publishProduct(`${prefix}-old`, oldRelease);
    await service.setAgentAccessThroughProduct({ userId, agentKey: key, productVersionId: oldProduct.productVersionId, enabled: true, grantedScopes: agent.permissions, idempotencyKey: `${prefix}-old-consent` });
    const [thread] = await query("SELECT id FROM chat_threads WHERE user_id = ? AND agent_id = ?", [userId, key]);
    agent = { ...agent, version: "0.1.4", permissions: ["messages:read", "media:image:generate"] };
    const newRelease = await publishRelease("当前漫画能力");
    const newProduct = await publishProduct(`${prefix}-current`, newRelease);

    await t.test("publication never upgrades the old stored user consent", async () => {
      assert.equal((await products.listEntitlementsForUser(userId))[0].status, "unavailable");
      await assert.rejects(assertAgentProductEntitlement({ userId, agent }), error => error.details?.code === "AGENT_PRODUCT_ENTITLEMENT_REQUIRED");
      const [stored] = await query("SELECT status,granted_scopes FROM user_entitlements WHERE user_id = ?", [userId]);
      assert.equal(stored.status, "enabled");
      assert.deepEqual(stored.granted_scopes, ["messages:read"]);
    });

    await t.test("explicit current product consent ignores stale product identities in the display projection", async () => {
      const grant = await service.setAgentAccessThroughProduct({ userId, agentKey: key, productVersionId: newProduct.productVersionId, enabled: true, grantedScopes: agent.permissions, idempotencyKey: `${prefix}-current-consent` });
      assert.equal(grant.status, "enabled");
      assert.equal((await assertAgentProductEntitlement({ userId, agent })).productVersionId, newProduct.productVersionId);
      const [projection] = await query("SELECT enabled,granted_scopes,alias FROM user_agents WHERE user_id = ? AND agent_id = ?", [userId, key]);
      assert.equal(projection.enabled, true);
      assert.deepEqual([...projection.granted_scopes].sort(), [...agent.permissions].sort());
      assert.equal(projection.alias, "当前漫画能力");
      const threads = await query("SELECT id FROM chat_threads WHERE user_id = ? AND agent_id = ?", [userId, key]);
      assert.deepEqual(threads, [thread], "reconsent preserves the conversation without unbinding");
      const grants = await products.listEntitlementsForUser(userId);
      assert.equal(grants.find(value => value.productVersionId === oldProduct.productVersionId).status, "unavailable");
      assert.equal(grants.find(value => value.productVersionId === newProduct.productVersionId).status, "enabled");
    });

    await t.test("explicit current version revocation is not blocked by another historical product", async () => {
      const revoked = await service.setAgentAccessThroughProduct({ userId, agentKey: key, productVersionId: newProduct.productVersionId,
        enabled: false, grantedScopes: [], idempotencyKey: `${prefix}-current-revoke` });
      assert.equal(revoked.status, "disabled");
      const [projection] = await query("SELECT enabled,granted_scopes FROM user_agents WHERE user_id = ? AND agent_id = ?", [userId, key]);
      assert.equal(projection.enabled, false, "an unavailable historical product cannot re-enable the Agent");
      assert.deepEqual(projection.granted_scopes, []);
      await assert.rejects(assertAgentProductEntitlement({ userId, agent }), error => error.details?.code === "AGENT_PRODUCT_ENTITLEMENT_REQUIRED");
      const [old] = await query("SELECT status FROM user_entitlements WHERE user_id = ? AND product_version_id = ?", [userId, oldProduct.productVersionId]);
      assert.equal(old.status, "enabled", "targeted revocation preserves the historical ledger");
    });
  } finally {
    await closeDatabase();
  }
});
