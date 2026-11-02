import { query, withTransaction } from "./db.js";
import { HttpError } from "./http-error.js";
import { normalizeLocationText } from "./location-labels.js";
import {
  adminSessionSummary,
  findUserByDisplayName,
  getRawUserById,
  getUserById,
  listAgentAccessForUser,
  revokeSessionsForUser,
} from "./repositories.js";
import { getProfileForUser } from "./station-repository.js";
import {
  mapAgentRun,
  parseJson,
  publicUser,
  sqlLimit,
  toIso,
} from "./repository-mappers.js";

export async function adminOverview() {
  const [userRows, activeRows, threadRows, messageRows, eventRows, runRows, recentUsers, postRows, interactionRows, mediaRows, comicRows] =
    await Promise.all([
      query("SELECT COUNT(*) AS total FROM users"),
      query(
        "SELECT COUNT(*) AS total FROM users WHERE last_login_at >= CURRENT_TIMESTAMP - INTERVAL '1 day'",
      ),
      query("SELECT COUNT(*) AS total FROM chat_threads"),
      query(
        "SELECT COUNT(*) AS total FROM chat_messages WHERE created_at >= CURRENT_DATE",
      ),
      query("SELECT COUNT(*) AS total FROM usage_events WHERE created_at >= CURRENT_DATE"),
      query("SELECT COUNT(*) AS total FROM agent_runs WHERE created_at >= CURRENT_DATE"),
      query(
        `SELECT id, login_name, email, phone_number, display_name, ai_id, role, admin_permissions, status, created_at, last_login_at
        FROM users
        ORDER BY created_at DESC
        LIMIT 6`,
      ),
      query("SELECT COUNT(*) AS total FROM station_posts WHERE deleted_at IS NULL"),
      query("SELECT COUNT(*) AS total, COUNT(*) FILTER (WHERE interaction_type = 'like') AS likes, COUNT(*) FILTER (WHERE interaction_type = 'favorite') AS favorites FROM station_post_interactions"),
      query("SELECT COUNT(*) AS total FROM station_media_assets WHERE deleted_at IS NULL"),
      query("SELECT COUNT(*) AS total FROM station_comic_diaries WHERE deleted_at IS NULL"),
    ]);

  return {
    usersTotal: Number(userRows[0]?.total || 0),
    activeUsers24h: Number(activeRows[0]?.total || 0),
    threadsTotal: Number(threadRows[0]?.total || 0),
    messagesToday: Number(messageRows[0]?.total || 0),
    eventsToday: Number(eventRows[0]?.total || 0),
    agentRunsToday: Number(runRows[0]?.total || 0),
    postsTotal: Number(postRows[0]?.total || 0),
    interactionsTotal: Number(interactionRows[0]?.total || 0),
    likesTotal: Number(interactionRows[0]?.likes || 0),
    favoritesTotal: Number(interactionRows[0]?.favorites || 0),
    mediaAssetsTotal: Number(mediaRows[0]?.total || 0),
    comicDiariesTotal: Number(comicRows[0]?.total || 0),
    recentUsers: recentUsers.map(publicUser),
  };
}

export async function adminUsers({ limit = 50 } = {}) {
  const safeLimit = sqlLimit(limit, 50);
  const rows = await query(
    `SELECT
      u.id,
      u.login_name,
      u.email,
      u.phone_number,
      u.display_name,
      u.ai_id,
      u.role,
      u.admin_permissions,
      u.status,
      u.created_at,
      u.last_login_at,
      (SELECT COUNT(*) FROM chat_threads t WHERE t.user_id = u.id) AS thread_count,
      (SELECT COUNT(*) FROM chat_messages m WHERE m.user_id = u.id) AS message_count,
      (SELECT COUNT(*) FROM auth_sessions s WHERE s.user_id = u.id AND s.revoked_at IS NULL AND s.expires_at > CURRENT_TIMESTAMP) AS active_session_count,
      (SELECT COUNT(*) FROM user_agents a WHERE a.user_id = u.id AND a.enabled = TRUE) AS agent_count
    FROM users u
    ORDER BY u.created_at DESC
    LIMIT ${safeLimit}`,
  );

  return rows.map((row) => ({
    ...publicUser(row),
    threadCount: Number(row.thread_count || 0),
    messageCount: Number(row.message_count || 0),
    activeSessionCount: Number(row.active_session_count || 0),
    agentCount: Number(row.agent_count || 0),
  }));
}

