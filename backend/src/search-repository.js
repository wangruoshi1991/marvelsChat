import crypto from "crypto";
import { query, withTransaction } from "./db.js";
import { HttpError } from "./http-error.js";
import { getPublicProfileByAiId } from "./station-repository.js";
import {
  mapSearchHistory,
  sqlLimit,
} from "./repository-mappers.js";

export const SEARCH_HISTORY_LIMIT = 12;

export function createSearchHistoryRepository({
  queryFn = query,
  transactionFn = withTransaction,
} = {}) {
  const prune = async (connection, userId) => {
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
  };

  const list = async (userId, limit = SEARCH_HISTORY_LIMIT) => {
    const safeLimit = sqlLimit(
      limit,
      SEARCH_HISTORY_LIMIT,
      SEARCH_HISTORY_LIMIT,
    );
    const rows = await queryFn(
      `SELECT *
      FROM search_history
      WHERE user_id = ?
      ORDER BY created_at DESC, id DESC
      LIMIT ${safeLimit}`,
      [userId],
    );
    return rows.map(mapSearchHistory);
  };

  const save = async ({ userId, queryText, scope = "all" }) => {
    const normalized = String(queryText || "").trim();
    if (!normalized) {
      throw new HttpError(400, "Search query is required");
    }
    await transactionFn(async (connection) => {
      const id = crypto.randomUUID();
      await connection.query(
        `INSERT INTO search_history (id, user_id, query_text, scope)
        VALUES (?, ?, ?, ?)
        ON CONFLICT (user_id, lower(query_text)) DO UPDATE SET
          query_text = EXCLUDED.query_text,
          scope = EXCLUDED.scope,
          created_at = CURRENT_TIMESTAMP`,
        [id, userId, normalized.slice(0, 120), scope],
      );
      await prune(connection, userId);
    });
    return list(userId);
  };

  const clear = async (userId) => {
    await queryFn("DELETE FROM search_history WHERE user_id = ?", [userId]);
    return [];
  };

  const deleteItem = async ({ userId, historyId }) => {
    await transactionFn(async (connection) => {
      await prune(connection, userId);
      await connection.query(
        "DELETE FROM search_history WHERE user_id = ? AND id = ?",
        [userId, historyId],
      );
    });
    return list(userId);
  };

  return {clear, deleteItem, list, save};
}

const searchHistoryRepository = createSearchHistoryRepository();

export const listSearchHistory = searchHistoryRepository.list;
export const saveSearchHistory = searchHistoryRepository.save;
export const clearSearchHistory = searchHistoryRepository.clear;
export const deleteSearchHistoryItem = searchHistoryRepository.deleteItem;

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
