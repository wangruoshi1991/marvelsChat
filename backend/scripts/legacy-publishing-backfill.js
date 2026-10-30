#!/usr/bin/env node

/**
 * One-time, auditable bridge from the 045 agent catalogue/user_agents model to
 * the release/product/entitlement model introduced by 046-048.
 *
 * The default is a dry run. Pass --apply during a maintenance window to
 * commit. Existing ordinary Agent grants become reconsent_required until an
 * operator publishes the migrated product and the user explicitly consents.
 * The built-in Butler is the only special path: existing account-default
 * grants may be projected as enabled after its published release/product has
 * been verified. This script never calls a model or a paid provider.
 */

import crypto from "node:crypto";
import pg from "pg";

import { listAgents } from "../../agents/registry.js";
import { computeAgentReleaseContractHash, isCompleteAgentIdentity } from "../../shared/agent-catalog.js";
import { computeProductContractHash } from "../src/product-catalog-repository.js";
import { buildAgentReadiness } from "../src/agent-readiness-service.js";
import { config } from "../src/config.js";
import { createConnectionAdapter } from "../src/db.js";
import { loadMigrationFiles } from "../src/migration-files.js";
import { checkMigrationStatus } from "../src/migration-ledger.js";

const BUTLER_KEY = "miaoxun-butler";
const PRODUCT_PLATFORMS = ["android", "ios"];
const MIGRATION_ID = "legacy-045-to-048-v1";

const parseJson = (value, fallback) => {
  if (Array.isArray(value) || (value && typeof value === "object")) return value;
  try { return JSON.parse(value ?? ""); } catch { return fallback; }
};

const iso = (value, fallback) => {
  const parsed = value ? new Date(value) : null;
  return parsed && !Number.isNaN(parsed.valueOf()) ? parsed.toISOString() : fallback;
};

function readinessForAgent(status) {
  return {
    ready: Boolean(status?.configured) && !(status?.missingEnv || []).length,
    missing: [
      ...(status?.missingEnv || []),
      ...(status?.capabilityNeeds || []),
    ],
  };
}

function buildIdentity({ agent, catalog, now, published }) {
  const legacy = {
    key: agent.key,
    avatarKind: agent.identity?.avatarKind,
    displayName: catalog?.display_name || agent.name,
    description: catalog?.description ?? agent.description ?? "",
    mark: catalog?.identity_mark || agent.identity?.mark,
    shape: catalog?.identity_shape || agent.identity?.shape,
    colors: parseJson(catalog?.identity_colors, agent.identity?.colors || {}),
    published: Boolean(published),
    // Treat the preserved 045 presentation as an operator snapshot so later
    // registry syncs do not silently replace or unpublish it.
    source: "admin",
    // The catalogue row is touched when this migration records the new
    // release/product linkage. Use its immutable creation time so a retry
    // cannot change the product contract merely because updated_at moved.
    updatedAt: iso(catalog?.created_at ?? catalog?.updated_at, now),
  };
  return isCompleteAgentIdentity(legacy) ? legacy : null;
}

function buildRegistryIdentity({ agent, now }) {
  return {
    key: agent.key,
    avatarKind: agent.identity?.avatarKind,
    displayName: agent.name,
    description: agent.description || "",
    mark: agent.identity?.mark,
    shape: agent.identity?.shape,
    colors: agent.identity?.colors || {},
    published: false,
    source: "registry",
    updatedAt: now,
  };
}

function productPayload({ agent, identity, releaseId, version, scopes, releaseContractHash }) {
  const product = {
    productKey: agent.key,
    version,
    displayName: identity.displayName,
    description: identity.description,
    identity,
    supportedPlatforms: PRODUCT_PLATFORMS,
    dependencies: [{
      agentKey: agent.key,
      agentReleaseId: releaseId,
      version,
      scopes: [...scopes].sort(),
      contractHash: releaseContractHash,
    }],
  };
  return product;
}

/**
 * Build the mutation plan without touching a database. This is exported for
 * deterministic tests and for the dry-run report.
 */
