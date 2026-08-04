import { query, withTransaction } from "./db.js";
import { HttpError } from "./http-error.js";

export function createAccountRepository({
  queryImpl = query,
  withTransactionImpl = withTransaction,
} = {}) {
  const findUserCredentialById = async (userId) => {
    const rows = await queryImpl(
      "SELECT id, password_hash FROM users WHERE id = ? LIMIT 1",
      [userId],
    );
    return rows[0]
      ? { id: rows[0].id, passwordHash: rows[0].password_hash }
      : null;
  };

  const listUserStorageObjects = async (userId) => {
    const rows = await queryImpl(
      `WITH owned AS (SELECT ?::char(36) AS user_id)
      SELECT media.storage_provider AS provider, media.storage_key AS object_key
      FROM station_media_assets media
      JOIN owned ON owned.user_id = media.user_id
      WHERE media.storage_key IS NOT NULL AND media.storage_key <> ''

      UNION
      SELECT file.storage_provider, file.storage_key
      FROM file_assets file
      JOIN owned ON owned.user_id = file.user_id
      WHERE file.storage_key IS NOT NULL AND file.storage_key <> ''

      UNION
      SELECT COALESCE(model_file.value ->> 'storageProvider', 'oss'),
        model_file.value ->> 'storageKey'
      FROM station_model_assets model
      JOIN owned ON owned.user_id = model.user_id
      CROSS JOIN LATERAL jsonb_each(
        CASE
          WHEN jsonb_typeof(model.model_files) = 'object' THEN model.model_files
          ELSE '{}'::jsonb
        END
      ) AS model_file(format, value)
      WHERE model_file.value ->> 'storageKey' IS NOT NULL
        AND model_file.value ->> 'storageKey' <> ''

      UNION
      SELECT COALESCE(model.thumbnail ->> 'storageProvider', 'oss'),
        model.thumbnail ->> 'storageKey'
      FROM station_model_assets model
      JOIN owned ON owned.user_id = model.user_id
      WHERE model.thumbnail ->> 'storageKey' IS NOT NULL
        AND model.thumbnail ->> 'storageKey' <> ''

      UNION
      SELECT 'oss', photo.source_storage_key
      FROM avatar_3d_job_photos photo
      JOIN owned ON owned.user_id = photo.user_id
      WHERE photo.source_storage_key <> ''

      UNION
      SELECT 'oss', photo.normalized_storage_key
      FROM avatar_3d_job_photos photo
      JOIN owned ON owned.user_id = photo.user_id
      WHERE photo.normalized_storage_key IS NOT NULL
        AND photo.normalized_storage_key <> ''

      UNION
      SELECT 'oss', photo.enhanced_storage_key
      FROM avatar_3d_job_photos photo
      JOIN owned ON owned.user_id = photo.user_id
      WHERE photo.enhanced_storage_key IS NOT NULL
        AND photo.enhanced_storage_key <> ''

      UNION
      SELECT 'oss', preview.storage_key
      FROM avatar_3d_style_previews preview
      JOIN owned ON owned.user_id = preview.user_id
      WHERE preview.storage_key <> ''

      UNION
      SELECT 'oss', reference.storage_key
      FROM avatar_3d_reference_images reference
      JOIN owned ON owned.user_id = reference.user_id
      WHERE reference.storage_key <> ''

      UNION
      SELECT 'oss', model.glb_storage_key
      FROM avatar_3d_models model
      JOIN owned ON owned.user_id = model.user_id
      WHERE model.glb_storage_key IS NOT NULL AND model.glb_storage_key <> ''

      UNION
      SELECT 'oss', model.mobile_glb_storage_key
      FROM avatar_3d_models model
      JOIN owned ON owned.user_id = model.user_id
      WHERE model.mobile_glb_storage_key IS NOT NULL
        AND model.mobile_glb_storage_key <> ''

      UNION
      SELECT 'oss', model.thumbnail_storage_key
      FROM avatar_3d_models model
      JOIN owned ON owned.user_id = model.user_id
      WHERE model.thumbnail_storage_key IS NOT NULL
        AND model.thumbnail_storage_key <> ''`,
      [userId],
    );

    return rows
      .map((row) => ({
        provider: String(row.provider || "").trim().toLowerCase(),
        objectKey: String(row.object_key || "").trim(),
      }))
      .filter((item) => item.provider && item.objectKey);
  };

  const deleteUserAccount = async ({ userId }) => {
    let deleted = false;
    await withTransactionImpl(async (connection) => {
      const [lockedUsers] = await connection.execute(
        "SELECT id FROM users WHERE id = ? FOR UPDATE",
        [userId],
      );
      if (!lockedUsers.length) {
        throw new HttpError(404, "Account not found.");
      }

      await connection.execute(
        `DELETE FROM station_post_media
        WHERE post_id IN (SELECT id FROM station_posts WHERE user_id = ?)
          OR media_asset_id IN (
            SELECT id FROM station_media_assets WHERE user_id = ?
          )`,
        [userId, userId],
      );
      await connection.execute(
        `UPDATE avatar_3d_jobs
        SET source_photo_id = NULL,
          enhanced_photo_id = NULL,
          reference_set_id = NULL,
          current_attempt_id = NULL
        WHERE user_id = ?`,
        [userId],
      );
      await connection.execute(
        "UPDATE avatar_3d_generation_attempts SET source_photo_id = NULL WHERE user_id = ?",
        [userId],
      );
      await connection.execute(
        "DELETE FROM usage_events WHERE user_id = ? OR (target_type = 'user' AND target_id = ?)",
        [userId, userId],
      );
      await connection.execute("DELETE FROM agent_runs WHERE user_id = ?", [userId]);
      await connection.execute("DELETE FROM notifications WHERE actor_user_id = ?", [userId]);
      const [rows] = await connection.execute(
        "DELETE FROM users WHERE id = ? RETURNING id",
        [userId],
      );
      deleted = rows.length > 0;
    });
    if (!deleted) throw new HttpError(404, "Account not found.");
    return { deleted: true };
  };

  return {
    deleteUserAccount,
    findUserCredentialById,
    listUserStorageObjects,
  };
}

export const {
  deleteUserAccount,
  findUserCredentialById,
  listUserStorageObjects,
} = createAccountRepository();
