import crypto from "crypto";
import { query, withTransaction } from "./db.js";
import { HttpError } from "./http-error.js";
import {
  mapFileAsset,
  mapStationComicDiary,
  mapStationSiteDraft,
  mapStationVideoDraft,
  sqlLimit,
} from "./repository-mappers.js";
import { getProfileForUser } from "./station-profile-repository.js";

export async function listStationSiteDraftsForUser(userId, limit = 20) {
  const safeLimit = sqlLimit(limit, 20, 50);
  const rows = await query(
    `SELECT *
    FROM station_site_drafts
    WHERE user_id = ? AND source = 'model' AND deleted_at IS NULL
    ORDER BY created_at DESC
    LIMIT ${safeLimit}`,
    [userId],
  );
  return rows.map(mapStationSiteDraft);
}

export async function createStationSiteDraft({
  userId,
  prompt,
  draft,
  source = "model",
  model = {},
}) {
  if (source !== "model") {
    throw new HttpError(500, "Station site drafts require a model result.", {
      code: "INVALID_SITE_DRAFT_SOURCE",
    });
  }
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
      source,
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
      WHERE id = ? AND user_id = ? AND source = 'model' AND deleted_at IS NULL
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
