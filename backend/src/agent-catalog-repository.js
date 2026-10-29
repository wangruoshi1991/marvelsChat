import { query, withTransaction } from "./db.js";
import { parseJson, toIso } from "./repository-mappers.js";

function mapRow(row) {
  return {
    agentId: row.agent_id,
    displayName: row.display_name ?? null,
    description: row.description ?? null,
    identityMark: row.identity_mark ?? null,
    identityShape: row.identity_shape || null,
    identityColors: parseJson(row.identity_colors, {}),
    status: row.status || "unpublished",
    releaseVersion: row.release_version ?? null,
    contractHash: row.contract_hash ?? null,
    // Keep the existing API projection while the database uses one lifecycle
    // status column as its source of truth.
    published: row.status === "published",
    createdAt: toIso(row.created_at),
    updatedAt: toIso(row.updated_at),
  };
}

function applyCatalogueMetadata(agent, metadata) {
  if (!metadata) return { ...agent, published: false };
  const identityColors = {
    ...(agent.identity?.colors || {}),
    ...(metadata.identityColors || {}),
  };
  return {
    ...agent,
    // Empty descriptions are an intentional operator value. Only a missing
    // database field falls back to the executable registry declaration.
    name: metadata.displayName ?? agent.name,
    description: metadata.description ?? agent.description,
    published: metadata.status === "published",
    catalogStatus: metadata.status,
    releaseVersion: metadata.releaseVersion,
    contractHash: metadata.contractHash,
    identity: {
      ...(agent.identity || {}),
      ...(metadata.identityMark ? { mark: metadata.identityMark } : {}),
      ...(metadata.identityShape ? { shape: metadata.identityShape } : {}),
      ...(Object.keys(identityColors).length ? { colors: identityColors } : {}),
    },
  };
}

/**
 * The first deployed catalogue is seeded from the checked-in registry. Any
 * later code registration is inserted as unpublished until an operator reviews
 * its presentation metadata. This keeps a registry addition from silently
 * appearing in the mobile client.
 */
export async function syncAgentCatalogue(registeredAgents) {
  const keys = new Set(registeredAgents.map((agent) => agent.key));
  for (const agent of registeredAgents) {
    // A code registration never implies operator publication. Existing rows
    // retain their reviewed state; new rows are explicitly unpublished.
    await query(
      `INSERT INTO agent_catalog
       (agent_id, display_name, description, identity_mark, identity_shape, identity_colors, status)
       VALUES (?, ?, ?, ?, ?, ?::jsonb, 'unpublished')
       ON CONFLICT (agent_id) DO UPDATE SET
         display_name = COALESCE(agent_catalog.display_name, EXCLUDED.display_name),
         description = COALESCE(agent_catalog.description, EXCLUDED.description),
         identity_mark = COALESCE(agent_catalog.identity_mark, EXCLUDED.identity_mark),
         identity_shape = COALESCE(agent_catalog.identity_shape, EXCLUDED.identity_shape),
         identity_colors = CASE
           WHEN agent_catalog.identity_colors = '{}'::jsonb THEN EXCLUDED.identity_colors
           ELSE agent_catalog.identity_colors
         END
       WHERE agent_catalog.display_name IS NULL
          OR agent_catalog.description IS NULL
          OR agent_catalog.identity_mark IS NULL
          OR agent_catalog.identity_shape IS NULL
          OR agent_catalog.identity_colors = '{}'::jsonb`,
      [
        agent.key,
        agent.name,
        agent.description || "",
        agent.identity?.mark || "",
        agent.identity?.shape || null,
        JSON.stringify(agent.identity?.colors || {}),
      ],
    );
  }
  // Do not delete rows for removed code: they remain an audit trail and can be
  // shown as unavailable by the admin page if needed.
  return [...keys];
}

export async function listAgentCatalogue({ includeUnregistered = false } = {}) {
  const rows = await query(
    `SELECT agent_id, display_name, description, identity_mark, identity_shape,
            identity_colors, status, release_version, contract_hash, created_at, updated_at
       FROM agent_catalog
      ${includeUnregistered ? "" : "WHERE status = 'published'"}
      ORDER BY updated_at DESC, agent_id ASC`,
  );
  return rows.map(mapRow);
}

