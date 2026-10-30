import { query } from "./db.js";
import { HttpError } from "./http-error.js";
import { mapAgentRun, parseJson, publicUser, toIso } from "./repository-mappers.js";
import { mapRelease } from "./agent-release-repository.js";
import { mapProduct } from "./product-catalog-repository.js";

const configurations = {
  users: {
    from: "users u",
    select: `u.id, u.login_name, u.email, u.phone_number, u.display_name, u.ai_id, u.role, u.admin_permissions, u.status, u.created_at, u.last_login_at,
      (SELECT COUNT(*) FROM chat_threads t WHERE t.user_id = u.id) AS thread_count,
      (SELECT COUNT(*) FROM chat_messages m WHERE m.user_id = u.id) AS message_count,
      (SELECT COUNT(*) FROM auth_sessions s WHERE s.user_id = u.id AND s.revoked_at IS NULL AND s.expires_at > CURRENT_TIMESTAMP) AS active_session_count,
      (SELECT COUNT(*) FROM user_agents a WHERE a.user_id = u.id AND a.enabled = TRUE) AS agent_count`,
    search: ["u.id::text", "u.login_name", "u.email", "u.phone_number", "u.display_name", "u.ai_id"],
    filters: { status: "u.status", role: "u.role" },
    sorts: { createdAt: "u.created_at", lastLoginAt: "u.last_login_at", displayName: "u.display_name", email: "u.email", status: "u.status", role: "u.role" },
    defaultSort: "createdAt", tie: "u.id",
    map: row => ({ ...publicUser(row), threadCount: Number(row.thread_count || 0), messageCount: Number(row.message_count || 0), activeSessionCount: Number(row.active_session_count || 0), agentCount: Number(row.agent_count || 0) }),
  },
  events: {
    from: "usage_events e LEFT JOIN users u ON u.id = e.user_id",
    select: "e.id, e.user_id, u.email AS user_email, e.event_type, e.target_type, e.target_id, e.payload, e.user_agent, e.created_at",
    search: ["e.event_type", "e.user_id::text", "u.email", "e.target_type", "e.target_id", "e.payload->>'requestId'"],
    filters: {}, sorts: { createdAt: "e.created_at", eventType: "e.event_type" }, defaultSort: "createdAt", tie: "e.id",
    map: row => ({ id: row.id, userId: row.user_id, userEmail: row.user_email || "", eventType: row.event_type, targetType: row.target_type || "", targetId: row.target_id || "", payload: parseJson(row.payload, {}), userAgent: row.user_agent || "", createdAt: toIso(row.created_at) }),
  },
  runs: {
    from: "agent_runs r LEFT JOIN users u ON u.id = r.user_id", select: "r.*, u.email AS user_email",
    base: "r.agent_id <> 'media-retrieval'", search: ["r.id::text", "r.agent_id", "r.user_id::text", "u.email"],
    filters: { status: "r.status", agentId: "r.agent_id", userId: "r.user_id" },
    sorts: { createdAt: "r.created_at", agentId: "r.agent_id", status: "r.status" }, defaultSort: "createdAt", tie: "r.id", map: mapAgentRun,
  },
  releases: {
    from: "agent_releases r", select: "r.*", base: "r.catalog_status <> 'archived'",
    search: ["r.agent_key", "r.version", "r.identity_snapshot->>'displayName'"], filters: { status: "r.catalog_status" },
    sorts: { updatedAt: "r.updated_at", createdAt: "r.created_at", agentKey: "r.agent_key", version: "r.version", status: "r.catalog_status" }, defaultSort: "updatedAt", tie: "r.id", map: mapRelease,
  },
  products: {
    from: `products p LEFT JOIN LATERAL (SELECT * FROM product_versions v WHERE v.product_id = p.id ORDER BY v.created_at DESC, v.id DESC LIMIT 1) pv ON TRUE`,
    select: "p.*, pv.id AS product_version_id, pv.version, pv.supported_platforms, pv.status AS version_status, pv.contract_hash",
    search: ["p.product_key", "p.display_name", "pv.version"], filters: { status: "COALESCE(pv.status, p.status)" },
    sorts: { updatedAt: "p.updated_at", createdAt: "p.created_at", productKey: "p.product_key", displayName: "p.display_name", version: "pv.version", status: "COALESCE(pv.status, p.status)" }, defaultSort: "updatedAt", tie: "p.id",
  },
};

export function createAdminListRepository(runQuery = query) {
  return async function listAdminPage(kind, options) {
    const config = configurations[kind];
    if (!config) throw new HttpError(400, "Unknown admin list");
    const { page, pageSize, sortBy = config.defaultSort, sortOrder = "desc" } = options;
    const predicates = config.base ? [config.base] : [];
    const params = [];
    if (options.query) {
      // Literal substring search: wildcard characters in user input have no special meaning.
      const pattern = `%${options.query.replace(/[\\%_]/g, "\\$&")}%`;
      predicates.push(`(${config.search.map(column => `${column} ILIKE ? ESCAPE '\\'`).join(" OR ")})`);
      params.push(...config.search.map(() => pattern));
    }
    for (const [key, column] of Object.entries(config.filters)) if (options[key]) {
      predicates.push(`${column} = ?`); params.push(options[key]);
    }
    const where = predicates.length ? `WHERE ${predicates.join(" AND ")}` : "";
    const order = config.sorts[sortBy];
    if (!order || !["asc", "desc"].includes(sortOrder)) throw new HttpError(400, "Invalid admin sort", { code: "ADMIN_SORT_INVALID" });
    const [counts, rows] = await Promise.all([
      runQuery(`SELECT COUNT(*) AS total FROM ${config.from} ${where}`, params),
      runQuery(`SELECT ${config.select} FROM ${config.from} ${where} ORDER BY ${order} ${sortOrder.toUpperCase()} NULLS LAST, ${config.tie} ${sortOrder.toUpperCase()} LIMIT ? OFFSET ?`, [...params, pageSize, (page - 1) * pageSize]),
    ]);
    const items = kind === "products" ? await Promise.all(rows.map(async row => {
      const deps = row.product_version_id ? await runQuery(`SELECT d.*, r.identity_snapshot, r.readiness, r.declared_scopes AS declared_scopes,
        r.contract_hash AS release_contract_hash, r.catalog_status AS release_status, ar.version AS registry_version,
        ar.declared_scopes AS registry_declared_scopes, ar.contract_hash AS registry_contract_hash, ar.registration_status AS registry_status
        FROM product_agent_dependencies d LEFT JOIN agent_releases r ON r.id = d.agent_release_id
        LEFT JOIN agent_registry ar ON ar.agent_key = d.agent_key WHERE d.product_version_id = ? ORDER BY d.agent_key`, [row.product_version_id]) : [];
      return mapProduct({ ...row, status: row.version_status || row.status }, deps);
    })) : rows.map(config.map);
    return { items, total: Number(counts[0]?.total || 0), page, pageSize };
  };
}
export const listAdminPage = createAdminListRepository();
