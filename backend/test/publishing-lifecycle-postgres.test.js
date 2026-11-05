import assert from "node:assert/strict";
import test from "node:test";
import { randomUUID } from "node:crypto";
import { query, closeDatabase, withTransaction } from "../src/db.js";
import { createAgentReleaseRepository } from "../src/agent-release-repository.js";
import { createProductCatalogRepository } from "../src/product-catalog-repository.js";
import { createAgentPublishingService } from "../src/agent-publishing-service.js";
import { getPublishedProductCatalog } from "../src/product-catalog-projection.js";
import { assertAgentProductEntitlement } from "../src/ai-agent-access.js";
import { createUIPreferenceService } from "../src/ui-preference-service.js";

const enabled = process.env.RUN_PUBLISHING_LIFECYCLE_POSTGRES === "1";
const identityFor = (key, displayName, mark = "演") => ({ key, avatarKind: "agent-mark", displayName, description: "已部署运行能力", mark, shape: "circle", colors: { background: "#123456", foreground: "#ffffff", accent: "#facc15" }, published: false, source: "admin", updatedAt: "2026-11-02T00:00:00.000Z" });

test("explicit Agent intake and product versions preserve published contracts and user consent", { skip: !enabled && "RUN_PUBLISHING_LIFECYCLE_POSTGRES=1 requires a dedicated loopback *_migration_test database" }, async t => {
  const dbUrl = new URL(process.env.DATABASE_URL);
  assert.ok(["127.0.0.1", "localhost"].includes(dbUrl.hostname));
  assert.match(dbUrl.pathname, /_migration_test$/);
  const key = `lifecycle-${randomUUID().slice(0, 8)}`;
  const productKey = `${key}-product`;
  const userId = randomUUID();
  const agent = { key, name: "代码 Agent", description: "已部署运行能力", version: "1.0.0", permissions: ["messages:read"], identity: identityFor(key, "代码 Agent"), readiness: { ready: true, missing: [] } };
  const releases = createAgentReleaseRepository();
  const products = createProductCatalogRepository();
  const service = createAgentPublishingService({ releaseRepository: releases, productRepository: products, listRegisteredAgents: async () => [agent], getReadiness: async () => ({ [key]: { configured: true, missingEnv: [], capabilityNeeds: [] } }), recordAudit: async () => {}, afterProductProjection: null });
  let first; let revision; let product1; let product2;
  try {
    await query("INSERT INTO users (id,email,password_hash,display_name,ai_id) VALUES (?,?,'test-only',?,?)", [userId, `${key}@example.invalid`, key, `93${Math.floor(Math.random() * 1e10).toString().padStart(10, "0")}`]);
    await t.test("create is explicit, idempotent and tied to deployed runtime", async () => {
      first = await service.createRelease({ agentKey: key, identity: identityFor(key, "原 Agent"), requestId: `${key}-create` });
      assert.equal(first.created, true);
      const replay = await service.createRelease({ agentKey: key, identity: identityFor(key, "原 Agent"), requestId: `${key}-create` });
      assert.equal(replay.release.id, first.release.id);
      await assert.rejects(service.createRelease({ agentKey: key, identity: identityFor(key, "伪重放"), requestId: `${key}-create` }), error => error.details?.code === "IDEMPOTENCY_CONFLICT");
      await service.reviewRelease({ releaseId: first.release.id });
      await service.publishRelease({ releaseId: first.release.id });
    });
    await t.test("identity revision reuses runtime without mutating published release", async () => {
      await assert.rejects(releases.updateIdentity({ releaseId: first.release.id, identity: identityFor(key, "非法覆盖") }), error => error.details?.code === "RELEASE_NOT_EDITABLE");
      revision = await service.createRelease({ agentKey: key, identity: identityFor(key, "新版 Agent", "新"), sourceReleaseId: first.release.id, requestId: `${key}-revision` });
      assert.equal(revision.release.version, first.release.version);
      assert.notEqual(revision.release.id, first.release.id);
      assert.equal((await releases.getAgentRelease(first.release.id)).identity.displayName, "原 Agent");
      const [catalog] = await query("SELECT display_name FROM agent_catalog WHERE agent_id = ?", [key]);
      assert.equal(catalog.display_name, "原 Agent");
      await service.reviewRelease({ releaseId: revision.release.id });
      await service.publishRelease({ releaseId: revision.release.id });
    });
    await t.test("first product review/publish requires exact release dependency", async () => {
      const create = { productKey, version: "1.0.0", displayName: "原产品", description: "已部署运行能力", identity: identityFor(productKey, "原产品"), supportedPlatforms: ["ios"], dependencies: [{ agentKey: key, agentReleaseId: first.release.id, version: agent.version, scopes: agent.permissions }], requestId: `${key}-create-product` };
      product1 = await products.createProduct(create);
      assert.equal((await products.createProduct(create)).id, product1.id);
      await assert.rejects(products.createProduct({ ...create, displayName: "冲突产品", identity: identityFor(productKey, "冲突产品") }), error => error.details?.code === "IDEMPOTENCY_CONFLICT");
      await assert.rejects(products.createProduct({ ...create, requestId: `${key}-duplicate-product` }), error => error.details?.code === "PRODUCT_EXISTS");
      await service.submitProduct({ productId: product1.id, productVersionId: product1.productVersionId });
      await service.publishProduct({ productId: product1.id, productVersionId: product1.productVersionId });
      await products.createEntitlement({ userId, productId: product1.id, productVersionId: product1.productVersionId, grantedScopes: agent.permissions, consentVersion: "1.0.0", idempotencyKey: `${key}-consent-old` });
    });
    await t.test("legacy reconsent restores a disabled Agent projection only after explicit current consent", async () => {
      // Recreate the entitlement and projection produced by the legacy backfill.
      await query("UPDATE user_entitlements SET status = 'reconsent_required', contract_hash = NULL, consent_version = NULL WHERE user_id = ? AND product_version_id = ?", [userId, product1.productVersionId]);
      await query("UPDATE user_agents SET enabled = FALSE, granted_scopes = '[]'::jsonb WHERE user_id = ? AND agent_id = ?", [userId, key]);
      const catalog = await getPublishedProductCatalog(userId);
      assert.equal(catalog.products.find(item => item.id === product1.id).productVersionId, product1.productVersionId);
      assert.equal(catalog.entitlements.find(item => item.productVersionId === product1.productVersionId).status, "reconsent_required");
      await assert.rejects(assertAgentProductEntitlement({ userId, agent }), error => error.details?.code === "AGENT_PRODUCT_ENTITLEMENT_REQUIRED");
      await assert.rejects(service.setAgentAccessThroughProduct({ userId, agentKey: key, productVersionId: product1.productVersionId, enabled: true, grantedScopes: [], idempotencyKey: `${key}-reconsent-invalid` }), error => error.details?.code === "PRODUCT_CONSENT_REQUIRED");
      assert.equal((await query("SELECT enabled FROM user_agents WHERE user_id = ? AND agent_id = ?", [userId, key]))[0].enabled, false);
      const grant = await service.setAgentAccessThroughProduct({ userId, agentKey: key, productVersionId: product1.productVersionId, enabled: true, grantedScopes: agent.permissions, idempotencyKey: `${key}-reconsent` });
      assert.equal(grant.status, "enabled");
      const [projection] = await query("SELECT enabled, granted_scopes FROM user_agents WHERE user_id = ? AND agent_id = ?", [userId, key]);
      assert.equal(projection.enabled, true);
      assert.deepEqual(projection.granted_scopes, agent.permissions);
      const history = await query("SELECT reason FROM entitlement_status_history WHERE entitlement_id = ? AND from_status = 'reconsent_required' AND to_status = 'enabled'", [grant.id]);
      assert.equal(history[0].reason, "user_reconsent");
      await assertAgentProductEntitlement({ userId, agent });
    });
    await t.test("preference confirmation serializes with product pause, revocation and release withdrawal", async () => {
      await query("INSERT INTO user_profiles (user_id,nickname,avatar_text) VALUES (?,?,?)", [userId, "test", "T"]);
      const previewId = randomUUID();
      await query(`INSERT INTO ui_preference_previews (id,user_id,base_revision,patch,preview,expires_at)
        VALUES (?,?,0,?::jsonb,'{}'::jsonb,CURRENT_TIMESTAMP + interval '1 hour')`,
      [previewId, userId, JSON.stringify({ surfaces: { miao: { cardRadius: 20 } } })]);
      const authorization = { agent, access: { grantedScopes: agent.permissions }, productGrant: await assertAgentProductEntitlement({ userId, agent }) };
      const barrier = () => {
        let open;
        let reached;
        return { entered: new Promise(resolve => { reached = resolve; }), wait: new Promise(resolve => { open = resolve; }), open: () => open(), reached: () => reached() };
      };
      const gated = (gate, match) => work => withTransaction(connection => work({ query: async (sql, params) => {
        const rows = await connection.query(sql, params);
        if (match(sql)) { gate.reached(); await gate.wait; }
        return rows;
      } }));
      const signaled = (gate, match) => work => withTransaction(connection => work({ query: async (sql, params) => {
        if (match(sql)) gate.reached();
        return connection.query(sql, params);
      } }));
      const confirm = (transaction = withTransaction) => createUIPreferenceService({
        authorize: async () => authorization, recordEvent: async () => {}, transaction,
      }).confirm({ user: { id: userId }, previewId, baseRevision: 0 });
      const checkUnchanged = async () => {
        const [row] = await query("SELECT station_config FROM user_profiles WHERE user_id = ?", [userId]);
        assert.equal(row.station_config?.uiPreferences, undefined);
        assert.equal((await query("SELECT status FROM ui_preference_previews WHERE id = ?", [previewId]))[0].status, "pending");
      };
      const productLock = sql => sql.includes("FOR UPDATE OF p");
      for (const action of ["pause", "revoke"]) {
        const gate = barrier();
        const repo = createProductCatalogRepository({ withTransaction: gated(gate, productLock) });
        const mutation = action === "pause"
          ? repo.transitionProduct({ productId: product1.id, productVersionId: product1.productVersionId, toStatus: "paused" })
          : repo.disableEntitlement({ userId, productId: product1.id, productVersionId: product1.productVersionId, idempotencyKey: `${key}-race-revoke` });
        await gate.entered;
        const attempted = barrier();
        const pending = confirm(signaled(attempted, sql => sql.startsWith("SELECT id FROM products") && sql.includes("FOR SHARE")));
        await attempted.entered;
        gate.open();
        await mutation;
        await assert.rejects(pending, error => ["AI_ACCESS_REVOKED", "AGENT_PRODUCT_ENTITLEMENT_REQUIRED"].includes(error.details?.code));
        await checkUnchanged();
        if (action === "pause") await products.transitionProduct({ productId: product1.id, productVersionId: product1.productVersionId, toStatus: "published" });
        await products.createEntitlement({ userId, productId: product1.id, productVersionId: product1.productVersionId, grantedScopes: agent.permissions, idempotencyKey: `${key}-restore-${action}` });
      }
      const gate = barrier();
      const releaseRepo = createAgentReleaseRepository({ withTransaction: gated(gate, sql => sql.includes("SELECT * FROM agent_releases") && sql.includes("FOR UPDATE")) });
      const withdrawing = releaseRepo.transition({ releaseId: first.release.id, toStatus: "unpublished" });
      await gate.entered;
      await assert.rejects(confirm(), error => error.details?.code === "UI_AGENT_AUTHORIZATION_CHANGING");
      gate.open();
      await withdrawing;
      await assert.rejects(confirm(), error => error.details?.code === "AGENT_PRODUCT_ENTITLEMENT_REQUIRED");
      await checkUnchanged();
      await releases.transition({ releaseId: first.release.id, toStatus: "published" });

      const confirmGate = barrier();
      const lockedUI = createUIPreferenceService({ authorize: async () => authorization, recordEvent: async () => {},
        transaction: gated(confirmGate, sql => sql.startsWith("SELECT id FROM products") && sql.includes("FOR SHARE")) });
      const confirming = lockedUI.confirm({ user: { id: userId }, previewId, baseRevision: 0 });
      await confirmGate.entered;
      const pauseAttempt = barrier();
      const pauseRepo = createProductCatalogRepository({ withTransaction: signaled(pauseAttempt, productLock) });
      const pausing = pauseRepo.transitionProduct({ productId: product1.id, productVersionId: product1.productVersionId, toStatus: "paused" });
      await pauseAttempt.entered;
      confirmGate.open();
      assert.equal((await confirming).status, "confirmed");
      await pausing;
      assert.equal((await query("SELECT station_config FROM user_profiles WHERE user_id = ?", [userId]))[0].station_config.uiPreferences.revision, 1);
      await products.transitionProduct({ productId: product1.id, productVersionId: product1.productVersionId, toStatus: "published" });
      await products.createEntitlement({ userId, productId: product1.id, productVersionId: product1.productVersionId, grantedScopes: agent.permissions, idempotencyKey: `${key}-restore-final` });
    });
    await t.test("a newer draft neither hides the published version nor changes original consent", async () => {
      product2 = await products.createProductVersion({ productId: product1.id, version: "1.1.0", displayName: "新产品", description: "已部署运行能力", identity: identityFor(productKey, "新产品"), supportedPlatforms: ["ios"], dependencies: [{ agentKey: key, agentReleaseId: revision.release.id, version: agent.version, scopes: agent.permissions }], requestId: `${key}-product-revision` });
      const published = (await products.listProducts({ includeUnpublished: false })).find(item => item.id === product1.id);
      assert.equal(published.productVersionId, product1.productVersionId);
      assert.equal((await products.listEntitlementsForUser(userId))[0].status, "enabled");
      assert.equal((await products.getProduct(product1.id, { productVersionId: product1.productVersionId })).displayName, "原产品");
      assert.equal((await products.listProductVersions(product1.id)).length, 2);
    });
    await t.test("new publication preserves exact original entitlement until explicit user upgrade", async () => {
      await service.submitProduct({ productId: product1.id, productVersionId: product2.productVersionId });
      await service.publishProduct({ productId: product1.id, productVersionId: product2.productVersionId });
      const authorized = await assertAgentProductEntitlement({ userId, agent });
      assert.equal(authorized.agentReleaseId, first.release.id, "A newer global identity must not replace the exact consented release");
      await assert.rejects(assertAgentProductEntitlement({ userId, agent: { ...agent, version: "2.0.0" } }), error => error.details?.code === "AGENT_PRODUCT_ENTITLEMENT_REQUIRED");
      assert.equal((await products.listEntitlementsForUser(userId))[0].status, "enabled");
      assert.equal((await getPublishedProductCatalog(userId)).products.find(item => item.id === product1.id).productVersionId, product1.productVersionId);
      assert.equal((await getPublishedProductCatalog()).products.find(item => item.id === product1.id).productVersionId, product2.productVersionId);
      await assert.rejects(products.updateProductVersion({ ...product2, productId: product1.id, productVersionId: product2.productVersionId }), error => error.details?.code === "PRODUCT_VERSION_NOT_EDITABLE");
      await products.createEntitlement({ userId, productId: product1.id, productVersionId: product2.productVersionId, grantedScopes: agent.permissions, consentVersion: "1.1.0", idempotencyKey: `${key}-consent-new` });
      const grants = await products.listEntitlementsForUser(userId);
      assert.equal(grants.find(item => item.productVersionId === product1.productVersionId).status, "disabled");
      assert.equal(grants.find(item => item.productVersionId === product2.productVersionId).status, "enabled");
      assert.equal((await getPublishedProductCatalog(userId)).products.find(item => item.id === product1.id).productVersionId, product2.productVersionId);
    });
    await t.test("revocation still finds the authorized version after another draft is created", async () => {
      await products.createProductVersion({ ...product2, productId: product1.id, version: "1.2.0", identity: identityFor(productKey, "新产品"), requestId: `${key}-future` });
      await products.disableEntitlement({ userId, productId: product1.id, idempotencyKey: `${key}-disable` });
      assert.equal((await products.listEntitlementsForUser(userId)).find(item => item.productVersionId === product2.productVersionId).status, "disabled");
      await query("UPDATE user_agents SET enabled = true WHERE user_id = ? AND agent_id = ?", [userId, key]);
      await assert.rejects(assertAgentProductEntitlement({ userId, agent }), error => error.details?.code === "AGENT_PRODUCT_ENTITLEMENT_REQUIRED");
    });
    await t.test("explicit upgrade removes Agents omitted from the new product version", async () => {
      await products.createEntitlement({ userId, productId: product1.id, productVersionId: product2.productVersionId, grantedScopes: agent.permissions, consentVersion: "1.1.0", idempotencyKey: `${key}-reenable` });
      const nextAgent = { ...agent, key: `${key}-next`, identity: identityFor(`${key}-next`, "替代 Agent") };
      const next = await releases.createDraft({ agent: nextAgent, identity: nextAgent.identity, requestId: `${key}-next-release` });
      await releases.transition({ releaseId: next.release.id, toStatus: "review" });
      await releases.transition({ releaseId: next.release.id, toStatus: "published" });
      const nextProduct = await products.createProductVersion({ productId: product1.id, version: "2.0.0", displayName: "替代产品", description: "已部署运行能力", identity: identityFor(productKey, "替代产品"), supportedPlatforms: ["ios"], dependencies: [{ agentKey: nextAgent.key, agentReleaseId: next.release.id, version: nextAgent.version, scopes: nextAgent.permissions }], requestId: `${key}-replacement` });
      await products.transitionProduct({ productId: product1.id, productVersionId: nextProduct.productVersionId, toStatus: "review" });
      await products.transitionProduct({ productId: product1.id, productVersionId: nextProduct.productVersionId, toStatus: "published" });
      await products.createEntitlement({ userId, productId: product1.id, productVersionId: nextProduct.productVersionId, grantedScopes: nextAgent.permissions, consentVersion: "2.0.0", idempotencyKey: `${key}-replacement-consent` });
      const rows = await query("SELECT agent_id, enabled FROM user_agents WHERE user_id = ? ORDER BY agent_id", [userId]);
      assert.equal(rows.find(row => row.agent_id === key).enabled, false);
      assert.equal(rows.find(row => row.agent_id === nextAgent.key).enabled, true);
      await assertAgentProductEntitlement({ userId, agent: nextAgent });
      await products.transitionProduct({ productId: product1.id, productVersionId: nextProduct.productVersionId, toStatus: "paused" });
      await assert.rejects(assertAgentProductEntitlement({ userId, agent: nextAgent }), error => error.details?.code === "AGENT_PRODUCT_ENTITLEMENT_REQUIRED");
      await products.transitionProduct({ productId: product1.id, productVersionId: nextProduct.productVersionId, toStatus: "published" });
      await releases.transition({ releaseId: next.release.id, toStatus: "unpublished" });
      await assert.rejects(assertAgentProductEntitlement({ userId, agent: nextAgent }), error => error.details?.code === "AGENT_PRODUCT_ENTITLEMENT_REQUIRED");
    });
  } finally {
    await closeDatabase();
  }
});