export function buildBackfillPlan({ agents, catalogs, grants, readiness = {}, now = new Date().toISOString() }) {
  const catalogByKey = new Map(catalogs.map((row) => [row.agent_id, row]));
  const grantsByAgent = new Map();
  for (const grant of grants) {
    const list = grantsByAgent.get(grant.agent_id) || [];
    list.push(grant);
    grantsByAgent.set(grant.agent_id, list);
  }

  const plan = [];
  for (const agent of agents) {
    const catalog = catalogByKey.get(agent.key);
    if (!catalog) continue;
    const status = readinessForAgent(readiness[agent.key]);
    const legacyPublished = catalog.status === "published" || catalog.published === true;
    const identity = buildIdentity({ agent, catalog, now, published: false });
    // A malformed legacy presentation must remain blocked. Never silently
    // replace it with the code registry's display identity during migration.
    const releaseIdentity = identity;
    const releaseHash = releaseIdentity
      ? computeAgentReleaseContractHash({ key: agent.key, version: agent.version, permissions: agent.permissions, identity: releaseIdentity })
      : null;
    const registryIdentity = buildRegistryIdentity({ agent, now });
    const registryHash = isCompleteAgentIdentity(registryIdentity)
      ? computeAgentReleaseContractHash({ key: agent.key, version: agent.version, permissions: agent.permissions, identity: registryIdentity })
      : null;
    // Preserve discovery for legacy entries that were already published and
    // still pass the current readiness/identity contract. User grants remain
    // independently gated below and never become execution authorization.
    const releaseStatus = identity && status.ready && legacyPublished
      ? "published"
      : "review";
    const catalogStatus = releaseStatus === "published" ? "published" : "review";
    const productIdentity = releaseIdentity ? { ...releaseIdentity, published: releaseStatus === "published" } : null;
    const productPlan = releaseHash && productIdentity
      ? {
        productKey: agent.key,
        version: agent.version,
        displayName: productIdentity.displayName,
        description: productIdentity.description,
        identity: productIdentity,
        supportedPlatforms: PRODUCT_PLATFORMS,
        scopes: [...agent.permissions],
        status: releaseStatus === "published" ? "published" : "draft",
      }
      : null;
    // The product contract includes the concrete release UUID. It is computed
    // after the release row is resolved in executeBackfill, never with a
    // placeholder that could make a product permanently stale.
    const entitlementPlan = (grantsByAgent.get(agent.key) || []).map((grant) => {
      const enabled = Boolean(grant.enabled);
      const isButlerDefault = agent.key === BUTLER_KEY && enabled && releaseStatus === "published";
      return {
        userId: grant.user_id,
        agentKey: agent.key,
        enabled,
        status: isButlerDefault ? "enabled" : enabled ? "reconsent_required" : "disabled",
        scopes: parseJson(grant.granted_scopes, []),
        alias: grant.alias || null,
        reason: isButlerDefault ? "legacy_account_default_projection" : enabled ? "legacy_grant_requires_user_consent" : "legacy_disabled_projection",
      };
    });
    plan.push({
      agentKey: agent.key,
      legacyPublished,
      readiness: status,
      registry: { version: agent.version, contractHash: registryHash },
      release: { status: releaseStatus, version: agent.version, contractHash: releaseHash, identity: releaseIdentity },
      catalog: { status: catalogStatus, releaseVersion: agent.version, contractHash: releaseHash },
      product: productPlan,
      entitlements: entitlementPlan,
    });
  }
  return plan;
}

export function validateBackfillPlan(plan) {
  for (const item of plan) {
    if (!item.registry?.contractHash || !item.release.contractHash || !item.release.identity) {
      throw new Error(`Legacy Agent ${item.agentKey} has an incomplete identity or contract; migration is blocked before any write.`);
    }
  }
  return plan;
}

const qFor = (connection) => connection.query.bind(connection);

async function ensureRelease(q, item) {
  if (!item.release.contractHash || !item.release.identity) return null;
  const existing = await q("SELECT id, catalog_status, contract_hash FROM agent_releases WHERE agent_key = ? AND version = ? AND contract_hash = ? LIMIT 1 FOR UPDATE", [item.agentKey, item.release.version, item.release.contractHash]);
  if (existing[0]) {
    if (existing[0].catalog_status === "published" && item.release.status !== "published") return existing[0];
    if (existing[0].catalog_status !== item.release.status) {
      await q("UPDATE agent_releases SET catalog_status = ?, published_at = CASE WHEN ? = 'published' THEN COALESCE(published_at, CURRENT_TIMESTAMP) ELSE NULL END, identity_snapshot = ?::jsonb, readiness = ?::jsonb WHERE id = ?", [item.release.status, item.release.status, JSON.stringify(item.release.identity), JSON.stringify(item.readiness), existing[0].id]);
      await q("INSERT INTO agent_release_status_history (release_id, from_status, to_status, reason) VALUES (?, ?, ?, ?)", [existing[0].id, existing[0].catalog_status, item.release.status, MIGRATION_ID]);
    }
    return existing[0];
  }
  const id = crypto.randomUUID();
  await q("INSERT INTO agent_releases (id, agent_key, version, contract_hash, declared_scopes, readiness, identity_snapshot, catalog_status, published_at) VALUES (?, ?, ?, ?, ?::jsonb, ?::jsonb, ?::jsonb, ?, CASE WHEN ? = 'published' THEN CURRENT_TIMESTAMP ELSE NULL END)", [id, item.agentKey, item.release.version, item.release.contractHash, JSON.stringify(item.release.scopes || []), JSON.stringify(item.readiness), JSON.stringify(item.release.identity), item.release.status, item.release.status]);
  await q("INSERT INTO agent_release_status_history (release_id, from_status, to_status, reason) VALUES (?, NULL, ?, ?)", [id, item.release.status, MIGRATION_ID]);
  return { id, catalog_status: item.release.status };
}

