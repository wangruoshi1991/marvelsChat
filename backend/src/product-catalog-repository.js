import crypto from "node:crypto";
import { canonicalizeContract, computeAgentContractHash, isCompleteAgentIdentity } from "../../shared/agent-catalog.js";
import { query, withTransaction } from "./db.js";
import { parseJson, toIso } from "./repository-mappers.js";
import { HttpError } from "./http-error.js";
import { assertManagedAgentAvatar, assertAgentImagePublicationReady } from "./agent-avatar-assets.js";

const uuid = () => crypto.randomUUID();
const qFor = (connection) => typeof connection?.query === "function"
  ? connection.query.bind(connection)
  : async (sql, params = []) => (await connection.execute(sql, params))[0] || [];

export function mapProduct(row, dependencies = []) {
  if (!row) return null;
  return {
    id: String(row.id || "").trim(),
    productKey: row.product_key,
    version: row.version || null,
    displayName: row.version_display_name ?? row.display_name,
    description: row.version_description ?? row.description ?? "",
    identity: parseJson(row.version_identity_snapshot ?? row.identity_snapshot, null),
    supportedPlatforms: parseJson(row.supported_platforms, []),
    status: row.status,
    productVersionId: row.product_version_id ? String(row.product_version_id).trim() : null,
    contractHash: row.contract_hash || null,
    dependencies: dependencies.map((dep) => ({
      agentKey: dep.agent_key,
      agentReleaseId: String(dep.agent_release_id || "").trim(),
      version: dep.version,
      scopes: parseJson(dep.required_scopes, []),
      declaredScopes: parseJson(dep.declared_scopes, []),
      contractHash: dep.release_contract_hash || null,
      identity: parseJson(dep.identity_snapshot, null),
      readiness: parseJson(dep.readiness, null),
      releaseStatus: dep.release_status || null,
      registryVersion: dep.registry_version || null,
      registryDeclaredScopes: parseJson(dep.registry_declared_scopes, []),
      registryContractHash: dep.registry_contract_hash || null,
      registryStatus: dep.registry_status || null,
    })),
    createdAt: toIso(row.created_at),
    updatedAt: toIso(row.updated_at),
  };
}

function sameScopes(left = [], right = []) {
  const a = [...new Set(left)].sort();
  const b = [...new Set(right)].sort();
  return a.length === b.length && a.every((scope, index) => scope === b[index]);
}

export function isCurrentProductDependency(dependency) {
  return dependency?.releaseStatus === "published" &&
    dependency?.readiness?.ready === true &&
    dependency?.registryStatus === "registered" &&
    dependency?.registryVersion === dependency?.version &&
    sameScopes(dependency.declaredScopes, dependency.registryDeclaredScopes) &&
    dependency?.identity?.key === dependency?.agentKey &&
    Boolean(dependency?.contractHash) &&
    isCompleteAgentIdentity(dependency.identity);
}

function productContractPayload(product) {
  return {
    productKey: product.productKey,
    version: product.version,
    displayName: product.displayName,
    description: product.description,
    identity: product.identity,
    supportedPlatforms: [...(product.supportedPlatforms || [])].sort(),
    dependencies: [...(product.dependencies || [])].map((dependency) => ({
      agentKey: dependency.agentKey,
      agentReleaseId: dependency.agentReleaseId,
      version: dependency.version,
      scopes: [...(dependency.scopes || [])].sort(),
      contractHash: dependency.contractHash,
    })).sort((left, right) => left.agentKey.localeCompare(right.agentKey)),
  };
}

export function computeProductContractHash(product) {
  return computeAgentContractHash(productContractPayload(product));
}

export function isCurrentProductContract(product) {
  return Boolean(product?.contractHash) && product.contractHash === computeProductContractHash(product);
}

function productIsExecutable(product) {
  return Boolean(product?.dependencies?.length) &&
    product.dependencies.every(isCurrentProductDependency) &&
    isCurrentProductContract(product);
}