export function createAdminUserDetailReader({
  findRawUser,
  getProfile,
  listThreads,
  listAgentAccess,
  getSessionSummary,
  runQuery,
}) {
  return async ({ userId, registeredAgents, includeAgents, includeAudit }) => {
    if (!Array.isArray(registeredAgents)
      || typeof includeAgents !== "boolean"
      || typeof includeAudit !== "boolean") {
      throw new TypeError("Admin user detail requires explicit Agent and audit access flags");
    }
    const rawUser = await findRawUser(userId);
    if (!rawUser) return null;

    const [profile, threads, agents, sessions, events, runs] = await Promise.all([
      getProfile(userId),
      listThreads(userId),
      includeAgents ? listAgentAccess(userId, registeredAgents) : Promise.resolve([]),
      getSessionSummary(userId),
      includeAudit
        ? runQuery(
          `SELECT
            e.id,
            e.user_id,
            u.email AS user_email,
            e.event_type,
            e.target_type,
            e.target_id,
            e.created_at
          FROM usage_events e
          LEFT JOIN users u ON u.id = e.user_id
          WHERE e.user_id = ?
          ORDER BY e.created_at DESC
          LIMIT 12`,
          [userId],
        )
        : Promise.resolve([]),
      includeAudit
        ? runQuery(
          `SELECT
            r.id, r.agent_id, r.status, r.user_id, r.thread_id,
            r.latency_ms, r.token_prompt, r.token_completion, r.token_total,
            r.cost_cents, r.provider, r.run_type, r.lifecycle_status,
            r.trace_id, r.attempt, r.failure_code, r.created_at, r.finished_at,
            u.email AS user_email
          FROM agent_runs r
          LEFT JOIN users u ON u.id = r.user_id
          WHERE r.user_id = ?
          ORDER BY r.created_at DESC
          LIMIT 12`,
          [userId],
        )
        : Promise.resolve([]),
    ]);

    return {
      user: publicUser(rawUser),
      profile,
      // Conversation names, status text and lastContent can all be user
      // authored. Account operators receive only routing/state metadata.
      threads: threads.map((thread) => ({
        id: thread.id,
        agentId: thread.agentId || null,
        kind: thread.kind || null,
        pinned: thread.pinned === true,
        muted: thread.muted === true,
        unreadCount: Number(thread.unreadCount || 0),
        createdAt: toIso(thread.createdAt),
        updatedAt: toIso(thread.updatedAt),
        lastMessageAt: toIso(thread.lastMessageAt),
      })),
      agents,
      sessions,
      recentEvents: events.map((row) => ({
        id: row.id,
        userId: row.user_id,
        userEmail: row.user_email || "",
        eventType: row.event_type,
        targetType: row.target_type || "",
        targetId: row.target_id || "",
        createdAt: toIso(row.created_at),
      })),
      recentRuns: runs.map((row) => ({
        id: row.id,
        agentId: row.agent_id,
        status: row.status,
        lifecycleStatus: row.lifecycle_status || null,
        threadId: row.thread_id || null,
        latencyMs: row.latency_ms ?? null,
        tokenPrompt: row.token_prompt ?? null,
        tokenCompletion: row.token_completion ?? null,
        tokenTotal: row.token_total ?? null,
        costCents: row.cost_cents ?? null,
        provider: row.provider || null,
        runType: row.run_type || null,
        traceId: row.trace_id || null,
        attempt: Number(row.attempt || 1),
        failureCode: /^[A-Z][A-Z0-9_]{0,99}$/.test(row.failure_code || "") ? row.failure_code : null,
        createdAt: toIso(row.created_at),
        finishedAt: toIso(row.finished_at),
      })),
    };
  };
}

