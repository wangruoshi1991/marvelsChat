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
      `WITH assets AS (
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
      )
      SELECT assets.asset_kind, assets.asset_id, assets.storage_key
      FROM assets LEFT JOIN avatar_3d_private_asset_cleanup_retries retry
        ON retry.asset_kind = assets.asset_kind AND retry.asset_id = assets.asset_id
        AND retry.storage_key = assets.storage_key
      WHERE retention_until IS NOT NULL AND retention_until <= ?
        AND (retry.retry_at IS NULL OR retry.retry_at <= clock_timestamp())
      ORDER BY retention_until ASC, assets.asset_kind, assets.asset_id
      LIMIT ${safeLimit}`,
      [before],
    );
  };

  const recordPrivateAssetCleanupFailure = async ({ assetKind, assetId, storageKey, errorCode }) => {
    await queryFn(
      `INSERT INTO avatar_3d_private_asset_cleanup_retries
        (asset_kind, asset_id, storage_key, attempts, retry_at, error_code)
      VALUES (?, ?, ?, 1, clock_timestamp() + INTERVAL '5 minutes', ?)
      ON CONFLICT (asset_kind, asset_id, storage_key) DO UPDATE
      SET attempts = LEAST(avatar_3d_private_asset_cleanup_retries.attempts + 1, 31),
          retry_at = clock_timestamp() + LEAST(
            INTERVAL '1 hour',
            INTERVAL '5 minutes' * power(2, avatar_3d_private_asset_cleanup_retries.attempts)
          ),
          error_code = EXCLUDED.error_code`,
      [assetKind, assetId, storageKey, errorCode],
    );
  };

  const markPrivateAssetDeleted = async ({ assetKind, assetId, storageKey }) => {
    let update;
    if (assetKind === "photo_source") {
      update =
        `UPDATE avatar_3d_job_photos
        SET source_storage_key = '',
          deleted_at = CASE WHEN normalized_storage_key IS NULL THEN CURRENT_TIMESTAMP ELSE deleted_at END
        WHERE id = ? AND source_storage_key = ?`;
    } else if (assetKind === "photo_normalized") {
      update =
        `UPDATE avatar_3d_job_photos
        SET normalized_storage_key = NULL,
          deleted_at = CASE WHEN source_storage_key = '' THEN CURRENT_TIMESTAMP ELSE deleted_at END
        WHERE id = ? AND normalized_storage_key = ?`;
    } else if (assetKind === "reference_image") {
      update =
        `UPDATE avatar_3d_reference_images
        SET status = 'deleted', storage_key = '', deleted_at = CURRENT_TIMESTAMP
        WHERE id = ? AND storage_key = ? AND status = 'active' AND deleted_at IS NULL`;
    } else {
      throw new HttpError(400, "Unknown avatar asset type.");
    }
    await queryFn(
      `WITH updated AS (${update} RETURNING id)
      DELETE FROM avatar_3d_private_asset_cleanup_retries
      WHERE asset_kind = ? AND asset_id = ? AND storage_key = ?`,
      [assetId, storageKey, assetKind, assetId, storageKey],
    );
  };

  return {
    markJobAssetsRetention,
    listExpiredPrivateAssets,
    markPrivateAssetDeleted,
    recordPrivateAssetCleanupFailure,
  };
}
