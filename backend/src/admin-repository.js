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
import { listThreadsForUser } from "./message-repository.js";
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
            e.payload,
            e.user_agent,
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
            r.*,
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
      threads,
      agents,
      sessions,
      recentEvents: events.map((row) => ({
        id: row.id,
        userId: row.user_id,
        userEmail: row.user_email || "",
        eventType: row.event_type,
        targetType: row.target_type || "",
        targetId: row.target_id || "",
        payload: parseJson(row.payload, {}),
        userAgent: row.user_agent || "",
        createdAt: toIso(row.created_at),
      })),
      recentRuns: runs.map(mapAgentRun),
    };
  };
}

export const adminUserDetail = createAdminUserDetailReader({
  findRawUser: getRawUserById,
  getProfile: getProfileForUser,
  listThreads: listThreadsForUser,
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
