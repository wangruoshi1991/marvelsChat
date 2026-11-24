import crypto from "crypto";
import { normalizeAvatarConfig } from "./avatar-service.js";
import { query, withTransaction } from "./db.js";
import { HttpError } from "./http-error.js";
import { enqueueStorageCleanup, getStorageCleanup, storageCleanupGraceMs } from "./storage-cleanup-repository.js";
import { createUsageEvent } from "./repositories.js";
import {
  mapStationAlbum,
  mapStationDiaryEntry,
  mapStationMediaAsset,
  mapStationOutfit,
  sqlLimit,
} from "./repository-mappers.js";

export async function createStationDiaryEntry({ userId, title, body, mood = "", visibility = "private", source = "manual" }, queryFn = query) {
  const id = crypto.randomUUID();
  const rows = await queryFn(
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

export async function createStationAlbum({ userId, title, description = "", visibility = "private" }, runQuery = query) {
  const id = crypto.randomUUID();
  const rows = await runQuery(
    `INSERT INTO station_albums
      (id, user_id, title, description, visibility)
    VALUES (?, ?, ?, ?, ?)
    RETURNING *, 0 AS media_count`,
    [id, userId, title, description, visibility],
  );
  return mapStationAlbum(rows[0]);
}

export async function submitStationAlbum({ userId, submissionKey, title, description, visibility, audit }) {
  const requestHash = submissionKey
    ? crypto.createHash("sha256").update(JSON.stringify([title, description, visibility])).digest("hex")
    : null;
  return withTransaction(async connection => {
    if (submissionKey) {
      await connection.query("SELECT pg_advisory_xact_lock(hashtextextended(?, 0))",
        [`station-album:${userId}:${submissionKey}`]);
      const [previous] = await connection.query(
        `SELECT submission.request_hash, album.creation_receipt
        FROM station_album_submissions submission
        LEFT JOIN station_albums album
          ON album.id = submission.album_id AND album.user_id = submission.user_id AND album.deleted_at IS NULL
        WHERE submission.user_id = ? AND submission.submission_key = ?`,
        [userId, submissionKey],
      );
      if (previous) {
        if (previous.request_hash !== requestHash) {
          throw new HttpError(409, "此提交标识已用于不同的相册内容。", {
            code: "STATION_ALBUM_IDEMPOTENCY_CONFLICT",
          });
        }
        if (!previous.creation_receipt) {
          throw new HttpError(410, "该请求创建的相册已删除。", {
            code: "STATION_ALBUM_RECEIPT_UNAVAILABLE",
          });
        }
        return { album: previous.creation_receipt, replayed: true };
      }
    }
    const album = await createStationAlbum({ userId, title, description, visibility }, connection.query);
    if (submissionKey) {
      await connection.query(
        "UPDATE station_albums SET creation_receipt = ?::jsonb WHERE id = ?",
        [JSON.stringify(album), album.id],
      );
      await connection.query(
        `INSERT INTO station_album_submissions (user_id, submission_key, album_id, request_hash) VALUES (?, ?, ?, ?)`,
        [userId, submissionKey, album.id, requestHash],
      );
    }
    await createUsageEvent({
      ...audit,
      userId,
      eventType: "station.album.create",
      targetType: "station_album",
      targetId: album.id,
      payload: { visibility: album.visibility },
    }, connection.query);
    return { album, replayed: false };
  });
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

async function queueStationStorage(connection, { scope, userId, targetId, assets }) {
  const notBefore = new Date(Date.now() + storageCleanupGraceMs);
  await enqueueStorageCleanup(connection, {
    scope, userId, targetId,
    objects: assets.filter(asset => asset.storage_key).map(asset => ({
      provider: asset.storage_provider, objectKey: asset.storage_key, notBefore,
    })),
  });
}

export async function deleteStationAlbum({ userId, albumId, audit }) {
  return withTransaction(async (connection) => {
    const scope = { scope: "station_album", userId, targetId: albumId };
    const rows = await connection.query(
      `SELECT id FROM station_albums
      WHERE id = ? AND user_id = ? AND deleted_at IS NULL
      FOR UPDATE`,
      [albumId, userId],
    );
    if (!rows.length) {
      return Boolean(await getStorageCleanup(connection, scope));
    }
    const assets = await connection.query(
      `SELECT id, storage_provider, storage_key FROM station_media_assets
      WHERE album_id = ? AND user_id = ? AND deleted_at IS NULL ORDER BY id FOR UPDATE`,
      [albumId, userId],
    );
    const changed = await connection.query(
      `UPDATE station_albums SET deleted_at = CURRENT_TIMESTAMP, creation_receipt = NULL
      WHERE id = ? AND user_id = ? AND deleted_at IS NULL RETURNING id`,
      [albumId, userId],
    );
    if (!changed.length) return false;
    await queueStationStorage(connection, { ...scope, assets });
    await connection.query(
      `UPDATE station_media_assets
      SET status = 'deleted', deleted_at = CURRENT_TIMESTAMP
      WHERE album_id = ? AND user_id = ? AND deleted_at IS NULL`,
      [albumId, userId],
    );
    if (audit) await createUsageEvent({
      ...audit, userId, eventType: "station.album.delete", targetType: "station_album", targetId: albumId,
    }, connection.query);
    return true;
  });
}

export async function listStationAlbumMediaAssetsForUser({ userId, albumId }) {
  const rows = await query(
    `SELECT *
    FROM station_media_assets
    WHERE album_id = ? AND user_id = ? AND deleted_at IS NULL
    ORDER BY created_at ASC`,
    [albumId, userId],
  );
  return rows.map(mapStationMediaAsset);
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
}, connection = null) {
  const create = async connection => {
    if (albumId) await lockStationAlbum(connection, { albumId, userId });
    const id = crypto.randomUUID();
    const rows = await connection.query(
    `INSERT INTO station_media_assets
      (id, user_id, album_id, kind, original_filename, mime_type, byte_size, width, height, caption, tags, metadata)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?::jsonb, ?::jsonb)
    RETURNING *`,
    [id, userId, albumId, kind, originalFilename, mimeType, byteSize, width, height, caption, JSON.stringify(tags), JSON.stringify(metadata)],
    );
    return mapStationMediaAsset(rows[0]);
  };
  return connection ? create(connection) : withTransaction(create);
}

async function lockStationAlbum(connection, { albumId, userId }) {
  const [album] = await connection.query(
    "SELECT id FROM station_albums WHERE id = ? AND user_id = ? AND deleted_at IS NULL FOR UPDATE",
    [albumId, userId],
  );
  if (!album) throw new HttpError(404, "Album not found");
}

export async function updateStationMediaAsset({
  userId,
  mediaAssetId,
  albumId,
  caption,
  hasAlbumId,
}) {
  return withTransaction(async (connection) => {
    if (hasAlbumId && albumId) await lockStationAlbum(connection, { albumId, userId });
    const rows = await connection.query(
      `UPDATE station_media_assets
      SET album_id = CASE WHEN ?::boolean THEN ?::text ELSE album_id END,
        caption = COALESCE(?::text, caption)
      WHERE id = ? AND user_id = ? AND deleted_at IS NULL RETURNING *`,
      [Boolean(hasAlbumId), albumId ?? null, caption ?? null, mediaAssetId, userId],
    );
    return rows[0] ? mapStationMediaAsset(rows[0]) : null;
  });
}

export async function deleteStationMediaAsset({ userId, mediaAssetId, audit }) {
  return withTransaction(async (connection) => {
    const scope = { scope: "station_media", userId, targetId: mediaAssetId };
    const [asset] = await connection.query(
      "SELECT * FROM station_media_assets WHERE id = ? AND user_id = ? AND deleted_at IS NULL FOR UPDATE",
      [mediaAssetId, userId],
    );
    if (!asset) return await getStorageCleanup(connection, scope) ? { id: mediaAssetId } : null;
    await queueStationStorage(connection, { ...scope, assets: [asset] });
    const rows = await connection.query(
      `UPDATE station_media_assets SET status = 'deleted', deleted_at = CURRENT_TIMESTAMP
      WHERE id = ? AND user_id = ? AND deleted_at IS NULL RETURNING *`,
      [mediaAssetId, userId],
    );
    if (audit) await createUsageEvent({
      ...audit, userId, eventType: "station.media.delete", targetType: "station_media_asset",
      targetId: mediaAssetId, payload: { albumId: asset.album_id },
    }, connection.query);
    return mapStationMediaAsset(rows[0]);
  });
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

export function createStationMediaAssetViewerReader({ runQuery }) {
  if (typeof runQuery !== "function") {
    throw new TypeError("Station media viewer reader requires a query function");
  }

  return async ({ viewerUserId, mediaAssetId }) => {
    const rows = await runQuery(
      `SELECT asset.*
      FROM station_media_assets asset
      JOIN users owner ON owner.id = asset.user_id
      LEFT JOIN profile_visibility visibility ON visibility.user_id = asset.user_id
      WHERE asset.id = ?
        AND asset.deleted_at IS NULL
        AND (
          asset.user_id = ?
          OR (
            owner.status = 'active'
            AND asset.status = 'uploaded'
            AND asset.storage_key IS NOT NULL
            AND (
              (
                visibility.show_posts = TRUE
                AND EXISTS (
                  SELECT 1
                  FROM station_post_media post_media
                  JOIN station_posts post ON post.id = post_media.post_id
                  WHERE post_media.media_asset_id = asset.id
                    AND post.user_id = asset.user_id
                    AND post.deleted_at IS NULL
                    AND (
                      post.visibility = 'public'
                      OR (
                        post.visibility = 'friends'
                        AND EXISTS (
                          SELECT 1
                          FROM social_relationships relationship
                          WHERE relationship.follower_user_id = ?
                            AND relationship.followed_user_id = asset.user_id
                            AND relationship.relation_type = 'friend'
                            AND relationship.status = 'active'
                        )
                      )
                    )
                )
              )
              OR (
                visibility.show_album = TRUE
                AND EXISTS (
                  SELECT 1
                  FROM station_albums album
                  WHERE album.id = asset.album_id
                    AND album.user_id = asset.user_id
                    AND album.deleted_at IS NULL
                    AND (
                      album.visibility = 'public'
                      OR (
                        album.visibility = 'friends'
                        AND EXISTS (
                          SELECT 1
                          FROM social_relationships relationship
                          WHERE relationship.follower_user_id = ?
                            AND relationship.followed_user_id = asset.user_id
                            AND relationship.relation_type = 'friend'
                            AND relationship.status = 'active'
                        )
                      )
                    )
                )
              )
            )
          )
        )
      LIMIT 1`,
      [mediaAssetId, viewerUserId, viewerUserId, viewerUserId],
    );
    return rows[0] ? mapStationMediaAsset(rows[0]) : null;
  };
}

export const getStationMediaAssetForViewer = createStationMediaAssetViewerReader({
  runQuery: query,
});

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

export async function createStationOutfit({
  userId,
  title,
  note = "",
  avatarConfig = {},
  mediaAssetId = null,
  visibility = "private",
  source = "manual",
}, runQuery = query) {
  if (mediaAssetId) {
    const assets = await runQuery(
      "SELECT id FROM station_media_assets WHERE id = ? AND user_id = ? AND deleted_at IS NULL LIMIT 1",
      [mediaAssetId, userId],
    );
    if (!assets.length) {
      throw new HttpError(404, "Media asset not found");
    }
  }

  const id = crypto.randomUUID();
  const rows = await runQuery(
    `INSERT INTO station_outfits
      (id, user_id, title, note, avatar_config, media_asset_id, visibility, source)
    VALUES (?, ?, ?, ?, ?::jsonb, ?, ?, ?)
    RETURNING *`,
    [id, userId, title, note, JSON.stringify(normalizeAvatarConfig(avatarConfig, userId)), mediaAssetId, visibility, source],
  );
  return mapStationOutfit(rows[0]);
}