export function createProductCatalogRepository({
  query: runQuery = query,
  withTransaction: transaction = withTransaction,
  randomUUID = uuid,
} = {}) {
  async function ensureAgentThread(q, { userId, agentKey, identity, source }) {
    const alias = identity.displayName;
    const thread = await q("SELECT id FROM chat_threads WHERE user_id = ? AND agent_id = ? LIMIT 1", [userId, agentKey]);
    if (thread[0]) {
      await q("UPDATE chat_threads SET status_text = '在线 · Agent', kind = 'agent' WHERE user_id = ? AND agent_id = ?", [userId, agentKey]);
      return;
    }
    const threadId = randomUUID();
    await q(`INSERT INTO chat_threads (id, user_id, title, status_text, avatar_text, agent_id, kind, pinned)
        VALUES (?, ?, ?, '在线 · Agent', ?, ?, 'agent', FALSE)`,
      [threadId, userId, alias, [...alias][0] || identity.mark, agentKey]);
    await q(`INSERT INTO chat_messages (id, thread_id, user_id, sender_type, sender_name, content, metadata)
        VALUES (?, ?, ?, 'agent', ?, ?, ?::jsonb)`,
      [randomUUID(), threadId, userId, alias, `${alias} 已添加，可以开始对话。`, JSON.stringify({ source, agentId: agentKey })]);
  }

  // A user can enable several products that depend on the same Agent. The
  // user_agents row is a projection of all enabled product entitlements, so a
  // later product consent can never narrow or overwrite an earlier grant.
  async function reconcileUserAgentProjection(q, { userId, agentKeys = null, source = "product_enable" }) {
    const keyList = agentKeys ? [...new Set(agentKeys)] : [];
    const filter = keyList.length ? " AND d.agent_key = ANY(?::text[])" : "";
    const params = keyList.length ? [userId, keyList] : [userId];
    const rows = await q(`SELECT d.agent_key, d.required_scopes, r.identity_snapshot, r.declared_scopes
      FROM user_entitlements e
      JOIN product_agent_dependencies d ON d.product_version_id = e.product_version_id
      JOIN agent_releases r ON r.id = d.agent_release_id
      WHERE e.user_id = ? AND e.status = 'enabled'${filter}
      ORDER BY d.agent_key`, params);
    const grants = new Map();
    for (const row of rows) {
      const identity = parseJson(row.identity_snapshot, null);
      if (!isCompleteAgentIdentity(identity)) {
        throw new HttpError(409, `Agent dependency ${row.agent_key} identity is incomplete`, { code: "IDENTITY_INCOMPLETE" });
      }
      const required = parseJson(row.required_scopes, []);
      const declared = parseJson(row.declared_scopes, []);
      if (required.length !== declared.length || required.some((scope) => !declared.includes(scope))) {
        throw new HttpError(409, `Agent dependency ${row.agent_key} scopes are incomplete`, { code: "SCOPES_INCOMPLETE" });
      }
      const current = grants.get(row.agent_key);
      if (current && canonicalizeContract(current.identity) !== canonicalizeContract(identity)) {
        throw new HttpError(409, `Agent dependency ${row.agent_key} has conflicting identities`, { code: "IDENTITY_CONFLICT" });
      }
      const grantState = current || { scopes: new Set(), identity };
      required.forEach((scope) => grantState.scopes.add(scope));
      grants.set(row.agent_key, grantState);
    }
    const existing = await q(
      keyList.length
        ? "SELECT agent_id FROM user_agents WHERE user_id = ? AND agent_id = ANY(?::text[])"
        : "SELECT agent_id FROM user_agents WHERE user_id = ?",
      keyList.length ? [userId, keyList] : [userId],
    );
    const keys = new Set([...existing.map((row) => row.agent_id), ...keyList]);
    for (const agentKey of keys) {
      const grant = grants.get(agentKey);
      if (!grant) {
        await q("UPDATE user_agents SET enabled = FALSE, granted_scopes = '[]'::jsonb, updated_at = CURRENT_TIMESTAMP WHERE user_id = ? AND agent_id = ?", [userId, agentKey]);
        await q("UPDATE chat_threads SET status_text = '已停用' WHERE user_id = ? AND agent_id = ?", [userId, agentKey]);
        continue;
      }
      const scopes = [...grant.scopes].sort();
      await q(`INSERT INTO user_agents (user_id, agent_id, alias, enabled, granted_scopes, alias_source)
          VALUES (?, ?, ?, TRUE, ?::jsonb, 'system')
          ON CONFLICT (user_id, agent_id) DO UPDATE SET enabled = TRUE, granted_scopes = EXCLUDED.granted_scopes,
            alias = CASE WHEN user_agents.alias_source = 'custom' THEN user_agents.alias ELSE EXCLUDED.alias END,
            updated_at = CURRENT_TIMESTAMP`,
        [userId, agentKey, grant.identity.displayName, JSON.stringify(scopes)]);
      await ensureAgentThread(q, { userId, agentKey, identity: grant.identity, source });
    }
  }

  async function ensureEntitlementProjection(q, { userId, product, agentKeys = null }) {
    await reconcileUserAgentProjection(q, {
      userId,
      agentKeys: agentKeys || product.dependencies.map((dependency) => dependency.agentKey),
      source: `product_enable:${product.id}`,
    });
  }

  async function listProducts({ includeUnpublished = true } = {}) {
    const rows = await runQuery(`SELECT p.*, pv.id AS product_version_id, pv.version,
      pv.supported_platforms, pv.status AS version_status, pv.contract_hash,
      pv.display_name AS version_display_name, pv.description AS version_description, pv.identity_snapshot AS version_identity_snapshot
      FROM products p LEFT JOIN LATERAL (
        SELECT * FROM product_versions v WHERE v.product_id = p.id ${includeUnpublished ? "" : "AND v.status = 'published'"}
        ORDER BY v.created_at DESC, v.id DESC LIMIT 1
      ) pv ON TRUE ${includeUnpublished ? "" : "WHERE pv.status = 'published'"}
      ORDER BY p.updated_at DESC, p.product_key ASC`);
    const result = [];
    for (const row of rows) {
      const deps = row.product_version_id ? await runQuery(`SELECT d.*, r.identity_snapshot,
        r.readiness, r.declared_scopes AS declared_scopes, r.contract_hash AS release_contract_hash, r.catalog_status AS release_status,
        ar.version AS registry_version, ar.declared_scopes AS registry_declared_scopes,
        ar.contract_hash AS registry_contract_hash, ar.registration_status AS registry_status
        FROM product_agent_dependencies d
        LEFT JOIN agent_releases r ON r.id = d.agent_release_id
        LEFT JOIN agent_registry ar ON ar.agent_key = d.agent_key
        WHERE d.product_version_id = ? ORDER BY d.agent_key`, [row.product_version_id]) : [];
      const product = mapProduct({ ...row, status: row.version_status || row.status }, deps);
      if (!includeUnpublished && !productIsExecutable(product)) continue;
      result.push(product);
    }
    return result;
  }

  async function listPublishedProductsForAgent(agentKey, { connection = null, userId = null, publishedOnly = true, productVersionId = null } = {}) {
    const q = connection ? qFor(connection) : runQuery;
    if (!publishedOnly && !userId) throw new HttpError(400, "A user is required to resolve an existing Agent entitlement", { code: "USER_REQUIRED" });
    const rows = await q(`SELECT DISTINCT p.id, p.product_key
      FROM products p
      JOIN product_versions pv ON pv.product_id = p.id
      JOIN product_agent_dependencies d ON d.product_version_id = pv.id
      ${publishedOnly ? "" : "LEFT JOIN user_entitlements e ON e.product_version_id = pv.id AND e.user_id = ?"}
      WHERE ${publishedOnly ? "p.status = 'published' AND pv.status = 'published' AND" : "e.id IS NOT NULL AND"} d.agent_key = ?${productVersionId ? " AND pv.id = ?" : ""}
      ORDER BY p.product_key ASC`, [...(publishedOnly ? [agentKey] : [userId, agentKey]), ...(productVersionId ? [productVersionId] : [])]);
    const products = [];
    for (const row of rows) {
      const product = await getProduct(row.id, { connection, publishedOnly, productVersionId });
      if (product && (!publishedOnly || (productIsExecutable(product) && product.dependencies.some(dependency => dependency.agentKey === agentKey)))) products.push(product);
    }
    return products;
  }

  async function getProduct(productId, { lock = false, connection = null, productVersionId = null, publishedOnly = false } = {}) {
    const q = connection ? qFor(connection) : runQuery;
    const rows = await q(`SELECT p.*, pv.id AS product_version_id, pv.version,
      pv.supported_platforms, pv.status AS version_status, pv.contract_hash,
      pv.display_name AS version_display_name, pv.description AS version_description, pv.identity_snapshot AS version_identity_snapshot
      FROM products p LEFT JOIN product_versions pv ON pv.product_id = p.id
      WHERE (p.id = ? OR p.product_key = ?)${productVersionId ? " AND pv.id = ?" : ""}${publishedOnly ? " AND pv.status = 'published'" : ""}
      ORDER BY pv.created_at DESC, pv.id DESC LIMIT 1${lock ? " FOR UPDATE OF p" : ""}`,
      [productId, productId, ...(productVersionId ? [productVersionId] : [])]);
    if (!rows[0]) return null;
    const deps = rows[0].product_version_id ? await q(`SELECT d.*, r.identity_snapshot,
      r.readiness, r.declared_scopes AS declared_scopes, r.contract_hash AS release_contract_hash, r.catalog_status AS release_status,
      ar.version AS registry_version, ar.declared_scopes AS registry_declared_scopes,
      ar.contract_hash AS registry_contract_hash, ar.registration_status AS registry_status
      FROM product_agent_dependencies d
      LEFT JOIN agent_releases r ON r.id = d.agent_release_id
      LEFT JOIN agent_registry ar ON ar.agent_key = d.agent_key
      WHERE d.product_version_id = ? ORDER BY d.agent_key`, [rows[0].product_version_id]) : [];
    return mapProduct({ ...rows[0], status: rows[0].version_status || rows[0].status }, deps);
  }

  async function createProduct({ productKey, version, displayName, description = "", identity, supportedPlatforms, dependencies, createdBy = null, requestId = null }) {
    if (!dependencies?.length) throw new HttpError(422, "Product requires at least one Agent dependency", { code: "PRODUCT_DEPENDENCIES_REQUIRED" });
    if (!isCompleteAgentIdentity(identity) || identity.key !== productKey || identity.published) throw new HttpError(422, "Product identity is incomplete or mismatched", { code: "PRODUCT_IDENTITY_INCOMPLETE" });
    if (identity.displayName !== displayName || identity.description !== description) throw new HttpError(422, "Product identity presentation must match the version", { code: "PRODUCT_IDENTITY_MISMATCH" });
    return transaction(async (connection) => {
      const q = qFor(connection);
      const fingerprint = computeAgentContractHash({ productKey, version, displayName, description, identity, supportedPlatforms: [...supportedPlatforms].sort(), dependencies: [...dependencies].map(dep => ({ ...dep, scopes: [...(dep.scopes || [])].sort() })).sort((a, b) => a.agentKey.localeCompare(b.agentKey)) });
      const reason = `create_product:${fingerprint}`;
      if (requestId) {
        await q("SELECT pg_advisory_xact_lock(hashtext(?))", [`product-create:${createdBy}:${requestId}`]);
        const [replay] = await q(`SELECT product_id, product_version_id, reason FROM product_status_history
          WHERE actor_user_id IS NOT DISTINCT FROM ? AND request_id = ? ORDER BY id DESC LIMIT 1`, [createdBy, requestId]);
        if (replay) {
          if (replay.reason !== reason) throw new HttpError(409, "Idempotency-Key was used for another product", { code: "IDEMPOTENCY_CONFLICT" });
          return getProduct(String(replay.product_id).trim(), { connection, productVersionId: String(replay.product_version_id).trim() });
        }
        await q("SELECT pg_advisory_xact_lock(hashtext(?))", [`product-key:${productKey}`]);
        const duplicate = await q("SELECT id FROM products WHERE product_key = ?", [productKey]);
        if (duplicate.length) throw new HttpError(409, "Product key already exists; create another version of the existing product", { code: "PRODUCT_EXISTS" });
      }
      const productId = randomUUID();
      const versionId = randomUUID();
      await assertManagedAgentAvatar(identity, { connection });
      const normalizedDependencies = await normalizeDependencies(q, dependencies);
      const contractHash = computeProductContractHash({ productKey, version, displayName, description, identity, supportedPlatforms, dependencies: normalizedDependencies });
      await q(`INSERT INTO products (id, product_key, display_name, description, identity_snapshot, status, created_by)
        VALUES (?, ?, ?, ?, ?::jsonb, 'draft', ?)`, [productId, productKey, displayName, description, JSON.stringify(identity), createdBy]);
      await q(`INSERT INTO product_versions (id, product_id, version, supported_platforms, status, created_by, display_name, description, identity_snapshot)
        VALUES (?, ?, ?, ?::jsonb, 'draft', ?, ?, ?, ?::jsonb)`, [versionId, productId, version, JSON.stringify(supportedPlatforms), createdBy, displayName, description, JSON.stringify(identity)]);
      await q("UPDATE product_versions SET contract_hash = ? WHERE id = ?", [contractHash, versionId]);
      for (const dep of normalizedDependencies) await q(`INSERT INTO product_agent_dependencies
        (product_version_id, agent_key, agent_release_id, version, required_scopes) VALUES (?, ?, ?, ?, ?::jsonb)`, [versionId, dep.agentKey, dep.agentReleaseId, dep.version, JSON.stringify(dep.scopes || dep.requiredScopes || [])]);
      await q("INSERT INTO product_status_history (product_id, product_version_id, from_status, to_status, actor_user_id, reason, request_id) VALUES (?, ?, NULL, 'draft', ?, ?, ?)", [productId, versionId, createdBy, reason, requestId]);
      return getProduct(productId, { connection, productVersionId: versionId });
    }).catch(error => {
      if (error.code === "23505" && error.constraint === "products_product_key_key") throw new HttpError(409, "Product key already exists; create a new product version", { code: "PRODUCT_EXISTS" });
      throw error;
    });
  }

  async function listProductVersions(productId, { connection = null } = {}) {
    const q = connection ? qFor(connection) : runQuery;
    const rows = await q(`SELECT pv.id FROM product_versions pv JOIN products p ON p.id = pv.product_id
      WHERE p.id = ? OR p.product_key = ? ORDER BY pv.created_at DESC, pv.id DESC`, [productId, productId]);
    const versions = [];
    for (const row of rows) versions.push(await getProduct(productId, { connection, productVersionId: String(row.id).trim() }));
    return versions.filter(Boolean);
  }

  async function normalizeDependencies(q, dependencies) {
    if (!dependencies?.length) throw new HttpError(422, "Product requires Agent dependencies", { code: "PRODUCT_DEPENDENCIES_REQUIRED" });
    if (new Set(dependencies.map(dep => dep.agentKey)).size !== dependencies.length) throw new HttpError(422, "Product Agent dependencies must be unique", { code: "PRODUCT_DEPENDENCY_DUPLICATE" });
    const normalized = [];
    for (const dep of dependencies) {
      const [release] = await q("SELECT id, agent_key, version, contract_hash, declared_scopes, catalog_status FROM agent_releases WHERE id = ? LIMIT 1 FOR SHARE", [dep.agentReleaseId]);
      if (!release || release.agent_key !== dep.agentKey || release.version !== dep.version) throw new HttpError(409, "Product dependency release does not match", { code: "PRODUCT_DEPENDENCY_MISMATCH" });
      if (release.catalog_status !== "published") throw new HttpError(409, "Product versions must bind published Agent releases", { code: "AGENT_DEPENDENCY_UNAVAILABLE" });
      const scopes = [...new Set(dep.scopes || [])];
      if (!sameScopes(scopes, parseJson(release.declared_scopes, []))) throw new HttpError(422, "Product dependency scopes must match Agent declaration", { code: "SCOPES_MISMATCH" });
      normalized.push({ ...dep, scopes, contractHash: release.contract_hash });
    }
    return normalized;
  }

  async function saveVersion({ productId, productVersionId = null, version, displayName, description = "", identity, supportedPlatforms, dependencies, actorUserId = null, requestId = null }) {
    return transaction(async connection => {
      const q = qFor(connection);
      const [parent] = await q("SELECT id, product_key FROM products WHERE id = ? LIMIT 1 FOR UPDATE", [productId]);
      if (!parent) throw new HttpError(404, "Product not found", { code: "PRODUCT_NOT_FOUND" });
      if (!isCompleteAgentIdentity(identity) || identity.key !== parent.product_key || identity.published) throw new HttpError(422, "Product identity does not match", { code: "PRODUCT_IDENTITY_INCOMPLETE" });
      if (identity.displayName !== displayName || identity.description !== description) throw new HttpError(422, "Product identity presentation must match the version", { code: "PRODUCT_IDENTITY_MISMATCH" });
      await assertManagedAgentAvatar(identity, { connection });
      const normalized = await normalizeDependencies(q, dependencies);
      const contractHash = computeProductContractHash({ productKey: parent.product_key, version, displayName, description, identity, supportedPlatforms, dependencies: normalized });
      const reason = `${productVersionId ? "edit_version" : "create_version"}:${contractHash}`;
      if (requestId) {
        const [replay] = await q("SELECT product_version_id, reason FROM product_status_history WHERE product_id = ? AND request_id = ? ORDER BY id DESC LIMIT 1", [productId, requestId]);
        if (replay) {
          if (replay.reason !== reason || (productVersionId && String(replay.product_version_id).trim() !== productVersionId)) throw new HttpError(409, "Idempotency-Key was used for a different product version", { code: "IDEMPOTENCY_CONFLICT" });
          return getProduct(productId, { connection, productVersionId: String(replay.product_version_id).trim() });
        }
      }
      let versionId = productVersionId;
      if (versionId) {
        const existing = await getProduct(productId, { connection, productVersionId: versionId });
        if (!existing) throw new HttpError(404, "Product version not found", { code: "PRODUCT_VERSION_NOT_FOUND" });
        if (existing.status !== "draft") throw new HttpError(409, "Only draft product versions can be edited", { code: "PRODUCT_VERSION_NOT_EDITABLE" });
        const everPublished = await q("SELECT id FROM product_status_history WHERE product_version_id = ? AND to_status = 'published' LIMIT 1", [versionId]);
        if (everPublished.length) throw new HttpError(409, "Published product versions are immutable", { code: "PRODUCT_VERSION_NOT_EDITABLE" });
        const duplicate = await q("SELECT id FROM product_versions WHERE product_id = ? AND version = ? AND id <> ?", [productId, version, versionId]);
        if (duplicate.length) throw new HttpError(409, "Product version already exists", { code: "PRODUCT_VERSION_EXISTS" });
        await q(`UPDATE product_versions SET version = ?, display_name = ?, description = ?, identity_snapshot = ?::jsonb,
          supported_platforms = ?::jsonb, contract_hash = ? WHERE id = ?`, [version, displayName, description, JSON.stringify(identity), JSON.stringify(supportedPlatforms), contractHash, versionId]);
        await q("DELETE FROM product_agent_dependencies WHERE product_version_id = ?", [versionId]);
      } else {
        const duplicate = await q("SELECT id FROM product_versions WHERE product_id = ? AND version = ?", [productId, version]);
        if (duplicate.length) throw new HttpError(409, "Product version already exists", { code: "PRODUCT_VERSION_EXISTS" });
        versionId = randomUUID();
        await q(`INSERT INTO product_versions (id, product_id, version, display_name, description, identity_snapshot, supported_platforms, contract_hash, status, created_by)
          VALUES (?, ?, ?, ?, ?, ?::jsonb, ?::jsonb, ?, 'draft', ?)`, [versionId, productId, version, displayName, description, JSON.stringify(identity), JSON.stringify(supportedPlatforms), contractHash, actorUserId]);
      }
      for (const dep of normalized) await q(`INSERT INTO product_agent_dependencies (product_version_id, agent_key, agent_release_id, version, required_scopes)
        VALUES (?, ?, ?, ?, ?::jsonb)`, [versionId, dep.agentKey, dep.agentReleaseId, dep.version, JSON.stringify(dep.scopes)]);
      await q("INSERT INTO product_status_history (product_id, product_version_id, from_status, to_status, actor_user_id, reason, request_id) VALUES (?, ?, ?, 'draft', ?, ?, ?)", [productId, versionId, productVersionId ? "draft" : null, actorUserId, reason, requestId]);
      return getProduct(productId, { connection, productVersionId: versionId });
    });
  }

  async function createProductVersion(args) { return saveVersion({ ...args, productVersionId: null }); }
  async function updateProductVersion(args) { return saveVersion(args); }

  async function transitionProduct({ productId, productVersionId = null, toStatus, actorUserId = null, reason = null, requestId = null, afterProjection = null }) {
    return transaction(async (connection) => {
      const q = qFor(connection);
      const product = await getProduct(productId, { connection, lock: true, productVersionId });
      if (!product) throw new HttpError(404, "Product not found", { code: "PRODUCT_NOT_FOUND" });
      if (["review", "published"].includes(toStatus)) {
        assertAgentImagePublicationReady(product.identity);
        for (const dependency of product.dependencies) assertAgentImagePublicationReady(dependency.identity);
      }
      const from = product.status;
      if (requestId) {
        const replay = await q(`SELECT to_status, product_version_id FROM product_status_history
          WHERE product_id = ? AND request_id = ? ORDER BY id DESC LIMIT 1`, [product.id, requestId]);
        if (replay[0]) {
          if (replay[0].to_status !== toStatus || from !== toStatus || (replay[0].product_version_id && String(replay[0].product_version_id).trim() !== product.productVersionId)) {
            throw new HttpError(409, "Idempotency-Key was already used for a different product transition", { code: "IDEMPOTENCY_CONFLICT" });
          }
          return product;
        }
      }
      if (from === toStatus) return product;
      const allowed = { draft: ["review", "retired"], review: ["draft", "published"], published: ["paused", "retired"], paused: ["published", "retired"], retired: [] };
      if (!allowed[from]?.includes(toStatus)) throw new HttpError(409, `Invalid product transition ${from} -> ${toStatus}`, { code: "INVALID_PRODUCT_TRANSITION" });
      if (toStatus === "published") {
        if (!product.contractHash) {
          throw new HttpError(409, "Product contract is incomplete", { code: "PRODUCT_CONTRACT_INCOMPLETE" });
        }
        if (!isCurrentProductContract(product)) {
          throw new HttpError(409, "Product contract is stale", { code: "PRODUCT_CONTRACT_STALE" });
        }
        if (!productIsExecutable(product)) {
          throw new HttpError(409, "Product dependencies have not passed release gates", { code: "PRODUCT_DEPENDENCY_GATE_FAILED" });
        }
      }
      const affectedUsers = ["published", "paused", "retired"].includes(toStatus)
        ? await q("SELECT DISTINCT e.user_id FROM user_entitlements e WHERE e.product_version_id = ? AND e.status = 'enabled'", [product.productVersionId])
        : [];
      await assertManagedAgentAvatar(product.identity, { connection });
      await q("UPDATE product_versions SET status = ? WHERE id = ?", [toStatus, product.productVersionId]);
      await q(`UPDATE products SET status = CASE WHEN EXISTS (SELECT 1 FROM product_versions WHERE product_id = ? AND status = 'published') THEN 'published' ELSE ? END WHERE id = ?`, [product.id, toStatus, product.id]);
      if (toStatus === "published") {
        await q("UPDATE products SET display_name = ?, description = ?, identity_snapshot = ?::jsonb WHERE id = ?", [product.displayName, product.description, JSON.stringify(product.identity), product.id]);
        for (const dep of product.dependencies) {
          const identity = dep.identity;
          await assertManagedAgentAvatar(identity, { connection });
          await q(`INSERT INTO agent_catalog (agent_id, display_name, description, identity_mark, identity_shape, identity_colors, identity_avatar, release_version, contract_hash, source, status)
            VALUES (?, ?, ?, ?, ?, ?::jsonb, ?::jsonb, ?, ?, ?, 'published')
            ON CONFLICT (agent_id) DO UPDATE SET display_name = EXCLUDED.display_name, description = EXCLUDED.description,
              identity_mark = EXCLUDED.identity_mark, identity_shape = EXCLUDED.identity_shape, identity_colors = EXCLUDED.identity_colors,
              identity_avatar = EXCLUDED.identity_avatar, release_version = EXCLUDED.release_version,
              contract_hash = EXCLUDED.contract_hash, source = EXCLUDED.source, status = 'published'`,
            [dep.agentKey, identity.displayName, identity.description, identity.mark, identity.shape, JSON.stringify(identity.colors), identity.avatar ? JSON.stringify(identity.avatar) : null, dep.version, dep.contractHash, identity.source]);
        }
      }
      if (["paused", "retired"].includes(toStatus) && affectedUsers.length) {
        for (const row of affectedUsers) {
          await q("INSERT INTO entitlement_status_history (entitlement_id, from_status, to_status, actor_user_id, reason) SELECT id, status, 'unavailable', ?, ? FROM user_entitlements WHERE user_id = ? AND product_version_id = ? AND status = 'enabled'", [actorUserId, `product_${toStatus}`, row.user_id, product.productVersionId]);
          await q("UPDATE user_entitlements SET status = 'unavailable', unavailable_reason = ?, updated_at = CURRENT_TIMESTAMP WHERE user_id = ? AND product_version_id = ? AND status = 'enabled'", [`Product ${toStatus}`, row.user_id, product.productVersionId]);
          await reconcileUserAgentProjection(q, { userId: row.user_id, agentKeys: product.dependencies.map((dependency) => dependency.agentKey), source: `product_${toStatus}:${product.id}` });
          if (afterProjection) {
            await afterProjection({
              userId: row.user_id,
              enabled: false,
              consentVersion: null,
              idempotencyKey: requestId || uuid(),
              product,
              connection,
            });
          }
        }
      }
      await q("INSERT INTO product_status_history (product_id, product_version_id, from_status, to_status, actor_user_id, reason, request_id) VALUES (?, ?, ?, ?, ?, ?, ?)", [product.id, product.productVersionId, from, toStatus, actorUserId, reason, requestId]);
      return getProduct(product.id, { connection, productVersionId: product.productVersionId });
    });
  }

  async function createEntitlement({ userId, productId, productVersionId = null, grantedScopes, consentVersion = null, idempotencyKey = null, actorUserId = userId, afterProjection = null }) {
    return transaction(async (connection) => {
      const q = qFor(connection);
      if (!idempotencyKey || typeof idempotencyKey !== "string" || idempotencyKey.trim().length < 8 || idempotencyKey.trim().length > 160) {
        throw new HttpError(400, "An Idempotency-Key is required to enable a product", { code: "IDEMPOTENCY_KEY_REQUIRED" });
      }
      const normalizedIdempotencyKey = idempotencyKey.trim();
      let selectedVersionId = productVersionId;
      if (!selectedVersionId) {
        const existingGrant = await q("SELECT product_version_id FROM user_entitlements WHERE user_id = ? AND product_id = ? AND status = 'enabled' ORDER BY updated_at DESC LIMIT 1", [userId, productId]);
        selectedVersionId = existingGrant[0]?.product_version_id?.trim() || null;
      }
      const product = await getProduct(productId, { connection, lock: true, productVersionId: selectedVersionId, publishedOnly: !selectedVersionId });
      if (!product) throw new HttpError(404, "Published product version not found", { code: "PRODUCT_NOT_FOUND" });
      if (product.status !== "published") throw new HttpError(409, "Product is unavailable", { code: "PRODUCT_UNAVAILABLE" });
      if (!isCurrentProductContract(product)) {
        throw new HttpError(409, "Product contract is stale", { code: "PRODUCT_CONTRACT_STALE" });
      }
      if (product.dependencies.some((dependency) => !isCurrentProductDependency(dependency))) {
        throw new HttpError(409, "Product dependencies have changed and require re-consent", { code: "PRODUCT_DEPENDENCY_GATE_FAILED" });
      }
      const required = product.dependencies.flatMap((dep) => dep.scopes || []);
      const scopes = [...new Set(grantedScopes || [])];
      const requiredSet = new Set(required);
      if (requiredSet.size !== scopes.length || [...requiredSet].some((scope) => !scopes.includes(scope))) {
        throw new HttpError(400, "Product scopes require explicit user consent", { code: "PRODUCT_CONSENT_REQUIRED" });
      }
      // Lock the user after the product row. Product pause/retire uses the same
      // product-first order before touching entitlement rows, which prevents a
      // concurrent consent and product transition from deadlocking.
      const userRows = await q("SELECT id FROM users WHERE id = ? FOR UPDATE", [userId]);
      if (!userRows[0]) throw new HttpError(404, "User not found", { code: "USER_NOT_FOUND" });
      const replay = await q("SELECT * FROM user_entitlements WHERE user_id = ? AND idempotency_key = ? FOR UPDATE", [userId, normalizedIdempotencyKey]);
      if (replay[0] && replay[0].product_version_id !== product.productVersionId) {
        throw new HttpError(409, "Idempotency-Key was already used for another product", { code: "IDEMPOTENCY_CONFLICT" });
      }
      const supersededProducts = [];
      if (productVersionId) {
        const superseded = await q("SELECT product_version_id FROM user_entitlements WHERE user_id = ? AND product_id = ? AND product_version_id <> ? AND status = 'enabled'", [userId, product.id, product.productVersionId]);
        for (const row of superseded) {
          const previous = await getProduct(product.id, { connection, productVersionId: String(row.product_version_id).trim() });
          if (previous) supersededProducts.push(previous);
        }
        await q(`INSERT INTO entitlement_status_history (entitlement_id, from_status, to_status, actor_user_id, reason)
          SELECT id, status, 'disabled', ?, 'user_consented_product_version_upgrade' FROM user_entitlements
          WHERE user_id = ? AND product_id = ? AND product_version_id <> ? AND status = 'enabled'`, [actorUserId, userId, product.id, product.productVersionId]);
        await q("UPDATE user_entitlements SET status = 'disabled', unavailable_reason = 'User consented to another product version' WHERE user_id = ? AND product_id = ? AND product_version_id <> ? AND status = 'enabled'", [userId, product.id, product.productVersionId]);
      }
      const projectConsent = async () => {
        const agentKeys = [...new Set([product, ...supersededProducts].flatMap(item => item.dependencies.map(dependency => dependency.agentKey)))];
        await ensureEntitlementProjection(q, { userId, product, agentKeys });
        if (afterProjection) {
          for (const previous of supersededProducts) {
            await afterProjection({ userId, enabled: false, consentVersion: null, idempotencyKey: `product-upgrade-${crypto.createHash("sha256").update(`${normalizedIdempotencyKey}:${previous.productVersionId}`).digest("hex")}`, product: previous, connection });
          }
          await afterProjection({ userId, enabled: true, consentVersion, idempotencyKey: normalizedIdempotencyKey, product, connection });
        }
      };
      const existing = await q("SELECT * FROM user_entitlements WHERE user_id = ? AND product_version_id = ? FOR UPDATE", [userId, product.productVersionId]);
      if (existing[0]) {
        if (replay[0] && replay[0].id === existing[0].id) {
          const previousScopes = parseJson(existing[0].granted_scopes, []);
          const sameRequest = existing[0].status === "enabled" && existing[0].contract_hash === product.contractHash &&
            existing[0].consent_version === consentVersion && previousScopes.length === scopes.length &&
            previousScopes.every((scope) => scopes.includes(scope));
          if (sameRequest) return mapEntitlement(existing[0]);
          throw new HttpError(409, "Idempotency-Key was already used with different consent", { code: "IDEMPOTENCY_CONFLICT" });
        }
        const sameContract = existing[0].status === "enabled" && existing[0].contract_hash === product.contractHash;
        if (!sameContract) {
          await q("UPDATE user_entitlements SET status = 'enabled', granted_scopes = ?::jsonb, contract_hash = ?, consent_version = ?, idempotency_key = ?, unavailable_reason = NULL WHERE id = ?", [JSON.stringify(scopes), product.contractHash, consentVersion, normalizedIdempotencyKey, existing[0].id]);
          await q("INSERT INTO entitlement_status_history (entitlement_id, from_status, to_status, actor_user_id, reason) VALUES (?, ?, 'enabled', ?, ?)", [existing[0].id, existing[0].status, actorUserId, existing[0].status === "enabled" ? "contract_refresh" : "user_reconsent"]);
        } else {
          await q("UPDATE user_entitlements SET idempotency_key = ?, consent_version = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?", [normalizedIdempotencyKey, consentVersion, existing[0].id]);
        }
        await projectConsent();
        return mapEntitlement((await q("SELECT * FROM user_entitlements WHERE id = ?", [existing[0].id]))[0]);
      }
      const entitlementId = randomUUID();
      const contractHash = product.contractHash;
      if (!contractHash) throw new HttpError(409, "Product contract is incomplete", { code: "PRODUCT_CONTRACT_INCOMPLETE" });
      await q(`INSERT INTO user_entitlements (id, user_id, product_id, product_version_id, status, granted_scopes, contract_hash, consent_version, idempotency_key)
        VALUES (?, ?, ?, ?, 'enabled', ?::jsonb, ?, ?, ?)`, [entitlementId, userId, product.id, product.productVersionId, JSON.stringify(scopes), contractHash, consentVersion, normalizedIdempotencyKey]);
      await q("INSERT INTO entitlement_status_history (entitlement_id, from_status, to_status, actor_user_id, reason) VALUES (?, NULL, 'enabled', ?, 'user_consent')", [entitlementId, actorUserId]);
      await projectConsent();
      return mapEntitlement((await q("SELECT * FROM user_entitlements WHERE id = ?", [entitlementId]))[0]);
    });
  }

  async function disableEntitlement({ userId, productId, productVersionId = null, idempotencyKey, actorUserId = userId, afterProjection = null }) {
    return transaction(async (connection) => {
      const q = qFor(connection);
      if (!idempotencyKey || typeof idempotencyKey !== "string" || idempotencyKey.trim().length < 8 || idempotencyKey.trim().length > 160) {
        throw new HttpError(400, "An Idempotency-Key is required to disable a product", { code: "IDEMPOTENCY_KEY_REQUIRED" });
      }
      let selectedVersionId = productVersionId;
      if (!selectedVersionId) {
        const existingGrant = await q("SELECT product_version_id FROM user_entitlements WHERE user_id = ? AND product_id = ? ORDER BY CASE status WHEN 'enabled' THEN 0 ELSE 1 END, updated_at DESC LIMIT 1", [userId, productId]);
        selectedVersionId = existingGrant[0]?.product_version_id?.trim() || null;
      }
      const product = await getProduct(productId, { connection, lock: true, productVersionId: selectedVersionId });
      if (!product) throw new HttpError(404, "Product not found", { code: "PRODUCT_NOT_FOUND" });
      const users = await q("SELECT id FROM users WHERE id = ? FOR UPDATE", [userId]);
      if (!users[0]) throw new HttpError(404, "User not found", { code: "USER_NOT_FOUND" });
      const normalizedKey = idempotencyKey.trim();
      const replay = await q("SELECT * FROM user_entitlements WHERE user_id = ? AND idempotency_key = ? FOR UPDATE", [userId, normalizedKey]);
      if (replay[0] && replay[0].product_version_id !== product.productVersionId) {
        throw new HttpError(409, "Idempotency-Key was already used for another product", { code: "IDEMPOTENCY_CONFLICT" });
      }
      const entitlementRows = await q("SELECT * FROM user_entitlements WHERE user_id = ? AND product_version_id = ? FOR UPDATE", [userId, product.productVersionId]);
      const entitlement = entitlementRows[0];
      if (!entitlement) throw new HttpError(404, "Product entitlement not found", { code: "ENTITLEMENT_NOT_FOUND" });
      if (replay[0] && replay[0].id !== entitlement.id) {
        throw new HttpError(409, "Idempotency-Key was already used for another entitlement", { code: "IDEMPOTENCY_CONFLICT" });
      }
      if (entitlement.idempotency_key && entitlement.idempotency_key === normalizedKey && entitlement.status === "disabled") {
        return mapEntitlement(entitlement);
      }
      const from = entitlement.status;
      // An idempotency key used to enable a product cannot be reused for a
      // different mutation. The entitlement row stores only the latest key,
      // so an enabled row with the same key is necessarily an enable replay,
      // not a valid disable request.
      if (entitlement.idempotency_key === normalizedKey && from !== "disabled") {
        throw new HttpError(409, "Idempotency-Key was already used for a different product mutation", { code: "IDEMPOTENCY_CONFLICT" });
      }
      if (from !== "disabled") {
        await q("UPDATE user_entitlements SET status = 'disabled', unavailable_reason = 'User disabled product', idempotency_key = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?", [normalizedKey, entitlement.id]);
        await q("INSERT INTO entitlement_status_history (entitlement_id, from_status, to_status, actor_user_id, reason) VALUES (?, ?, 'disabled', ?, 'user_revoked')", [entitlement.id, from, actorUserId]);
      } else {
        await q("UPDATE user_entitlements SET idempotency_key = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?", [normalizedKey, entitlement.id]);
      }
      await reconcileUserAgentProjection(q, {
        userId,
        agentKeys: product.dependencies.map((dependency) => dependency.agentKey),
        source: `product_disable:${product.id}`,
      });
      if (afterProjection) await afterProjection({ userId, enabled: false, consentVersion: null, idempotencyKey: normalizedKey, product, connection });
      return mapEntitlement((await q("SELECT * FROM user_entitlements WHERE id = ?", [entitlement.id]))[0]);
    });
  }

  async function listEntitlementsForUser(userId) {
    const rows = await runQuery(`SELECT e.id, e.product_id, e.product_version_id, e.status,
        e.granted_scopes, e.contract_hash, e.consent_version, e.unavailable_reason,
        p.product_key, pv.version
      FROM user_entitlements e
      JOIN products p ON p.id = e.product_id
      JOIN product_versions pv ON pv.id = e.product_version_id
      WHERE e.user_id = ?
      ORDER BY e.updated_at DESC, e.id DESC`, [userId]);
    const result = [];
    for (const row of rows) {
      const product = row.status === "enabled" ? await getProduct(String(row.product_id).trim(), { productVersionId: String(row.product_version_id).trim() }) : null;
      const unavailable = row.status === "enabled" && (!product || product.status !== "published" || !productIsExecutable(product) || row.contract_hash !== product.contractHash);
      result.push({
        id: String(row.id || "").trim(), productId: String(row.product_id || "").trim(),
        productVersionId: String(row.product_version_id || "").trim(), productKey: row.product_key, version: row.version,
        status: unavailable ? "unavailable" : row.status, grantedScopes: parseJson(row.granted_scopes, []),
        contractHash: row.contract_hash || null, consentVersion: row.consent_version || null,
        unavailableReason: unavailable ? (row.unavailable_reason || "Product dependency contract is unavailable") : (row.unavailable_reason || null),
      });
    }
    return result;
  }

  return { listProducts, getProduct, listProductVersions, createProductVersion, updateProductVersion, listPublishedProductsForAgent, createProduct, transitionProduct, createEntitlement, disableEntitlement, listEntitlementsForUser };
}

function mapEntitlement(row) {
  return row ? {
    id: String(row.id || "").trim(),
    userId: row.user_id,
    productId: row.product_id,
    productVersionId: row.product_version_id && String(row.product_version_id).trim(),
    productKey: row.product_key || null,
    version: row.product_version || null,
    status: row.status,
    grantedScopes: parseJson(row.granted_scopes, []),
    contractHash: row.contract_hash || null,
    consentVersion: row.consent_version || null,
    unavailableReason: row.unavailable_reason || null,
  } : null;
}

export const productCatalogRepository = createProductCatalogRepository();
export const listProducts = (...args) => productCatalogRepository.listProducts(...args);
export const getProduct = (...args) => productCatalogRepository.getProduct(...args);
export const listPublishedProductsForAgent = (...args) => productCatalogRepository.listPublishedProductsForAgent(...args);
export const listEntitlementsForUser = (...args) => productCatalogRepository.listEntitlementsForUser(...args);
