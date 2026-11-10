import crypto from 'node:crypto';
import sharp from 'sharp';
import { query, withTransaction } from './db.js';
import { config } from './config.js';
import { HttpError } from './http-error.js';
import { buildStationMediaObjectKey, putOssObject, inspectOssObject, deleteOssObject, fetchOssObject } from './oss-service.js';

const maxImageBytes = 16 * 1024 * 1024;
const invalidImage = () => new HttpError(502, '图片结果无效，未保存为漫画画面。', { code: 'COMIC_IMAGE_BYTES_INVALID' });
const leaseLost = () => new HttpError(409, '漫画任务执行权已失效。', { code: 'AI_TASK_LEASE_LOST' });

export async function normalizeComicImage({ bytes, mimeType }) {
  if (!Buffer.isBuffer(bytes) || !bytes.length || bytes.length > maxImageBytes) throw invalidImage();
  const formats = { 'image/png': 'png', 'image/jpeg': 'jpeg', 'image/webp': 'webp' };
  try {
    if (!formats[mimeType]) throw invalidImage();
    const decoder = sharp(bytes, { limitInputPixels: 16_000_000, failOn: 'warning' });
    const metadata = await decoder.metadata();
    if (metadata.format !== formats[mimeType] || (metadata.pages || 1) !== 1 || !metadata.width || !metadata.height) throw invalidImage();
    const result = await decoder.rotate().resize({ width: 2048, height: 2048, fit: 'inside', withoutEnlargement: true }).webp({ quality: 88 }).toBuffer({ resolveWithObject: true });
    return { bytes: result.data, mimeType: 'image/webp', width: result.info.width, height: result.info.height };
  } catch { throw invalidImage(); }
}

async function bindDefault(connection, args) {
  const { bindComicFrameAssetInTransaction } = await import('./comic-render-repository.js');
  return bindComicFrameAssetInTransaction(connection, args);
}

