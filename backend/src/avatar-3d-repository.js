import crypto from "node:crypto";
import { query, withTransaction } from "./db.js";
import { HttpError } from "./http-error.js";
import {
  mapAvatar3dJob,
  mapAvatar3dModel,
  mapAvatar3dPhoto,
  mapAvatar3dStylePreview,
  sqlLimit,
  toIso,
} from "./repository-mappers.js";

const terminalStatuses = new Set(["succeeded", "failed", "cancelled", "submission_unknown"]);

export const avatar3dNextStatuses = new Map([
  ["queued_style", new Set(["processing_style", "cancelled"])],
  ["processing_style", new Set(["awaiting_style_confirmation", "failed", "submission_unknown"])],
  ["awaiting_style_confirmation", new Set(["queued_3d", "cancelled"])],
  ["queued_3d", new Set(["submitting_3d", "cancelled"])],
  ["submitting_3d", new Set(["processing_3d", "failed", "submission_unknown"])],
  ["processing_3d", new Set(["persisting", "failed"])],
  ["persisting", new Set(["succeeded", "failed"])],
]);

const mapPrivateJob = (row) => ({
  ...mapAvatar3dJob(row),
  idempotencyKeyHash: row.idempotency_key_hash,
  styleProviderTaskId: row.style_provider_task_id || null,
  modelProviderTaskId: row.model_provider_task_id || null,
  providerStatus: row.provider_status || null,
  claimedAt: toIso(row.claimed_at),
  retentionUntil: toIso(row.retention_until),
});

const mapPrivatePhoto = (row) => ({
  ...mapAvatar3dPhoto(row),
  userId: row.user_id,
  sourceStorageKey: row.source_storage_key,
  normalizedStorageKey: row.normalized_storage_key || null,
  normalizedMimeType: row.normalized_mime_type || null,
  normalizedByteSize: row.normalized_byte_size === null || row.normalized_byte_size === undefined
    ? null
    : Number(row.normalized_byte_size),
  retentionUntil: toIso(row.retention_until),
});

const mapPrivatePreview = (row) => ({
  ...mapAvatar3dStylePreview(row),
  userId: row.user_id,
  providerTaskId: row.provider_task_id || null,
  storageKey: row.storage_key,
  mimeType: row.mime_type,
  retentionUntil: toIso(row.retention_until),
});

const mapPrivateModel = (row) => ({
  ...mapAvatar3dModel(row),
  userId: row.user_id,
  providerTaskId: row.provider_task_id || null,
  glbStorageKey: row.glb_storage_key,
  glbMimeType: row.glb_mime_type,
  thumbnailStorageKey: row.thumbnail_storage_key || null,
  thumbnailMimeType: row.thumbnail_mime_type || null,
  thumbnailByteSize: row.thumbnail_byte_size === null || row.thumbnail_byte_size === undefined
    ? null
    : Number(row.thumbnail_byte_size),
});

