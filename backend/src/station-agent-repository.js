import crypto from "crypto";
import { query, withTransaction } from "./db.js";
import { HttpError } from "./http-error.js";
import {
  mapFileAsset,
  mapStationComicDiary,
  mapStationSiteDraft,
  mapStationSiteDraftRecord,
  mapStationVideoDraft,
  sqlLimit,
} from "./repository-mappers.js";
import { getProfileForUser } from "./station-profile-repository.js";
import { validateSiteDraftContent } from "./site-builder-service.js";
import { readSiteDocumentResources, validateStoredSiteDocument } from "./site-document-repository.js";

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
  connection = null,
  workspaceNodeId = null,
}) {
  if (source !== "model") {
    throw new HttpError(500, "Station site drafts require a model result.", {
      code: "INVALID_SITE_DRAFT_SOURCE",
    });
  }
  validateSiteDraftContent(draft);
  const id = crypto.randomUUID();
  const document = {
    schemaVersion: 2, documentId: id, revision: 1, visibility: "private",
    ...draft, sections: draft.sections.map(section => ({ id: crypto.randomUUID(), ...section })),
  };
  validateStoredSiteDocument(document, id);
  const save = async target => {
    if (workspaceNodeId !== null) {
      if (!connection) throw new HttpError(409, "Workspace drafts must be saved with their node transaction.", { code: "WORKSPACE_SITE_BINDING_INVALID" });
      const [node] = await target.query(`SELECT node.id FROM agent_workspace_nodes node
        JOIN agent_workspaces workspace ON workspace.id = node.workspace_id AND workspace.user_id = node.user_id
        WHERE node.id = ? AND node.user_id = ? AND node.agent_id = 'site-builder'
          AND node.capability = 'site.compose' AND node.status = 'succeeded' AND node.result IS NULL
          AND workspace.status = 'running' FOR SHARE OF workspace, node`, [workspaceNodeId, userId]);
      if (!node) throw new HttpError(409, "The page draft has no active owning workspace node.", { code: "WORKSPACE_SITE_BINDING_INVALID" });
    }
    await readSiteDocumentResources(target, userId, document);
    const rows = await target.query(
      `INSERT INTO station_site_drafts
        (id, user_id, prompt, draft, source, model_provider, model_missing, model_error, workspace_node_id)
      VALUES (?, ?, ?, ?::jsonb, ?, ?, ?::jsonb, ?, ?)
      RETURNING *`,
      [
        id,
        userId,
        prompt,
        JSON.stringify(document),
        source,
        model.provider || "",
        JSON.stringify(Array.isArray(model.missing) ? model.missing : []),
        model.error || "",
        workspaceNodeId,
      ],
    );
    return mapStationSiteDraftRecord(rows[0]);
  };
  return connection ? save(connection) : withTransaction(save);
}

export async function applyStationSiteDraft({ userId, draftId, connection: existingConnection = null, workspaceNodeId = null }) {
  let siteDraft = null;

  const apply = async (connection) => {
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
    if ((rows[0].workspace_node_id ?? null) !== workspaceNodeId) {
      throw new HttpError(409, "This page requires confirmation in its owning workspace.", { code: "WORKSPACE_SITE_CONFIRMATION_REQUIRED" });
    }

    const draft = validateStoredSiteDocument(rows[0].draft, rows[0].id);
    await readSiteDocumentResources(connection, userId, draft);
    await connection.execute(
      `UPDATE station_site_drafts
      SET status = 'draft'
      WHERE user_id = ? AND status = 'applied' AND id <> ?`,
      [userId, draftId],
    );
    const [updatedRows] = await connection.execute(
      `UPDATE station_site_drafts
      SET status = 'applied', workspace_node_id = NULL
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

    siteDraft = mapStationSiteDraftRecord(updatedRows[0]);
  };

  if (existingConnection) {
    await apply(existingConnection);
    return { siteDraft };
  }
  await withTransaction(apply);

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

export async function createStationComicDiary(
  {
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
  },
  queryFn = query,
) {
  if (typeof title !== "string" || !title.trim() || title.trim().length > 120) {
    throw new HttpError(500, "Comic diary title is invalid.", { code: "INVALID_COMIC_DIARY_TITLE" });
  }
  const id = crypto.randomUUID();
  const rows = await queryFn(
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
      title.trim(),
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
