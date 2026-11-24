import crypto from "crypto";
import { query, withTransaction } from "./db.js";
import { HttpError } from "./http-error.js";
import { ensureFriendThreadPair, getThreadForUser } from "./message-repository.js";
import {
  NOTIFICATION_KINDS,
  createNotification,
  markNotificationsForTargetRead,
} from "./notification-service.js";
import {
  mapRelationshipProfile,
  normalizeOnlineUserIds,
  sqlLimit,
} from "./repository-mappers.js";

async function getRawUserById(userId) {
  const rows = await query("SELECT * FROM users WHERE id = ? LIMIT 1", [userId]);
  return rows[0] || null;
}

function lockFriendPair(connection, userId, otherUserId) {
  const pair = [userId, otherUserId].sort().join(":");
  return connection.query("SELECT pg_advisory_xact_lock(hashtextextended(?, 0))", [`friend-request:${pair}`]);
}

async function refreshSocialCounts(connection, userId) {
  await connection.execute(
    `UPDATE user_profiles
    SET
      following_count = (
        SELECT COUNT(*)
        FROM social_relationships
        WHERE follower_user_id = ? AND relation_type = 'follow' AND status = 'active'
      ),
      followers_count = (
        SELECT COUNT(*)
        FROM social_relationships
        WHERE followed_user_id = ? AND relation_type = 'follow' AND status = 'active'
      )
    WHERE user_id = ?`,
    [userId, userId, userId],
  );
}

export async function followUser({ followerUserId, followedUserId }) {
  if (followerUserId === followedUserId) {
    throw new HttpError(400, "Cannot follow yourself");
  }

  const existingRows = await query(
    `SELECT status FROM social_relationships
    WHERE follower_user_id = ? AND followed_user_id = ? AND relation_type = 'follow'
    LIMIT 1`,
    [followerUserId, followedUserId],
  );
  const wasAlreadyActive = existingRows[0]?.status === "active";

  await withTransaction(async (connection) => {
    const relationshipId = crypto.randomUUID();
    await connection.execute(
      `INSERT INTO social_relationships
        (id, follower_user_id, followed_user_id, relation_type, status)
      VALUES (?, ?, ?, 'follow', 'active')
      ON CONFLICT (follower_user_id, followed_user_id, relation_type) DO UPDATE SET
        status = 'active',
        updated_at = CURRENT_TIMESTAMP`,
      [relationshipId, followerUserId, followedUserId],
    );
    await refreshSocialCounts(connection, followerUserId);
    await refreshSocialCounts(connection, followedUserId);
  });

  if (!wasAlreadyActive) {
    const actor = await getRawUserById(followerUserId);
    const notification = await createNotification({
      userId: followedUserId,
      actorUserId: followerUserId,
      actorName: actor?.display_name || "",
      kind: NOTIFICATION_KINDS.FOLLOW_CREATED,
      targetType: "user",
      targetId: followerUserId,
    });
    return { ok: true, notification };
  }

  return { ok: true };
}

export async function unfollowUser({ followerUserId, followedUserId }) {
  if (followerUserId === followedUserId) {
    throw new HttpError(400, "Cannot unfollow yourself");
  }

  await withTransaction(async (connection) => {
    await connection.execute(
      `DELETE FROM social_relationships
      WHERE follower_user_id = ? AND followed_user_id = ? AND relation_type = 'follow' AND status = 'active'`,
      [followerUserId, followedUserId],
    );
    await refreshSocialCounts(connection, followerUserId);
    await refreshSocialCounts(connection, followedUserId);
  });

  return { ok: true };
}

