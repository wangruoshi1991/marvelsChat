import { getPool, query } from "../src/db.js";
import { avatar3dStorage } from "../src/avatar-3d-storage.js";

const models = await query(
  `SELECT id, user_id, job_id, glb_storage_key, glb_byte_size
  FROM avatar_3d_models
  WHERE status = 'active' AND deleted_at IS NULL
    AND glb_storage_key IS NOT NULL
    AND mobile_glb_storage_key IS NULL
  ORDER BY created_at ASC`,
);

let completed = 0;
let sourceBytes = 0;
let mobileBytes = 0;

try {
  for (const model of models) {
    const response = await avatar3dStorage.streamAvatarObject({
      objectKey: model.glb_storage_key,
    });
    const source = Buffer.from(await response.arrayBuffer());
    if (source.length !== Number(model.glb_byte_size)) {
      throw new Error("Avatar source model size did not match its database record.");
    }

    const mobile = await avatar3dStorage.persistAvatarMobileModel({
      userId: model.user_id,
      jobId: model.job_id,
      source,
    });
    const rows = await query(
      `UPDATE avatar_3d_models
      SET mobile_glb_storage_key = ?, mobile_glb_mime_type = ?, mobile_glb_byte_size = ?
      WHERE id = ? AND user_id = ? AND status = 'active'
        AND deleted_at IS NULL AND mobile_glb_storage_key IS NULL
      RETURNING id`,
      [
        mobile.storageKey,
        mobile.contentType,
        mobile.byteSize,
        model.id,
        model.user_id,
      ],
    );
    if (rows.length !== 1) {
      throw new Error("Avatar mobile model record changed during backfill.");
    }
    completed += 1;
    sourceBytes += source.length;
    mobileBytes += mobile.byteSize;
    console.log(JSON.stringify({
      type: "avatar_mobile_model_backfill_progress",
      completed,
      total: models.length,
      sourceByteSize: source.length,
      mobileByteSize: mobile.byteSize,
    }));
  }

  console.log(JSON.stringify({
    type: "avatar_mobile_model_backfill_complete",
    completed,
    sourceBytes,
    mobileBytes,
  }));
} finally {
  await (await getPool()).end();
}
