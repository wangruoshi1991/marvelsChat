import crypto from "crypto";
import { normalizeAvatarConfig } from "./avatar-service.js";
import { query, withTransaction } from "./db.js";
import { HttpError } from "./http-error.js";
import { normalizeLocationText } from "./location-labels.js";
import {
  displayInitial,
  mapFileAsset,
  mapGenerationJob,
  mapMiaoPointLedgerEntry,
  mapProfile,
  mapPublicProfile,
  mapStationAlbum,
  mapStationComicDiary,
  mapStationDiaryEntry,
  mapStationMediaAsset,
  mapStationModelAsset,
  mapStationOutfit,
  mapStationPost,
  mapStationSiteDraft,
  mapStationVideoDraft,
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

export async function listStationPostsForUser(userId, limit = 40) {
  const safeLimit = sqlLimit(limit, 40, 80);
  const postRows = await query(
    `SELECT *
    FROM station_posts
    WHERE user_id = ? AND deleted_at IS NULL
    ORDER BY created_at DESC, id DESC
    LIMIT ${safeLimit}`,
    [userId],
  );
  if (!postRows.length) return [];

  const mediaRows = await query(
    `SELECT pm.post_id, pm.sort_order AS post_sort_order, m.*
    FROM station_post_media pm
    JOIN station_media_assets m ON m.id = pm.media_asset_id
    WHERE
      pm.post_id = ANY(?::text[])
      AND m.deleted_at IS NULL
      AND m.status = 'uploaded'
    ORDER BY pm.post_id, pm.sort_order ASC`,
    [postRows.map((row) => row.id)],
  );
  const mediaByPost = new Map();
  for (const row of mediaRows) {
    const items = mediaByPost.get(row.post_id) || [];
    items.push(mapStationMediaAsset(row));
    mediaByPost.set(row.post_id, items);
  }

  return postRows.map((row) =>
    mapStationPost(row, { media: mediaByPost.get(row.id) || [] }),
  );
}

export async function getStationContentForUser(userId) {
  const [
    posts,
    diaryRows,
    albumRows,
    mediaRows,
    outfitRows,
    siteDraftRows,
    modelJobRows,
    modelAssetRows,
    fileRows,
    comicDiaryRows,
    videoDraftRows,
  ] = await Promise.all([
    listStationPostsForUser(userId, 40),
    query(
      `SELECT *
      FROM station_diary_entries
      WHERE user_id = ? AND deleted_at IS NULL
      ORDER BY created_at DESC
      LIMIT 20`,
      [userId],
    ),
    query(
      `SELECT
        a.*,
        COUNT(m.id) FILTER (WHERE m.deleted_at IS NULL AND m.status <> 'deleted') AS media_count
      FROM station_albums a
      LEFT JOIN station_media_assets m ON m.album_id = a.id
      WHERE a.user_id = ? AND a.deleted_at IS NULL
      GROUP BY a.id
      ORDER BY a.created_at DESC
      LIMIT 20`,
      [userId],
    ),
    query(
      `SELECT *
      FROM station_media_assets
      WHERE user_id = ? AND deleted_at IS NULL
      ORDER BY created_at DESC
      LIMIT 40`,
      [userId],
    ),
    query(
      `SELECT *
      FROM station_outfits
      WHERE user_id = ? AND deleted_at IS NULL
      ORDER BY created_at DESC
      LIMIT 20`,
      [userId],
    ),
    query(
      `SELECT *
      FROM station_site_drafts
      WHERE user_id = ? AND deleted_at IS NULL
      ORDER BY created_at DESC
      LIMIT 10`,
      [userId],
    ),
    query(
      `SELECT *
      FROM generation_jobs
      WHERE user_id = ? AND kind = '3d_model' AND deleted_at IS NULL
      ORDER BY created_at DESC
      LIMIT 10`,
      [userId],
    ),
    query(
      `SELECT *
      FROM station_model_assets
      WHERE user_id = ? AND deleted_at IS NULL
      ORDER BY created_at DESC
      LIMIT 20`,
      [userId],
    ),
    query(
      `SELECT *
      FROM file_assets
      WHERE user_id = ? AND deleted_at IS NULL
      ORDER BY created_at DESC
      LIMIT 30`,
      [userId],
    ),
    query(
      `SELECT *
      FROM station_comic_diaries
      WHERE user_id = ? AND deleted_at IS NULL
      ORDER BY created_at DESC
      LIMIT 20`,
      [userId],
    ),
    query(
      `SELECT *
      FROM station_video_drafts
      WHERE user_id = ? AND deleted_at IS NULL
      ORDER BY created_at DESC
      LIMIT 20`,
      [userId],
    ),
  ]);

  return {
    posts,
    diaryEntries: diaryRows.map(mapStationDiaryEntry),
    albums: albumRows.map(mapStationAlbum),
    mediaAssets: mediaRows.map(mapStationMediaAsset),
    outfits: outfitRows.map(mapStationOutfit),
    siteDrafts: siteDraftRows.map(mapStationSiteDraft),
    modelJobs: modelJobRows.map(mapGenerationJob),
    modelAssets: modelAssetRows.map(mapStationModelAsset),
    fileAssets: fileRows.map(mapFileAsset),
    comicDiaries: comicDiaryRows.map(mapStationComicDiary),
    videoDrafts: videoDraftRows.map(mapStationVideoDraft),
  };
}

export async function createStationPost({
  userId,
  body = "",
  locationLabel = "",
  visibility = "public",
  agentCapabilities = [],
  mediaAssetIds = [],
}) {
  const requestedMediaIds = Array.from(new Set(mediaAssetIds));
  if (requestedMediaIds.length !== mediaAssetIds.length) {
    throw new HttpError(400, "Post media assets must be unique");
  }
  if (!body.trim() && !requestedMediaIds.length) {
    throw new HttpError(400, "Post body or media is required");
  }

  return withTransaction(async (connection) => {
    let media = [];
    if (requestedMediaIds.length) {
      const rows = await connection.query(
        `SELECT *
        FROM station_media_assets
        WHERE
          user_id = ?
          AND id = ANY(?::text[])
          AND deleted_at IS NULL
        FOR UPDATE`,
        [userId, requestedMediaIds],
      );
      const assetsById = new Map(rows.map((row) => [row.id, row]));
      if (assetsById.size !== requestedMediaIds.length) {
        throw new HttpError(404, "Post media asset not found");
      }
      const orderedRows = requestedMediaIds.map((id) => assetsById.get(id));
      if (orderedRows.some((row) => row.status !== "uploaded")) {
        throw new HttpError(409, "Post media must finish uploading first");
      }
      const kinds = new Set(orderedRows.map((row) => row.kind));
      if (kinds.size > 1) {
        throw new HttpError(400, "Images and video cannot be mixed in one post");
      }
      if (kinds.has("video") && orderedRows.length !== 1) {
        throw new HttpError(400, "A post can contain only one video");
      }
      if (kinds.has("image") && orderedRows.length > 9) {
        throw new HttpError(400, "A post can contain at most nine images");
      }
      media = orderedRows.map(mapStationMediaAsset);
    }

    const id = crypto.randomUUID();
    const postRows = await connection.query(
      `INSERT INTO station_posts
        (id, user_id, body, location_label, visibility, agent_capabilities)
      VALUES (?, ?, ?, ?, ?, ?::jsonb)
      RETURNING *`,
      [
        id,
        userId,
        body,
        locationLabel,
        visibility,
        JSON.stringify(agentCapabilities),
      ],
    );
    for (const [sortOrder, mediaAssetId] of requestedMediaIds.entries()) {
      await connection.query(
        `INSERT INTO station_post_media (post_id, media_asset_id, sort_order)
        VALUES (?, ?, ?)`,
        [id, mediaAssetId, sortOrder],
      );
    }

    return mapStationPost(postRows[0], { media });
  });
}

export async function deleteStationPost({ userId, postId }) {
  const rows = await query(
    `UPDATE station_posts
    SET deleted_at = CURRENT_TIMESTAMP
    WHERE id = ? AND user_id = ? AND deleted_at IS NULL
    RETURNING id`,
    [postId, userId],
  );
  return rows.length > 0;
}

export async function createStationDiaryEntry({ userId, title, body, mood = "", visibility = "private", source = "manual" }) {
  const id = crypto.randomUUID();
  const rows = await query(
    `INSERT INTO station_diary_entries
      (id, user_id, title, body, mood, visibility, source)
    VALUES (?, ?, ?, ?, ?, ?, ?)
    RETURNING *`,
    [id, userId, title, body, mood, visibility, source],
  );
  return mapStationDiaryEntry(rows[0]);
}

export async function updateStationDiaryEntry({
  userId,
  entryId,
  title,
  body,
  mood,
  visibility,
}) {
  const rows = await query(
    `UPDATE station_diary_entries
    SET
      title = COALESCE(?::text, title),
      body = COALESCE(?::text, body),
      mood = COALESCE(?::text, mood),
      visibility = COALESCE(?::text, visibility)
    WHERE id = ? AND user_id = ? AND deleted_at IS NULL
    RETURNING *`,
    [
      title ?? null,
      body ?? null,
      mood ?? null,
      visibility ?? null,
      entryId,
      userId,
    ],
  );
  return rows[0] ? mapStationDiaryEntry(rows[0]) : null;
}

export async function deleteStationDiaryEntry({ userId, entryId }) {
  const rows = await query(
    `UPDATE station_diary_entries
    SET deleted_at = CURRENT_TIMESTAMP
    WHERE id = ? AND user_id = ? AND deleted_at IS NULL
    RETURNING id`,
    [entryId, userId],
  );
  return rows.length > 0;
}

export async function getStationDiaryEntryForUser({ userId, diaryEntryId }) {
  const rows = await query(
    `SELECT *
    FROM station_diary_entries
    WHERE id = ? AND user_id = ? AND deleted_at IS NULL
    LIMIT 1`,
    [diaryEntryId, userId],
  );
  return rows[0] ? mapStationDiaryEntry(rows[0]) : null;
}

export async function createStationAlbum({ userId, title, description = "", visibility = "private" }) {
  const id = crypto.randomUUID();
  const rows = await query(
    `INSERT INTO station_albums
      (id, user_id, title, description, visibility)
    VALUES (?, ?, ?, ?, ?)
    RETURNING *, 0 AS media_count`,
    [id, userId, title, description, visibility],
  );
  return mapStationAlbum(rows[0]);
}

export async function updateStationAlbum({
  userId,
  albumId,
  title,
  description,
  visibility,
}) {
  const rows = await query(
    `WITH updated AS (
      UPDATE station_albums
      SET
        title = COALESCE(?::text, title),
        description = COALESCE(?::text, description),
        visibility = COALESCE(?::text, visibility)
      WHERE id = ? AND user_id = ? AND deleted_at IS NULL
      RETURNING *
    )
    SELECT
      updated.*,
      (
        SELECT COUNT(m.id)
        FROM station_media_assets m
        WHERE
          m.album_id = updated.id
          AND m.deleted_at IS NULL
          AND m.status <> 'deleted'
      ) AS media_count
    FROM updated`,
    [title ?? null, description ?? null, visibility ?? null, albumId, userId],
  );
  return rows[0] ? mapStationAlbum(rows[0]) : null;
}

export async function deleteStationAlbum({ userId, albumId }) {
  return withTransaction(async (connection) => {
    const rows = await connection.query(
      `UPDATE station_albums
      SET deleted_at = CURRENT_TIMESTAMP
      WHERE id = ? AND user_id = ? AND deleted_at IS NULL
      RETURNING id`,
      [albumId, userId],
    );
    if (!rows.length) {
      return false;
    }
    await connection.query(
      `UPDATE station_media_assets
      SET status = 'deleted', deleted_at = CURRENT_TIMESTAMP
      WHERE album_id = ? AND user_id = ? AND deleted_at IS NULL`,
      [albumId, userId],
    );
    return true;
  });
}

export async function createStationMediaAsset({
  userId,
  albumId = null,
  kind = "image",
  originalFilename = "",
  mimeType = "",
  byteSize = null,
  width = null,
  height = null,
  caption = "",
  tags = [],
  metadata = {},
}) {
  if (albumId) {
    const albums = await query(
      "SELECT id FROM station_albums WHERE id = ? AND user_id = ? AND deleted_at IS NULL LIMIT 1",
      [albumId, userId],
    );
    if (!albums.length) {
      throw new HttpError(404, "Album not found");
    }
  }

  const id = crypto.randomUUID();
  const rows = await query(
    `INSERT INTO station_media_assets
      (id, user_id, album_id, kind, original_filename, mime_type, byte_size, width, height, caption, tags, metadata)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?::jsonb, ?::jsonb)
    RETURNING *`,
    [id, userId, albumId, kind, originalFilename, mimeType, byteSize, width, height, caption, JSON.stringify(tags), JSON.stringify(metadata)],
  );
  return mapStationMediaAsset(rows[0]);
}

export async function updateStationMediaAsset({
  userId,
  mediaAssetId,
  albumId,
  caption,
  hasAlbumId,
}) {
  if (hasAlbumId && albumId) {
    const albums = await query(
      "SELECT id FROM station_albums WHERE id = ? AND user_id = ? AND deleted_at IS NULL LIMIT 1",
      [albumId, userId],
    );
    if (!albums.length) {
      throw new HttpError(404, "Album not found");
    }
  }

  const rows = await query(
    `UPDATE station_media_assets
    SET
      album_id = CASE WHEN ?::boolean THEN ?::text ELSE album_id END,
      caption = COALESCE(?::text, caption)
    WHERE id = ? AND user_id = ? AND deleted_at IS NULL
    RETURNING *`,
    [
      Boolean(hasAlbumId),
      albumId ?? null,
      caption ?? null,
      mediaAssetId,
      userId,
    ],
  );
  return rows[0] ? mapStationMediaAsset(rows[0]) : null;
}

export async function deleteStationMediaAsset({ userId, mediaAssetId }) {
  const rows = await query(
    `UPDATE station_media_assets
    SET status = 'deleted', deleted_at = CURRENT_TIMESTAMP
    WHERE id = ? AND user_id = ? AND deleted_at IS NULL
    RETURNING *`,
    [mediaAssetId, userId],
  );
  return rows[0] ? mapStationMediaAsset(rows[0]) : null;
}

export async function getStationMediaAssetForUser({ userId, mediaAssetId }) {
  const rows = await query(
    `SELECT *
    FROM station_media_assets
    WHERE id = ? AND user_id = ? AND deleted_at IS NULL
    LIMIT 1`,
    [mediaAssetId, userId],
  );
  return rows[0] ? mapStationMediaAsset(rows[0]) : null;
}

export async function prepareStationMediaAssetUpload({
  userId,
  mediaAssetId,
  storageProvider,
  storageKey,
  mimeType,
  byteSize = null,
}) {
  const rows = await query(
    `UPDATE station_media_assets
    SET
      storage_provider = ?,
      storage_key = ?,
      mime_type = COALESCE(NULLIF(?, ''), mime_type),
      byte_size = COALESCE(?::integer, byte_size)
    WHERE id = ? AND user_id = ? AND deleted_at IS NULL AND status = 'pending_upload'
    RETURNING *`,
    [
      storageProvider,
      storageKey,
      mimeType || "",
      byteSize,
      mediaAssetId,
      userId,
    ],
  );
  return rows[0] ? mapStationMediaAsset(rows[0]) : null;
}

export async function markStationMediaAssetUploaded({
  userId,
  mediaAssetId,
  storageKey,
  mimeType,
  byteSize,
  metadata = {},
}) {
  const rows = await query(
    `UPDATE station_media_assets
    SET
      status = 'uploaded',
      mime_type = ?,
      byte_size = ?,
      metadata = COALESCE(metadata, '{}'::jsonb) || ?::jsonb
    WHERE
      id = ?
      AND user_id = ?
      AND deleted_at IS NULL
      AND status = 'pending_upload'
      AND storage_key = ?
    RETURNING *`,
    [
      mimeType,
      byteSize,
      JSON.stringify(metadata),
      mediaAssetId,
      userId,
      storageKey,
    ],
  );
  return rows[0] ? mapStationMediaAsset(rows[0]) : null;
}

export async function updateStationMediaAssetTags({
  userId,
  mediaAssetId,
  caption = undefined,
  tags = [],
  metadata = {},
}) {
  const rows = await query(
    `UPDATE station_media_assets
    SET
      caption = COALESCE(?::text, caption),
      tags = ?::jsonb,
      metadata = COALESCE(metadata, '{}'::jsonb) || ?::jsonb
    WHERE id = ? AND user_id = ? AND deleted_at IS NULL
    RETURNING *`,
    [
      caption === undefined ? null : caption,
      JSON.stringify(tags),
      JSON.stringify(metadata),
      mediaAssetId,
      userId,
    ],
  );
  if (!rows.length) throw new HttpError(404, "Media asset not found");
  return mapStationMediaAsset(rows[0]);
}

export async function listStationMediaAssetsForUser(userId, limit = 40) {
  const safeLimit = sqlLimit(limit, 40, 100);
  const rows = await query(
    `SELECT *
    FROM station_media_assets
    WHERE user_id = ? AND deleted_at IS NULL
    ORDER BY created_at DESC
    LIMIT ${safeLimit}`,
    [userId],
  );
  return rows.map(mapStationMediaAsset);
}

export async function listStationMediaAssetsByIdsForUser({ userId, mediaAssetIds = [] }) {
  const ids = Array.from(new Set(mediaAssetIds.filter(Boolean)));
  if (!ids.length) return [];
  const rows = await query(
    `SELECT *
    FROM station_media_assets
    WHERE user_id = ? AND id = ANY(?::text[]) AND deleted_at IS NULL`,
    [userId, ids],
  );
  const byId = new Map(rows.map((row) => [row.id, mapStationMediaAsset(row)]));
  return ids.map((id) => byId.get(id)).filter(Boolean);
}

export async function moveMediaAssetsToAlbum({ userId, albumId, mediaAssetIds = [] }) {
  if (!mediaAssetIds.length) return [];
  const albumRows = await query(
    "SELECT id FROM station_albums WHERE id = ? AND user_id = ? AND deleted_at IS NULL LIMIT 1",
    [albumId, userId],
  );
  if (!albumRows.length) throw new HttpError(404, "Album not found");

  const rows = await query(
    `UPDATE station_media_assets
    SET album_id = ?
    WHERE user_id = ? AND id = ANY(?::text[]) AND deleted_at IS NULL
    RETURNING *`,
    [albumId, userId, mediaAssetIds],
  );
  return rows.map(mapStationMediaAsset);
}

export async function createStationOutfit({
  userId,
  title,
  note = "",
  avatarConfig = {},
  mediaAssetId = null,
  visibility = "private",
  source = "manual",
}) {
  if (mediaAssetId) {
    const assets = await query(
      "SELECT id FROM station_media_assets WHERE id = ? AND user_id = ? AND deleted_at IS NULL LIMIT 1",
      [mediaAssetId, userId],
    );
    if (!assets.length) {
      throw new HttpError(404, "Media asset not found");
    }
  }

  const id = crypto.randomUUID();
  const rows = await query(
    `INSERT INTO station_outfits
      (id, user_id, title, note, avatar_config, media_asset_id, visibility, source)
    VALUES (?, ?, ?, ?, ?::jsonb, ?, ?, ?)
    RETURNING *`,
    [id, userId, title, note, JSON.stringify(normalizeAvatarConfig(avatarConfig, userId)), mediaAssetId, visibility, source],
  );
  return mapStationOutfit(rows[0]);
}

export async function listStationSiteDraftsForUser(userId, limit = 20) {
  const safeLimit = sqlLimit(limit, 20, 50);
  const rows = await query(
    `SELECT *
    FROM station_site_drafts
    WHERE user_id = ? AND deleted_at IS NULL
    ORDER BY created_at DESC
    LIMIT ${safeLimit}`,
    [userId],
  );
  return rows.map(mapStationSiteDraft);
}

export async function getStationSiteDraftForUser({ userId, draftId }) {
  const rows = await query(
    `SELECT *
    FROM station_site_drafts
    WHERE id = ? AND user_id = ? AND deleted_at IS NULL
    LIMIT 1`,
    [draftId, userId],
  );
  return rows[0] ? mapStationSiteDraft(rows[0]) : null;
}

export async function createStationSiteDraft({
  userId,
  prompt,
  draft,
  source = "fallback",
  model = {},
}) {
  const id = crypto.randomUUID();
  const rows = await query(
    `INSERT INTO station_site_drafts
      (id, user_id, prompt, draft, source, model_provider, model_missing, model_error)
    VALUES (?, ?, ?, ?::jsonb, ?, ?, ?::jsonb, ?)
    RETURNING *`,
    [
      id,
      userId,
      prompt,
      JSON.stringify(draft),
      source === "model" ? "model" : "fallback",
      model.provider || "",
      JSON.stringify(Array.isArray(model.missing) ? model.missing : []),
      model.error || "",
    ],
  );
  return mapStationSiteDraft(rows[0]);
}

export async function applyStationSiteDraft({ userId, draftId }) {
  let siteDraft = null;

  await withTransaction(async (connection) => {
    const [rows] = await connection.execute(
      `SELECT *
      FROM station_site_drafts
      WHERE id = ? AND user_id = ? AND deleted_at IS NULL
      LIMIT 1
      FOR UPDATE`,
      [draftId, userId],
    );
    if (!rows.length) {
      throw new HttpError(404, "Site draft not found");
    }

    const draft = rows[0].draft;
    await connection.execute(
      `UPDATE station_site_drafts
      SET status = 'draft'
      WHERE user_id = ? AND status = 'applied' AND id <> ?`,
      [userId, draftId],
    );
    const [updatedRows] = await connection.execute(
      `UPDATE station_site_drafts
      SET status = 'applied'
      WHERE id = ? AND user_id = ?
      RETURNING *`,
      [draftId, userId],
    );
    await connection.execute(
      `UPDATE user_profiles
      SET station_config = COALESCE(station_config, '{}'::jsonb)
        || jsonb_build_object('siteLayout', ?::jsonb, 'siteDraftId', ?::text)
      WHERE user_id = ?`,
      [JSON.stringify(draft), draftId, userId],
    );

    siteDraft = mapStationSiteDraft(updatedRows[0]);
  });

  return {
    siteDraft,
    profile: await getProfileForUser(userId),
  };
}

export async function listGenerationJobsForUser({ userId, kind = "3d_model", limit = 20 }) {
  const safeLimit = sqlLimit(limit, 20, 50);
  const rows = await query(
    `SELECT *
    FROM generation_jobs
    WHERE user_id = ? AND kind = ? AND deleted_at IS NULL
    ORDER BY created_at DESC
    LIMIT ${safeLimit}`,
    [userId, kind],
  );
  return rows.map(mapGenerationJob);
}

export async function getGenerationJobForUser({ userId, jobId }) {
  const rows = await query(
    `SELECT *
    FROM generation_jobs
    WHERE id = ? AND user_id = ? AND deleted_at IS NULL
    LIMIT 1`,
    [jobId, userId],
  );
  return rows[0] ? mapGenerationJob(rows[0]) : null;
}

export async function createGenerationJob({
  userId,
  agentId = "model-3d",
  kind = "3d_model",
  inputType,
  prompt,
  sourceAssetId = null,
  provider = "meshy",
  providerTaskId = "",
  status = "queued",
  progress = 0,
  requestPayload = {},
  resultPayload = {},
  errorMessage = "",
}) {
  const id = crypto.randomUUID();
  const rows = await query(
    `INSERT INTO generation_jobs
      (
        id, user_id, agent_id, kind, input_type, prompt, source_asset_id,
        provider, provider_task_id, status, progress, request_payload, result_payload,
        error_message, finished_at
      )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?::jsonb, ?::jsonb, ?, CASE WHEN ?::text IN ('succeeded', 'failed', 'cancelled', 'blocked') THEN CURRENT_TIMESTAMP ELSE NULL END)
    RETURNING *`,
    [
      id,
      userId,
      agentId,
      kind,
      inputType,
      prompt,
      sourceAssetId,
      provider,
      providerTaskId || null,
      status,
      progress,
      JSON.stringify(requestPayload),
      JSON.stringify(resultPayload),
      errorMessage || null,
      status,
    ],
  );
  return mapGenerationJob(rows[0]);
}

export async function updateGenerationJob({
  userId,
  jobId,
  status,
  progress = null,
  providerTaskId = null,
  requestPayload = null,
  resultPayload = null,
  errorMessage = null,
}) {
  const rows = await query(
    `UPDATE generation_jobs
    SET
      status = COALESCE(?::text, status),
      progress = COALESCE(?::integer, progress),
      provider_task_id = COALESCE(?::text, provider_task_id),
      request_payload = CASE WHEN ?::jsonb IS NULL THEN request_payload ELSE ?::jsonb END,
      result_payload = CASE WHEN ?::jsonb IS NULL THEN result_payload ELSE ?::jsonb END,
      error_message = COALESCE(?::text, error_message),
      finished_at = CASE
        WHEN COALESCE(?::text, status) IN ('succeeded', 'failed', 'cancelled', 'blocked') THEN COALESCE(finished_at, CURRENT_TIMESTAMP)
        ELSE finished_at
      END
    WHERE id = ? AND user_id = ? AND deleted_at IS NULL
    RETURNING *`,
    [
      status || null,
      progress,
      providerTaskId || null,
      requestPayload === null ? null : JSON.stringify(requestPayload),
      requestPayload === null ? null : JSON.stringify(requestPayload),
      resultPayload === null ? null : JSON.stringify(resultPayload),
      resultPayload === null ? null : JSON.stringify(resultPayload),
      errorMessage,
      status || null,
      jobId,
      userId,
    ],
  );
  if (!rows.length) throw new HttpError(404, "Generation job not found");
  return mapGenerationJob(rows[0]);
}

export async function upsertStationModelAsset({
  userId,
  generationJobId,
  title,
  provider = "meshy",
  providerTaskId = "",
  modelFiles = {},
  thumbnail = null,
  metadata = {},
}) {
  const id = crypto.randomUUID();
  const rows = await query(
    `INSERT INTO station_model_assets
      (
        id, user_id, generation_job_id, title, provider, provider_task_id,
        model_files, thumbnail, metadata, status
      )
    VALUES (?, ?, ?, ?, ?, ?, ?::jsonb, ?::jsonb, ?::jsonb, 'active')
    ON CONFLICT (generation_job_id)
    DO UPDATE SET
      title = EXCLUDED.title,
      provider = EXCLUDED.provider,
      provider_task_id = EXCLUDED.provider_task_id,
      model_files = EXCLUDED.model_files,
      thumbnail = EXCLUDED.thumbnail,
      metadata = EXCLUDED.metadata,
      status = 'active',
      deleted_at = NULL
    RETURNING *`,
    [
      id,
      userId,
      generationJobId,
      String(title || "3D 模型").trim().slice(0, 160) || "3D 模型",
      provider,
      providerTaskId || null,
      JSON.stringify(modelFiles),
      JSON.stringify(thumbnail),
      JSON.stringify(metadata),
    ],
  );
  return mapStationModelAsset(rows[0]);
}

export async function listFileAssetsForUser(userId, limit = 30) {
  const safeLimit = sqlLimit(limit, 30, 100);
  const rows = await query(
    `SELECT *
    FROM file_assets
    WHERE user_id = ? AND deleted_at IS NULL
    ORDER BY created_at DESC
    LIMIT ${safeLimit}`,
    [userId],
  );
  return rows.map(mapFileAsset);
}

export async function listFileAssetsByIdsForUser({ userId, fileAssetIds = [] }) {
  const ids = Array.from(new Set(fileAssetIds.filter(Boolean)));
  if (!ids.length) return [];
  const rows = await query(
    `SELECT *
    FROM file_assets
    WHERE user_id = ? AND id = ANY(?::text[]) AND deleted_at IS NULL`,
    [userId, ids],
  );
  const byId = new Map(rows.map((row) => [row.id, mapFileAsset(row)]));
  return ids.map((id) => byId.get(id)).filter(Boolean);
}

export async function getFileAssetForUser({ userId, fileAssetId }) {
  const rows = await query(
    `SELECT *
    FROM file_assets
    WHERE id = ? AND user_id = ? AND deleted_at IS NULL
    LIMIT 1`,
    [fileAssetId, userId],
  );
  return rows[0] ? mapFileAsset(rows[0]) : null;
}

export async function createFileAsset({
  userId,
  originalFilename,
  mimeType = "",
  byteSize = null,
  checksumSha256 = "",
  storageProvider = "inline",
  storageKey = "",
  sourceKind = "inline_text",
  status = "processed",
  preprocessingResult = {},
  metadata = {},
}) {
  const id = crypto.randomUUID();
  const rows = await query(
    `INSERT INTO file_assets
      (
        id, user_id, original_filename, mime_type, byte_size, checksum_sha256,
        storage_provider, storage_key, source_kind, status, preprocessing_result, metadata
      )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?::jsonb, ?::jsonb)
    RETURNING *`,
    [
      id,
      userId,
      originalFilename,
      mimeType,
      byteSize,
      checksumSha256 || null,
      storageProvider,
      storageKey || null,
      sourceKind,
      status,
      JSON.stringify(preprocessingResult),
      JSON.stringify(metadata),
    ],
  );
  return mapFileAsset(rows[0]);
}

export async function updateFileAssetPreprocessing({
  userId,
  fileAssetId,
  status,
  preprocessingResult = {},
  checksumSha256 = "",
}) {
  const rows = await query(
    `UPDATE file_assets
    SET
      status = ?,
      preprocessing_result = ?::jsonb,
      checksum_sha256 = COALESCE(?::text, checksum_sha256)
    WHERE id = ? AND user_id = ? AND deleted_at IS NULL
    RETURNING *`,
    [
      status,
      JSON.stringify(preprocessingResult),
      checksumSha256 || null,
      fileAssetId,
      userId,
    ],
  );
  if (!rows.length) throw new HttpError(404, "File asset not found");
  return mapFileAsset(rows[0]);
}

export async function listStationComicDiariesForUser(userId, limit = 20) {
  const safeLimit = sqlLimit(limit, 20, 50);
  const rows = await query(
    `SELECT *
    FROM station_comic_diaries
    WHERE user_id = ? AND deleted_at IS NULL
    ORDER BY created_at DESC
    LIMIT ${safeLimit}`,
    [userId],
  );
  return rows.map(mapStationComicDiary);
}

export async function getStationComicDiaryForUser({ userId, comicDiaryId }) {
  const rows = await query(
    `SELECT *
    FROM station_comic_diaries
    WHERE id = ? AND user_id = ? AND deleted_at IS NULL
    LIMIT 1`,
    [comicDiaryId, userId],
  );
  return rows[0] ? mapStationComicDiary(rows[0]) : null;
}

export async function createStationComicDiary({
  userId,
  title,
  prompt,
  style = "slice-of-life",
  sourceDiaryEntryId = null,
  sourceMediaAssetIds = [],
  sourceFileAssetIds = [],
  frames = [],
  summary = "",
  metadata = {},
}) {
  const id = crypto.randomUUID();
  const rows = await query(
    `INSERT INTO station_comic_diaries
      (
        id, user_id, title, prompt, style, source_diary_entry_id,
        source_media_asset_ids, source_file_asset_ids, frames, summary, metadata
      )
    VALUES (?, ?, ?, ?, ?, ?, ?::jsonb, ?::jsonb, ?::jsonb, ?, ?::jsonb)
    RETURNING *`,
    [
      id,
      userId,
      String(title || "漫画日记").trim().slice(0, 160) || "漫画日记",
      prompt,
      style,
      sourceDiaryEntryId || null,
      JSON.stringify(sourceMediaAssetIds),
      JSON.stringify(sourceFileAssetIds),
      JSON.stringify(frames),
      summary || "",
      JSON.stringify(metadata),
    ],
  );
  return mapStationComicDiary(rows[0]);
}

export async function deleteStationComicDiaryForUser({ userId, comicDiaryId }) {
  const rows = await query(
    `UPDATE station_comic_diaries
    SET deleted_at = CURRENT_TIMESTAMP,
        updated_at = CURRENT_TIMESTAMP
    WHERE id = ? AND user_id = ? AND deleted_at IS NULL
    RETURNING *`,
    [comicDiaryId, userId],
  );
  if (!rows.length) {
    throw new HttpError(404, "Comic diary not found");
  }
  return mapStationComicDiary(rows[0]);
}

export async function listStationVideoDraftsForUser(userId, limit = 20) {
  const safeLimit = sqlLimit(limit, 20, 50);
  const rows = await query(
    `SELECT *
    FROM station_video_drafts
    WHERE user_id = ? AND deleted_at IS NULL
    ORDER BY created_at DESC
    LIMIT ${safeLimit}`,
    [userId],
  );
  return rows.map(mapStationVideoDraft);
}

export async function createStationVideoDraft({
  userId,
  title,
  prompt,
  format = "short-clip",
  aspectRatio = "9:16",
  durationSeconds = 45,
  sourceDiaryEntryId = null,
  sourceComicDiaryId = null,
  sourceMediaAssetIds = [],
  sourceFileAssetIds = [],
  script = {},
  shots = [],
  summary = "",
  metadata = {},
}) {
  const id = crypto.randomUUID();
  const rows = await query(
    `INSERT INTO station_video_drafts
      (
        id, user_id, title, prompt, format, aspect_ratio, duration_seconds,
        source_diary_entry_id, source_comic_diary_id, source_media_asset_ids,
        source_file_asset_ids, script, shots, summary, metadata
      )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?::jsonb, ?::jsonb, ?::jsonb, ?::jsonb, ?, ?::jsonb)
    RETURNING *`,
    [
      id,
      userId,
      String(title || "视频草稿").trim().slice(0, 160) || "视频草稿",
      prompt,
      format,
      aspectRatio,
      durationSeconds,
      sourceDiaryEntryId || null,
      sourceComicDiaryId || null,
      JSON.stringify(sourceMediaAssetIds),
      JSON.stringify(sourceFileAssetIds),
      JSON.stringify(script),
      JSON.stringify(shots),
      summary || "",
      JSON.stringify(metadata),
    ],
  );
  return mapStationVideoDraft(rows[0]);
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
