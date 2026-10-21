import crypto from 'node:crypto';
import { query, withTransaction } from './db.js';
import { HttpError } from './http-error.js';
import { mapFileAsset } from './repository-mappers.js';
export async function createUploadedFile(input) {
  const requestHash = crypto.createHash('sha256').update(JSON.stringify({ name: input.originalFilename, mime: input.mimeType, hash: input.checksumSha256, parser: input.parseVersion })).digest('hex');
  return withTransaction(async connection => {
    // Serialize identical keys including concurrent first uploads; the unique index
    // remains the database invariant. Deleted receipts remain to prevent replay resurrection.
    await connection.query('SELECT pg_advisory_xact_lock(hashtextextended(?, 0))', [`file-upload:${input.userId}:${input.idempotencyKey}`]);
    const [existing] = await connection.query('SELECT * FROM file_assets WHERE user_id = ? AND upload_idempotency_key = ? FOR UPDATE', [input.userId, input.idempotencyKey]);
    if (existing) {
      if (existing.upload_request_hash !== requestHash) throw new HttpError(409, '上传标识已用于不同文件。', { code: 'FILE_IDEMPOTENCY_CONFLICT' });
      if (existing.deleted_at) throw new HttpError(410, '此文件已删除，请重新选择并上传。', { code: 'FILE_DELETED' });
      return { asset: mapFileAsset(existing), replayed: true };
    }
    const [row] = await connection.query(`INSERT INTO file_assets(id,user_id,original_filename,mime_type,byte_size,checksum_sha256,storage_provider,source_kind,status,preprocessing_result,extracted_text,parse_version,upload_idempotency_key,upload_request_hash)
      VALUES(?,?,?,?,?,?,'database','uploaded_text','processed',?::jsonb,?,?,?,?) RETURNING *`, [crypto.randomUUID(), input.userId, input.originalFilename, input.mimeType, input.byteSize, input.checksumSha256, JSON.stringify(input.preprocessingResult), input.content, input.parseVersion, input.idempotencyKey, requestHash]);
    return { asset: mapFileAsset(row), replayed: false };
  });
}
export async function getFileAssetForUser(userId, id) {
  const [row] = await query('SELECT * FROM file_assets WHERE user_id = ? AND id = ? AND deleted_at IS NULL', [userId, id]);
  return row ? { ...mapFileAsset(row), content: row.extracted_text ?? null } : null;
}
export async function deleteFileAssetForUser(userId, id) {
  const rows = await query(`UPDATE file_assets SET status='deleted',deleted_at=CURRENT_TIMESTAMP,extracted_text=NULL,parse_version=NULL,preprocessing_result='{}'::jsonb,metadata='{}'::jsonb,storage_key=NULL
    WHERE user_id=? AND id=? AND deleted_at IS NULL RETURNING id`, [userId, id]);
  return Boolean(rows.length);
}
