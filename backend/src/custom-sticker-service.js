import crypto from 'node:crypto';
import sharp from 'sharp';
import { query, withTransaction } from './db.js';
import { HttpError } from './http-error.js';
import { createUsageEvent } from './repositories.js';

export const maxCustomStickerBytes = 2 * 1024 * 1024;
const fail = (status, code, message) => { throw new HttpError(status, message, { code }); };
export const customStickerProjection = row => ({ id:row.id, mimeType:row.mime_type,
  byteSize:row.byte_size,width:row.width,height:row.height,downloadPath:`/api/custom-stickers/${row.id}/content` });

export async function normalizeCustomStickerUpload({mimeType,bytes}) {
  if (!['image/jpeg','image/png','image/webp'].includes(mimeType)) fail(415,'CUSTOM_STICKER_FORMAT','仅支持静态JPEG、PNG或WebP表情。');
  if (!Buffer.isBuffer(bytes) || !bytes.length) fail(400,'CUSTOM_STICKER_EMPTY','请选择非空图片。');
  if (bytes.length > maxCustomStickerBytes) fail(413,'CUSTOM_STICKER_TOO_LARGE','表情不能超过2MiB。');
  try {
    const image=sharp(bytes,{limitInputPixels:16_000_000,animated:true});
    const metadata=await image.metadata();
    if (!['jpeg','png','webp'].includes(metadata.format) || (metadata.pages || 1)!==1) fail(415,'CUSTOM_STICKER_FORMAT','仅支持静态JPEG、PNG或WebP表情。');
    // Normalize every source to static PNG: preserves transparency, removes EXIF
    // and prevents source filenames/URLs from entering messages or audit logs.
    const {data:content,info}=await image.rotate().resize({width:512,height:512,fit:'inside',withoutEnlargement:true}).png().toBuffer({resolveWithObject:true});
    if (content.length > maxCustomStickerBytes) fail(413,'CUSTOM_STICKER_TOO_LARGE','处理后的表情不能超过2MiB。');
    return {content,mimeType:'image/png',width:info.width,height:info.height};
  } catch(error) { if(error instanceof HttpError) throw error; fail(415,'CUSTOM_STICKER_INVALID','表情图片无法解码。'); }
}

