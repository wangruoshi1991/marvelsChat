import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { createAgentCatalogDiagnostics } from "../src/agent-catalog-diagnostics.js";
import { createAgentReleaseRepository } from "../src/agent-release-repository.js";
import { createProductCatalogRepository } from "../src/product-catalog-repository.js";
import { closeDatabase, query } from "../src/db.js";
import { cleanupPublishedAgentConsent } from "./helpers/agent-publishing-fixture.js";

const enabled = process.env.RUN_AGENT_CATALOG_DIAGNOSTICS_POSTGRES === "1";
const observedTables = [
  "agent_registry", "agent_catalog", "agent_releases", "agent_release_status_history",
  "products", "product_versions", "product_agent_dependencies", "product_status_history",
  "users", "user_agents", "user_entitlements", "entitlement_status_history", "chat_threads", "usage_events",
];

async function publicationSnapshot() {
  const snapshot = {};
  for (const table of observedTables) {
    const [result] = await query(`SELECT COALESCE(jsonb_agg(row ORDER BY row::text), '[]'::jsonb) AS rows
      FROM (SELECT to_jsonb(entry) AS row FROM ${table} entry) entries`);
    snapshot[table] = result.rows;
  }
  return snapshot;
}

test("catalog diagnostics read real publication SQL without syncing or changing consent", {
  skip: !enabled && "RUN_AGENT_CATALOG_DIAGNOSTICS_POSTGRES=1 requires a dedicated loopback *_migration_test database",
}, async t => {
  const url = new URL(process.env.DATABASE_URL);
  assert.ok(["127.0.0.1", "localhost", "[::1]"].includes(url.hostname));
  assert.match(url.pathname, /_migration_test$/);
  const [database] = await query("SELECT current_database() AS name, host(inet_server_addr()) AS address");
  assert.match(database.name, /_migration_test$/);
  assert.ok(["127.0.0.1", "::1"].includes(database.address));

  const key = `diagnostics-${randomUUID().slice(0, 8)}`;
  const productKey = `${key}-product`;
  const userId = randomUUID();
  const identity = {
    key, avatarKind: "agent-mark", displayName: "隔离漫画诊断", description: "仅测试发布链路",
    mark: "漫", shape: "circle", colors: { background: "#123456", foreground: "#ffffff", accent: "#abcdef" },
    published: false, source: "admin", updatedAt: "2026-11-11T00:00:00.000Z",
  };
  let agent = { key, name: identity.displayName, description: identity.description, version: "0.1.4",
    permissions: ["messages:read", "media:image:generate"], identity, readiness: { ready: true, missing: [] } };
  // This code-only entry must remain absent from agent_catalog during diagnosis.
  const unsynced = { ...agent, key: `${key}-unsynced` };
  const releases = createAgentReleaseRepository();
  const products = createProductCatalogRepository();
  const diagnose = createAgentCatalogDiagnostics({ listRegistered: async () => [agent, unsynced] });
  let release;
  let product;
  const readWithoutWrites = async () => {
    const before = await publicationSnapshot();
    const result = await diagnose({ release, products: product ? [product] : [] });
    assert.deepEqual(await publicationSnapshot(), before,
      "diagnosis must not sync registry/catalog or mutate publication, audit, user consent or conversation rows");
    return result;
  };

  try {
    await query("INSERT INTO users (id,email,password_hash,display_name,ai_id) VALUES (?,?,'isolated-test-only',?,?)",
      [userId, `${key}@example.invalid`, key, `96${String(Math.floor(Math.random() * 1e10)).padStart(10, "0")}`]);
    const draft = await releases.createDraft({ agent, identity, actorUserId: userId, requestId: `${key}-release` });
    await releases.transition({ releaseId: draft.release.id, toStatus: "review", actorUserId: userId });
    release = await releases.transition({ releaseId: draft.release.id, toStatus: "published", actorUserId: userId });
    await query("INSERT INTO usage_events (id,user_id,event_type,target_type,target_id,payload) VALUES (?,?, 'test.catalog_diagnostic', 'agent_release', ?, '{}'::jsonb)",
      [randomUUID(), userId, release.id]);

    await t.test("a published release without a product remains invisible", async () => {
      const result = await readWithoutWrites();
      assert.equal(result.visible, false);
      assert.equal(result.selectedReleaseVisible, false);
      assert.equal(result.sourceVersion, "0.1.4");
      assert.ok(result.reasons.some(reason => reason.code === "AGENT_PRODUCT_UNAVAILABLE"));
      assert.deepEqual(await query("SELECT id FROM user_entitlements WHERE user_id = ?", [userId]), []);
    });

    await t.test("an exact published product makes the release visible without granting access", async () => {
      product = await products.createProduct({ productKey, version: "1.0.0", displayName: "隔离漫画产品",
        description: identity.description, identity: { ...identity, key: productKey, displayName: "隔离漫画产品" },
        supportedPlatforms: ["ios"], createdBy: userId, requestId: `${key}-product`,
        dependencies: [{ agentKey: key, agentReleaseId: release.id, version: agent.version, scopes: agent.permissions }] });
      await products.transitionProduct({ productId: product.id, productVersionId: product.productVersionId, toStatus: "review", actorUserId: userId });
      product = await products.transitionProduct({ productId: product.id, productVersionId: product.productVersionId, toStatus: "published", actorUserId: userId });
      const result = await readWithoutWrites();
      assert.equal(result.visible, true);
      assert.equal(result.selectedReleaseVisible, true);
      assert.deepEqual(result.reasons, []);
      assert.deepEqual(result.products[0].reasons, []);
      assert.deepEqual(await query("SELECT id FROM user_entitlements WHERE user_id = ?", [userId]), []);
      assert.deepEqual(await query("SELECT agent_id FROM user_agents WHERE user_id = ?", [userId]), []);
    });

    await t.test("reading diagnostics preserves an existing explicit consent and its audit history", async () => {
      await products.createEntitlement({ userId, productId: product.id, productVersionId: product.productVersionId,
        grantedScopes: agent.permissions, consentVersion: "explicit-isolated-test-consent", idempotencyKey: `${key}-consent` });
      assert.equal((await readWithoutWrites()).selectedReleaseVisible, true);
      assert.equal((await query("SELECT status FROM user_entitlements WHERE user_id = ?", [userId]))[0].status, "enabled");
    });

    await t.test("a source and registry upgrade hides the old product without silently upgrading consent", async () => {
      agent = { ...agent, version: "0.1.5" };
      await releases.syncRegisteredAgents([agent]);
      const result = await readWithoutWrites();
      assert.equal(result.visible, false);
      assert.equal(result.selectedReleaseVisible, false);
      assert.equal(result.sourceVersion, "0.1.5");
      assert.ok(result.reasons.some(reason => reason.code === "SOURCE_VERSION_STALE"));
      assert.ok(result.products[0].reasons.some(reason => reason.code === "REGISTRY_VERSION_STALE"));
      const [grant] = await query("SELECT status,product_version_id FROM user_entitlements WHERE user_id = ?", [userId]);
      assert.equal(grant.status, "enabled", "diagnosis must preserve the stored consent status");
      assert.equal(grant.product_version_id.trim(), product.productVersionId);
    });
  } finally {
    await cleanupPublishedAgentConsent({ userIds: [userId] });
    await query("DELETE FROM usage_events WHERE user_id = ?", [userId]);
    await query("DELETE FROM users WHERE id = ?", [userId]);
    if (product) {
      await query("DELETE FROM product_status_history WHERE product_id = ?", [product.id]);
      await query("DELETE FROM products WHERE id = ?", [product.id]);
    }
    if (release) {
      await query("DELETE FROM agent_release_status_history WHERE release_id = ?", [release.id]);
      await query("DELETE FROM agent_releases WHERE id = ?", [release.id]);
    }
    await query("DELETE FROM agent_registry WHERE agent_key = ?", [key]);
    await query("DELETE FROM agent_catalog WHERE agent_id = ?", [key]);
    await closeDatabase();
  }
});
