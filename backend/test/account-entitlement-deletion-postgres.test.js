import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { createAccountRepository } from "../src/account-repository.js";
import { createAgentReleaseRepository } from "../src/agent-release-repository.js";
import { createProductCatalogRepository } from "../src/product-catalog-repository.js";
import { closeDatabase, query, withTransaction } from "../src/db.js";

const enabled = process.env.RUN_ACCOUNT_ENTITLEMENT_DELETION_POSTGRES === "1";

test("account deletion removes personal consent atomically and preserves shared publications and other users", {
  skip: !enabled && "RUN_ACCOUNT_ENTITLEMENT_DELETION_POSTGRES=1 requires a dedicated loopback *_migration_test database",
}, async () => {
  const url = new URL(process.env.DATABASE_URL);
  assert.ok(["127.0.0.1", "localhost"].includes(url.hostname));
  assert.match(url.pathname, /_migration_test$/);
  const key = `delete-${randomUUID().slice(0, 8)}`;
  const userId = randomUUID();
  const otherUserId = randomUUID();
  const identity = {
    key, avatarKind: "agent-mark", displayName: "Account deletion test Agent", description: "",
    mark: "测", shape: "circle", colors: { background: "#123456", foreground: "#ffffff", accent: "#facc15" },
    published: false, source: "admin", updatedAt: "2026-11-02T00:00:00.000Z",
  };
  const agent = { key, version: "1.0.0", permissions: ["messages:read"], identity, readiness: { ready: true, missing: [] } };
  const releases = createAgentReleaseRepository();
  const products = createProductCatalogRepository();
  try {
    for (const [index, id] of [userId, otherUserId].entries()) {
      await query("INSERT INTO users (id,email,password_hash,display_name,ai_id) VALUES (?,?,'test-only',?,?)", [id, `${key}-${index}@example.invalid`, `${key}-${index}`, `94${Math.floor(Math.random() * 1e10).toString().padStart(10, "0")}`]);
    }
    const draft = await releases.createDraft({ agent, identity, actorUserId: userId, requestId: `${key}-release` });
    for (const toStatus of ["review", "published"]) await releases.transition({ releaseId: draft.release.id, toStatus, actorUserId: userId });
    const product = await products.createProduct({
      productKey: key, version: "1.0.0", displayName: identity.displayName, description: "", identity,
      supportedPlatforms: ["ios"], createdBy: userId,
      dependencies: [{ agentKey: key, agentReleaseId: draft.release.id, version: agent.version, scopes: agent.permissions }],
    });
    for (const toStatus of ["review", "published"]) await products.transitionProduct({ productId: product.id, productVersionId: product.productVersionId, toStatus, actorUserId: userId });
    const grants = [];
    for (const id of [userId, otherUserId]) grants.push(await products.createEntitlement({
      userId: id, productId: product.id, productVersionId: product.productVersionId,
      grantedScopes: agent.permissions, consentVersion: "explicit-test-consent", idempotencyKey: `${key}-${id}`,
    }));
    const before = await query("SELECT id, entitlement_id, actor_user_id FROM entitlement_status_history WHERE entitlement_id IN (?,?) ORDER BY id", grants.map(item => item.id));
    assert.equal(before.length, 2);
    const productHistory = await query("SELECT id FROM product_status_history WHERE product_id = ? ORDER BY id", [product.id]);
    const releaseHistory = await query("SELECT id FROM agent_release_status_history WHERE release_id = ? ORDER BY id", [draft.release.id]);

    const failing = createAccountRepository({ withTransactionImpl: work => withTransaction(connection => work({
      execute: async (sql, params) => {
        if (sql.startsWith("DELETE FROM users")) throw new Error("injected_delete_failure");
        return connection.execute(sql, params);
      },
    })) });
    await assert.rejects(failing.deleteUserAccount({ userId }), /injected_delete_failure/);
    assert.deepEqual(await query("SELECT id, entitlement_id, actor_user_id FROM entitlement_status_history WHERE entitlement_id IN (?,?) ORDER BY id", grants.map(item => item.id)), before);
    assert.equal((await query("SELECT id FROM users WHERE id = ?", [userId])).length, 1);

    assert.deepEqual(await createAccountRepository().deleteUserAccount({ userId }), { deleted: true });
    assert.equal((await query("SELECT id FROM users WHERE id = ?", [userId])).length, 0);
    assert.equal((await query("SELECT id FROM user_entitlements WHERE user_id = ?", [userId])).length, 0);
    assert.equal((await query("SELECT id FROM entitlement_status_history WHERE entitlement_id = ?", [grants[0].id])).length, 0);
    assert.equal((await query("SELECT id FROM user_agents WHERE user_id = ?", [userId])).length, 0);
    assert.equal((await products.listEntitlementsForUser(otherUserId))[0].status, "enabled");
    assert.deepEqual(await query("SELECT id, entitlement_id, actor_user_id FROM entitlement_status_history WHERE entitlement_id = ? ORDER BY id", [grants[1].id]), before.filter(item => item.entitlement_id === grants[1].id));
    assert.deepEqual(await query("SELECT id FROM product_status_history WHERE product_id = ? ORDER BY id", [product.id]), productHistory);
    assert.deepEqual(await query("SELECT id FROM agent_release_status_history WHERE release_id = ? ORDER BY id", [draft.release.id]), releaseHistory);
    assert.equal((await products.getProduct(product.id, { productVersionId: product.productVersionId })).status, "published");
    assert.equal((await releases.getAgentRelease(draft.release.id)).catalogStatus, "published");
    assert.equal((await query("SELECT actor_user_id FROM product_status_history WHERE product_id = ? AND actor_user_id IS NOT NULL", [product.id])).length, 0);
  } finally {
    await closeDatabase();
  }
});