export const adminUserDetail = createAdminUserDetailReader({
  findRawUser: getRawUserById,
  getProfile: getProfileForUser,
  listThreads: async (userId) => {
    const rows = await query(`SELECT id, agent_id, kind, pinned, muted, unread_count, created_at, updated_at
      FROM chat_threads WHERE user_id = ? ORDER BY updated_at DESC, id DESC LIMIT 100`, [userId]);
    return rows.map((row) => ({ id: row.id, agentId: row.agent_id, kind: row.kind, pinned: row.pinned,
      muted: row.muted, unreadCount: row.unread_count, createdAt: row.created_at, updatedAt: row.updated_at }));
  },
  listAgentAccess: listAgentAccessForUser,
  getSessionSummary: adminSessionSummary,
  runQuery: query,
});

export function createAdminUserProfileUpdater({
  findByDisplayName = findUserByDisplayName,
  transaction = withTransaction,
  getProfile = getProfileForUser,
} = {}) {
  return async function updateUserProfileAdmin({
    userId,
    nickname,
    bio = "",
    community = "",
    activityArea = "",
    headline,
    publicLocation,
    experienceYears,
    languages,
  }) {
    const resolvedNickname = String(nickname || "").trim();
    const existing = await findByDisplayName(resolvedNickname);
    if (existing && existing.id !== userId) {
      throw new HttpError(409, "Display name already registered");
    }
    await transaction(async (connection) => {
      await connection.execute("UPDATE users SET display_name = ? WHERE id = ?", [resolvedNickname, userId]);
      await connection.execute(
        `UPDATE user_profiles
        SET nickname = ?, bio = ?, community = ?, activity_area = ?,
          headline = COALESCE(?::text, headline),
          public_location = COALESCE(?::text, public_location),
          experience_years = CASE WHEN ?::boolean THEN ?::smallint ELSE experience_years END,
          languages = COALESCE(?::text[], languages)
        WHERE user_id = ?`,
        [
          resolvedNickname,
          bio,
          normalizeLocationText(community),
          normalizeLocationText(activityArea),
          headline ?? null,
          publicLocation ?? null,
          experienceYears !== undefined,
          experienceYears ?? null,
          languages ?? null,
          userId,
        ],
      );
    });

    return getProfile(userId);
  };
}

export const updateUserProfileAdmin = createAdminUserProfileUpdater();

export async function updateUserStatus(userId, status) {
  await query("UPDATE users SET status = ? WHERE id = ?", [status, userId]);
  if (status !== "active") await revokeSessionsForUser(userId);
  return getUserById(userId);
}

export async function updateUserRole(userId, role) {
  const permissions = role === "admin" ? JSON.stringify(["users:read"]) : JSON.stringify([]);
  await query("UPDATE users SET role = ?, admin_permissions = ?::jsonb WHERE id = ?", [
    role,
    permissions,
    userId,
  ]);
  return getUserById(userId);
}

export async function updateUserAdminPermissions(userId, permissions = []) {
  await query("UPDATE users SET admin_permissions = ?::jsonb WHERE id = ?", [
    JSON.stringify(permissions),
    userId,
  ]);
  return getUserById(userId);
}

export async function updateUserPassword(userId, passwordHash) {
  await query("UPDATE users SET password_hash = ? WHERE id = ?", [passwordHash, userId]);
  await revokeSessionsForUser(userId);
  return getUserById(userId);
}

export async function adminEvents({ limit = 80 } = {}) {
  const safeLimit = sqlLimit(limit);
  const rows = await query(
    `SELECT
      e.id,
      e.user_id,
      u.email AS user_email,
      e.event_type,
      e.target_type,
      e.target_id,
      e.payload,
      e.user_agent,
      e.created_at
    FROM usage_events e
    LEFT JOIN users u ON u.id = e.user_id
    ORDER BY e.created_at DESC
    LIMIT ${safeLimit}`,
  );

  return rows.map((row) => ({
    id: row.id,
    userId: row.user_id,
    userEmail: row.user_email || "",
    eventType: row.event_type,
    targetType: row.target_type || "",
    targetId: row.target_id || "",
    payload: parseJson(row.payload, {}),
    userAgent: row.user_agent || "",
    createdAt: toIso(row.created_at),
  }));
}

export async function adminAgentRuns({ limit = 80 } = {}) {
  const safeLimit = sqlLimit(limit);
  const rows = await query(
    `SELECT
      r.*,
      u.email AS user_email
    FROM agent_runs r
    LEFT JOIN users u ON u.id = r.user_id
    WHERE r.agent_id <> 'media-retrieval'
    ORDER BY r.created_at DESC
    LIMIT ${safeLimit}`,
  );

  return rows.map(mapAgentRun);
}

