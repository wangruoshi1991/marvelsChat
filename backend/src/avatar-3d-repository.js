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

  const createJobWithPhotos = async ({
    userId,
    idempotencyKeyHash,
    style,
    photos,
    acceptedCostVersion,
    estimatedCostFen,
    dailyLimit,
  }) => {
    let result;
    await transactionFn(async (connection) => {
      const [existingRows] = await connection.execute(
        `SELECT * FROM avatar_3d_jobs
        WHERE user_id = ? AND idempotency_key_hash = ? AND deleted_at IS NULL
        LIMIT 1 FOR UPDATE`,
        [userId, idempotencyKeyHash],
      );
      if (existingRows.length) {
        result = { created: false, job: mapAvatar3dJob(existingRows[0]) };
        return;
      }

      const [userRows] = await connection.execute(
        "SELECT id FROM users WHERE id = ? LIMIT 1 FOR UPDATE",
        [userId],
      );
      if (!userRows.length) throw new HttpError(404, "Account not found.");

      const [quotaRows] = await connection.execute(
        `SELECT
          COUNT(*) FILTER (
            WHERE created_at >= date_trunc('day', CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Shanghai')
              AT TIME ZONE 'Asia/Shanghai'
          ) AS daily_used,
          COUNT(*) FILTER (
            WHERE status IN (
              'queued_style', 'processing_style', 'awaiting_style_confirmation',
              'queued_3d', 'submitting_3d', 'processing_3d', 'persisting'
            )
          ) AS active_count
        FROM avatar_3d_jobs
        WHERE user_id = ? AND deleted_at IS NULL`,
        [userId],
      );
      if (Number(quotaRows[0]?.active_count || 0) > 0) {
        throw new HttpError(409, "Another avatar task is already active.", {
          code: "ACTIVE_JOB_EXISTS",
        });
      }
      if (Number(quotaRows[0]?.daily_used || 0) >= Number(dailyLimit)) {
        throw new HttpError(429, "Daily avatar generation limit reached.", {
          code: "DAILY_LIMIT_REACHED",
        });
      }

      const photoIds = photos.map((photo) => photo.photoId);
      const [photoRows] = await connection.execute(
        `SELECT * FROM avatar_3d_job_photos
        WHERE user_id = ? AND id::text = ANY(?::text[])
          AND status = 'ready' AND job_id IS NULL AND deleted_at IS NULL
        FOR UPDATE`,
        [userId, photoIds],
      );
      if (photoRows.length !== photoIds.length) {
        throw new HttpError(409, "One or more avatar photos are unavailable.", {
          code: "PHOTO_NOT_READY",
        });
      }

      const jobId = randomUUID();
      const initialStatus = style === "cartoon" ? "queued_style" : "queued_3d";
      const [jobRows] = await connection.execute(
        `INSERT INTO avatar_3d_jobs
          (id, user_id, idempotency_key_hash, style, status, photo_count,
           accepted_cost_version, estimated_cost_fen)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        RETURNING *`,
        [
          jobId, userId, idempotencyKeyHash, style, initialStatus, photos.length,
          acceptedCostVersion, estimatedCostFen,
        ],
      );
      for (const photo of photos) {
        const [updatedRows] = await connection.execute(
          `UPDATE avatar_3d_job_photos
          SET job_id = ?, view = ?
          WHERE id = ? AND user_id = ? AND status = 'ready' AND job_id IS NULL
          RETURNING id`,
          [jobId, photo.view, photo.photoId, userId],
        );
        if (!updatedRows.length) {
          throw new HttpError(409, "Avatar photo assignment changed.", {
            code: "PHOTO_ASSIGNMENT_CONFLICT",
          });
        }
      }
      result = { created: true, job: mapAvatar3dJob(jobRows[0]) };
    });
    return result;
  };

  const getQuotaState = async ({ userId }) => {
    const rows = await queryFn(
      `SELECT
        COUNT(*) FILTER (
          WHERE created_at >= date_trunc('day', CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Shanghai')
            AT TIME ZONE 'Asia/Shanghai'
        ) AS daily_used,
        COUNT(*) FILTER (
          WHERE status IN (
            'queued_style', 'processing_style', 'awaiting_style_confirmation',
            'queued_3d', 'submitting_3d', 'processing_3d', 'persisting'
          )
        ) AS active_count
      FROM avatar_3d_jobs
      WHERE user_id = ? AND deleted_at IS NULL`,
      [userId],
    );
    return {
      dailyUsed: Number(rows[0]?.daily_used || 0),
      hasActiveJob: Number(rows[0]?.active_count || 0) > 0,
    };
  };

  const createPhoto = async ({
    id = randomUUID(),
    userId,
    originalFilename,
    mimeType,
    byteSize,
    sourceStorageKey,
  }) => {
    const rows = await queryFn(
      `INSERT INTO avatar_3d_job_photos
        (id, user_id, original_filename, source_mime_type, source_byte_size, source_storage_key)
      VALUES (?, ?, ?, ?, ?, ?)
      RETURNING *`,
      [id, userId, originalFilename, mimeType, byteSize, sourceStorageKey],
    );
    return rows[0] ? mapAvatar3dPhoto(rows[0]) : null;
  };

  const getPhoto = async ({ userId, photoId, includePrivate = false }) => {
    const rows = await queryFn(
      `SELECT * FROM avatar_3d_job_photos
      WHERE id = ? AND user_id = ? AND deleted_at IS NULL
      LIMIT 1`,
      [photoId, userId],
    );
    if (!rows.length) return null;
    return includePrivate ? mapPrivatePhoto(rows[0]) : mapAvatar3dPhoto(rows[0]);
  };

  const completePhoto = async ({ userId, photoId, normalized }) => {
    const rows = await queryFn(
      `UPDATE avatar_3d_job_photos
      SET status = 'ready', normalized_storage_key = ?, normalized_mime_type = ?,
        normalized_byte_size = ?, width = ?, height = ?, safe_error_code = NULL
      WHERE id = ? AND user_id = ? AND status IN ('uploading', 'uploaded')
        AND job_id IS NULL AND deleted_at IS NULL
      RETURNING *`,
      [
        normalized.storageKey, normalized.contentType, normalized.byteSize,
        normalized.width, normalized.height, photoId, userId,
      ],
    );
    return rows[0] ? mapAvatar3dPhoto(rows[0]) : null;
  };

  const deletePhotoRecord = async ({ userId, photoId }) => {
    const rows = await queryFn(
      `UPDATE avatar_3d_job_photos
      SET status = 'deleted', deleted_at = CURRENT_TIMESTAMP
      WHERE id = ? AND user_id = ? AND job_id IS NULL AND deleted_at IS NULL
      RETURNING *`,
      [photoId, userId],
    );
    return rows[0] ? mapAvatar3dPhoto(rows[0]) : null;
  };

  const listJobPhotos = async ({ userId, jobId, includePrivate = false }) => {
    const rows = await queryFn(
      `SELECT * FROM avatar_3d_job_photos
      WHERE user_id = ? AND job_id = ? AND status = 'ready' AND deleted_at IS NULL
      ORDER BY CASE view
        WHEN 'front' THEN 1 WHEN 'left' THEN 2 WHEN 'back' THEN 3 WHEN 'right' THEN 4 ELSE 5 END`,
      [userId, jobId],
    );
    return rows.map(includePrivate ? mapPrivatePhoto : mapAvatar3dPhoto);
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
          AND status IN ('queued_style', 'processing_style', 'queued_3d', 'submitting_3d', 'processing_3d', 'persisting')
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

  const updateJobProgress = async ({
    userId,
    jobId,
    status,
    progress,
    styleProviderTaskId,
    modelProviderTaskId,
    providerStatus,
  }) => {
    const assignments = ["claimed_at = NULL"];
    const params = [];
    for (const [column, value] of [
      ["progress", progress],
      ["style_provider_task_id", styleProviderTaskId],
      ["model_provider_task_id", modelProviderTaskId],
      ["provider_status", providerStatus],
    ]) {
      if (value !== undefined) {
        assignments.push(`${column} = ?`);
        params.push(value);
      }
    }
    params.push(jobId, userId, status);
    const rows = await queryFn(
      `UPDATE avatar_3d_jobs SET ${assignments.join(", ")}
      WHERE id = ? AND user_id = ? AND status = ? AND deleted_at IS NULL
      RETURNING *`,
      params,
    );
    return rows[0] ? mapPrivateJob(rows[0]) : null;
  };

  const releaseJobClaim = async ({ jobId }) => {
    await queryFn(
      "UPDATE avatar_3d_jobs SET claimed_at = NULL WHERE id = ? AND deleted_at IS NULL",
      [jobId],
    );
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
      ON CONFLICT (job_id) DO UPDATE SET
        storage_key = EXCLUDED.storage_key,
        mime_type = EXCLUDED.mime_type,
        byte_size = EXCLUDED.byte_size,
        width = EXCLUDED.width,
        height = EXCLUDED.height,
        status = 'active',
        deleted_at = NULL
      RETURNING *`,
      [
        randomUUID(), userId, jobId, providerTaskId, storageKey, mimeType,
        byteSize, width, height, retentionUntil,
      ],
    );
    return rows[0] ? mapAvatar3dStylePreview(rows[0]) : null;
  };

  const getStylePreview = async ({ userId, jobId, includePrivate = false }) => {
    const rows = await queryFn(
      `SELECT * FROM avatar_3d_style_previews
      WHERE user_id = ? AND job_id = ? AND status = 'active' AND deleted_at IS NULL
      LIMIT 1`,
      [userId, jobId],
    );
    if (!rows.length) return null;
    return includePrivate ? mapPrivatePreview(rows[0]) : mapAvatar3dStylePreview(rows[0]);
  };

  const discardStylePreview = async ({ userId, jobId }) => {
    const rows = await queryFn(
      `UPDATE avatar_3d_style_previews
      SET status = 'discarded'
      WHERE user_id = ? AND job_id = ? AND status = 'active' AND deleted_at IS NULL
      RETURNING *`,
      [userId, jobId],
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
      ON CONFLICT (job_id) DO UPDATE SET
        title = EXCLUDED.title,
        glb_storage_key = EXCLUDED.glb_storage_key,
        glb_mime_type = EXCLUDED.glb_mime_type,
        glb_byte_size = EXCLUDED.glb_byte_size,
        thumbnail_storage_key = EXCLUDED.thumbnail_storage_key,
        thumbnail_mime_type = EXCLUDED.thumbnail_mime_type,
        thumbnail_byte_size = EXCLUDED.thumbnail_byte_size,
        status = 'active',
        deleted_at = NULL
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

  const markJobAssetsRetention = async ({ userId, jobId, retentionUntil }) => {
    await transactionFn(async (connection) => {
      await connection.execute(
        "UPDATE avatar_3d_jobs SET retention_until = ? WHERE id = ? AND user_id = ?",
        [retentionUntil, jobId, userId],
      );
      await connection.execute(
        "UPDATE avatar_3d_job_photos SET retention_until = ? WHERE job_id = ? AND user_id = ?",
        [retentionUntil, jobId, userId],
      );
      await connection.execute(
        "UPDATE avatar_3d_style_previews SET retention_until = ? WHERE job_id = ? AND user_id = ?",
        [retentionUntil, jobId, userId],
      );
    });
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
        WHERE p.deleted_at IS NULL AND p.source_storage_key <> ''
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
        "UPDATE avatar_3d_job_photos SET source_storage_key = '' WHERE id = ?",
        [assetId],
      );
      return;
    }
    if (assetKind === "photo_normalized") {
      await queryFn(
        `UPDATE avatar_3d_job_photos
        SET normalized_storage_key = NULL,
          deleted_at = CASE WHEN source_storage_key = '' THEN CURRENT_TIMESTAMP ELSE deleted_at END
        WHERE id = ?`,
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
    createJobWithPhotos,
    getQuotaState,
    createPhoto,
    getPhoto,
    completePhoto,
    deletePhotoRecord,
    listJobPhotos,
    getJob,
    listJobs,
    claimNextStep,
    transitionJob,
    updateJobProgress,
    releaseJobClaim,
    createStylePreview,
    getStylePreview,
    discardStylePreview,
    createModel,
    listModels,
    getModel,
    deleteModelRecord,
    markJobAssetsRetention,
    listExpiredPrivateAssets,
    markPrivateAssetDeleted,
    transactionFn,
    mapPrivatePhoto,
    mapPrivatePreview,
  };
}

export const avatar3dRepository = createAvatar3dRepository();
