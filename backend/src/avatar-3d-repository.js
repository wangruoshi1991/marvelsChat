import crypto from "node:crypto";
import { query, withTransaction } from "./db.js";
import { HttpError } from "./http-error.js";
import {
  mapAvatar3dJob,
  mapAvatar3dModel,
  mapAvatar3dPhoto as mapSharedAvatar3dPhoto,
  mapAvatar3dStylePreview,
  sqlLimit,
  toIso,
} from "./repository-mappers.js";

const terminalStatuses = new Set([
  "succeeded", "failed", "quality_failed", "cancelled", "submission_unknown",
]);

const attemptQualityStatuses = new Set(["passed", "failed"]);

const mapAvatar3dPhoto = (row) => {
  const {
    qualityStatus: _qualityStatus,
    ...photo
  } = mapSharedAvatar3dPhoto(row);
  return photo;
};

export const avatar3dNextStatuses = new Map([
  ["queued_style", new Set(["processing_style", "cancelled"])],
  ["processing_style", new Set(["awaiting_style_confirmation", "failed", "submission_unknown"])],
  ["awaiting_style_confirmation", new Set(["queued_3d", "cancelled"])],
  ["queued_references", new Set(["submitting_references", "failed", "cancelled"])],
  ["submitting_references", new Set(["processing_references", "failed", "submission_unknown"])],
  ["processing_references", new Set(["persisting_references", "failed"])],
  ["persisting_references", new Set(["awaiting_reference_confirmation", "failed"])],
  ["awaiting_reference_confirmation", new Set(["queued_3d", "cancelled"])],
  ["queued_3d", new Set(["submitting_3d", "cancelled"])],
  ["submitting_3d", new Set(["processing_3d", "failed", "submission_unknown"])],
  ["processing_3d", new Set(["persisting", "failed"])],
  ["persisting", new Set(["succeeded", "failed"])],
  ["queued_generation", new Set(["submitting_generation", "cancelled"])],
  ["submitting_generation", new Set(["processing_generation", "failed", "submission_unknown"])],
  ["processing_generation", new Set(["persisting_assets", "failed"])],
  ["persisting_assets", new Set(["quality_checking", "failed"])],
  ["quality_checking", new Set(["succeeded", "quality_failed", "failed"])],
]);

const referenceSetNextStatuses = new Map([
  ["queued", new Set(["submitting", "rejected", "failed"])],
  ["submitting", new Set(["processing", "failed"])],
  ["processing", new Set(["persisting", "failed"])],
  ["persisting", new Set(["awaiting_confirmation", "failed"])],
  ["awaiting_confirmation", new Set(["accepted", "rejected"])],
]);

const mapPrivateJob = (row) => ({
  ...mapAvatar3dJob(row),
  modelProvider: row.model_provider || "tripo",
  prompt: row.prompt || "",
  promptPlan: row.prompt_plan || null,
  promptPlanVersion: row.prompt_plan_version || null,
  sourcePhotoId: row.source_photo_id || null,
  enhancedPhotoId: row.enhanced_photo_id || null,
  idempotencyKeyHash: row.idempotency_key_hash,
  styleProviderTaskId: row.style_provider_task_id || null,
  modelProviderTaskId: row.model_provider_task_id || null,
  geometryQuality: row.geometry_quality || "standard",
  textureQuality: row.texture_quality || "standard",
  providerStatus: row.provider_status || null,
  qualityMetrics: row.quality_metrics || null,
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
  enhancedStorageKey: row.enhanced_storage_key || null,
  enhancementProviderTaskId: row.enhancement_provider_task_id || null,
  enhancementRequestId: row.enhancement_request_id || null,
  retainForRegeneration: Boolean(row.retain_for_regeneration),
  qualityStatus: row.quality_status || null,
  qualityMetadata: row.quality_metadata || null,
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
  mobileGlbStorageKey: row.mobile_glb_storage_key || null,
  mobileGlbMimeType: row.mobile_glb_mime_type || null,
  mobileGlbByteSize: row.mobile_glb_byte_size === null || row.mobile_glb_byte_size === undefined
    ? null
    : Number(row.mobile_glb_byte_size),
  thumbnailStorageKey: row.thumbnail_storage_key || null,
  thumbnailMimeType: row.thumbnail_mime_type || null,
  thumbnailByteSize: row.thumbnail_byte_size === null || row.thumbnail_byte_size === undefined
    ? null
    : Number(row.thumbnail_byte_size),
  qualityMetrics: row.quality_metrics || null,
});

const mapReferenceSet = (row) => ({
  id: row.id,
  jobId: row.job_id,
  status: row.status,
  expectedImageCount: Number(row.expected_image_count || 4),
  actualImageCount: Number(row.actual_image_count || 0),
  usageImageCount: Number(row.usage_image_count || 0),
  costVersion: row.cost_version || null,
  estimatedCostFen: Number(row.estimated_cost_fen || 0),
  confirmedAt: toIso(row.confirmed_at),
  createdAt: toIso(row.created_at),
  updatedAt: toIso(row.updated_at),
});

const mapPrivateReferenceSet = (row) => ({
  ...mapReferenceSet(row),
  sourcePhotoId: row.source_photo_id || null,
  promptPlan: row.prompt_plan || null,
  promptPlanVersion: row.prompt_plan_version || null,
  userId: row.user_id,
  provider: row.provider,
  providerTaskId: row.provider_task_id || null,
  providerRequestId: row.provider_request_id || null,
  providerStatus: row.provider_status || null,
  retentionUntil: toIso(row.retention_until),
});

const mapReferenceImage = (row) => ({
  id: row.id,
  referenceSetId: row.reference_set_id,
  jobId: row.job_id,
  view: row.view,
  sequenceIndex: Number(row.sequence_index),
  mimeType: row.mime_type,
  byteSize: Number(row.byte_size || 0),
  width: Number(row.width || 0),
  height: Number(row.height || 0),
  status: row.status,
  createdAt: toIso(row.created_at),
  updatedAt: toIso(row.updated_at),
});