export async function createFriendRequest({ requesterUserId, targetUserId, message = "" }) {
  if (requesterUserId === targetUserId) {
    throw new HttpError(400, "Cannot add yourself as friend");
  }

  const requester = await getRawUserById(requesterUserId);
  return withTransaction(async connection => {
    await lockFriendPair(connection, requesterUserId, targetUserId);
    const [friend] = await connection.query(`SELECT id FROM social_relationships
      WHERE follower_user_id=? AND followed_user_id=? AND relation_type='friend' AND status='active' LIMIT 1`,
    [requesterUserId,targetUserId]);
    if (friend) throw new HttpError(409, "Already friends");
    const [row] = await connection.query(`INSERT INTO social_requests
      (id, requester_user_id, target_user_id, request_type, status, message)
      VALUES (?, ?, ?, 'friend', 'pending', ?)
      ON CONFLICT (requester_user_id, target_user_id, request_type) WHERE status = 'pending'
      DO UPDATE SET message=EXCLUDED.message RETURNING id,status,(xmax = 0) AS created`,
    [crypto.randomUUID(),requesterUserId,targetUserId,message]);
    if (!row) throw new HttpError(500, "Could not create friend request");
    const notification = row.created ? await createNotification({
      userId: targetUserId,
      actorUserId: requesterUserId,
      actorName: requester?.display_name || "",
      kind: NOTIFICATION_KINDS.FRIEND_REQUEST,
      targetType: "friend_request",
      targetId: row.id,
      payload: { requesterUserId },
    }, connection.query) : null;
    return { id: row.id, status: row.status, ...(notification ? { notification } : {}) };
  });
}

export async function acceptFriendRequest({ requestId, targetUserId }) {
  const request = await withTransaction(async connection => {
    const [pending] = await connection.query(`SELECT requester_user_id FROM social_requests
      WHERE id=? AND target_user_id=? AND request_type='friend' AND status='pending'`, [requestId, targetUserId]);
    if (!pending) throw new HttpError(409, "Friend request has already changed", { code: "FRIEND_REQUEST_STATE_CHANGED" });
    await lockFriendPair(connection, pending.requester_user_id, targetUserId);
    const [request] = await connection.query(`UPDATE social_requests SET status='accepted',responded_at=CURRENT_TIMESTAMP
      WHERE id=? AND target_user_id=? AND request_type='friend' AND status='pending' RETURNING *`,
    [requestId,targetUserId]);
    if (!request) throw new HttpError(409, "Friend request has already changed", { code: "FRIEND_REQUEST_STATE_CHANGED" });
    const [requester] = await connection.query("SELECT display_name FROM users WHERE id=?", [request.requester_user_id]);
    const [target] = await connection.query("SELECT display_name FROM users WHERE id=?", [request.target_user_id]);

    for (const [followerUserId, followedUserId] of [
      [request.requester_user_id, request.target_user_id],
      [request.target_user_id, request.requester_user_id],
    ]) {
      await connection.query(
      `INSERT INTO social_relationships
          (id, follower_user_id, followed_user_id, relation_type, status)
        VALUES (?, ?, ?, 'friend', 'active')
        ON CONFLICT (follower_user_id, followed_user_id, relation_type) DO UPDATE SET
          status = 'active',
          updated_at = CURRENT_TIMESTAMP`,
        [crypto.randomUUID(), followerUserId, followedUserId],
      );
    }

    await refreshSocialCounts(connection, request.requester_user_id);
    await refreshSocialCounts(connection, request.target_user_id);
    const threadId = await ensureFriendThreadPair(connection, request.target_user_id, request.requester_user_id);
    const notification = await createNotification({
      userId: request.requester_user_id,
      actorUserId: targetUserId,
      actorName: target?.display_name || "",
      kind: NOTIFICATION_KINDS.FRIEND_ACCEPTED,
      targetType: "user",
      targetId: targetUserId,
    }, connection.query);
    await markNotificationsForTargetRead(targetUserId, "friend_request", requestId, connection.query);
    return { ...request, notification, threadId, requesterName: requester?.display_name || "" };
  });
  const thread = await getThreadForUser(targetUserId, request.threadId);
  return {
    id: requestId,
    status: "accepted",
    requesterUserId: request.requester_user_id,
    targetUserId,
    thread,
    notification: request.notification,
  };
}

