import crypto from "crypto";
import { query, withTransaction } from "./db.js";
import { HttpError } from "./http-error.js";
import { getPublicProfileByAiId } from "./station-repository.js";
import {
  mapSearchHistory,
  sqlLimit,
} from "./repository-mappers.js";

const SEARCH_HISTORY_LIMIT = 12;

async function pruneSearchHistory(connection, userId) {
  await connection.query(
    `DELETE FROM search_history
    WHERE id IN (
      SELECT id
      FROM search_history
      WHERE user_id = ?
      ORDER BY created_at DESC, id DESC
      OFFSET ${SEARCH_HISTORY_LIMIT}
    )`,
    [userId],
  );
}

export async function listSearchHistory(userId, limit = SEARCH_HISTORY_LIMIT) {
  const safeLimit = sqlLimit(
    limit,
    SEARCH_HISTORY_LIMIT,
    SEARCH_HISTORY_LIMIT,
  );
  const rows = await query(
    `SELECT *
    FROM search_history
    WHERE user_id = ?
    ORDER BY created_at DESC, id DESC
    LIMIT ${safeLimit}`,
    [userId],
  );
  return rows.map(mapSearchHistory);
}

export async function saveSearchHistory({ userId, queryText, scope = "all" }) {
  const normalized = String(queryText || "").trim();
  if (!normalized) {
    throw new HttpError(400, "Search query is required");
  }
  await withTransaction(async (connection) => {
    await connection.query(
      `DELETE FROM search_history
      WHERE user_id = ? AND lower(query_text) = lower(?) AND scope = ?`,
      [userId, normalized, scope],
    );
    const id = crypto.randomUUID();
    await connection.query(
      `INSERT INTO search_history (id, user_id, query_text, scope)
      VALUES (?, ?, ?, ?)`,
      [id, userId, normalized.slice(0, 120), scope],
    );
    await pruneSearchHistory(connection, userId);
  });
  return listSearchHistory(userId);
}

export async function clearSearchHistory(userId) {
  await query("DELETE FROM search_history WHERE user_id = ?", [userId]);
  return [];
}

export async function deleteSearchHistoryItem({ userId, historyId }) {
  await withTransaction(async (connection) => {
    await pruneSearchHistory(connection, userId);
    await connection.query(
      "DELETE FROM search_history WHERE user_id = ? AND id = ?",
      [userId, historyId],
    );
  });
  return listSearchHistory(userId);
}

export async function searchPublicProfiles({ viewerUserId, queryText, limit = 20, onlineUserIds = [] }) {
  const normalized = String(queryText || "").trim();
  if (!normalized) return [];
  const safeLimit = sqlLimit(limit, 20, 50);
  const pattern = `%${normalized.toLowerCase()}%`;
  const rows = await query(
    `SELECT
      u.ai_id
    FROM users u
    JOIN user_profiles p ON p.user_id = u.id
    WHERE u.status = 'active'
      AND u.id <> ?
      AND (
        lower(u.display_name) LIKE ?
        OR lower(p.nickname) LIKE ?
        OR u.ai_id LIKE ?
      )
    ORDER BY
      CASE WHEN u.ai_id = ? THEN 0 ELSE 1 END,
      u.created_at DESC
    LIMIT ${safeLimit}`,
    [viewerUserId, pattern, pattern, pattern, normalized],
  );
  const profiles = await Promise.all(
    rows.map((row) => getPublicProfileByAiId({ viewerUserId, aiId: row.ai_id, onlineUserIds })),
  );
  return profiles.filter(Boolean);
}