async function ensureProduct(q, item, release) {
  if (!item.product || !release) return null;
  const agent = { key: item.agentKey };
  const contractProduct = productPayload({ agent, identity: item.product.identity, releaseId: release.id, version: item.product.version, scopes: item.product.scopes, releaseContractHash: item.release.contractHash });
  const contractHash = computeProductContractHash(contractProduct);
  const existing = await q("SELECT p.id, p.status, pv.id AS product_version_id, pv.status AS version_status, pv.contract_hash FROM products p JOIN product_versions pv ON pv.product_id = p.id WHERE p.product_key = ? ORDER BY pv.created_at DESC LIMIT 1 FOR UPDATE OF p", [item.agentKey]);
  if (existing[0]) {
    if (existing[0].contract_hash !== contractHash) {
      throw new Error(`Legacy product ${item.agentKey} exists with a different contract; review before retrying.`);
    }
    return existing[0];
  }
  const productId = crypto.randomUUID();
  const versionId = crypto.randomUUID();
  await q("INSERT INTO products (id, product_key, display_name, description, identity_snapshot, status) VALUES (?, ?, ?, ?, ?::jsonb, ?)", [productId, item.product.productKey, item.product.displayName, item.product.description, JSON.stringify(item.product.identity), item.product.status]);
  await q("INSERT INTO product_versions (id, product_id, version, supported_platforms, status, contract_hash) VALUES (?, ?, ?, ?::jsonb, ?, ?)", [versionId, productId, item.product.version, JSON.stringify(item.product.supportedPlatforms), item.product.status, contractHash]);
  await q("INSERT INTO product_agent_dependencies (product_version_id, agent_key, agent_release_id, version, required_scopes) VALUES (?, ?, ?, ?, ?::jsonb)", [versionId, item.agentKey, release.id, item.product.version, JSON.stringify(item.product.scopes)]);
  await q("INSERT INTO product_status_history (product_id, product_version_id, from_status, to_status, reason) VALUES (?, ?, NULL, ?, ?)", [productId, versionId, item.product.status, MIGRATION_ID]);
  return { id: productId, product_version_id: versionId, status: item.product.status, version_status: item.product.status, contract_hash: contractHash };
}

async function ensureEntitlement(q, item, product, index) {
  if (!product) return false;
  const existing = await q("SELECT id, status, product_version_id FROM user_entitlements WHERE user_id = ? AND product_version_id = ? FOR UPDATE", [item.userId, product.product_version_id]);
  if (existing[0]) return false;
  const id = crypto.randomUUID();
  const key = `${MIGRATION_ID}:${item.agentKey}:${item.userId}:${index}`;
  const contractHash = product.contract_hash;
  await q("INSERT INTO user_entitlements (id, user_id, product_id, product_version_id, status, granted_scopes, contract_hash, consent_version, idempotency_key, unavailable_reason) VALUES (?, ?, ?, ?, ?, ?::jsonb, ?, ?, ?, ?)", [id, item.userId, product.id, product.product_version_id, item.status, JSON.stringify(item.status === "enabled" ? item.scopes : []), contractHash, item.status === "enabled" ? "legacy-045-account-default" : null, key, item.status === "enabled" ? null : item.reason]);
  await q("INSERT INTO entitlement_status_history (entitlement_id, from_status, to_status, reason) VALUES (?, NULL, ?, ?)", [id, item.status, item.reason]);
  return true;
}

