import { HttpError } from "./http-error.js";
import { sqlLimit } from "./repository-mappers.js";

export function createAvatar3dPrivateAssetRepository({ queryFn, transactionFn }) {
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
          AND j.status IN ('succeeded', 'failed', 'quality_failed', 'cancelled', 'submission_unknown')
        UNION ALL
        SELECT 'photo_normalized', p.id, p.normalized_storage_key, p.retention_until
        FROM avatar_3d_job_photos p
        JOIN avatar_3d_jobs j ON j.id = p.job_id AND j.user_id = p.user_id
        WHERE p.deleted_at IS NULL AND p.normalized_storage_key IS NOT NULL
          AND j.status IN ('succeeded', 'failed', 'quality_failed', 'cancelled', 'submission_unknown')
        UNION ALL
        SELECT 'photo_source', p.id, p.source_storage_key, p.retention_until
        FROM avatar_3d_job_photos p
        WHERE p.job_id IS NULL AND p.deleted_at IS NULL AND p.source_storage_key <> ''
        UNION ALL
        SELECT 'photo_normalized', p.id, p.normalized_storage_key, p.retention_until
        FROM avatar_3d_job_photos p
        WHERE p.job_id IS NULL AND p.deleted_at IS NULL
          AND p.normalized_storage_key IS NOT NULL
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
          deleted_at = CASE WHEN normalized_storage_key IS NULL THEN CURRENT_TIMESTAMP ELSE deleted_at END
        WHERE id = ?`,
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
    markJobAssetsRetention,
    listExpiredPrivateAssets,
    markPrivateAssetDeleted,
  };
}
