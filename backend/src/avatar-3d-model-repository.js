import { HttpError } from "./http-error.js";
import { mapPrivateModel } from "./avatar-3d-repository-mappers.js";
import { mapAvatar3dModel, sqlLimit } from "./repository-mappers.js";

export function createAvatar3dModelRepository({ queryFn, randomUUID }) {
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

  return {
    createPreparingModel,
    completePreparingModel,
    listModels,
    getModel,
    getJobModel,
    deleteModelRecord,
  };
}