const mapPrivateReferenceImage = (row) => ({
  ...mapReferenceImage(row),
  userId: row.user_id,
  storageKey: row.storage_key,
  retentionUntil: toIso(row.retention_until),
});

export const mapPublicGenerationAttempt = (row) => ({
  id: row.id,
  jobId: row.job_id,
  attemptNumber: Number(row.attempt_number || 0),
  kind: row.kind,
  modelProvider: row.model_provider || "tripo",
  sourcePhotoId: row.source_photo_id || null,
  status: row.status,
  qualityStatus: row.quality_status || null,
  qualityReasonCode: row.quality_reason_code || null,
  submittedAt: toIso(row.submitted_at),
  completedAt: toIso(row.completed_at),
  createdAt: toIso(row.created_at),
  updatedAt: toIso(row.updated_at),
});

export const mapPrivateGenerationAttempt = (row) => ({
  ...mapPublicGenerationAttempt(row),
  providerTaskId: row.provider_task_id || null,
  providerRequestId: row.provider_request_id || null,
  artifactManifest: row.artifact_manifest || null,
  qualityMetrics: row.quality_metrics || null,
  billingDisposition: row.billing_disposition || null,
  rawError: row.raw_error || row.provider_error || null,
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
    qualityPreset,
    geometryQuality,
    textureQuality,
    photoIds,
    acceptedCostVersion,
    estimatedCostFen,
  }) => {
    const jobId = randomUUID();
    const initialStatus = style === "cartoon" ? "queued_style" : "queued_3d";
    const inserted = await queryFn(
      `INSERT INTO avatar_3d_jobs
        (id, user_id, idempotency_key_hash, style, status, quality_preset,
         geometry_quality, texture_quality, photo_count, accepted_cost_version,
         estimated_cost_fen)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT (user_id, idempotency_key_hash) DO NOTHING
      RETURNING *`,
      [
        jobId,
        userId,
        idempotencyKeyHash,
        style,
        initialStatus,
        qualityPreset,
        geometryQuality,
        textureQuality,
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
    qualityPreset,
    geometryQuality,
    textureQuality,
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
              'queued_references', 'submitting_references', 'processing_references',
              'persisting_references', 'awaiting_reference_confirmation',
              'queued_3d', 'submitting_3d', 'processing_3d', 'persisting',
              'queued_generation', 'submitting_generation', 'processing_generation',
              'persisting_assets', 'quality_checking'
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
          (id, user_id, idempotency_key_hash, style, status, quality_preset,
           geometry_quality, texture_quality, photo_count, accepted_cost_version,
           estimated_cost_fen)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        RETURNING *`,
        [
          jobId, userId, idempotencyKeyHash, style, initialStatus, qualityPreset,
          geometryQuality, textureQuality, photos.length, acceptedCostVersion,
          estimatedCostFen,
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
        WHERE user_id = ? AND idempotency_key_hash = ? AND deleted_at IS NULL
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
              'queued_style', 'processing_style', 'awaiting_style_confirmation',
              'queued_references', 'submitting_references', 'processing_references',
              'persisting_references', 'awaiting_reference_confirmation',
              'queued_3d', 'submitting_3d', 'processing_3d', 'persisting',
              'queued_generation', 'submitting_generation', 'processing_generation',
              'persisting_assets', 'quality_checking'
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
            'queued_style', 'processing_style', 'awaiting_style_confirmation',
              'queued_references', 'submitting_references', 'processing_references',
              'persisting_references', 'awaiting_reference_confirmation',
              'queued_3d', 'submitting_3d', 'processing_3d', 'persisting',
              'queued_generation', 'submitting_generation', 'processing_generation',
              'persisting_assets', 'quality_checking'
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
          AND status IN (
            'queued_style', 'processing_style', 'queued_3d', 'submitting_3d', 'processing_3d', 'persisting',
            'queued_references', 'submitting_references', 'processing_references', 'persisting_references',
            'queued_generation', 'submitting_generation', 'processing_generation', 'persisting_assets',
            'quality_checking'
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

  const refreshJobClaim = async ({ jobId, claimedAt }) => {
    const rows = await queryFn(
      `UPDATE avatar_3d_jobs
      SET claimed_at = date_trunc('milliseconds', CURRENT_TIMESTAMP)
      WHERE id = ? AND claimed_at = ? AND deleted_at IS NULL
      RETURNING *`,
      [jobId, claimedAt],
    );
    return rows[0] ? mapPrivateJob(rows[0]) : null;
  };

  const createReferenceSet = async ({
    userId,
    jobId,
    sourcePhotoId,
    promptPlan,
    promptPlanVersion,
    costVersion,
    estimatedCostFen,
    retentionUntil = null,
  }) => {
    const rows = await queryFn(
      `INSERT INTO avatar_3d_reference_sets
        (id, user_id, job_id, source_photo_id, prompt_plan, prompt_plan_version,
         cost_version, estimated_cost_fen, retention_until)
      SELECT ?, ?, job.id, photo.id, ?, ?, ?, ?, ?
      FROM avatar_3d_jobs job
      JOIN avatar_3d_job_photos photo
        ON photo.job_id = job.id AND photo.user_id = job.user_id
      WHERE job.id = ? AND job.user_id = ? AND job.deleted_at IS NULL
        AND photo.id = ? AND photo.user_id = ?
        AND photo.status IN ('ready', 'enhanced') AND photo.deleted_at IS NULL
      ON CONFLICT (job_id) DO NOTHING
      RETURNING *`,
      [
        randomUUID(), userId, JSON.stringify(promptPlan || {}), promptPlanVersion,
        costVersion, estimatedCostFen, retentionUntil, jobId, userId, sourcePhotoId, userId,
      ],
    );
    if (rows.length) return mapReferenceSet(rows[0]);

    const existingRows = await queryFn(
      `SELECT reference_set.*
      FROM avatar_3d_reference_sets reference_set
      JOIN avatar_3d_jobs job ON job.id = reference_set.job_id
      WHERE reference_set.job_id = ? AND reference_set.user_id = ?
        AND job.user_id = ? AND reference_set.deleted_at IS NULL
      LIMIT 1`,
      [jobId, userId, userId],
    );
    if (!existingRows.length) {
      throw new HttpError(404, "Avatar task or source photo not found.", {
        code: "REFERENCE_SOURCE_NOT_FOUND",
      });
    }
    return mapReferenceSet(existingRows[0]);
  };

  const getReferenceSetForJob = async ({
    userId,
    jobId,
    referenceSetId = null,
    includePrivate = false,
  }) => {
    const referenceFilter = referenceSetId ? "AND reference_set.id = ?" : "";
    const rows = await queryFn(
      `SELECT reference_set.*
      FROM avatar_3d_reference_sets reference_set
      JOIN avatar_3d_jobs job ON job.id = reference_set.job_id
      WHERE reference_set.job_id = ? AND reference_set.user_id = ?
        AND job.user_id = ? ${referenceFilter}
        AND reference_set.deleted_at IS NULL AND job.deleted_at IS NULL
      LIMIT 1`,
      [jobId, userId, userId, ...(referenceSetId ? [referenceSetId] : [])],
    );
    if (!rows.length) {
      throw new HttpError(404, "Avatar reference set not found.", {
        code: "REFERENCE_SET_NOT_FOUND",
      });
    }
    return includePrivate ? mapPrivateReferenceSet(rows[0]) : mapReferenceSet(rows[0]);
  };

  const persistReferenceImages = async ({
    userId,
    jobId,
    referenceSetId,
    images,
    usageImageCount,
  }) => {
    const requiredViews = ["front", "left", "back", "right"];
    const validImages = Array.isArray(images)
      && images.length === requiredViews.length
      && images.every((image, index) => (
        image?.view === requiredViews[index]
        && image.sequenceIndex === index
        && typeof image.storageKey === "string" && image.storageKey.length > 0
        && ["image/jpeg", "image/png"].includes(image.mimeType)
        && Number.isInteger(image.byteSize) && image.byteSize > 0
        && Number.isInteger(image.width) && image.width > 0
        && Number.isInteger(image.height) && image.height > 0
      ));
    if (!validImages) {
      throw new HttpError(409, "Avatar reference set is incomplete.", {
        code: "REFERENCE_SET_INCOMPLETE",
      });
    }
    if (!Number.isInteger(usageImageCount) || usageImageCount < 0 || usageImageCount > 4) {
      throw new HttpError(409, "Avatar reference usage is invalid.", {
        code: "REFERENCE_USAGE_INVALID",
      });
    }

    const persisted = [];
    await transactionFn(async (connection) => {
      const [referenceRows] = await connection.execute(
        `SELECT reference_set.*
        FROM avatar_3d_reference_sets reference_set
        JOIN avatar_3d_jobs job
          ON job.id = reference_set.job_id AND job.user_id = reference_set.user_id
        WHERE reference_set.id = ? AND reference_set.job_id = ?
          AND reference_set.user_id = ? AND reference_set.status = 'persisting'
          AND job.status = 'persisting_references'
          AND reference_set.deleted_at IS NULL AND job.deleted_at IS NULL
        FOR UPDATE OF reference_set, job`,
        [referenceSetId, jobId, userId],
      );
      if (!referenceRows.length) {
        throw new HttpError(409, "Avatar reference state changed.", {
          code: "REFERENCE_SET_STATE_CHANGED",
        });
      }

      for (const image of images) {
        const [rows] = await connection.execute(
          `INSERT INTO avatar_3d_reference_images
            (id, reference_set_id, job_id, user_id, view, sequence_index,
             storage_key, mime_type, byte_size, width, height)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT (reference_set_id, view) DO UPDATE SET
            sequence_index = EXCLUDED.sequence_index,
            storage_key = EXCLUDED.storage_key,
            mime_type = EXCLUDED.mime_type,
            byte_size = EXCLUDED.byte_size,
            width = EXCLUDED.width,
            height = EXCLUDED.height,
            status = 'active',
            deleted_at = NULL
          RETURNING *`,
          [
            randomUUID(), referenceSetId, jobId, userId, image.view, image.sequenceIndex,
            image.storageKey, image.mimeType, image.byteSize, image.width, image.height,
          ],
        );
        persisted.push(mapReferenceImage(rows[0]));
      }

      await connection.execute(
        `UPDATE avatar_3d_reference_sets
        SET status = 'awaiting_confirmation', actual_image_count = 4,
            usage_image_count = ?, provider_status = 'SUCCEEDED'
        WHERE id = ? AND job_id = ? AND user_id = ? AND status = 'persisting'`,
        [usageImageCount, referenceSetId, jobId, userId],
      );
      const [jobRows] = await connection.execute(
        `UPDATE avatar_3d_jobs
        SET reference_set_id = ?, status = 'awaiting_reference_confirmation', progress = 100
        WHERE id = ? AND user_id = ? AND status = 'persisting_references'
          AND deleted_at IS NULL
        RETURNING id`,
        [referenceSetId, jobId, userId],
      );
      if (!jobRows.length) {
        throw new HttpError(409, "Avatar task state changed.", {
          code: "AVATAR_JOB_STATE_CHANGED",
        });
      }
    });
    return persisted;
  };

  const listReferenceImages = async ({
    userId,
    jobId,
    referenceSetId,
    includePrivate = false,
  }) => {
    const rows = await queryFn(
      `SELECT image.*
      FROM avatar_3d_reference_images image
      JOIN avatar_3d_reference_sets reference_set
        ON reference_set.id = image.reference_set_id
        AND reference_set.job_id = image.job_id
        AND reference_set.user_id = image.user_id
      WHERE image.reference_set_id = ? AND image.job_id = ?
        AND reference_set.user_id = ?
        AND image.status = 'active' AND image.deleted_at IS NULL
        AND reference_set.deleted_at IS NULL
      ORDER BY image.sequence_index ASC`,
      [referenceSetId, jobId, userId],
    );
    return rows.map(includePrivate ? mapPrivateReferenceImage : mapReferenceImage);
  };

  const getReferenceImage = async ({
    userId,
    jobId,
    referenceSetId,
    view,
    includePrivate = false,
  }) => {
    const rows = await queryFn(
      `SELECT image.*
      FROM avatar_3d_reference_images image
      JOIN avatar_3d_reference_sets reference_set
        ON reference_set.id = image.reference_set_id
        AND reference_set.job_id = image.job_id
        AND reference_set.user_id = image.user_id
      WHERE image.reference_set_id = ? AND image.job_id = ?
        AND reference_set.user_id = ? AND image.view = ?
        AND image.status = 'active' AND image.deleted_at IS NULL
        AND reference_set.deleted_at IS NULL
      LIMIT 1`,
      [referenceSetId, jobId, userId, view],
    );
    if (!rows.length) return null;
    return includePrivate ? mapPrivateReferenceImage(rows[0]) : mapReferenceImage(rows[0]);
  };

  const transitionReferenceGeneration = async ({
    userId,
    jobId,
    referenceSetId,
    fromJobStatus,
    toJobStatus,
    fromReferenceStatus,
    toReferenceStatus,
    progress,
    providerTaskId,
    providerRequestId,
    providerStatus,
    safeErrorCode,
    retentionUntil,
  }) => {
    if (
      !avatar3dNextStatuses.get(fromJobStatus)?.has(toJobStatus)
      || !referenceSetNextStatuses.get(fromReferenceStatus)?.has(toReferenceStatus)
    ) {
      throw new HttpError(409, "Avatar reference state changed.", {
        code: "ILLEGAL_REFERENCE_TRANSITION",
      });
    }

    let result;
    await transactionFn(async (connection) => {
      const [jobRows] = await connection.execute(
        `SELECT job.* FROM avatar_3d_jobs job
        WHERE job.id = ? AND job.user_id = ? AND job.reference_set_id = ?
          AND job.status = ? AND job.deleted_at IS NULL
        FOR UPDATE`,
        [jobId, userId, referenceSetId, fromJobStatus],
      );
      const [referenceRows] = await connection.execute(
        `SELECT * FROM avatar_3d_reference_sets
        WHERE id = ? AND job_id = ? AND user_id = ? AND status = ?
          AND deleted_at IS NULL
        FOR UPDATE`,
        [referenceSetId, jobId, userId, fromReferenceStatus],
      );
      if (!jobRows.length || !referenceRows.length) {
        throw new HttpError(409, "Avatar reference state changed.", {
          code: "REFERENCE_SET_STATE_CHANGED",
        });
      }

      const referenceAssignments = ["status = ?"];
      const referenceParams = [toReferenceStatus];
      for (const [column, value] of [
        ["provider_task_id", providerTaskId],
        ["provider_request_id", providerRequestId],
        ["provider_status", providerStatus],
        ["retention_until", retentionUntil],
      ]) {
        if (value !== undefined) {
          referenceAssignments.push(`${column} = ?`);
          referenceParams.push(value);
        }
      }
      referenceParams.push(referenceSetId, jobId, userId, fromReferenceStatus);
      const [updatedReferences] = await connection.execute(
        `UPDATE avatar_3d_reference_sets
        SET ${referenceAssignments.join(", ")}
        WHERE id = ? AND job_id = ? AND user_id = ? AND status = ?
          AND deleted_at IS NULL
        RETURNING *`,
        referenceParams,
      );

      const jobAssignments = ["status = ?", "claimed_at = NULL"];
      const jobParams = [toJobStatus];
      for (const [column, value] of [
        ["progress", progress],
        ["provider_status", providerStatus],
        ["safe_error_code", safeErrorCode],
        ["retention_until", retentionUntil],
      ]) {
        if (value !== undefined) {
          jobAssignments.push(`${column} = ?`);
          jobParams.push(value);
        }
      }
      if (terminalStatuses.has(toJobStatus)) jobAssignments.push("finished_at = CURRENT_TIMESTAMP");
      jobParams.push(jobId, userId, referenceSetId, fromJobStatus);
      const [updatedJobs] = await connection.execute(
        `UPDATE avatar_3d_jobs
        SET ${jobAssignments.join(", ")}
        WHERE id = ? AND user_id = ? AND reference_set_id = ? AND status = ?
          AND deleted_at IS NULL
        RETURNING *`,
        jobParams,
      );
      if (!updatedReferences.length || !updatedJobs.length) {
        throw new HttpError(409, "Avatar reference state changed.", {
          code: "REFERENCE_SET_STATE_CHANGED",
        });
      }
      result = {
        job: mapPrivateJob(updatedJobs[0]),
        referenceSet: mapPrivateReferenceSet(updatedReferences[0]),
      };
    });
    return result;
  };

  const updateReferenceGenerationProgress = async ({
    userId,
    jobId,
    referenceSetId,
    jobStatus = "processing_references",
    referenceStatus = "processing",
    progress,
    providerStatus,
  }) => {
    let result;
    await transactionFn(async (connection) => {
      const [referenceRows] = await connection.execute(
        `UPDATE avatar_3d_reference_sets
        SET provider_status = ?
        WHERE id = ? AND job_id = ? AND user_id = ? AND status = ?
          AND deleted_at IS NULL
        RETURNING *`,
        [providerStatus, referenceSetId, jobId, userId, referenceStatus],
      );
      const [jobRows] = await connection.execute(
        `UPDATE avatar_3d_jobs
        SET progress = ?, provider_status = ?, claimed_at = NULL
        WHERE id = ? AND user_id = ? AND reference_set_id = ? AND status = ?
          AND deleted_at IS NULL
        RETURNING *`,
        [progress, providerStatus, jobId, userId, referenceSetId, jobStatus],
      );
      if (!referenceRows.length || !jobRows.length) {
        throw new HttpError(409, "Avatar reference state changed.", {
          code: "REFERENCE_SET_STATE_CHANGED",
        });
      }
      result = {
        job: mapPrivateJob(jobRows[0]),
        referenceSet: mapPrivateReferenceSet(referenceRows[0]),
      };
    });
    return result;
  };

  const confirmReferenceSet = async ({
    userId,
    jobId,
    referenceSetId,
    qualityPreset,
    geometryQuality,
    textureQuality,
    acceptedCostVersion,
    estimatedCostFen,
  }) => {
    if (
      !["standard", "ultra"].includes(qualityPreset)
      || !["standard", "ultra"].includes(geometryQuality)
      || !["standard", "detailed"].includes(textureQuality)
      || typeof acceptedCostVersion !== "string"
      || !acceptedCostVersion
      || !Number.isInteger(estimatedCostFen)
      || estimatedCostFen < 0
    ) {
      throw new HttpError(400, "Avatar quality confirmation is invalid.", {
        code: "INVALID_QUALITY_CONFIRMATION",
      });
    }

    let result;
    await transactionFn(async (connection) => {
      const [jobRows] = await connection.execute(
        `SELECT job.* FROM avatar_3d_jobs job
        WHERE job.id = ? AND job.user_id = ? AND job.reference_set_id = ?
          AND job.status = 'awaiting_reference_confirmation' AND job.deleted_at IS NULL
        FOR UPDATE`,
        [jobId, userId, referenceSetId],
      );
      const [referenceRows] = await connection.execute(
        `SELECT * FROM avatar_3d_reference_sets
        WHERE id = ? AND job_id = ? AND user_id = ?
          AND status = 'awaiting_confirmation' AND deleted_at IS NULL
        FOR UPDATE`,
        [referenceSetId, jobId, userId],
      );
      if (!jobRows.length || !referenceRows.length) {
        throw new HttpError(409, "Avatar reference set cannot be confirmed.", {
          code: "REFERENCE_CONFIRMATION_STATE_CHANGED",
        });
      }
      const [countRows] = await connection.execute(
        `SELECT COUNT(*) AS image_count, COUNT(DISTINCT view) AS view_count,
          MIN(sequence_index) AS first_sequence, MAX(sequence_index) AS last_sequence
        FROM avatar_3d_reference_images
        WHERE reference_set_id = ? AND job_id = ? AND user_id = ?
          AND status = 'active' AND deleted_at IS NULL`,
        [referenceSetId, jobId, userId],
      );
      const counts = countRows[0] || {};
      if (
        Number(counts.image_count || 0) !== 4
        || Number(counts.view_count || 0) !== 4
        || Number(counts.first_sequence) !== 0
        || Number(counts.last_sequence) !== 3
      ) {
        throw new HttpError(409, "Avatar reference set is incomplete.", {
          code: "REFERENCE_SET_INCOMPLETE",
        });
      }

      const [acceptedReferences] = await connection.execute(
        `UPDATE avatar_3d_reference_sets
        SET status = 'accepted', confirmed_at = CURRENT_TIMESTAMP
        WHERE id = ? AND job_id = ? AND user_id = ?
          AND status = 'awaiting_confirmation'
        RETURNING *`,
        [referenceSetId, jobId, userId],
      );
      const [queuedJobs] = await connection.execute(
        `UPDATE avatar_3d_jobs
        SET status = 'queued_3d', progress = 0, quality_preset = ?,
          geometry_quality = ?, texture_quality = ?, accepted_cost_version = ?,
          estimated_cost_fen = ?, claimed_at = NULL
        WHERE id = ? AND user_id = ? AND reference_set_id = ?
          AND status = 'awaiting_reference_confirmation'
        RETURNING *`,
        [
          qualityPreset, geometryQuality, textureQuality, acceptedCostVersion,
          estimatedCostFen, jobId, userId, referenceSetId,
        ],
      );
      if (!acceptedReferences.length || !queuedJobs.length) {
        throw new HttpError(409, "Avatar reference set cannot be confirmed.", {
          code: "REFERENCE_CONFIRMATION_STATE_CHANGED",
        });
      }
      result = {
        job: mapAvatar3dJob(queuedJobs[0]),
        referenceSet: mapReferenceSet(acceptedReferences[0]),
      };
    });
    return result;
  };

  const createGenerationAttempt = async ({
    userId,
    jobId,
    kind,
    modelProvider,
    provider,
    providerTaskId = null,
    sourcePhotoId = null,
    status = "submitting_generation",
    artifactManifest = null,
  }) => {
    if (!["initial", "technical_replacement"].includes(kind)) {
      throw new HttpError(400, "Unknown generation attempt kind.", {
        code: "INVALID_ATTEMPT_KIND",
      });
    }
    let attempt;
    await transactionFn(async (connection) => {
      const [jobRows] = await connection.execute(
        `SELECT * FROM avatar_3d_jobs
        WHERE id = ? AND user_id = ? AND deleted_at IS NULL
        FOR UPDATE`,
        [jobId, userId],
      );
      if (!jobRows.length) throw new HttpError(404, "Avatar task not found.", { code: "AVATAR_JOB_NOT_FOUND" });

      if (sourcePhotoId !== null) {
        const [photoRows] = await connection.execute(
          `SELECT id FROM avatar_3d_job_photos
          WHERE id = ? AND user_id = ? AND deleted_at IS NULL
          FOR KEY SHARE`,
          [sourcePhotoId, userId],
        );
        if (!photoRows.length) {
          throw new HttpError(404, "Source photo not found.", { code: "SOURCE_PHOTO_NOT_FOUND" });
        }
      }

      const [existingAttempts] = await connection.execute(
        `SELECT id, attempt_number, kind, status, quality_status, billing_disposition
        FROM avatar_3d_generation_attempts
        WHERE job_id = ?
        ORDER BY attempt_number ASC
        FOR UPDATE`,
        [jobId],
      );
      const existing = existingAttempts || [];
      const countKind = (value) => existing.filter((item) => item.kind === value).length;
      if (existing.length >= 2) {
        throw new HttpError(409, "Maximum provider submissions reached.", {
          code: "MAX_PROVIDER_SUBMISSIONS_REACHED",
        });
      }
      if (kind === "initial" && countKind("initial") > 0) {
        throw new HttpError(409, "Initial generation already exists.", { code: "INITIAL_ATTEMPT_EXISTS" });
      }
      if (kind === "technical_replacement" && countKind("technical_replacement") > 0) {
        throw new HttpError(409, "A technical replacement already exists.", {
          code: "TECHNICAL_REPLACEMENT_EXISTS",
        });
      }
      if (kind === "technical_replacement") {
        const currentAttempt = existing.find(
          (item) => item.id === jobRows[0].current_attempt_id,
        );
        if (currentAttempt?.status !== "failed"
          || currentAttempt.billing_disposition !== "uncharged") {
          throw new HttpError(409, "Technical replacement is not eligible.", {
            code: "TECHNICAL_REPLACEMENT_NOT_ELIGIBLE",
          });
        }
      }

      const attemptNumber = Math.max(0, ...existing.map((item) => Number(item.attempt_number || 0))) + 1;
      const [attemptRows] = await connection.execute(
        `INSERT INTO avatar_3d_generation_attempts
          (id, job_id, user_id, attempt_number, kind, model_provider, provider_task_id,
           source_photo_id, status, artifact_manifest, submitted_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
        RETURNING *`,
        [
          randomUUID(), jobId, userId, attemptNumber, kind, modelProvider || provider || "tripo",
          providerTaskId, sourcePhotoId, status, JSON.stringify(artifactManifest || {}),
        ],
      );
      const [row] = attemptRows;
      await connection.execute(
        `UPDATE avatar_3d_jobs
        SET current_attempt_id = ?, model_provider = ?,
            technical_retry_count = ?
        WHERE id = ?`,
        [
          row.id, row.model_provider,
          countKind("technical_replacement") + (kind === "technical_replacement" ? 1 : 0),
          jobId,
        ],
      );
      attempt = mapPublicGenerationAttempt(row);
    });
    return attempt;
  };

  const getCurrentGenerationAttempt = async ({ userId, jobId, includePrivate = false }) => {
    const rows = await queryFn(
      `SELECT attempt.*
      FROM avatar_3d_generation_attempts attempt
      JOIN avatar_3d_jobs job ON job.current_attempt_id = attempt.id
      WHERE job.id = ? AND job.user_id = ? AND job.deleted_at IS NULL
      LIMIT 1`,
      [jobId, userId],
    );
    return rows[0] ? (includePrivate
      ? mapPrivateGenerationAttempt(rows[0])
      : mapPublicGenerationAttempt(rows[0])) : null;
  };

  const updateGenerationAttempt = async ({
    userId,
    attemptId,
    providerTaskId,
    status,
    artifactManifest,
    billingDisposition,
    completedAt,
  }) => {
    const assignments = [];
    const params = [];
    for (const [column, value] of [
      ["provider_task_id", providerTaskId],
      ["status", status],
      ["artifact_manifest", artifactManifest === undefined ? undefined : JSON.stringify(artifactManifest)],
      ["billing_disposition", billingDisposition],
      ["completed_at", completedAt],
    ]) {
      if (value !== undefined) {
        assignments.push(`${column} = ?`);
        params.push(value);
      }
    }
    if (!assignments.length) return null;
    params.push(attemptId, userId);
    const rows = await queryFn(
      `UPDATE avatar_3d_generation_attempts attempt
      SET ${assignments.join(", ")}
      FROM avatar_3d_jobs job
      WHERE attempt.id = ? AND attempt.job_id = job.id
        AND job.user_id = ? AND job.deleted_at IS NULL
      RETURNING *`,
      params,
    );
    return rows[0] ? mapPublicGenerationAttempt(rows[0]) : null;
  };

  const recordAttemptQuality = async ({
    userId,
    attemptId,
    qualityStatus,
    qualityReasonCode = null,
    qualityMetrics = null,
  }) => {
    if (!attemptQualityStatuses.has(qualityStatus)) {
      throw new HttpError(400, "Unknown attempt quality status.", {
        code: "INVALID_QUALITY_STATUS",
      });
    }

    let result = null;
    await transactionFn(async (connection) => {
      const [lockedRows] = await connection.execute(
        `SELECT attempt.*
        FROM avatar_3d_generation_attempts attempt
        JOIN avatar_3d_jobs job ON job.id = attempt.job_id
        WHERE attempt.id = ? AND job.user_id = ? AND job.deleted_at IS NULL
        FOR UPDATE OF job, attempt`,
        [attemptId, userId],
      );
      if (!lockedRows.length) return;

      const lockedAttempt = lockedRows[0];
      if (lockedAttempt.status !== "quality_checking") {
        throw new HttpError(409, "Generation attempt is not awaiting quality evaluation.", {
          code: "INVALID_ATTEMPT_QUALITY_STATE",
        });
      }
      if (lockedAttempt.quality_status !== null
        && lockedAttempt.quality_status !== undefined) {
        throw new HttpError(409, "Generation attempt quality was already recorded.", {
          code: "ATTEMPT_QUALITY_ALREADY_RECORDED",
        });
      }

      const serializedQualityMetrics = JSON.stringify(qualityMetrics);
      const [updatedRows] = await connection.execute(
        `UPDATE avatar_3d_generation_attempts
        SET quality_status = ?, quality_reason_code = ?, quality_metrics = ?
        WHERE id = ? AND job_id = ?
          AND status = 'quality_checking' AND quality_status IS NULL
        RETURNING *`,
        [
          qualityStatus, qualityReasonCode, serializedQualityMetrics,
          attemptId, lockedAttempt.job_id,
        ],
      );
      if (!updatedRows.length) {
        throw new HttpError(409, "Generation attempt quality could not be recorded.", {
          code: "ATTEMPT_QUALITY_STATE_CHANGED",
        });
      }

      const [countRows] = await connection.execute(
        `SELECT COUNT(*) AS completed_quality_evaluations
        FROM avatar_3d_generation_attempts
        WHERE job_id = ? AND quality_status IS NOT NULL`,
        [lockedAttempt.job_id],
      );
      const completedQualityEvaluations = Number(
        countRows[0]?.completed_quality_evaluations || 0,
      );
      const maxQualityAttempts = 1;
      if (completedQualityEvaluations > maxQualityAttempts) {
        throw new HttpError(409, "Maximum quality evaluations reached.", {
          code: "MAX_QUALITY_ATTEMPTS_REACHED",
        });
      }

      const jobStatus = qualityStatus === "passed"
        ? "succeeded"
        : "quality_failed";
      const isTerminal = jobStatus === "succeeded" || jobStatus === "quality_failed";
      const [jobRows] = await connection.execute(
        `UPDATE avatar_3d_jobs
        SET quality_status = ?, quality_reason_code = ?, quality_metrics = ?, status = ?,
            finished_at = CASE WHEN ? THEN CURRENT_TIMESTAMP ELSE NULL END
        WHERE id = ? AND user_id = ? AND deleted_at IS NULL
        RETURNING id`,
        [
          qualityStatus, qualityReasonCode, serializedQualityMetrics, jobStatus,
          isTerminal, lockedAttempt.job_id, userId,
        ],
      );
      if (!jobRows.length) {
        throw new HttpError(409, "Avatar task quality state changed.", {
          code: "AVATAR_JOB_QUALITY_STATE_CHANGED",
        });
      }
      result = mapPrivateGenerationAttempt(updatedRows[0]);
    });
    return result;
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
        provider_task_id = EXCLUDED.provider_task_id,
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

  const createPreparingModel = async ({
    userId,
    jobId,
    title,
    providerTaskId,
    thumbnail = null,
  }) => {
    const rows = await queryFn(
      `INSERT INTO avatar_3d_models
        (id, user_id, job_id, title, provider_task_id, thumbnail_storage_key,
         thumbnail_mime_type, thumbnail_byte_size, status)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'preparing')
      ON CONFLICT (job_id) DO UPDATE SET
        title = EXCLUDED.title,
        provider_task_id = EXCLUDED.provider_task_id,
        thumbnail_storage_key = COALESCE(EXCLUDED.thumbnail_storage_key, avatar_3d_models.thumbnail_storage_key),
        thumbnail_mime_type = COALESCE(EXCLUDED.thumbnail_mime_type, avatar_3d_models.thumbnail_mime_type),
        thumbnail_byte_size = COALESCE(EXCLUDED.thumbnail_byte_size, avatar_3d_models.thumbnail_byte_size),
        status = CASE
          WHEN avatar_3d_models.status = 'active' THEN 'active'
          ELSE 'preparing'
        END,
        deleted_at = NULL
      RETURNING *`,
      [
        randomUUID(), userId, jobId, title, providerTaskId,
        thumbnail?.storageKey || null,
        thumbnail?.contentType || null,
        thumbnail?.byteSize ?? null,
      ],
    );
    return rows[0] ? mapAvatar3dModel(rows[0]) : null;
  };

  const completePreparingModel = async ({ userId, jobId, glb }) => {
    if (!glb?.mobile?.storageKey || !glb.mobile.contentType) {
      throw new HttpError(500, "App avatar model asset is missing.", {
        code: "MOBILE_MODEL_ASSET_MISSING",
      });
    }
    const rows = await queryFn(
      `UPDATE avatar_3d_models
      SET glb_storage_key = ?, glb_mime_type = ?, glb_byte_size = ?,
        mobile_glb_storage_key = ?, mobile_glb_mime_type = ?, mobile_glb_byte_size = ?,
        status = 'active'
      WHERE job_id = ? AND user_id = ? AND status = 'preparing' AND deleted_at IS NULL
      RETURNING *`,
      [
        glb.storageKey,
        glb.contentType,
        glb.byteSize,
        glb.mobile.storageKey,
        glb.mobile.contentType,
        glb.mobile.byteSize,
        jobId,
        userId,
      ],
    );
    return rows[0] ? mapAvatar3dModel(rows[0]) : null;
  };

  const createModel = async ({
    userId,
    jobId,
    title,
    providerTaskId,
    glb,
    thumbnail = null,
  }) => {
    if (!glb?.mobile?.storageKey || !glb.mobile.contentType) {
      throw new HttpError(500, "App avatar model asset is missing.", {
        code: "MOBILE_MODEL_ASSET_MISSING",
      });
    }
    const rows = await queryFn(
      `INSERT INTO avatar_3d_models
        (id, user_id, job_id, title, provider_task_id, glb_storage_key,
         glb_mime_type, glb_byte_size, mobile_glb_storage_key,
         mobile_glb_mime_type, mobile_glb_byte_size, thumbnail_storage_key,
         thumbnail_mime_type, thumbnail_byte_size, status)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active')
      ON CONFLICT (job_id) DO UPDATE SET
        title = EXCLUDED.title,
        provider_task_id = EXCLUDED.provider_task_id,
        glb_storage_key = EXCLUDED.glb_storage_key,
        glb_mime_type = EXCLUDED.glb_mime_type,
        glb_byte_size = EXCLUDED.glb_byte_size,
        mobile_glb_storage_key = EXCLUDED.mobile_glb_storage_key,
        mobile_glb_mime_type = EXCLUDED.mobile_glb_mime_type,
        mobile_glb_byte_size = EXCLUDED.mobile_glb_byte_size,
        thumbnail_storage_key = EXCLUDED.thumbnail_storage_key,
        thumbnail_mime_type = EXCLUDED.thumbnail_mime_type,
        thumbnail_byte_size = EXCLUDED.thumbnail_byte_size,
        status = 'active',
        deleted_at = NULL
      RETURNING *`,
      [
        randomUUID(), userId, jobId, title, providerTaskId,
        glb.storageKey, glb.contentType, glb.byteSize,
        glb.mobile.storageKey, glb.mobile.contentType, glb.mobile.byteSize,
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
      WHERE id = ? AND user_id = ? AND status IN ('preparing', 'active') AND deleted_at IS NULL
      LIMIT 1`,
      [modelId, userId],
    );
    if (!rows.length) return null;
    return includePrivate ? mapPrivateModel(rows[0]) : mapAvatar3dModel(rows[0]);
  };

  const getJobModel = async ({ userId, jobId, includePrivate = false }) => {
    const rows = await queryFn(
      `SELECT * FROM avatar_3d_models
      WHERE job_id = ? AND user_id = ? AND status IN ('preparing', 'active') AND deleted_at IS NULL
      LIMIT 1`,
      [jobId, userId],
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
      await connection.execute(
        "UPDATE avatar_3d_reference_sets SET retention_until = ? WHERE job_id = ? AND user_id = ?",
        [retentionUntil, jobId, userId],
      );
      await connection.execute(
        "UPDATE avatar_3d_reference_images SET retention_until = ? WHERE job_id = ? AND user_id = ?",
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
          AND NOT p.retain_for_regeneration
          AND j.status IN ('succeeded', 'failed', 'quality_failed', 'cancelled', 'submission_unknown')
        UNION ALL
        SELECT 'photo_normalized', p.id, p.normalized_storage_key, p.retention_until
        FROM avatar_3d_job_photos p
        JOIN avatar_3d_jobs j ON j.id = p.job_id AND j.user_id = p.user_id
        WHERE p.deleted_at IS NULL AND p.normalized_storage_key IS NOT NULL
          AND NOT p.retain_for_regeneration
          AND j.status IN ('succeeded', 'failed', 'quality_failed', 'cancelled', 'submission_unknown')
        UNION ALL
        SELECT 'enhanced_photo', p.id, p.enhanced_storage_key, p.retention_until
        FROM avatar_3d_job_photos p
        JOIN avatar_3d_jobs j ON j.id = p.job_id AND j.user_id = p.user_id
        WHERE p.deleted_at IS NULL AND p.enhanced_storage_key IS NOT NULL
          AND p.enhanced_storage_key <> '' AND NOT p.retain_for_regeneration
          AND j.status IN ('succeeded', 'failed', 'quality_failed', 'cancelled', 'submission_unknown')
        UNION ALL
        SELECT 'photo_source', p.id, p.source_storage_key, p.retention_until
        FROM avatar_3d_job_photos p
        WHERE p.job_id IS NULL AND p.deleted_at IS NULL AND p.source_storage_key <> ''
          AND NOT p.retain_for_regeneration
        UNION ALL
        SELECT 'photo_normalized', p.id, p.normalized_storage_key, p.retention_until
        FROM avatar_3d_job_photos p
        WHERE p.job_id IS NULL AND p.deleted_at IS NULL
          AND p.normalized_storage_key IS NOT NULL AND NOT p.retain_for_regeneration
        UNION ALL
        SELECT 'enhanced_photo', p.id, p.enhanced_storage_key, p.retention_until
        FROM avatar_3d_job_photos p
        WHERE p.job_id IS NULL AND p.deleted_at IS NULL
          AND p.enhanced_storage_key IS NOT NULL AND p.enhanced_storage_key <> ''
          AND NOT p.retain_for_regeneration
        UNION ALL
        SELECT 'style_preview', preview.id, preview.storage_key, preview.retention_until
        FROM avatar_3d_style_previews preview
        JOIN avatar_3d_jobs j ON j.id = preview.job_id AND j.user_id = preview.user_id
        WHERE preview.deleted_at IS NULL
          AND j.status IN ('succeeded', 'failed', 'quality_failed', 'cancelled', 'submission_unknown')
        UNION ALL
        SELECT 'reference_image', image.id, image.storage_key, image.retention_until
        FROM avatar_3d_reference_images image
        JOIN avatar_3d_jobs j ON j.id = image.job_id AND j.user_id = image.user_id
        WHERE image.status = 'active' AND image.deleted_at IS NULL
          AND image.storage_key <> ''
          AND j.status IN ('succeeded', 'failed', 'quality_failed', 'cancelled', 'submission_unknown')
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
        `UPDATE avatar_3d_job_photos
        SET source_storage_key = '',
          deleted_at = CASE
            WHEN normalized_storage_key IS NULL AND enhanced_storage_key IS NULL
              THEN CURRENT_TIMESTAMP
            ELSE deleted_at
          END
        WHERE id = ? AND NOT retain_for_regeneration`,
        [assetId],
      );
      return;
    }
    if (assetKind === "photo_normalized") {
      await queryFn(
        `UPDATE avatar_3d_job_photos
        SET normalized_storage_key = NULL,
          deleted_at = CASE
            WHEN source_storage_key = '' AND enhanced_storage_key IS NULL
              THEN CURRENT_TIMESTAMP
            ELSE deleted_at
          END
        WHERE id = ? AND NOT retain_for_regeneration`,
        [assetId],
      );
      return;
    }
    if (assetKind === "enhanced_photo") {
      await queryFn(
        `UPDATE avatar_3d_job_photos
        SET enhanced_storage_key = NULL,
          deleted_at = CASE
            WHEN source_storage_key = '' AND normalized_storage_key IS NULL
              THEN CURRENT_TIMESTAMP
            ELSE deleted_at
          END
        WHERE id = ? AND NOT retain_for_regeneration`,
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
    if (assetKind === "reference_image") {
      await queryFn(
        `UPDATE avatar_3d_reference_images
        SET status = 'deleted', storage_key = '', deleted_at = CURRENT_TIMESTAMP
        WHERE id = ? AND status = 'active' AND deleted_at IS NULL`,
        [assetId],
      );
      return;
    }
    throw new HttpError(400, "Unknown avatar asset type.");
  };

  return {
    createJob,
    createJobWithPhotos,
    createFaceFirstJob,
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
    refreshJobClaim,
    createReferenceSet,
    getReferenceSetForJob,
    persistReferenceImages,
    listReferenceImages,
    getReferenceImage,
    transitionReferenceGeneration,
    updateReferenceGenerationProgress,
    confirmReferenceSet,
    createGenerationAttempt,
    getCurrentGenerationAttempt,
    updateGenerationAttempt,
    recordAttemptQuality,
    createStylePreview,
    getStylePreview,
    discardStylePreview,
    createPreparingModel,
    completePreparingModel,
    createModel,
    listModels,
    getModel,
    getJobModel,
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
