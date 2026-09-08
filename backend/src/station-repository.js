import crypto from "crypto";
import { query, withTransaction } from "./db.js";
import { HttpError } from "./http-error.js";
import {
  mapFileAsset,
  mapStationAlbum,
  mapStationComicDiary,
  mapStationDiaryEntry,
  mapStationMediaAsset,
  mapStationOutfit,
  mapStationPost,
  mapStationSiteDraft,
  mapStationVideoDraft,
  sqlLimit,
} from "./repository-mappers.js";

export {
  getProfileForUser,
  getProfileVisibility,
  getPublicProfileByAiId,
  listMiaoPointLedger,
  updateProfileVisibility,
  updateUserProfile,
  updateUserStationConfig,
} from "./station-profile-repository.js";
export {
  createStationAlbum,
  createStationDiaryEntry,
  createStationMediaAsset,
  createStationOutfit,
  deleteStationAlbum,
  deleteStationDiaryEntry,
  deleteStationMediaAsset,
  getStationDiaryEntryForUser,
  getStationMediaAssetForUser,
  listStationMediaAssetsByIdsForUser,
  listStationAlbumMediaAssetsForUser,
  listStationMediaAssetsForUser,
  markStationMediaAssetUploaded,
  moveMediaAssetsToAlbum,
  prepareStationMediaAssetUpload,
  updateStationAlbum,
  updateStationDiaryEntry,
  updateStationMediaAsset,
  updateStationMediaAssetTags,
} from "./station-library-repository.js";
export {
  applyStationSiteDraft,
  createFileAsset,
  createStationComicDiary,
  createStationSiteDraft,
  createStationVideoDraft,
  deleteStationComicDiaryForUser,
  getFileAssetForUser,
  getStationComicDiaryForUser,
  listFileAssetsByIdsForUser,
  listFileAssetsForUser,
  listStationComicDiariesForUser,
  listStationSiteDraftsForUser,
  listStationVideoDraftsForUser,
  updateFileAssetPreprocessing,
} from "./station-agent-repository.js";

async function listStationPostsForUser(userId, limit = 40) {
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
      WHERE user_id = ? AND source = 'model' AND deleted_at IS NULL
      ORDER BY created_at DESC
      LIMIT 10`,
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
