import crypto from "node:crypto";

import { getAgent } from "../../agents/registry.js";
import {
  canonicalizeContract,
  computeAgentContractHash,
  computeAgentReleaseContractHash,
  isCompleteAgentIdentity,
} from "../../shared/agent-catalog.js";
import { HttpError } from "./http-error.js";

const BUTLER_KEY = "miaoxun-butler";
const PRODUCT_PLATFORMS = ["android", "ios"];

const queryRows = async (connection, sql, params = []) => {
  if (typeof connection?.query === "function") return connection.query(sql, params);
  const result = await connection.execute(sql, params);
  return result?.[0] || [];
};

const completeIdentity = (agent, now) => ({
  key: agent.key,
  avatarKind: agent.identity.avatarKind,
  displayName: agent.name,
  description: agent.description,
  mark: agent.identity.mark,
  shape: agent.identity.shape,
  colors: agent.identity.colors,
  published: true,
  source: "registry",
  updatedAt: now,
});

const sameScopes = (left, right) =>
  JSON.stringify([...left].sort()) === JSON.stringify([...right].sort());

const parseJson = (value, fallback) => {
  if (Array.isArray(value) || (value && typeof value === "object")) return value;
  try {
    return JSON.parse(value ?? "");
  } catch {
    return fallback;
  }
};

/**
 * Publish the first built-in Butler release and product during the explicit
 * admin bootstrap command. Subsequent code changes must go through the admin
 * release/product review APIs; this function refuses to publish a new
 * version, repair a stale contract, or overwrite an existing product.
 */
