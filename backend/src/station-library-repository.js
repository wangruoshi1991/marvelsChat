import crypto from "crypto";
import { normalizeAvatarConfig } from "./avatar-service.js";
import { query, withTransaction } from "./db.js";
import { HttpError } from "./http-error.js";
import {
  mapStationAlbum,
  mapStationDiaryEntry,
  mapStationMediaAsset,
  mapStationOutfit,
  sqlLimit,
} from "./repository-mappers.js";

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