export async function rejectFriendRequest({ requestId, targetUserId }) {
  return withTransaction(async connection => {
    const [request] = await connection.query(`UPDATE social_requests SET status='rejected',responded_at=CURRENT_TIMESTAMP
      WHERE id=? AND target_user_id=? AND request_type='friend' AND status='pending' RETURNING id,requester_user_id`,
    [requestId,targetUserId]);
    if (!request) throw new HttpError(409, "Friend request has already changed", { code: "FRIEND_REQUEST_STATE_CHANGED" });
    await markNotificationsForTargetRead(targetUserId, "friend_request", requestId, connection.query);
    return { id: request.id, status: "rejected", requesterUserId: request.requester_user_id };
  });
}

export async function cancelFriendRequest({ requestId, requesterUserId }) {
  return withTransaction(async connection => {
    const [request] = await connection.query(`UPDATE social_requests SET status='cancelled',responded_at=CURRENT_TIMESTAMP
      WHERE id=? AND requester_user_id=? AND request_type='friend' AND status='pending' RETURNING id,target_user_id`,
    [requestId,requesterUserId]);
    if (!request) throw new HttpError(409, "Friend request has already changed", { code: "FRIEND_REQUEST_STATE_CHANGED" });
    await markNotificationsForTargetRead(request.target_user_id, "friend_request", requestId, connection.query);
    return { id: request.id, status: "cancelled", targetUserId: request.target_user_id };
  });
}

export async function listRelationshipProfiles(userId, type = "friends", limit = 60, onlineUserIds = [], before = null) {
  const safeLimit = sqlLimit(limit, 60, 120);
  const onlineIds = normalizeOnlineUserIds(onlineUserIds);
  const relationType = type === "friends" ? "friend" : "follow";
  const direction = type === "followers" ? "followed_user_id" : "follower_user_id";
  const targetColumn = type === "followers" ? "follower_user_id" : "followed_user_id";
  const rows = await query(
    `SELECT
      r.relation_type,
      r.created_at,
      r.id AS relation_id,
      to_char(r.created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS cursor_created_at,
      u.id AS user_id,
      u.display_name,
      u.ai_id,
      u.presence_mode,
      (u.id = ANY(?::text[])) AS is_connected,
      p.nickname,
      p.avatar_text,
      p.avatar_config,
      p.bio,
      p.headline,
      p.public_location,
      p.experience_years,
      p.languages,
      v.show_bio,
      v.show_ai_id,
      v.show_counts,
      v.show_community,
      v.show_activity_area,
      v.show_collections,
      p.community,
      p.activity_area,
      p.following_count,
      p.followers_count,
      p.likes_count,
      p.collections_count,
      t.id AS thread_id
    FROM social_relationships r
    JOIN users u ON u.id = r.${targetColumn}
    JOIN user_profiles p ON p.user_id = u.id
    LEFT JOIN profile_visibility v ON v.user_id = u.id
    LEFT JOIN chat_threads t
      ON t.user_id = ? AND t.peer_user_id = u.id
    WHERE r.${direction} = ? AND r.relation_type = ? AND r.status = 'active' AND u.status = 'active'
      ${before ? "AND (r.created_at, r.id) < (?::timestamptz, ?::char(36))" : ""}
    ORDER BY r.created_at DESC, r.id DESC
    LIMIT ${safeLimit}`,
    [onlineIds, userId, userId, relationType, ...(before ? [before.createdAt, before.relationId] : [])],
  );
  return rows.map(mapRelationshipProfile);
}

export async function listPresenceAudienceUserIds(userId) {
  const rows = await query(
    `SELECT DISTINCT audience_user_id
    FROM (
      SELECT
        CASE
          WHEN follower_user_id = ? THEN followed_user_id
          ELSE follower_user_id
        END AS audience_user_id
      FROM social_relationships
      WHERE status = 'active'
        AND relation_type IN ('follow', 'friend')
        AND (follower_user_id = ? OR followed_user_id = ?)
      UNION
      SELECT user_id AS audience_user_id
      FROM chat_threads
      WHERE peer_user_id = ?
      UNION
      SELECT peer_user_id AS audience_user_id
      FROM chat_threads
      WHERE user_id = ? AND peer_user_id IS NOT NULL
    ) audience
    WHERE audience_user_id IS NOT NULL AND audience_user_id <> ?`,
    [userId, userId, userId, userId, userId, userId],
  );
  return rows.map((row) => row.audience_user_id).filter(Boolean);
}
