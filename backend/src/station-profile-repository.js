import { normalizeAvatarConfig } from "./avatar-service.js";
import { query, withTransaction } from "./db.js";
import { HttpError } from "./http-error.js";
import { normalizeLocationText } from "./location-labels.js";
import {
  displayInitial,
  mapMiaoPointLedgerEntry,
  mapProfile,
  mapPublicProfile,
  mapVisibility,
  normalizeDisplayName,
  normalizeOnlineUserIds,
  sqlLimit,
} from "./repository-mappers.js";

async function findUserByDisplayName(displayName) {
  const rows = await query("SELECT * FROM users WHERE lower(display_name) = ? LIMIT 1", [
    normalizeDisplayName(displayName),
  ]);
  return rows[0] || null;
}

export async function getProfileForUser(userId) {
  const rows = await query(
    `SELECT p.*, u.ai_id
    FROM user_profiles p
    JOIN users u ON u.id = p.user_id
    WHERE p.user_id = ?
    LIMIT 1`,
    [userId],
  );
  return rows[0] ? mapProfile(rows[0]) : null;
}

export async function listMiaoPointLedger(userId, limit = 80) {
  const safeLimit = sqlLimit(limit, 80, 100);
  const rows = await query(
    `SELECT *
    FROM miao_point_ledger
    WHERE user_id = ?
    ORDER BY created_at DESC, id DESC
    LIMIT ${safeLimit}`,
    [userId],
  );
  return rows.map(mapMiaoPointLedgerEntry);
}

export async function getProfileVisibility(userId) {
  await query(
    `INSERT INTO profile_visibility (user_id)
    VALUES (?)
    ON CONFLICT (user_id) DO NOTHING`,
    [userId],
  );
  const rows = await query("SELECT * FROM profile_visibility WHERE user_id = ? LIMIT 1", [userId]);
  return mapVisibility(rows[0] || {});
}

export async function updateProfileVisibility(userId, visibility = {}) {
  await getProfileVisibility(userId);
  await query(
    `UPDATE profile_visibility
    SET
      show_bio = COALESCE(?::boolean, show_bio),
      show_ai_id = COALESCE(?::boolean, show_ai_id),
      show_counts = COALESCE(?::boolean, show_counts),
      show_community = COALESCE(?::boolean, show_community),
      show_activity_area = COALESCE(?::boolean, show_activity_area),
      show_collections = COALESCE(?::boolean, show_collections),
      show_posts = COALESCE(?::boolean, show_posts),
      show_album = COALESCE(?::boolean, show_album),
      show_diary = COALESCE(?::boolean, show_diary),
      show_music = COALESCE(?::boolean, show_music),
      show_files = COALESCE(?::boolean, show_files),
      show_following_list = COALESCE(?::boolean, show_following_list),
      show_followers_list = COALESCE(?::boolean, show_followers_list)
    WHERE user_id = ?`,
    [
      visibility.showBio,
      visibility.showAiId,
      visibility.showCounts,
      visibility.showCommunity,
      visibility.showActivityArea,
      visibility.showCollections,
      visibility.showPosts,
      visibility.showAlbum,
      visibility.showDiary,
      visibility.showMusic,
      visibility.showFiles,
      visibility.showFollowingList,
      visibility.showFollowersList,
      userId,
    ].map((value) => (value === undefined ? null : value)),
  );
  return getProfileVisibility(userId);
}

export async function getPublicProfileByAiId({ viewerUserId, aiId, onlineUserIds = [] }) {
  const normalizedAiId = String(aiId || "").replace(/\D/g, "");
  const onlineIds = normalizeOnlineUserIds(onlineUserIds);
  const rows = await query(
    `SELECT
      u.id AS user_id,
      u.display_name,
      u.ai_id,
      u.presence_mode,
      (u.id = ANY(?::text[])) AS is_connected,
      p.nickname,
      p.avatar_text,
      p.avatar_config,
      p.bio,
      p.community,
      p.activity_area,
      p.miao_points,
      p.following_count,
      p.followers_count,
      p.likes_count,
      p.collections_count,
      v.show_bio,
      v.show_ai_id,
      v.show_counts,
      v.show_community,
      v.show_activity_area,
      v.show_collections,
      v.show_posts,
      v.show_album,
      v.show_diary,
      v.show_music,
      v.show_files,
      v.show_following_list,
      v.show_followers_list
    FROM users u
    JOIN user_profiles p ON p.user_id = u.id
    LEFT JOIN profile_visibility v ON v.user_id = u.id
    WHERE u.ai_id = ? AND u.status = 'active'
    LIMIT 1`,
    [onlineIds, normalizedAiId],
  );
  if (!rows.length) return null;

  const targetUserId = rows[0].user_id;
  const [followRows, friendRows, requestRows] = await Promise.all([
    query(
      `SELECT id FROM social_relationships
      WHERE follower_user_id = ? AND followed_user_id = ? AND relation_type = 'follow' AND status = 'active'
      LIMIT 1`,
      [viewerUserId, targetUserId],
    ),
    query(
      `SELECT id FROM social_relationships
      WHERE follower_user_id = ? AND followed_user_id = ? AND relation_type = 'friend' AND status = 'active'
      LIMIT 1`,
      [viewerUserId, targetUserId],
    ),
    query(
      `SELECT id FROM social_requests
      WHERE requester_user_id = ? AND target_user_id = ? AND request_type = 'friend' AND status = 'pending'
      ORDER BY created_at DESC
      LIMIT 1`,
      [viewerUserId, targetUserId],
    ),
  ]);

  return mapPublicProfile(rows[0], {
    isSelf: viewerUserId === targetUserId,
    isFollowing: followRows.length > 0,
    isFriend: friendRows.length > 0,
    pendingFriendRequestId: requestRows[0]?.id || null,
  });
}

export async function updateUserStationConfig(userId, stationConfig = {}) {
  await query(
    `UPDATE user_profiles
    SET station_config = COALESCE(station_config, '{}'::jsonb) || ?::jsonb
    WHERE user_id = ?`,
    [JSON.stringify(stationConfig), userId],
  );

  return getProfileForUser(userId);
}

export async function updateUserProfile({
  userId,
  nickname,
  bio = "",
  community = "",
  activityArea = "",
  avatarText = "",
  avatarConfig = {},
}) {
  const resolvedNickname = String(nickname || "").trim();
  const existing = await findUserByDisplayName(resolvedNickname);
  if (existing && existing.id !== userId) {
    throw new HttpError(409, "Display name already registered");
  }
  const resolvedAvatarText = String(avatarText || displayInitial(resolvedNickname)).trim().slice(0, 8);

  await withTransaction(async (connection) => {
    await connection.execute("UPDATE users SET display_name = ? WHERE id = ?", [resolvedNickname, userId]);
    await connection.execute(
      `UPDATE user_profiles
      SET
        nickname = ?,
        avatar_text = ?,
        bio = ?,
        community = ?,
        activity_area = ?,
        avatar_config = ?::jsonb
      WHERE user_id = ?`,
      [
        resolvedNickname,
        resolvedAvatarText || displayInitial(resolvedNickname),
        bio,
        normalizeLocationText(community),
        normalizeLocationText(activityArea),
        JSON.stringify(normalizeAvatarConfig(avatarConfig, userId)),
        userId,
      ],
    );
  });

  return getProfileForUser(userId);
}
