import crypto from "node:crypto";
import { query, withTransaction } from "./db.js";
import { computeAgentReleaseContractHash, isCompleteAgentIdentity } from "../../shared/agent-catalog.js";
import { parseJson, toIso } from "./repository-mappers.js";
import { HttpError } from "./http-error.js";

const uuid = () => crypto.randomUUID();

export function mapRelease(row) {
  if (!row) return null;
  return {
    id: String(row.id || "").trim(),
    agentKey: row.agent_key,
    version: row.version,
    contractHash: row.contract_hash,
    declaredScopes: parseJson(row.declared_scopes, []),
    readiness: parseJson(row.readiness, { ready: false, missing: ["unverified"] }),
    identity: parseJson(row.identity_snapshot, null),
    catalogStatus: row.catalog_status,
    publishedAt: toIso(row.published_at),
    createdAt: toIso(row.created_at),
    updatedAt: toIso(row.updated_at),
  };
}

function transactionQuery(connection) {
  return typeof connection?.query === "function"
    ? connection.query.bind(connection)
    : async (sql, params = []) => (await connection.execute(sql, params))[0] || [];
}

function sameScopes(left = [], right = []) {
  const a = [...new Set(left)].sort();
  const b = [...new Set(right)].sort();
  return a.length === b.length && a.every((scope, index) => scope === b[index]);
}

