import { HttpError } from "./http-error.js";
import {
  avatar3dNextStatuses,
  mapPrivateJob,
  mapPrivateReferenceImage,
  mapPrivateReferenceSet,
  mapReferenceImage,
  mapReferenceSet,
  referenceSetNextStatuses,
  terminalAvatar3dStatuses,
} from "./avatar-3d-repository-mappers.js";
import { mapAvatar3dJob } from "./repository-mappers.js";

export function createAvatar3dReferenceRepository({ queryFn, transactionFn, randomUUID }) {
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
      if (terminalAvatar3dStatuses.has(toJobStatus)) jobAssignments.push("finished_at = CURRENT_TIMESTAMP");
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

  return {
    getReferenceSetForJob,
    persistReferenceImages,
    listReferenceImages,
    getReferenceImage,
    transitionReferenceGeneration,
    updateReferenceGenerationProgress,
    confirmReferenceSet,
  };
}