export async function createCustomSticker({userId,idempotencyKey,upload,transact=withTransaction}) {
  const normalized=await normalizeCustomStickerUpload(upload);
  const requestHash=crypto.createHash('sha256').update(upload.mimeType).update(upload.bytes).digest('hex');
  const checksum=crypto.createHash('sha256').update(normalized.content).digest('hex');
  const row=await transact(async connection=>{
    // Shared transaction lock serializes capacity reservations across instances.
    await connection.query('SELECT pg_advisory_xact_lock(?,?)',[531942,1]);
    const [existing]=await connection.query('SELECT * FROM custom_stickers WHERE user_id=? AND idempotency_key=?',[userId,idempotencyKey]);
    if(existing) {
      if(existing.request_hash!==requestHash) fail(409,'CUSTOM_STICKER_IDEMPOTENCY_CONFLICT','此收藏请求已用于其他图片。');
      if(existing.deleted_at) fail(410,'CUSTOM_STICKER_DELETED','此收藏已删除，请使用新的请求标识重新收藏。');
      return existing;
    }
    const [usage]=await connection.query(`SELECT count(*)::bigint AS total_count,COALESCE(sum(byte_size),0)::bigint AS total_bytes,
      count(*) FILTER(WHERE user_id=?)::bigint AS user_count,COALESCE(sum(byte_size) FILTER(WHERE user_id=?),0)::bigint AS user_bytes FROM custom_stickers`,[userId,userId]);
    // Deleted favorites with message references retain bytes and still consume
    // capacity; never reclaim those assets merely to admit a new upload.
    if(Number(usage.user_count)>=1000 || Number(usage.user_bytes)+normalized.content.length>104857600) fail(409,'CUSTOM_STICKER_USER_QUOTA','自定义表情存储容量已满。');
    if(Number(usage.total_count)>=100000 || Number(usage.total_bytes)+normalized.content.length>5368709120) fail(409,'CUSTOM_STICKER_GLOBAL_CAPACITY','自定义表情服务容量已满。');
    const [created]=await connection.query(`INSERT INTO custom_stickers(id,user_id,idempotency_key,request_hash,mime_type,byte_size,width,height,checksum_sha256,content)
      VALUES(?,?,?,?,?,?,?,?,?,?) RETURNING *`,[crypto.randomUUID(),userId,idempotencyKey,requestHash,normalized.mimeType,normalized.content.length,normalized.width,normalized.height,checksum,normalized.content]);
    await createUsageEvent({userId,eventType:'custom_sticker.collect',targetType:'custom_sticker',targetId:created.id,payload:{}},connection.query.bind(connection));
    return created;
  });
  return customStickerProjection(row);
}
export async function listCustomStickers({userId,limit=100,before,queryFn=query}) {
  const rows=await queryFn(`SELECT id,mime_type,byte_size,width,height,created_at FROM custom_stickers
    WHERE user_id=? AND deleted_at IS NULL ${before?'AND (created_at,id) < (SELECT created_at,id FROM custom_stickers WHERE id=? AND user_id=?)':''}
    ORDER BY created_at DESC,id DESC LIMIT ?`,[userId,...(before?[before,userId]:[]),limit]);
  return rows.map(row=>({...customStickerProjection(row),createdAt:row.created_at}));
}
export async function deleteCustomSticker({userId,stickerId,transact=withTransaction}) {
  return transact(async connection=>{
    const [row]=await connection.query('SELECT id,deleted_at FROM custom_stickers WHERE id=? AND user_id=? FOR UPDATE',[stickerId,userId]);
    if(!row) fail(404,'CUSTOM_STICKER_NOT_FOUND','表情不存在。');
    if(!row.deleted_at) {
      await connection.query('UPDATE custom_stickers SET deleted_at=CURRENT_TIMESTAMP WHERE id=?',[stickerId]);
      await createUsageEvent({userId,eventType:'custom_sticker.delete',targetType:'custom_sticker',targetId:stickerId,payload:{}},connection.query.bind(connection));
    }
    return {ok:true};
  });
}
export async function resolveCustomStickerForMessage({userId,threadId,stickerId,queryFn=query}) {
  if(!stickerId) return null;
  const [thread]=await queryFn('SELECT id,agent_id FROM chat_threads WHERE id=? AND user_id=?',[threadId,userId]);
  if(!thread) fail(404,'CHAT_THREAD_NOT_FOUND','会话不存在。');
  if(thread.agent_id) fail(400,'CUSTOM_STICKER_AGENT_UNSUPPORTED','自定义表情仅支持普通聊天。');
  const [row]=await queryFn('SELECT id,mime_type,byte_size,width,height FROM custom_stickers WHERE id=? AND user_id=? AND deleted_at IS NULL',[stickerId,userId]);
  if(!row) fail(404,'CUSTOM_STICKER_NOT_FOUND','表情不存在或不在本人收藏中。');
  return customStickerProjection(row);
}
export async function readCustomSticker({userId,stickerId,queryFn=query}) {
  const [row]=await queryFn(`SELECT s.* FROM custom_stickers s WHERE s.id=? AND (
    (s.user_id=? AND s.deleted_at IS NULL) OR EXISTS(
      SELECT 1 FROM custom_sticker_message_references r JOIN chat_messages m ON m.id=r.message_id
      JOIN chat_threads t ON t.id=m.thread_id
      WHERE r.sticker_id=s.id AND t.user_id=? AND m.deleted_at IS NULL AND m.recalled_at IS NULL
      AND (t.group_id IS NULL OR EXISTS(SELECT 1 FROM chat_group_members gm WHERE gm.group_id=t.group_id AND gm.user_id=? AND gm.left_at IS NULL))
    ))`,[stickerId,userId,userId,userId]);
  if(!row) fail(404,'CUSTOM_STICKER_NOT_FOUND','表情不存在或无权读取。');
  return {sticker:customStickerProjection(row),content:row.content};
}