export function createAgentReleaseRepository({
  query: runQuery = query,
  withTransaction: transaction = withTransaction,
  randomUUID = uuid,
} = {}) {
  async function syncRegisteredAgents(agents = []) {
    return transaction(async (connection) => {
      const q = transactionQuery(connection);
      const releases = [];
      for (const agent of agents) {
        const declaredScopes = [...new Set(agent.permissions || [])];
        const readiness = agent.readiness || { ready: true, missing: [] };
        const identity = {
          key: agent.key,
          avatarKind: agent.identity?.avatarKind,
          displayName: agent.name,
          description: agent.description || "",
          mark: agent.identity?.mark,
          shape: agent.identity?.shape,
          colors: agent.identity?.colors,
          published: false,
          source: "registry",
          updatedAt: new Date().toISOString(),
        };
        const contractHash = computeAgentReleaseContractHash({
          key: agent.key,
          version: agent.version,
          permissions: declaredScopes,
          identity,
        });
        await q(`INSERT INTO agent_registry
          (agent_key, version, contract_hash, declared_scopes, readiness, registration_status, source)
          VALUES (?, ?, ?, ?::jsonb, ?::jsonb, 'registered', 'registry')
          ON CONFLICT (agent_key) DO UPDATE SET version = EXCLUDED.version,
            contract_hash = EXCLUDED.contract_hash, declared_scopes = EXCLUDED.declared_scopes,
            readiness = EXCLUDED.readiness, registration_status = 'registered', removed_at = NULL,
            updated_at = CURRENT_TIMESTAMP`,
          [agent.key, agent.version, contractHash, JSON.stringify(declaredScopes), JSON.stringify(readiness)]);
        const existing = await q(`SELECT id, catalog_status, contract_hash, identity_snapshot, declared_scopes FROM agent_releases
          WHERE agent_key = ? AND version = ? AND contract_hash = ? LIMIT 1 FOR UPDATE`,
          [agent.key, agent.version, contractHash]);
        let existingRelease = existing[0] || null;
        let preserveOperatorIdentity = false;
        if (!existingRelease) {
          // An operator-curated identity is a release presentation decision,
          // not a code registration change. Keep that release stable when the
          // runtime version and declared scopes are unchanged; a version or
          // permission change still creates a new release below.
          const curatedRows = await q(`SELECT id, catalog_status, contract_hash, identity_snapshot, declared_scopes
            FROM agent_releases
            WHERE agent_key = ? AND version = ? AND catalog_status <> 'archived'
            ORDER BY CASE catalog_status WHEN 'published' THEN 0 WHEN 'review' THEN 1 WHEN 'unpublished' THEN 2 ELSE 3 END,
              updated_at DESC
            LIMIT 10 FOR UPDATE`, [agent.key, agent.version]);
          existingRelease = curatedRows.find((row) => {
            const snapshot = parseJson(row.identity_snapshot, null);
            return snapshot?.source === "admin" && sameScopes(parseJson(row.declared_scopes, []), declaredScopes);
          }) || null;
          preserveOperatorIdentity = Boolean(existingRelease);
        }
        let releaseId = existingRelease?.id;
        if (!releaseId) {
          releaseId = randomUUID();
          await q(`INSERT INTO agent_releases
            (id, agent_key, version, contract_hash, declared_scopes, readiness, identity_snapshot, catalog_status)
            VALUES (?, ?, ?, ?, ?::jsonb, ?::jsonb, ?::jsonb, 'draft')`,
            [releaseId, agent.key, agent.version, contractHash, JSON.stringify(declaredScopes), JSON.stringify(readiness), JSON.stringify(identity)]);
          await q(`INSERT INTO agent_release_status_history
            (release_id, from_status, to_status, reason) VALUES (?, NULL, 'draft', 'code_registration_sync')`, [releaseId]);
        } else if (preserveOperatorIdentity) {
          await q(`UPDATE agent_releases SET declared_scopes = ?::jsonb, readiness = ?::jsonb WHERE id = ?`,
            [JSON.stringify(declaredScopes), JSON.stringify(readiness), releaseId]);
        } else {
          await q(`UPDATE agent_releases SET declared_scopes = ?::jsonb, readiness = ?::jsonb,
              identity_snapshot = COALESCE(identity_snapshot, ?::jsonb) WHERE id = ?`,
            [JSON.stringify(declaredScopes), JSON.stringify(readiness), JSON.stringify(identity), releaseId]);
        }
        if (!preserveOperatorIdentity) await q(`INSERT INTO agent_catalog
          (agent_id, display_name, description, identity_mark, identity_shape, identity_colors,
           release_version, contract_hash, source, status)
          VALUES (?, ?, ?, ?, ?, ?::jsonb, ?, ?, 'registry', 'unpublished')
          ON CONFLICT (agent_id) DO UPDATE SET
            display_name = COALESCE(agent_catalog.display_name, EXCLUDED.display_name),
            description = COALESCE(agent_catalog.description, EXCLUDED.description),
            identity_mark = COALESCE(agent_catalog.identity_mark, EXCLUDED.identity_mark),
            identity_shape = COALESCE(agent_catalog.identity_shape, EXCLUDED.identity_shape),
            identity_colors = CASE WHEN agent_catalog.identity_colors = '{}'::jsonb THEN EXCLUDED.identity_colors ELSE agent_catalog.identity_colors END,
            release_version = EXCLUDED.release_version, contract_hash = EXCLUDED.contract_hash,
            source = EXCLUDED.source,
            status = CASE WHEN agent_catalog.contract_hash = EXCLUDED.contract_hash THEN agent_catalog.status ELSE 'unpublished' END`,
          [agent.key, agent.name, agent.description || "", agent.identity?.mark || "", agent.identity?.shape || null,
            JSON.stringify(agent.identity?.colors || {}), agent.version, contractHash]);
        const effectiveIdentity = preserveOperatorIdentity
          ? parseJson(existingRelease.identity_snapshot, null)
          : identity;
        releases.push({
          ...agent,
          name: effectiveIdentity?.displayName || agent.name,
          description: effectiveIdentity?.description || agent.description || "",
          identity: effectiveIdentity,
          contractHash: preserveOperatorIdentity ? existingRelease.contract_hash : contractHash,
          declaredScopes,
          readiness,
          releaseId,
        });
      }
      return releases;
    });
  }

  async function listAgentReleases({ includeArchived = false } = {}) {
    const rows = await runQuery(`SELECT * FROM agent_releases
      ${includeArchived ? "" : "WHERE catalog_status <> 'archived'"}
      ORDER BY updated_at DESC, agent_key ASC, version DESC`);
    return rows.map(mapRelease);
  }

  async function getAgentRelease(id, { lock = false, connection = null } = {}) {
    const q = connection ? transactionQuery(connection) : runQuery;
    const rows = await q(`SELECT * FROM agent_releases WHERE id = ? LIMIT 1${lock ? " FOR UPDATE" : ""}`, [id]);
    return mapRelease(rows[0]);
  }

  async function updateIdentity({ releaseId, identity, actorUserId = null, requestId = null }) {
    if (!isCompleteAgentIdentity(identity)) throw new HttpError(422, "Agent identity is incomplete", { code: "IDENTITY_INCOMPLETE" });
    return transaction(async (connection) => {
      const q = transactionQuery(connection);
      const rows = await q("SELECT * FROM agent_releases WHERE id = ? LIMIT 1 FOR UPDATE", [releaseId]);
      if (!rows[0]) throw new HttpError(404, "Agent release not found", { code: "RELEASE_NOT_FOUND" });
      if (identity.key !== rows[0].agent_key) throw new HttpError(422, "Identity key does not match release", { code: "IDENTITY_KEY_MISMATCH" });
      const declaredScopes = parseJson(rows[0].declared_scopes, []);
      // Identity provenance and freshness are server-owned. A client cannot
      // make an operator edit look like a registry sync or backdate it.
      const operatorIdentity = {
        ...identity,
        published: false,
        source: "admin",
        updatedAt: new Date().toISOString(),
      };
      const contractHash = computeAgentReleaseContractHash({
        key: rows[0].agent_key,
        version: rows[0].version,
        permissions: declaredScopes,
        identity: operatorIdentity,
      });
      if (requestId) {
        const replay = await q(`SELECT to_status, reason
          FROM agent_release_status_history
          WHERE release_id = ? AND request_id = ? ORDER BY id DESC LIMIT 1`, [releaseId, requestId]);
        if (replay[0]) {
          if (replay[0].reason !== `admin_identity_update:${contractHash}` || replay[0].to_status !== rows[0].catalog_status) {
            throw new HttpError(409, "Idempotency-Key was already used for a different Agent identity", { code: "IDEMPOTENCY_CONFLICT" });
          }
          return mapRelease(rows[0]);
        }
      }
      if (rows[0].catalog_status === "published") throw new HttpError(409, "Published Agent releases are immutable; register a new release for identity changes", { code: "PUBLISHED_RELEASE_IMMUTABLE" });
      const catalogIdentity = operatorIdentity;
      await q("UPDATE agent_releases SET identity_snapshot = ?::jsonb, contract_hash = ? WHERE id = ?", [JSON.stringify(catalogIdentity), contractHash, releaseId]);
      await q(`UPDATE agent_catalog SET display_name = ?, description = ?, identity_mark = ?, identity_shape = ?,
        identity_colors = ?::jsonb, release_version = ?, contract_hash = ?, source = ?, status = ?
        WHERE agent_id = ? AND release_version = ? AND contract_hash = ?`,
        [catalogIdentity.displayName, catalogIdentity.description, catalogIdentity.mark, catalogIdentity.shape, JSON.stringify(catalogIdentity.colors), rows[0].version,
          contractHash, catalogIdentity.source, catalogIdentity.published ? "published" : "unpublished", rows[0].agent_key,
          rows[0].version, rows[0].contract_hash]);
      await q(`INSERT INTO usage_events (id, user_id, event_type, target_type, target_id, payload)
        VALUES (?, ?, 'admin.agent.release.identity', 'agent_release', ?, ?::jsonb)`,
        [randomUUID(), actorUserId, releaseId, JSON.stringify({ requestId, identity: catalogIdentity })]);
      if (requestId) {
        await q(`INSERT INTO agent_release_status_history
          (release_id, from_status, to_status, actor_user_id, reason, request_id)
         VALUES (?, ?, ?, ?, ?, ?)`,
          [releaseId, rows[0].catalog_status, rows[0].catalog_status, actorUserId, `admin_identity_update:${contractHash}`, requestId]);
      }
      return mapRelease((await q("SELECT * FROM agent_releases WHERE id = ?", [releaseId]))[0]);
    });
  }

  async function transition({ releaseId, toStatus, actorUserId = null, reason = null, requestId = null, connection = null }) {
    const run = async (conn) => {
      const q = transactionQuery(conn);
      const rows = await q("SELECT * FROM agent_releases WHERE id = ? LIMIT 1 FOR UPDATE", [releaseId]);
      if (!rows[0]) throw new HttpError(404, "Agent release not found", { code: "RELEASE_NOT_FOUND" });
      const from = rows[0].catalog_status;
      if (requestId) {
        const replay = await q(`SELECT to_status FROM agent_release_status_history
          WHERE release_id = ? AND request_id = ? ORDER BY id DESC LIMIT 1`, [releaseId, requestId]);
        if (replay[0]) {
          if (replay[0].to_status !== toStatus || from !== toStatus) {
            throw new HttpError(409, "Idempotency-Key was already used for a different release transition", { code: "IDEMPOTENCY_CONFLICT" });
          }
          return mapRelease(rows[0]);
        }
      }
      if (from === toStatus) return mapRelease(rows[0]);
      const allowed = { draft: ["review", "archived"], review: ["draft", "published", "unpublished"], published: ["unpublished", "archived"], unpublished: ["review", "published", "archived"], archived: [] };
      if (!allowed[from]?.includes(toStatus)) throw new HttpError(409, `Invalid release transition ${from} -> ${toStatus}`, { code: "INVALID_RELEASE_TRANSITION" });
      await q("UPDATE agent_releases SET catalog_status = ?, published_at = CASE WHEN ? = 'published' THEN CURRENT_TIMESTAMP ELSE NULL END WHERE id = ?", [toStatus, toStatus, releaseId]);
      await q("UPDATE agent_releases SET identity_snapshot = CASE WHEN identity_snapshot IS NULL THEN NULL ELSE jsonb_set(identity_snapshot, '{published}', to_jsonb(? = 'published'), true) END WHERE id = ?", [toStatus, releaseId]);
      await q("INSERT INTO agent_release_status_history (release_id, from_status, to_status, actor_user_id, reason, request_id) VALUES (?, ?, ?, ?, ?, ?)", [releaseId, from, toStatus, actorUserId, reason, requestId]);
      await q(`UPDATE agent_catalog SET status = ?, release_version = ?, contract_hash = ?
        WHERE agent_id = ? AND release_version = ? AND contract_hash = ?`,
        [toStatus === "published" ? "published" : "unpublished", rows[0].version, rows[0].contract_hash,
          rows[0].agent_key, rows[0].version, rows[0].contract_hash]);
      return mapRelease((await q("SELECT * FROM agent_releases WHERE id = ?", [releaseId]))[0]);
    };
    return connection ? run(connection) : transaction(run);
  }

  return { syncRegisteredAgents, listAgentReleases, getAgentRelease, updateIdentity, transition };
}

export const agentReleaseRepository = createAgentReleaseRepository();
export const syncRegisteredAgents = (...args) => agentReleaseRepository.syncRegisteredAgents(...args);
export const listAgentReleases = (...args) => agentReleaseRepository.listAgentReleases(...args);
export const getAgentRelease = (...args) => agentReleaseRepository.getAgentRelease(...args);