export function createAvatar3dRepository({
  queryFn = query,
  transactionFn = withTransaction,
  randomUUID = crypto.randomUUID,
} = {}) {
  const createJob = async ({
    userId,
    idempotencyKeyHash,
    style,
    photoIds,
    acceptedCostVersion,
    estimatedCostFen,
  }) => {
    const jobId = randomUUID();
    const initialStatus = style === "cartoon" ? "queued_style" : "queued_3d";
    const inserted = await queryFn(
      `INSERT INTO avatar_3d_jobs
        (id, user_id, idempotency_key_hash, style, status, photo_count,
         accepted_cost_version, estimated_cost_fen)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT (user_id, idempotency_key_hash) DO NOTHING
      RETURNING *`,
      [
        jobId,
        userId,
        idempotencyKeyHash,
        style,
        initialStatus,
        photoIds.length,
        acceptedCostVersion,
        estimatedCostFen,
      ],
    );
    if (inserted.length) return { created: true, job: mapAvatar3dJob(inserted[0]) };

    const existing = await queryFn(
      `SELECT * FROM avatar_3d_jobs
      WHERE user_id = ? AND idempotency_key_hash = ? AND deleted_at IS NULL
      LIMIT 1`,
      [userId, idempotencyKeyHash],
    );
    if (!existing.length) {
      throw new HttpError(409, "Avatar request could not be recovered.", {
        code: "IDEMPOTENCY_RECOVERY_FAILED",
      });
    }
    return { created: false, job: mapAvatar3dJob(existing[0]) };
  };

  const getJob = async ({ userId, jobId, includePrivate = false }) => {
    const rows = await queryFn(
      `SELECT * FROM avatar_3d_jobs
      WHERE id = ? AND user_id = ? AND deleted_at IS NULL
      LIMIT 1`,
      [jobId, userId],
    );
    if (!rows.length) return null;
    return includePrivate ? mapPrivateJob(rows[0]) : mapAvatar3dJob(rows[0]);
  };

  const listJobs = async ({ userId, limit = 10 }) => {
    const safeLimit = sqlLimit(limit, 10, 30);
    const rows = await queryFn(
      `SELECT * FROM avatar_3d_jobs
      WHERE user_id = ? AND deleted_at IS NULL
      ORDER BY created_at DESC
      LIMIT ${safeLimit}`,
      [userId],
    );
    return rows.map(mapAvatar3dJob);
  };

  const claimNextStep = async ({ staleBefore, limit = 1 } = {}) => {
    const safeLimit = sqlLimit(limit, 1, 2);
    const rows = await queryFn(
      `WITH candidate AS (
        SELECT id
        FROM avatar_3d_jobs
        WHERE deleted_at IS NULL
          AND status IN ('queued_style', 'processing_style', 'queued_3d', 'processing_3d', 'persisting')
          AND (claimed_at IS NULL OR claimed_at < ?)
        ORDER BY updated_at ASC
        FOR UPDATE SKIP LOCKED
        LIMIT ${safeLimit}
      )
      UPDATE avatar_3d_jobs AS job
      SET claimed_at = CURRENT_TIMESTAMP
      FROM candidate
      WHERE job.id = candidate.id
      RETURNING job.*`,
      [staleBefore],
    );
    return rows[0] ? mapPrivateJob(rows[0]) : null;
  };

  const transitionJob = async ({
    userId,
    jobId,
    fromStatus,
    toStatus,
    progress,
    styleProviderTaskId,
    modelProviderTaskId,
    providerStatus,
    stylePreviewId,
    modelId,
    safeErrorCode,
    retentionUntil,
  }) => {
    if (!avatar3dNextStatuses.get(fromStatus)?.has(toStatus)) {
      throw new HttpError(409, "Avatar task state changed.", {
        code: "ILLEGAL_JOB_TRANSITION",
      });
    }

    const assignments = ["status = ?", "claimed_at = NULL"];
    const params = [toStatus];
    const optionalFields = [
      ["progress", progress],
      ["style_provider_task_id", styleProviderTaskId],
      ["model_provider_task_id", modelProviderTaskId],
      ["provider_status", providerStatus],
      ["style_preview_id", stylePreviewId],
      ["model_id", modelId],
      ["safe_error_code", safeErrorCode],
      ["retention_until", retentionUntil],
    ];
    for (const [column, value] of optionalFields) {
      if (value !== undefined) {
        assignments.push(`${column} = ?`);
        params.push(value);
      }
    }
    if (terminalStatuses.has(toStatus)) {
      assignments.push("finished_at = CURRENT_TIMESTAMP");
    }
    params.push(jobId, userId, fromStatus);
    const rows = await queryFn(
      `UPDATE avatar_3d_jobs
      SET ${assignments.join(", ")}
      WHERE id = ? AND user_id = ? AND status = ? AND deleted_at IS NULL
      RETURNING *`,
      params,
    );
    if (!rows.length) {
      throw new HttpError(409, "Avatar task state changed.", { code: "JOB_STATE_CONFLICT" });
    }
    return mapPrivateJob(rows[0]);
  };

  const createStylePreview = async ({
    userId,
    jobId,
    providerTaskId,
    storageKey,
    mimeType,
    byteSize,
    width = null,
    height = null,
    retentionUntil = null,
  }) => {
    const rows = await queryFn(
      `INSERT INTO avatar_3d_style_previews
        (id, user_id, job_id, provider_task_id, storage_key, mime_type,
         byte_size, width, height, retention_until)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      RETURNING *`,
      [
        randomUUID(), userId, jobId, providerTaskId, storageKey, mimeType,
        byteSize, width, height, retentionUntil,
      ],
    );
    return rows[0] ? mapAvatar3dStylePreview(rows[0]) : null;
  };

  const createModel = async ({
    userId,
    jobId,
    title,
    providerTaskId,
    glb,
    thumbnail = null,
  }) => {
    const rows = await queryFn(
      `INSERT INTO avatar_3d_models
        (id, user_id, job_id, title, provider_task_id, glb_storage_key,
         glb_mime_type, glb_byte_size, thumbnail_storage_key,
         thumbnail_mime_type, thumbnail_byte_size)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      RETURNING *`,
      [
        randomUUID(), userId, jobId, title, providerTaskId,
        glb.storageKey, glb.contentType, glb.byteSize,
        thumbnail?.storageKey || null,
        thumbnail?.contentType || null,
        thumbnail?.byteSize ?? null,
      ],
    );
    return rows[0] ? mapAvatar3dModel(rows[0]) : null;
  };

  const listModels = async ({ userId, limit = 20 }) => {
    const safeLimit = sqlLimit(limit, 20, 50);
    const rows = await queryFn(
      `SELECT * FROM avatar_3d_models
      WHERE user_id = ? AND status = 'active' AND deleted_at IS NULL
      ORDER BY created_at DESC
      LIMIT ${safeLimit}`,
      [userId],
    );
    return rows.map(mapAvatar3dModel);
  };

  const getModel = async ({ userId, modelId, includePrivate = false }) => {
    const rows = await queryFn(
      `SELECT * FROM avatar_3d_models
      WHERE id = ? AND user_id = ? AND status = 'active' AND deleted_at IS NULL
      LIMIT 1`,
      [modelId, userId],
    );
    if (!rows.length) return null;
    return includePrivate ? mapPrivateModel(rows[0]) : mapAvatar3dModel(rows[0]);
  };

  const deleteModelRecord = async ({ userId, modelId }) => {
    const rows = await queryFn(
      `UPDATE avatar_3d_models
      SET status = 'deleted', deleted_at = CURRENT_TIMESTAMP
      WHERE id = ? AND user_id = ? AND status = 'active' AND deleted_at IS NULL
      RETURNING *`,
      [modelId, userId],
    );
    return rows[0] ? mapAvatar3dModel(rows[0]) : null;
  };

  const listExpiredPrivateAssets = async ({ before, limit = 50 }) => {
    const safeLimit = sqlLimit(limit, 50, 200);
    return queryFn(
      `SELECT asset_kind, asset_id, storage_key
      FROM (
        SELECT 'photo_source' AS asset_kind, p.id AS asset_id, p.source_storage_key AS storage_key,
          p.retention_until
        FROM avatar_3d_job_photos p
        JOIN avatar_3d_jobs j ON j.id = p.job_id AND j.user_id = p.user_id
        WHERE p.deleted_at IS NULL
          AND j.status IN ('succeeded', 'failed', 'cancelled', 'submission_unknown')
        UNION ALL
        SELECT 'photo_normalized', p.id, p.normalized_storage_key, p.retention_until
        FROM avatar_3d_job_photos p
        JOIN avatar_3d_jobs j ON j.id = p.job_id AND j.user_id = p.user_id
        WHERE p.deleted_at IS NULL AND p.normalized_storage_key IS NOT NULL
          AND j.status IN ('succeeded', 'failed', 'cancelled', 'submission_unknown')
        UNION ALL
        SELECT 'style_preview', preview.id, preview.storage_key, preview.retention_until
        FROM avatar_3d_style_previews preview
        JOIN avatar_3d_jobs j ON j.id = preview.job_id AND j.user_id = preview.user_id
        WHERE preview.deleted_at IS NULL
          AND j.status IN ('succeeded', 'failed', 'cancelled', 'submission_unknown')
      ) AS assets
      WHERE retention_until IS NOT NULL AND retention_until <= ?
      ORDER BY retention_until ASC
      LIMIT ${safeLimit}`,
      [before],
    );
  };

  const markPrivateAssetDeleted = async ({ assetKind, assetId }) => {
    if (assetKind === "photo_source") {
      await queryFn(
        "UPDATE avatar_3d_job_photos SET source_storage_key = '', deleted_at = COALESCE(deleted_at, CURRENT_TIMESTAMP) WHERE id = ?",
        [assetId],
      );
      return;
    }
    if (assetKind === "photo_normalized") {
      await queryFn(
        "UPDATE avatar_3d_job_photos SET normalized_storage_key = NULL WHERE id = ?",
        [assetId],
      );
      return;
    }
    if (assetKind === "style_preview") {
      await queryFn(
        "UPDATE avatar_3d_style_previews SET status = 'deleted', deleted_at = CURRENT_TIMESTAMP WHERE id = ?",
        [assetId],
      );
      return;
    }
    throw new HttpError(400, "Unknown avatar asset type.");
  };

  return {
    createJob,
    getJob,
    listJobs,
    claimNextStep,
    transitionJob,
    createStylePreview,
    createModel,
    listModels,
    getModel,
    deleteModelRecord,
    listExpiredPrivateAssets,
    markPrivateAssetDeleted,
    transactionFn,
    mapPrivatePhoto,
    mapPrivatePreview,
  };
}

export const avatar3dRepository = createAvatar3dRepository();