/** Full-window Agent usage aggregates for the operator dashboard. The older
 * `/api/admin/agents` cards intentionally use a small recent-run list; this
 * endpoint is the source of truth for monitoring and never infers totals from
 * a truncated page. */
export async function adminAgentUsage({ days = 30 } = {}) {
  const safeDays = Math.max(1, Math.min(365, Number(days) || 30));
  const [summaryRows, agentRows, dailyRows] = await Promise.all([
    query(
      `SELECT COUNT(*) AS runs,
              COUNT(*) FILTER (WHERE lifecycle_status = 'succeeded' OR (lifecycle_status IS NULL AND status = 'success')) AS succeeded,
              COUNT(*) FILTER (WHERE lifecycle_status IN ('failed','cancelled','blocked') OR (lifecycle_status IS NULL AND status = 'error')) AS failed,
              SUM(token_total) AS token_total,
              SUM(cost_cents) AS cost_cents,
              AVG(latency_ms) FILTER (WHERE latency_ms IS NOT NULL) AS avg_latency_ms
         FROM agent_runs
        WHERE created_at >= CURRENT_TIMESTAMP - (? * INTERVAL '1 day')`,
      [safeDays],
    ),
    query(
      `SELECT agent_id,
              COUNT(*) AS runs,
              COUNT(*) FILTER (WHERE lifecycle_status = 'succeeded' OR (lifecycle_status IS NULL AND status = 'success')) AS succeeded,
              COUNT(*) FILTER (WHERE lifecycle_status IN ('failed','cancelled','blocked') OR (lifecycle_status IS NULL AND status = 'error')) AS failed,
              SUM(token_total) AS token_total,
              SUM(cost_cents) AS cost_cents,
              AVG(latency_ms) FILTER (WHERE latency_ms IS NOT NULL) AS avg_latency_ms
         FROM agent_runs
        WHERE created_at >= CURRENT_TIMESTAMP - (? * INTERVAL '1 day')
        GROUP BY agent_id
        ORDER BY runs DESC, agent_id ASC`,
      [safeDays],
    ),
    query(
      `SELECT created_at::date AS day,
              COUNT(*) AS runs,
              COUNT(*) FILTER (WHERE lifecycle_status = 'succeeded' OR (lifecycle_status IS NULL AND status = 'success')) AS succeeded,
              COUNT(*) FILTER (WHERE lifecycle_status IN ('failed','cancelled','blocked') OR (lifecycle_status IS NULL AND status = 'error')) AS failed
         FROM agent_runs
        WHERE created_at >= CURRENT_TIMESTAMP - (? * INTERVAL '1 day')
        GROUP BY created_at::date
        ORDER BY day ASC`,
      [safeDays],
    ),
  ]);
  const number = (value) => Number(value || 0);
  const nullableNumber = (value) => value === null || value === undefined ? null : Number(value);
  const mapUsage = (row) => ({
    agentId: row.agent_id,
    runs: number(row.runs),
    succeeded: number(row.succeeded),
    failed: number(row.failed),
    tokenTotal: nullableNumber(row.token_total),
    costCents: nullableNumber(row.cost_cents),
    avgLatencyMs: nullableNumber(row.avg_latency_ms) === null ? null : Math.round(number(row.avg_latency_ms)),
  });
  return {
    days: safeDays,
    summary: {
      runs: number(summaryRows[0]?.runs),
      succeeded: number(summaryRows[0]?.succeeded),
      failed: number(summaryRows[0]?.failed),
      tokenTotal: nullableNumber(summaryRows[0]?.token_total),
      costCents: nullableNumber(summaryRows[0]?.cost_cents),
      avgLatencyMs: nullableNumber(summaryRows[0]?.avg_latency_ms) === null
        ? null
        : Math.round(number(summaryRows[0]?.avg_latency_ms)),
    },
    agents: agentRows.map(mapUsage),
    daily: dailyRows.map((row) => ({
      day: row.day instanceof Date ? row.day.toISOString().slice(0, 10) : String(row.day),
      runs: number(row.runs),
      succeeded: number(row.succeeded),
      failed: number(row.failed),
    })),
  };
}
