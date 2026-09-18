import crypto from "crypto";
import { query, withTransaction } from "./db.js";
import { HttpError } from "./http-error.js";

const TYPES = new Set(["like", "favorite"]);

export function createStationPostInteractionSetter({ transaction, createId }) {
  if (typeof transaction !== "function" || typeof createId !== "function") {
    throw new TypeError("Station post interaction setter requires transaction and ID dependencies");
  }

  return async ({ userId, postId, interactionType, active, audit }) => {
    if (!TYPES.has(interactionType)) throw new HttpError(400, "Unsupported post interaction");
    if (!audit || typeof audit !== "object" || Array.isArray(audit)) {
      throw new TypeError("Station post interaction audit context is required");
    }
    return transaction(async (connection) => {
      const postRows = await connection.query(
        `SELECT post.id, post.user_id, post.visibility,
          owner.status AS owner_status, visibility.show_posts
        FROM station_posts post
        JOIN users owner ON owner.id = post.user_id
        JOIN profile_visibility visibility ON visibility.user_id = post.user_id
        WHERE post.id = ? AND post.deleted_at IS NULL
        FOR UPDATE OF post, owner, visibility`,
        [postId],
      );
      if (!postRows.length) throw new HttpError(404, "Post not found");
      const post = postRows[0];
      if (post.user_id !== userId && (post.owner_status !== "active" || post.show_posts !== true)) {
        throw new HttpError(404, "Post not found");
      }
      if (post.user_id !== userId && post.visibility !== "public") {
        const relation = await connection.query(
          `SELECT 1 FROM social_relationships
          WHERE relation_type = 'friend' AND status = 'active'
            AND follower_user_id = ? AND followed_user_id = ?
          LIMIT 1`,
          [userId, post.user_id],
        );
        if (post.visibility !== "friends" || !relation.length) {
          throw new HttpError(404, "Post not found");
        }
      }
      if (active) {
        await connection.query(
          `INSERT INTO station_post_interactions (post_id, user_id, interaction_type)
          VALUES (?, ?, ?)
          ON CONFLICT DO NOTHING`,
          [postId, userId, interactionType],
        );
      } else {
        await connection.query(
          `DELETE FROM station_post_interactions
          WHERE post_id = ? AND user_id = ? AND interaction_type = ?`,
          [postId, userId, interactionType],
        );
      }
      const [countRows, mineRows] = await Promise.all([
        connection.query(
          `SELECT
            COUNT(*) FILTER (WHERE interaction_type = 'like')::integer AS like_count,
            COUNT(*) FILTER (WHERE interaction_type = 'favorite')::integer AS favorite_count
          FROM station_post_interactions
          WHERE post_id = ?`,
          [postId],
        ),
        connection.query(
          `SELECT interaction_type
          FROM station_post_interactions
          WHERE post_id = ? AND user_id = ?`,
          [postId, userId],
        ),
      ]);
      const counts = countRows[0] || {};
      await connection.query(
        `UPDATE station_posts
        SET like_count = ?, favorite_count = ?
        WHERE id = ?`,
        [Number(counts.like_count || 0), Number(counts.favorite_count || 0), postId],
      );
      const mine = new Set(mineRows.map((row) => row.interaction_type));
      await connection.query(
        `INSERT INTO usage_events
          (id, user_id, event_type, target_type, target_id, payload, ip_hash, user_agent)
        VALUES (?, ?, ?, 'station_post', ?, ?::jsonb, ?, ?)`,
        [
          createId(),
          userId,
          `station.post.${interactionType}`,
          postId,
          JSON.stringify({ active }),
          audit.ipHash ?? null,
          String(audit.userAgent || ""),
        ],
      );
      return {
        postId,
        likeCount: Number(counts.like_count || 0),
        favoriteCount: Number(counts.favorite_count || 0),
        likedByMe: mine.has("like"),
        favoritedByMe: mine.has("favorite"),
      };
    });
  };
}

export const setStationPostInteraction = createStationPostInteractionSetter({
  transaction: withTransaction,
  createId: crypto.randomUUID,
});

export async function listStationPostInteractionsForUser({ userId, postIds }) {
  if (!postIds.length) return new Map();
  const rows = await query(`SELECT post_id, interaction_type FROM station_post_interactions WHERE user_id = ? AND post_id = ANY(?::text[])`, [userId, postIds]);
  const map = new Map();
  for (const row of rows) {
    const current = map.get(row.post_id) || new Set();
    current.add(row.interaction_type);
    map.set(row.post_id, current);
  }
  return map;
}
