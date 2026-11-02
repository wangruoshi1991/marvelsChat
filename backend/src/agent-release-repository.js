import crypto from "node:crypto";
import { query, withTransaction } from "./db.js";
import { computeAgentReleaseContractHash, isCompleteAgentIdentity } from "../../shared/agent-catalog.js";
import { parseJson, toIso } from "./repository-mappers.js";
import { HttpError } from "./http-error.js";
import { assertManagedAgentAvatar } from "./agent-avatar-assets.js";

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
          // runtime version and declared scopes are unchanged. New operator
          // drafts are created only through the explicit intake endpoint.
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
          releases.push({ ...agent, identity, contractHash, declaredScopes, readiness, releaseId: null });
          continue;
        }
        if (preserveOperatorIdentity) {
          await q(`UPDATE agent_releases SET declared_scopes = ?::jsonb, readiness = ?::jsonb WHERE id = ?`,
            [JSON.stringify(declaredScopes), JSON.stringify(readiness), releaseId]);
        } else {
          await q(`UPDATE agent_releases SET declared_scopes = ?::jsonb, readiness = ?::jsonb,
              identity_snapshot = COALESCE(identity_snapshot, ?::jsonb) WHERE id = ?`,
            [JSON.stringify(declaredScopes), JSON.stringify(readiness), JSON.stringify(identity), releaseId]);
        }
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

  async function createDraft({ agent, identity, sourceReleaseId = null, actorUserId = null, requestId = null }) {
    if (!isCompleteAgentIdentity(identity) || identity.key !== agent.key) throw new HttpError(422, "Identity does not match deployed Agent", { code: "IDENTITY_KEY_MISMATCH" });
    const operatorIdentity = { ...identity, published: false, source: "admin", updatedAt: new Date().toISOString() };
    const declaredScopes = [...new Set(agent.permissions || [])];
    const contractHash = computeAgentReleaseContractHash({ key: agent.key, version: agent.version, permissions: declaredScopes, identity: operatorIdentity });
    return transaction(async (connection) => {
      const q = transactionQuery(connection);
      if (requestId) await q("SELECT pg_advisory_xact_lock(hashtext(?))", [`agent-intake:${actorUserId}:${requestId}`]);
      await q("SELECT pg_advisory_xact_lock(hashtext(?))", [`agent-release:${agent.key}`]);
      await assertManagedAgentAvatar(operatorIdentity, { connection });
      if (sourceReleaseId) {
        const source = await getAgentRelease(sourceReleaseId, { connection, lock: true });
        if (!source || source.agentKey !== agent.key || source.version !== agent.version) throw new HttpError(409, "Revision source must match the deployed Agent runtime", { code: "REVISION_SOURCE_MISMATCH" });
      }
      const reason = `admin_create:${contractHash}:${sourceReleaseId || "initial"}`;
      if (requestId) {
        const replay = await q(`SELECT h.reason, r.* FROM agent_release_status_history h
          JOIN agent_releases r ON r.id = h.release_id WHERE h.request_id = ? AND h.actor_user_id IS NOT DISTINCT FROM ?
          ORDER BY h.id DESC LIMIT 1`, [requestId, actorUserId]);
        if (replay[0]) {
          if (replay[0].reason !== reason || replay[0].agent_key !== agent.key) throw new HttpError(409, "Idempotency-Key was already used for another release", { code: "IDEMPOTENCY_CONFLICT" });
          return { release: mapRelease(replay[0]), created: false };
        }
      }
      const existing = await q("SELECT * FROM agent_releases WHERE agent_key = ? AND version = ? AND contract_hash = ? FOR UPDATE", [agent.key, agent.version, contractHash]);
      if (existing[0]) {
        if (existing[0].catalog_status !== "draft") throw new HttpError(409, "This identity contract already has a release; change the identity to create a revision", { code: "RELEASE_CONTRACT_EXISTS", releaseId: String(existing[0].id).trim() });
        if (requestId) await q("INSERT INTO agent_release_status_history (release_id, from_status, to_status, actor_user_id, reason, request_id) VALUES (?, 'draft', 'draft', ?, ?, ?)", [existing[0].id, actorUserId, reason, requestId]);
        return { release: mapRelease(existing[0]), created: false };
      }
      const registryIdentity = { key: agent.key, ...agent.identity, displayName: agent.name, description: agent.description || "", published: false, source: "registry", updatedAt: new Date().toISOString() };
      const registryHash = computeAgentReleaseContractHash({ key: agent.key, version: agent.version, permissions: declaredScopes, identity: registryIdentity });
      await q(`INSERT INTO agent_registry (agent_key, version, contract_hash, declared_scopes, readiness, registration_status, source)
        VALUES (?, ?, ?, ?::jsonb, ?::jsonb, 'registered', 'registry')
        ON CONFLICT (agent_key) DO UPDATE SET version = EXCLUDED.version, contract_hash = EXCLUDED.contract_hash,
          declared_scopes = EXCLUDED.declared_scopes, readiness = EXCLUDED.readiness, registration_status = 'registered', removed_at = NULL`,
        [agent.key, agent.version, registryHash, JSON.stringify(declaredScopes), JSON.stringify(agent.readiness)]);
      const releaseId = randomUUID();
      await q(`INSERT INTO agent_releases (id, agent_key, version, contract_hash, declared_scopes, readiness, identity_snapshot, catalog_status)
        VALUES (?, ?, ?, ?, ?::jsonb, ?::jsonb, ?::jsonb, 'draft')`, [releaseId, agent.key, agent.version, contractHash, JSON.stringify(declaredScopes), JSON.stringify(agent.readiness), JSON.stringify(operatorIdentity)]);
      await q("INSERT INTO agent_release_status_history (release_id, from_status, to_status, actor_user_id, reason, request_id) VALUES (?, NULL, 'draft', ?, ?, ?)", [releaseId, actorUserId, reason, requestId]);
      await q(`INSERT INTO usage_events (id, user_id, event_type, target_type, target_id, payload) VALUES (?, ?, 'admin.agent.release.create', 'agent_release', ?, ?::jsonb)`, [randomUUID(), actorUserId, releaseId, JSON.stringify({ sourceReleaseId, requestId, contractHash })]);
      return { release: await getAgentRelease(releaseId, { connection }), created: true };
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
      await q("SELECT pg_advisory_xact_lock(hashtext('agent-release:' || agent_key)) FROM agent_releases WHERE id = ?", [releaseId]);
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
      if (rows[0].catalog_status !== "draft") throw new HttpError(409, "Only never-published drafts can be edited; create a revision for a published release", { code: "RELEASE_NOT_EDITABLE" });
      const duplicate = await q("SELECT id FROM agent_releases WHERE agent_key = ? AND version = ? AND contract_hash = ? AND id <> ?", [rows[0].agent_key, rows[0].version, contractHash, releaseId]);
      if (duplicate.length) throw new HttpError(409, "This identity already belongs to another release", { code: "RELEASE_CONTRACT_EXISTS", releaseId: String(duplicate[0].id).trim() });
      await assertManagedAgentAvatar(operatorIdentity, { connection });
      await q("UPDATE agent_releases SET identity_snapshot = ?::jsonb, contract_hash = ? WHERE id = ?", [JSON.stringify(operatorIdentity), contractHash, releaseId]);
      await q(`INSERT INTO usage_events (id, user_id, event_type, target_type, target_id, payload)
        VALUES (?, ?, 'admin.agent.release.identity', 'agent_release', ?, ?::jsonb)`,
        [randomUUID(), actorUserId, releaseId, JSON.stringify({ requestId, identity: operatorIdentity })]);
      if (requestId) {
        await q(`INSERT INTO agent_release_status_history
          (release_id, from_status, to_status, actor_user_id, reason, request_id)
         VALUES (?, ?, ?, ?, ?, ?)`,
          [releaseId, rows[0].catalog_status, rows[0].catalog_status, actorUserId, `admin_identity_update:${contractHash}`, requestId]);
      }
      return mapRelease((await q("SELECT * FROM agent_releases WHERE id = ?", [releaseId]))[0]);
    });
  }

  async function transition({ releaseId, toStatus, actorUserId = null, reason = null, requestId = null, readiness = null, expectedContractHash = null, connection = null }) {
    const run = async (conn) => {
      const q = transactionQuery(conn);
      const rows = await q("SELECT * FROM agent_releases WHERE id = ? LIMIT 1 FOR UPDATE", [releaseId]);
      if (!rows[0]) throw new HttpError(404, "Agent release not found", { code: "RELEASE_NOT_FOUND" });
      if (expectedContractHash && rows[0].contract_hash !== expectedContractHash) throw new HttpError(409, "Agent release identity changed; reload before review or publication", { code: "RELEASE_CONTRACT_CHANGED" });
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
      if (toStatus === "draft") {
        const publishedHistory = await q("SELECT id FROM agent_release_status_history WHERE release_id = ? AND to_status = 'published' LIMIT 1", [releaseId]);
        if (publishedHistory.length) throw new HttpError(409, "Previously published releases require a new revision", { code: "RELEASE_NOT_EDITABLE" });
      }
      const allowed = { draft: ["review", "archived"], review: ["draft", "published", "unpublished"], published: ["unpublished", "archived"], unpublished: ["review", "published", "archived"], archived: [] };
      if (!allowed[from]?.includes(toStatus)) throw new HttpError(409, `Invalid release transition ${from} -> ${toStatus}`, { code: "INVALID_RELEASE_TRANSITION" });
      if (readiness) await q("UPDATE agent_releases SET readiness = ?::jsonb WHERE id = ?", [JSON.stringify(readiness), releaseId]);
      await q("UPDATE agent_releases SET catalog_status = ?, published_at = CASE WHEN ? = 'published' THEN CURRENT_TIMESTAMP ELSE NULL END WHERE id = ?", [toStatus, toStatus, releaseId]);
      await q("UPDATE agent_releases SET identity_snapshot = CASE WHEN identity_snapshot IS NULL THEN NULL ELSE jsonb_set(identity_snapshot, '{published}', to_jsonb(? = 'published'), true) END WHERE id = ?", [toStatus, releaseId]);
      await q("INSERT INTO agent_release_status_history (release_id, from_status, to_status, actor_user_id, reason, request_id) VALUES (?, ?, ?, ?, ?, ?)", [releaseId, from, toStatus, actorUserId, reason, requestId]);
      const identity = parseJson(rows[0].identity_snapshot, null);
      if (toStatus === "published" && identity) {
        await assertManagedAgentAvatar(identity, { connection: conn });
        await q(`INSERT INTO agent_catalog
          (agent_id, display_name, description, identity_mark, identity_shape, identity_colors, identity_avatar, release_version, contract_hash, source, status)
          VALUES (?, ?, ?, ?, ?, ?::jsonb, ?::jsonb, ?, ?, ?, 'published')
          ON CONFLICT (agent_id) DO UPDATE SET display_name = EXCLUDED.display_name, description = EXCLUDED.description,
            identity_mark = EXCLUDED.identity_mark, identity_shape = EXCLUDED.identity_shape, identity_colors = EXCLUDED.identity_colors,
            identity_avatar = EXCLUDED.identity_avatar, release_version = EXCLUDED.release_version, contract_hash = EXCLUDED.contract_hash,
            source = EXCLUDED.source, status = EXCLUDED.status`,
          [rows[0].agent_key, identity.displayName, identity.description, identity.mark, identity.shape, JSON.stringify(identity.colors), identity.avatar ? JSON.stringify(identity.avatar) : null, rows[0].version, rows[0].contract_hash, identity.source]);
      } else {
        await q(`UPDATE agent_catalog SET status = ? WHERE agent_id = ? AND release_version = ? AND contract_hash = ?`,
          ["unpublished", rows[0].agent_key, rows[0].version, rows[0].contract_hash]);
      }
      return mapRelease((await q("SELECT * FROM agent_releases WHERE id = ?", [releaseId]))[0]);
    };
    return connection ? run(connection) : transaction(run);
  }

  return { syncRegisteredAgents, createDraft, listAgentReleases, getAgentRelease, updateIdentity, transition };
}

export const agentReleaseRepository = createAgentReleaseRepository();
export const syncRegisteredAgents = (...args) => agentReleaseRepository.syncRegisteredAgents(...args);
export const listAgentReleases = (...args) => agentReleaseRepository.listAgentReleases(...args);
export const getAgentRelease = (...args) => agentReleaseRepository.getAgentRelease(...args);