export async function executeBackfill({ connection, dryRun = true, now = new Date().toISOString(), report = null }) {
  const q = qFor(connection);
  const agents = await listAgents();
  const catalogs = await q("SELECT * FROM agent_catalog ORDER BY agent_id");
  const grants = await q("SELECT user_id, agent_id, enabled, granted_scopes, alias FROM user_agents ORDER BY user_id, agent_id");
  const readiness = await buildAgentReadiness();
  const plan = validateBackfillPlan(buildBackfillPlan({ agents, catalogs, grants, readiness, now }));
  const summary = { migration: MIGRATION_ID, dryRun, agents: plan.length, releases: 0, products: 0, entitlements: 0, ordinaryReconsent: 0, butlerEnabled: 0 };
  for (const item of plan) {
    const registryHash = item.registry.contractHash;
    await q("INSERT INTO agent_registry (agent_key, version, contract_hash, declared_scopes, readiness, registration_status, source) VALUES (?, ?, ?, ?::jsonb, ?::jsonb, 'registered', 'registry') ON CONFLICT (agent_key) DO UPDATE SET version = EXCLUDED.version, contract_hash = EXCLUDED.contract_hash, declared_scopes = EXCLUDED.declared_scopes, readiness = EXCLUDED.readiness, registration_status = 'registered', source = 'registry', updated_at = CURRENT_TIMESTAMP", [item.agentKey, item.release.version, registryHash, JSON.stringify((agents.find((agent) => agent.key === item.agentKey)?.permissions || [])), JSON.stringify(item.readiness)]);
    const release = await ensureRelease(q, { ...item, release: { ...item.release, scopes: agents.find((agent) => agent.key === item.agentKey)?.permissions || [] } });
    if (release) summary.releases += 1;
    if (release) {
      await q("UPDATE agent_catalog SET release_version = ?, contract_hash = ?, source = ?, status = ? WHERE agent_id = ?", [item.catalog.releaseVersion, item.catalog.contractHash, MIGRATION_ID, item.catalog.status, item.agentKey]);
    }
    const product = await ensureProduct(q, item, release);
    if (product) summary.products += 1;
    for (let index = 0; index < item.entitlements.length; index += 1) {
      const entitlement = item.entitlements[index];
      const inserted = await ensureEntitlement(q, entitlement, product, index);
      if (inserted) {
        summary.entitlements += 1;
        if (entitlement.status === "reconsent_required") summary.ordinaryReconsent += 1;
        if (entitlement.status === "enabled") summary.butlerEnabled += 1;
      }
      if (entitlement.status !== "enabled") await q("UPDATE user_agents SET enabled = FALSE, granted_scopes = '[]'::jsonb WHERE user_id = ? AND agent_id = ?", [entitlement.userId, entitlement.agentKey]);
    }
  }
  if (report) report(summary, plan);
  return summary;
}

async function main() {
  const apply = process.argv.includes("--apply");
  if (!config.db.configured) throw new Error("PostgreSQL is not configured.");
  const client = new pg.Client(config.db.databaseUrl ? { connectionString: config.db.databaseUrl } : { host: config.db.host, port: config.db.port, user: config.db.user, password: config.db.password, database: config.db.database });
  await client.connect();
  const connection = createConnectionAdapter(client);
  try {
    const status = await checkMigrationStatus({ client, migrations: await loadMigrationFiles() });
    if (!status.current || status.expectedCount < 48) throw new Error(`Database migrations are not current: ${status.message || status.pending.join(", ")}`);
    await client.query("BEGIN");
    const summary = await executeBackfill({
      connection,
      dryRun: !apply,
      report: (result, plan) => console.log(JSON.stringify({
        summary: result,
        agents: plan.map((item) => ({
          agentKey: item.agentKey,
          legacyPublished: item.legacyPublished,
          readiness: item.readiness,
          releaseStatus: item.release.status,
          productStatus: item.product?.status || "blocked",
          existingGrants: item.entitlements.length,
          enabledGrants: item.entitlements.filter((grant) => grant.enabled).length,
          reconsentRequired: item.entitlements.filter((grant) => grant.status === "reconsent_required").length,
          butlerProjection: item.entitlements.filter((grant) => grant.status === "enabled").length,
        })),
      }, null, 2)),
    });
    if (apply) await client.query("COMMIT");
    else {
      await client.query("ROLLBACK");
      console.log("Dry run complete; no database changes committed.");
    }
    console.log(JSON.stringify(summary));
  } catch (error) {
    try { await client.query("ROLLBACK"); } catch { /* keep original failure */ }
    throw error;
  } finally {
    await client.end();
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => { console.error(error.message); process.exitCode = 1; });
}