export async function ensureInitialDefaultButlerPublication(
  connection,
  { readiness = { ready: true, missing: [] }, now = new Date().toISOString() } = {},
) {
  const agent = await getAgent(BUTLER_KEY);
  if (!agent || !isCompleteAgentIdentity(completeIdentity(agent, now))) {
    throw new HttpError(409, "默认妙讯管家代码身份合同不完整", {
      code: "DEFAULT_BUTLER_IDENTITY_INCOMPLETE",
    });
  }
  if (!readiness?.ready) {
    throw new HttpError(409, "默认妙讯管家运行配置未就绪", {
      code: "DEFAULT_BUTLER_NOT_READY",
      missing: readiness?.missing || [],
    });
  }

  const identity = completeIdentity(agent, now);
  const releaseContractHash = computeAgentReleaseContractHash({
    key: agent.key,
    version: agent.version,
    permissions: agent.permissions,
    identity,
  });
  const declaredScopes = [...agent.permissions];

  const releases = await queryRows(
    connection,
    "SELECT id, agent_key, version, contract_hash, catalog_status FROM agent_releases WHERE agent_key = ? ORDER BY created_at ASC FOR UPDATE",
    [agent.key],
  );
  let release = releases.find(
    (row) => row.version === agent.version && row.contract_hash === releaseContractHash,
  );
  let initialReleasePublication = false;
  if (!release) {
    if (releases.length) {
      throw new HttpError(409, "默认妙讯管家已有版本，需要通过后台审核发布新版本", {
        code: "DEFAULT_BUTLER_RELEASE_REVIEW_REQUIRED",
      });
    }
    const releaseId = crypto.randomUUID();
    await queryRows(
      connection,
      `INSERT INTO agent_registry
        (agent_key, version, contract_hash, declared_scopes, readiness, registration_status, source)
       VALUES (?, ?, ?, ?::jsonb, ?::jsonb, 'registered', 'registry')
       ON CONFLICT (agent_key) DO UPDATE SET
         version = EXCLUDED.version,
         contract_hash = EXCLUDED.contract_hash,
         declared_scopes = EXCLUDED.declared_scopes,
         readiness = EXCLUDED.readiness,
         registration_status = 'registered',
         removed_at = NULL,
         source = 'registry',
         updated_at = CURRENT_TIMESTAMP`,
      [agent.key, agent.version, releaseContractHash, JSON.stringify(declaredScopes), JSON.stringify(readiness)],
    );
    await queryRows(
      connection,
      `INSERT INTO agent_releases
        (id, agent_key, version, contract_hash, declared_scopes, readiness, identity_snapshot, catalog_status)
       VALUES (?, ?, ?, ?, ?::jsonb, ?::jsonb, ?::jsonb, 'draft')`,
      [releaseId, agent.key, agent.version, releaseContractHash, JSON.stringify(declaredScopes), JSON.stringify(readiness), JSON.stringify(identity)],
    );
    await queryRows(
      connection,
      `INSERT INTO agent_release_status_history
        (release_id, from_status, to_status, reason)
       VALUES (?, NULL, 'draft', 'code_registration_sync')`,
      [releaseId],
    );
    await queryRows(connection, "UPDATE agent_releases SET catalog_status = 'review' WHERE id = ?", [releaseId]);
    await queryRows(
      connection,
      `INSERT INTO agent_release_status_history
        (release_id, from_status, to_status, reason)
       VALUES (?, 'draft', 'review', 'initial_default_butler_bootstrap')`,
      [releaseId],
    );
    await queryRows(connection, "UPDATE agent_releases SET catalog_status = 'published', published_at = CURRENT_TIMESTAMP WHERE id = ?", [releaseId]);
    await queryRows(
      connection,
      `INSERT INTO agent_release_status_history
        (release_id, from_status, to_status, reason)
       VALUES (?, 'review', 'published', 'initial_default_butler_bootstrap')`,
      [releaseId],
    );
    release = {
      id: releaseId,
      agent_key: agent.key,
      version: agent.version,
      contract_hash: releaseContractHash,
      catalog_status: "published",
    };
    initialReleasePublication = true;
  } else if (release.catalog_status !== "published") {
    if (releases.some((row) => row.catalog_status === "published")) {
      throw new HttpError(409, "默认妙讯管家 release 尚未完成后台发布", {
        code: "DEFAULT_BUTLER_RELEASE_REVIEW_REQUIRED",
      });
    }
    if (release.catalog_status === "draft") {
      await queryRows(connection, "UPDATE agent_releases SET catalog_status = 'review' WHERE id = ?", [release.id]);
      await queryRows(
        connection,
        `INSERT INTO agent_release_status_history
          (release_id, from_status, to_status, reason)
         VALUES (?, 'draft', 'review', 'initial_default_butler_bootstrap')`,
        [release.id],
      );
    }
    await queryRows(
      connection,
      `UPDATE agent_releases
          SET catalog_status = 'published', published_at = CURRENT_TIMESTAMP,
              identity_snapshot = ?::jsonb, readiness = ?::jsonb
        WHERE id = ?`,
      [JSON.stringify(identity), JSON.stringify(readiness), release.id],
    );
    await queryRows(
      connection,
      `INSERT INTO agent_release_status_history
        (release_id, from_status, to_status, reason)
       VALUES (?, 'review', 'published', 'initial_default_butler_bootstrap')`,
      [release.id],
    );
    release = { ...release, catalog_status: "published" };
    initialReleasePublication = true;
  }

  const catalogRows = await queryRows(
    connection,
    "SELECT display_name, description, identity_mark, identity_shape, identity_colors, status, release_version, contract_hash FROM agent_catalog WHERE agent_id = ? LIMIT 1 FOR UPDATE",
    [agent.key],
  );
  const catalog = catalogRows[0];
  const catalogMatches = catalog &&
    catalog.display_name === identity.displayName &&
    catalog.description === identity.description &&
    catalog.identity_mark === identity.mark &&
    catalog.identity_shape === identity.shape &&
    canonicalizeContract(parseJson(catalog.identity_colors, {})) === canonicalizeContract(identity.colors) &&
    catalog.status === "published" &&
    catalog.release_version === agent.version &&
    catalog.contract_hash === releaseContractHash;
  if (!catalog) {
    throw new HttpError(409, "默认妙讯管家目录合同不存在", {
      code: "DEFAULT_BUTLER_CATALOG_CONTRACT_INCOMPLETE",
    });
  }
  if (!catalogMatches && !initialReleasePublication) {
    throw new HttpError(409, "默认妙讯管家目录合同与已发布 release 不一致", {
      code: "DEFAULT_BUTLER_CATALOG_CONTRACT_INCOMPLETE",
    });
  }
  if (!catalogMatches && initialReleasePublication) {
    await queryRows(
      connection,
      `UPDATE agent_catalog
          SET display_name = ?, description = ?, identity_mark = ?, identity_shape = ?,
              identity_colors = ?::jsonb, release_version = ?, contract_hash = ?,
              source = 'registry', status = 'published'
        WHERE agent_id = ?`,
      [identity.displayName, identity.description, identity.mark, identity.shape, JSON.stringify(identity.colors), agent.version, releaseContractHash, agent.key],
    );
  }

  const productRows = await queryRows(
    connection,
    `SELECT p.id, p.product_key, p.status, p.identity_snapshot,
            pv.id AS product_version_id, pv.version, pv.status AS version_status,
            pv.contract_hash, d.agent_release_id, d.required_scopes
       FROM products p
       LEFT JOIN product_versions pv ON pv.product_id = p.id
       LEFT JOIN product_agent_dependencies d ON d.product_version_id = pv.id AND d.agent_key = ?
      WHERE p.product_key = ?
      ORDER BY pv.created_at DESC
      LIMIT 1
      FOR UPDATE OF p`,
    [agent.key, agent.key],
  );
  const product = productRows[0];
  const productContractHash = computeAgentContractHash({
    productKey: agent.key,
    version: agent.version,
    displayName: agent.name,
    description: agent.description,
    supportedPlatforms: PRODUCT_PLATFORMS,
    dependencies: [{
      agentKey: agent.key,
      agentReleaseId: release.id,
      version: agent.version,
      scopes: [...declaredScopes].sort(),
      contractHash: releaseContractHash,
    }],
  });

  if (product) {
    const productMatches = product.status === "published" &&
      product.version_status === "published" &&
      product.version === agent.version &&
      product.contract_hash === productContractHash &&
      product.agent_release_id === release.id &&
      sameScopes(parseJson(product.required_scopes, []), declaredScopes);
    if (!productMatches) {
      throw new HttpError(409, "默认妙讯管家产品合同需要后台重新发布", {
        code: "DEFAULT_BUTLER_PRODUCT_REVIEW_REQUIRED",
      });
    }
    return { releaseId: release.id, productId: product.id, productVersionId: product.product_version_id, created: false };
  }

  const productId = crypto.randomUUID();
  const productVersionId = crypto.randomUUID();
  await queryRows(
    connection,
    `INSERT INTO products (id, product_key, display_name, description, identity_snapshot, status)
     VALUES (?, ?, ?, ?, ?::jsonb, 'draft')`,
    [productId, agent.key, agent.name, agent.description, JSON.stringify(identity)],
  );
  await queryRows(
    connection,
    `INSERT INTO product_versions (id, product_id, version, supported_platforms, status, contract_hash)
     VALUES (?, ?, ?, ?::jsonb, 'draft', ?)`,
    [productVersionId, productId, agent.version, JSON.stringify(PRODUCT_PLATFORMS), productContractHash],
  );
  await queryRows(
    connection,
    `INSERT INTO product_agent_dependencies
      (product_version_id, agent_key, agent_release_id, version, required_scopes)
     VALUES (?, ?, ?, ?, ?::jsonb)`,
    [productVersionId, agent.key, release.id, agent.version, JSON.stringify(declaredScopes)],
  );
  await queryRows(
    connection,
    `INSERT INTO product_status_history
      (product_id, product_version_id, from_status, to_status, reason)
     VALUES (?, ?, NULL, 'draft', 'create')`,
    [productId, productVersionId],
  );
  await queryRows(connection, "UPDATE products SET status = 'review' WHERE id = ?", [productId]);
  await queryRows(connection, "UPDATE product_versions SET status = 'review' WHERE id = ?", [productVersionId]);
  await queryRows(
    connection,
    `INSERT INTO product_status_history
      (product_id, product_version_id, from_status, to_status, reason)
     VALUES (?, ?, 'draft', 'review', 'initial_default_butler_bootstrap')`,
    [productId, productVersionId],
  );
  await queryRows(connection, "UPDATE products SET status = 'published' WHERE id = ?", [productId]);
  await queryRows(connection, "UPDATE product_versions SET status = 'published' WHERE id = ?", [productVersionId]);
  await queryRows(
    connection,
    `INSERT INTO product_status_history
      (product_id, product_version_id, from_status, to_status, reason)
     VALUES (?, ?, 'review', 'published', 'initial_default_butler_bootstrap')`,
    [productId, productVersionId],
  );
  return { releaseId: release.id, productId, productVersionId, created: true };
}