export async function updateAgentCatalogue(agentId, patch) {
  return withTransaction(async ({ query: runQuery }) => {
  const previous = await runQuery(
    `SELECT agent_id, display_name, description, identity_mark, identity_shape,
            identity_colors, status, release_version, contract_hash, created_at, updated_at
       FROM agent_catalog
      WHERE agent_id = ?
      LIMIT 1 FOR UPDATE`,
    [agentId],
  );
  if (!previous[0]) return null;

  const assignments = [];
  const params = [];
  // Build the SET list from fields that are present so an explicit empty
  // description can clear the operator value while omitted fields remain
  // unchanged.
  for (const [field, column] of [
    ["displayName", "display_name"],
    ["description", "description"],
    ["identityMark", "identity_mark"],
    ["identityShape", "identity_shape"],
    ["status", "status"],
  ]) {
    if (Object.hasOwn(patch, field)) {
      assignments.push(`${column} = ?`);
      params.push(patch[field]);
    }
  }
  if (Object.hasOwn(patch, "published")) {
    assignments.push("status = ?");
    params.push(patch.published ? "published" : "unpublished");
  }
  if (Object.hasOwn(patch, "identityColors")) {
    assignments.push("identity_colors = identity_colors || ?::jsonb");
    params.push(JSON.stringify(patch.identityColors || {}));
  }
  assignments.push("updated_at = CURRENT_TIMESTAMP");
  params.push(agentId);

  const rows = await runQuery(
    `UPDATE agent_catalog
        SET ${assignments.join(", ")}
      WHERE agent_id = ?
      RETURNING agent_id, display_name, description, identity_mark, identity_shape,
                identity_colors, status, release_version, contract_hash, created_at, updated_at`,
    params,
  );
  if (!rows[0]) return null;

  const oldDisplayName = previous[0].display_name;
  const nextDisplayName = rows[0].display_name;
  if (
    oldDisplayName &&
    nextDisplayName &&
    oldDisplayName !== nextDisplayName
  ) {
    // Legacy aliases are only treated as defaults while they match the old
    // catalogue name; explicit custom aliases remain untouched.
    await runQuery(
      `UPDATE user_agents
          SET alias = ?, alias_source = 'system', updated_at = CURRENT_TIMESTAMP
        WHERE agent_id = ?
          AND alias IS NOT DISTINCT FROM ?
          AND alias_source IS DISTINCT FROM 'custom'`,
      [nextDisplayName, agentId, oldDisplayName],
    );
    await runQuery(
      `UPDATE chat_threads
          SET title = ?, updated_at = CURRENT_TIMESTAMP
        WHERE agent_id = ?
          AND title = ?
          AND NOT EXISTS (
            SELECT 1 FROM user_agents
             WHERE user_agents.user_id = chat_threads.user_id
               AND user_agents.agent_id = chat_threads.agent_id
               AND user_agents.alias_source = 'custom'
          )`,
      [nextDisplayName, agentId, oldDisplayName],
    );
  }
  return mapRow(rows[0]);
  });
}

export async function listPublishedRegisteredAgents(registeredAgents) {
  const all = await listRegisteredAgentsWithCatalogue(registeredAgents);
  return all.filter((agent) => agent.status === "published");
}

/**
 * Enrich every executable registry entry with operator-controlled presentation
 * metadata. Unpublished entries stay available to owned-agent/thread rendering
 * so an operator cannot accidentally make an existing authorization disappear.
 */
export async function listRegisteredAgentsWithCatalogue(registeredAgents) {
  await syncAgentCatalogue(registeredAgents);
  const rows = await listAgentCatalogue({ includeUnregistered: true });
  const byKey = new Map(rows.map((row) => [row.agentId, row]));
  return registeredAgents.map((agent) =>
    applyCatalogueMetadata(agent, byKey.get(agent.key)),
  );
}
