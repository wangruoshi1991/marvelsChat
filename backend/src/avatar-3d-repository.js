import crypto from "node:crypto";
import { createAvatar3dModelRepository } from "./avatar-3d-model-repository.js";
import { createAvatar3dPrivateAssetRepository } from "./avatar-3d-private-asset-repository.js";
import { createAvatar3dReferenceRepository } from "./avatar-3d-reference-repository.js";
import { query, withTransaction } from "./db.js";
import { HttpError } from "./http-error.js";
import {
  avatar3dNextStatuses,
  mapAvatar3dPhoto,
  mapPrivateJob,
  mapPrivatePhoto,
  mapReferenceSet,
  terminalAvatar3dStatuses,
} from "./avatar-3d-repository-mappers.js";
import {
  mapAvatar3dJob,
  sqlLimit,
} from "./repository-mappers.js";

export function createAvatar3dRepository({
  queryFn = query,
  transactionFn = withTransaction,
  randomUUID = crypto.randomUUID,
} = {}) {
  const referenceRepository = createAvatar3dReferenceRepository({
    queryFn,
    transactionFn,
    randomUUID,
  });
  const modelRepository = createAvatar3dModelRepository({ queryFn, randomUUID });
  const privateAssetRepository = createAvatar3dPrivateAssetRepository({
    queryFn,
    transactionFn,
  });

  const createFaceFirstJob = async ({
    userId,
    idempotencyKeyHash,
    sourcePhotoId,
    prompt = "",
    promptPlan,
    promptPlanVersion,
    qualityPreset,
    geometryQuality,
    textureQuality,
    acceptedCostVersion,
    estimatedCostFen,
    referenceCostVersion,
    referenceEstimatedCostFen,
    acceptedFaceComparison = true,
    acceptedAdultSubject,
    consentVersion,
    dailyLimit,
  }) => {
    let result;
    await transactionFn(async (connection) => {
      const [existingRows] = await connection.execute(
        `SELECT * FROM avatar_3d_jobs
        WHERE user_id = ? AND idempotency_key_hash = ?
          AND generation_mode = 'face_first_multiview' AND deleted_at IS NULL
        LIMIT 1 FOR UPDATE`,
        [userId, idempotencyKeyHash],
      );
      if (existingRows.length) {
        const existingJob = existingRows[0];
        const [referenceRows] = await connection.execute(
          `SELECT * FROM avatar_3d_reference_sets
          WHERE job_id = ? AND user_id = ? AND deleted_at IS NULL
          LIMIT 1`,
          [existingJob.id, userId],
        );
        result = {
          created: false,
          job: mapAvatar3dJob(existingJob),
          referenceSet: referenceRows[0] ? mapReferenceSet(referenceRows[0]) : null,
        };
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
              'queued_references', 'submitting_references', 'processing_references',
              'persisting_references', 'awaiting_reference_confirmation',
              'queued_3d', 'submitting_3d', 'processing_3d', 'persisting'
            )
          ) AS active_count
        FROM avatar_3d_jobs
        WHERE user_id = ? AND generation_mode = 'face_first_multiview'
          AND deleted_at IS NULL`,
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

      const [photoRows] = await connection.execute(
        `SELECT * FROM avatar_3d_job_photos
        WHERE id = ? AND user_id = ? AND status = 'ready'
          AND job_id IS NULL AND deleted_at IS NULL
        LIMIT 1 FOR UPDATE`,
        [sourcePhotoId, userId],
      );
      if (!photoRows.length) {
        throw new HttpError(409, "Avatar photo is unavailable.", {
          code: "PHOTO_NOT_READY",
        });
      }

      const jobId = randomUUID();
      const referenceSetId = randomUUID();
      const serializedPromptPlan = JSON.stringify(promptPlan || {});
      const [jobRows] = await connection.execute(
        `INSERT INTO avatar_3d_jobs
          (id, user_id, idempotency_key_hash, style, status, quality_preset,
           geometry_quality, texture_quality, photo_count, accepted_cost_version,
           estimated_cost_fen, generation_mode, model_provider, prompt, prompt_plan,
           prompt_plan_version, source_photo_id, accepted_face_comparison,
           accepted_adult_subject, consent_version)
        VALUES (?, ?, ?, 'realistic', 'queued_references', ?, ?, ?, 1, ?, ?,
          'face_first_multiview', 'tripo', ?, ?::jsonb, ?, ?, ?, ?, ?)
        RETURNING *`,
        [
          jobId, userId, idempotencyKeyHash, qualityPreset, geometryQuality,
          textureQuality, acceptedCostVersion, estimatedCostFen, prompt,
          serializedPromptPlan, promptPlanVersion, sourcePhotoId,
          Boolean(acceptedFaceComparison), Boolean(acceptedAdultSubject), consentVersion,
        ],
      );
      const [assignedPhotos] = await connection.execute(
        `UPDATE avatar_3d_job_photos
        SET job_id = ?, view = 'front'
        WHERE id = ? AND user_id = ? AND status = 'ready'
          AND job_id IS NULL AND deleted_at IS NULL
        RETURNING id`,
        [jobId, sourcePhotoId, userId],
      );
      if (!assignedPhotos.length) {
        throw new HttpError(409, "Avatar photo assignment changed.", {
          code: "PHOTO_ASSIGNMENT_CONFLICT",
        });
      }
      const [referenceRows] = await connection.execute(
        `INSERT INTO avatar_3d_reference_sets
          (id, user_id, job_id, source_photo_id, prompt_plan, prompt_plan_version,
           cost_version, estimated_cost_fen)
        VALUES (?, ?, ?, ?, ?::jsonb, ?, ?, ?)
        RETURNING *`,
        [
          referenceSetId, userId, jobId, sourcePhotoId, serializedPromptPlan,
          promptPlanVersion, referenceCostVersion, referenceEstimatedCostFen,
        ],
      );
      const [linkedJobs] = await connection.execute(
        `UPDATE avatar_3d_jobs
        SET reference_set_id = ?
        WHERE id = ? AND user_id = ? AND reference_set_id IS NULL
        RETURNING *`,
        [referenceSetId, jobId, userId],
      );
      if (!linkedJobs.length) {
        throw new HttpError(409, "Avatar reference state changed.", {
          code: "REFERENCE_SET_STATE_CHANGED",
        });
      }
      result = {
        created: true,
        job: mapAvatar3dJob(linkedJobs[0] || jobRows[0]),
        referenceSet: mapReferenceSet(referenceRows[0]),
      };
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
            'queued_references', 'submitting_references', 'processing_references',
            'persisting_references', 'awaiting_reference_confirmation',
            'queued_3d', 'submitting_3d', 'processing_3d', 'persisting'
          )
        ) AS active_count
      FROM avatar_3d_jobs
      WHERE user_id = ? AND generation_mode = 'face_first_multiview'
        AND deleted_at IS NULL`,
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
        (id, user_id, original_filename, source_mime_type, source_byte_size,
         source_storage_key, retention_until)
      VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP + INTERVAL '1 day')
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
        normalized_byte_size = ?, width = ?, height = ?,
        quality_status = ?, quality_metadata = ?, safe_error_code = NULL
      WHERE id = ? AND user_id = ? AND status IN ('uploading', 'uploaded')
        AND job_id IS NULL AND deleted_at IS NULL
      RETURNING *`,
      [
        normalized.storageKey, normalized.contentType, normalized.byteSize,
        normalized.width, normalized.height, normalized.quality.status,
        JSON.stringify(normalized.quality.metadata), photoId, userId,
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

  const getJob = async ({ userId, jobId, includePrivate = false }) => {
    const rows = await queryFn(
      `SELECT * FROM avatar_3d_jobs
      WHERE id = ? AND user_id = ? AND generation_mode = 'face_first_multiview'
        AND deleted_at IS NULL
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
      WHERE user_id = ? AND generation_mode = 'face_first_multiview'
        AND deleted_at IS NULL
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
        WHERE generation_mode = 'face_first_multiview' AND deleted_at IS NULL
          AND status IN (
            'queued_references', 'submitting_references', 'processing_references', 'persisting_references',
            'queued_3d', 'submitting_3d', 'processing_3d', 'persisting'
          )
          AND (claimed_at IS NULL OR claimed_at < ?)
        ORDER BY updated_at ASC
        FOR UPDATE SKIP LOCKED
        LIMIT ${safeLimit}
      )
      UPDATE avatar_3d_jobs AS job
      SET claimed_at = date_trunc('milliseconds', CURRENT_TIMESTAMP)
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
    modelProviderTaskId,
    providerStatus,
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
      ["model_provider_task_id", modelProviderTaskId],
      ["provider_status", providerStatus],
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
    if (terminalAvatar3dStatuses.has(toStatus)) {
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
    modelProviderTaskId,
    providerStatus,
  }) => {
    const assignments = ["claimed_at = NULL"];
    const params = [];
    for (const [column, value] of [
      ["progress", progress],
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

  return {
    createFaceFirstJob,
    getQuotaState,
    createPhoto,
    getPhoto,
    completePhoto,
    deletePhotoRecord,
    getJob,
    listJobs,
    claimNextStep,
    transitionJob,
    updateJobProgress,
    releaseJobClaim,
    ...referenceRepository,
    ...modelRepository,
    ...privateAssetRepository,
    transactionFn,
    mapPrivatePhoto,
  };
}

export const avatar3dRepository = createAvatar3dRepository();