export function createComicRenderStorage({
  query: runQuery = query, transaction = withTransaction, bucket = config.oss.bucket,
  putObject = putOssObject, inspectObject = inspectOssObject, deleteObject = deleteOssObject,
  fetchObject = fetchOssObject, bindAsset = bindDefault,
} = {}) {
  async function cleanFailedUpload({ journalId, objectKey, mediaAssetId }) {
    // A COMMIT transport failure is ambiguous. Never remove an image that the
    // transaction actually made visible; leave unreadable journal rows for QA.
    const rows = await runQuery('SELECT state FROM comic_render_cleanup_journal WHERE id = ?', [journalId]);
    if (rows[0]?.state === 'stored') return true;
    const marked = await runQuery(`UPDATE comic_render_cleanup_journal SET state = 'cleanup_required',
      last_error_code = 'COMIC_STORAGE_FINALIZE_FAILED', updated_at = clock_timestamp()
      WHERE id = ? AND state <> 'stored' RETURNING id`, [journalId]);
    if (!marked[0]) return false;
    try {
      await deleteObject({ objectKey });
      await runQuery("UPDATE station_media_assets SET status = 'deleted', deleted_at = clock_timestamp() WHERE id = ? AND status = 'pending_upload'", [mediaAssetId]);
      await runQuery('DELETE FROM comic_render_cleanup_journal WHERE id = ? AND state = ?', [journalId, 'cleanup_required']);
    } catch { /* Cleanup is retryable: the durable intent already exists. */ }
    return false;
  }
  async function storeComicFrame({ userId, taskId, claimToken, frameIndex, bytes, mimeType, providerRequestId, model, usage }) {
    const image = await normalizeComicImage({ bytes, mimeType });
    const mediaAssetId = crypto.randomUUID(), journalId = crypto.randomUUID();
    const filename = `comic-frame-${frameIndex}.webp`;
    const objectKey = buildStationMediaObjectKey({ userId, assetId: mediaAssetId, originalFilename: filename });
    await transaction(async connection => {
      const owned = await connection.query(`SELECT id FROM ai_tasks WHERE id = ? AND user_id = ? AND kind = 'comic_render'
        AND claim_token = ? AND status = 'running' AND lease_until > clock_timestamp() FOR UPDATE`, [taskId, userId, claimToken]);
      if (!owned[0]) throw leaseLost();
      await connection.query(`INSERT INTO station_media_assets
        (id,user_id,kind,original_filename,mime_type,byte_size,width,height,caption,tags,metadata,storage_provider,storage_key)
        VALUES (?,?,'image',?,'image/webp',?,?,?,?,'[]'::jsonb,?::jsonb,'oss',?)`,
      [mediaAssetId,userId,filename,image.bytes.length,image.width,image.height,`漫画第 ${frameIndex} 格`,JSON.stringify({source:'comic-render',taskId,frameIndex}),objectKey]);
      await connection.query(`INSERT INTO comic_render_cleanup_journal
        (id,user_id,task_id,frame_index,media_asset_id,bucket,object_key,state) VALUES (?,?,?,?,?,?,?,'pending')`,
      [journalId,userId,taskId,frameIndex,mediaAssetId,bucket,objectKey]);
    });
    try {
      await putObject({ objectKey, body: image.bytes, contentType: image.mimeType });
      const stored = await inspectObject({ objectKey, expectedBytes: image.bytes.length });
      if (stored.contentType !== image.mimeType || stored.contentLength !== image.bytes.length) {
        throw new HttpError(502, '图片存储校验失败。', { code: 'COMIC_IMAGE_STORAGE_INVALID' });
      }
      await transaction(async connection => {
        const uploaded = await connection.query(`UPDATE station_media_assets SET status = 'uploaded', updated_at = clock_timestamp()
          WHERE id = ? AND user_id = ? AND status = 'pending_upload' AND deleted_at IS NULL RETURNING id`, [mediaAssetId, userId]);
        if (!uploaded[0]) throw leaseLost();
        await bindAsset(connection, { taskId, claimToken, frameIndex, mediaAssetId, providerRequestId, metadata: { model: model || null, usage: usage ?? null } });
        await connection.query("UPDATE comic_render_cleanup_journal SET state = 'stored', updated_at = clock_timestamp() WHERE id = ?", [journalId]);
      });
      return { mediaAssetId };
    } catch {
      try {
        if (await cleanFailedUpload({ journalId, objectKey, mediaAssetId })) return { mediaAssetId };
      } catch {
        const uncertain = new HttpError(504, '图片保存结果尚未确认，后续生成已停止。', { code: 'COMIC_STORAGE_OUTCOME_UNKNOWN' });
        uncertain.outcomeUnknown = true;
        throw uncertain;
      }
      throw new HttpError(502, '漫画画面未能安全保存，请检查任务状态。', { code: 'COMIC_IMAGE_STORAGE_FAILED' });
    }
  }
  async function readSelectedImages({ userId, mediaAssetIds }) {
    if (!mediaAssetIds.length) return [];
    const rows = await runQuery(`SELECT id,mime_type,storage_key FROM station_media_assets
      WHERE user_id = ? AND id = ANY(?::text[]) AND kind = 'image' AND status = 'uploaded' AND deleted_at IS NULL`, [userId, mediaAssetIds]);
    if (rows.length !== new Set(mediaAssetIds).size) throw new HttpError(404, '所选图片已不可访问。', { code: 'COMIC_RENDER_SOURCE_CHANGED' });
    const images = [];
    const selectedById = new Map(rows.map(row => [row.id, row]));
    for (const id of mediaAssetIds) {
      const row = selectedById.get(id);
      const response = await fetchObject({ objectKey: row.storage_key });
      const chunks = []; let total = 0;
      try {
        for await (const chunk of response.body) {
          total += chunk.length;
          if (total > maxImageBytes) throw invalidImage();
          chunks.push(Buffer.from(chunk));
        }
      } catch (error) { await response.body?.cancel?.().catch(() => {}); throw error; }
      const image = await normalizeComicImage({ bytes: Buffer.concat(chunks), mimeType: row.mime_type });
      images.push({ id: row.id, ...image });
    }
    return images;
  }
  async function collectCleanup({ limit = 10 } = {}) {
    if (!bucket) return { deleted: 0 };
    return transaction(async connection => {
      const rows = await connection.query(`SELECT j.* FROM comic_render_cleanup_journal j
        WHERE j.bucket = ? AND (j.state = 'cleanup_required'
          OR (j.state = 'stored' AND NOT EXISTS (SELECT 1 FROM station_media_assets a WHERE a.id = j.media_asset_id AND a.user_id = j.user_id AND a.deleted_at IS NULL AND a.status = 'uploaded'))
          OR (j.state = 'pending' AND j.updated_at < clock_timestamp() - INTERVAL '15 minutes'
            AND NOT EXISTS(SELECT 1 FROM ai_tasks t WHERE t.id = j.task_id AND t.status = 'running' AND t.lease_until > clock_timestamp())))
        ORDER BY j.created_at LIMIT ? FOR UPDATE OF j SKIP LOCKED`, [bucket, Math.max(1, Math.min(50, limit))]);
      let deleted = 0;
      for (const row of rows) {
        try {
          await deleteObject({ objectKey: row.object_key });
          await connection.query("UPDATE station_media_assets SET status = 'deleted', deleted_at = clock_timestamp() WHERE id = ? AND status = 'pending_upload'", [row.media_asset_id]);
          await connection.query('DELETE FROM comic_render_cleanup_journal WHERE id = ?', [row.id]);
          deleted++;
        } catch {
          await connection.query("UPDATE comic_render_cleanup_journal SET last_error_code = 'COMIC_STORAGE_CLEANUP_FAILED', updated_at = clock_timestamp() WHERE id = ?", [row.id]);
        }
      }
      return { deleted };
    });
  }
  return { storeComicFrame, readSelectedImages, collectCleanup };
}
