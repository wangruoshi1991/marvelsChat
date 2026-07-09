import crypto from "crypto";
import { query } from "./db.js";
import { HttpError } from "./http-error.js";
import { getPublicProfileByAiId } from "./station-repository.js";
import {
  mapSearchHistory,
  sqlLimit,
} from "./repository-mappers.js";

export async function listSearchHistory(userId, limit = 12) {
  const safeLimit = sqlLimit(limit, 12, 30);
  const rows = await query(
    `SELECT *
    FROM search_history
    WHERE user_id = ?
    ORDER BY created_at DESC
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
  await query(
    `DELETE FROM search_history
    WHERE user_id = ? AND lower(query_text) = lower(?) AND scope = ?`,
    [userId, normalized, scope],
  );
  const id = crypto.randomUUID();
  await query(
    `INSERT INTO search_history (id, user_id, query_text, scope)
    VALUES (?, ?, ?, ?)`,
    [id, userId, normalized.slice(0, 120), scope],
  );
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
