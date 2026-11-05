import crypto from 'node:crypto';
import sharp from 'sharp';
import { query, withTransaction } from './db.js';
import { config } from './config.js';
import { HttpError } from './http-error.js';
import { parseUploadedText } from './file-content.js';
export { collectExpiredChatAttachments, readChatAttachmentCapacity } from './chat-attachment-lifecycle.js';

export const maxChatAttachmentBytes = 8 * 1024 * 1024;
const fail = (status, code, message) => { throw new HttpError(status, message, { code }); };
const validName = name => typeof name === 'string' && name.trim() && name.length <= 180 && !Array.from(name).some(character => character.charCodeAt(0) < 32 || character.charCodeAt(0) === 92 || character === '/');
const projection = row => ({ id: row.id, kind: row.kind, filename: row.filename, title: row.title,
  mimeType: row.mime_type, byteSize: row.byte_size, durationMs: row.duration_ms,
  downloadPath: row.content || row.checksum_sha256 ? `/api/chat-attachments/${row.id}/content` : null,
  data: row.data || {} });

function boxes(bytes, start, end) {
  const result = [];
  let offset = start;
  while (offset + 8 <= end) {
    const size = bytes.readUInt32BE(offset);
    if (size < 8 || offset + size > end) fail(415, 'CHAT_AUDIO_INVALID', '录音文件结构无效。');
    result.push({ type: bytes.toString('ascii', offset + 4, offset + 8), start: offset + 8, end: offset + size });
    offset += size;
  }
  if (offset !== end) fail(415, 'CHAT_AUDIO_INVALID', '录音文件结构无效。');
  return result;
}
export function chatAudioDuration(bytes) {
  const top = boxes(bytes, 0, bytes.length);
  const ftyp = top.find(box => box.type === 'ftyp');
  const moov = top.find(box => box.type === 'moov');
  if (!ftyp || !moov || !top.some(box => box.type === 'mdat')) fail(415, 'CHAT_AUDIO_INVALID', '请选择有效的M4A录音。');
  const tracks = boxes(bytes, moov.start, moov.end).filter(box => box.type === 'trak');
  if (tracks.length !== 1) fail(415, 'CHAT_AUDIO_INVALID', '仅支持单音轨录音。');
  const mdia = boxes(bytes, tracks[0].start, tracks[0].end).find(box => box.type === 'mdia');
  if (!mdia) fail(415, 'CHAT_AUDIO_INVALID', '录音缺少音轨。');
  const track = boxes(bytes, mdia.start, mdia.end);
  const hdlr = track.find(box => box.type === 'hdlr');
  const mdhd = track.find(box => box.type === 'mdhd');
  if (!hdlr || hdlr.end - hdlr.start < 12 || bytes.toString('ascii', hdlr.start + 8, hdlr.start + 12) !== 'soun' || !mdhd) fail(415, 'CHAT_AUDIO_INVALID', '仅支持音频录音。');
  const version = bytes[mdhd.start];
  const minimum = version === 1 ? 32 : 20;
  if (![0,1].includes(version) || mdhd.end - mdhd.start < minimum) fail(415, 'CHAT_AUDIO_INVALID', '录音时长无效。');
  const timescale = bytes.readUInt32BE(mdhd.start + (version === 1 ? 20 : 12));
  const duration = version === 1 ? Number(bytes.readBigUInt64BE(mdhd.start + 24)) : bytes.readUInt32BE(mdhd.start + 16);
  const durationMs = Math.round(duration * 1000 / timescale);
  if (!Number.isSafeInteger(durationMs) || durationMs < 1 || durationMs > 61000) fail(415, 'CHAT_AUDIO_DURATION', '录音须在60秒以内。');
  return durationMs;
}

export async function normalizeChatUpload({ kind, filename, mimeType, bytes }) {
  if (!validName(filename)) fail(400, 'CHAT_ATTACHMENT_NAME', '附件名称无效。');
  if (!Buffer.isBuffer(bytes) || !bytes.length) fail(400, 'CHAT_ATTACHMENT_EMPTY', '请选择非空附件。');
  if (bytes.length > maxChatAttachmentBytes) fail(413, 'CHAT_ATTACHMENT_TOO_LARGE', '附件不能超过8MiB。');
  let durationMs = null;
  let content = bytes;
  if (kind === 'image') {
    if (!['image/jpeg','image/png','image/webp'].includes(mimeType)) fail(415, 'CHAT_IMAGE_FORMAT', '请选择JPEG、PNG或WebP图片。');
    try {
      const image = sharp(bytes, { limitInputPixels: 40_000_000 });
      const meta = await image.metadata();
      if (!['jpeg','png','webp'].includes(meta.format) || (meta.pages || 1) !== 1) fail(415, 'CHAT_IMAGE_FORMAT', '仅支持静态图片。');
      content = await image.rotate().resize({ width: 2048, height: 2048, fit: 'inside', withoutEnlargement: true }).jpeg({ quality: 88 }).toBuffer();
      if (content.length > maxChatAttachmentBytes) fail(413, 'CHAT_ATTACHMENT_TOO_LARGE', '处理后的图片不能超过8MiB。');
      mimeType = 'image/jpeg';
      filename = filename.replace(/\.[^.]*$/, '') + '.jpg';
    } catch (error) { if (error instanceof HttpError) throw error; fail(415, 'CHAT_IMAGE_INVALID', '图片无法解码。'); }
  } else if (kind === 'audio') {
    if (mimeType !== 'audio/mp4') fail(415, 'CHAT_AUDIO_FORMAT', '仅支持M4A录音。');
    durationMs = chatAudioDuration(bytes);
  } else if (kind === 'file') {
    parseUploadedText({ originalFilename: filename, mimeType, bytes });
  } else fail(400, 'CHAT_ATTACHMENT_KIND', '附件类型无效。');
  return { kind, filename, title: filename, mimeType, durationMs, content, data: {} };
}

async function assertThread(userId, threadId, q) {
  const [thread] = await q('SELECT id, agent_id FROM chat_threads WHERE id = ? AND user_id = ?', [threadId, userId]);
  if (!thread) fail(404, 'CHAT_THREAD_NOT_FOUND', '会话不存在。');
  return thread;
}

export async function createChatAttachment({ userId, threadId, idempotencyKey, upload, structured, queryFn = query, limits = config.chatAttachments, transact = withTransaction }) {
  const thread = await assertThread(userId, threadId, queryFn);
  // Model attachment interpretation uses the existing selected-resource contract.
  // A chat audio blob must never be described to the user as an AI transcript.
  if (thread.agent_id) fail(400, 'AGENT_ATTACHMENT_REFERENCE_REQUIRED', 'Agent会话请使用素材引用；语音可先转成文字后发送。');
  let normalized = upload ? await normalizeChatUpload(upload) : null;
  if (structured) {
    let title, data;
    if (structured.kind === 'location') {
      if (!Number.isFinite(structured.latitude) || Math.abs(structured.latitude) > 90 || !Number.isFinite(structured.longitude) || Math.abs(structured.longitude) > 180) fail(400, 'CHAT_LOCATION_INVALID', '位置坐标无效。');
      title = String(structured.label || '位置').trim().slice(0, 160);
      data = { latitude: structured.latitude, longitude: structured.longitude, label: title };
    } else if (structured.kind === 'contact') {
      const [profile] = await queryFn(`SELECT u.id, COALESCE(NULLIF(p.nickname,''),u.display_name) AS name, u.ai_id
        FROM users u JOIN user_profiles p ON p.user_id=u.id
        WHERE u.id=? AND u.status='active' AND (u.id=? OR EXISTS(SELECT 1 FROM social_relationships r WHERE r.relation_type='friend' AND r.status='active' AND r.follower_user_id=? AND r.followed_user_id=u.id))`, [structured.userId,userId,userId]);
      if (!profile) fail(404, 'CHAT_CONTACT_NOT_FOUND', '联系人不存在或不在好友列表。');
      title = profile.name;
      data = { userId: profile.id, name: profile.name, aiId: profile.ai_id };
    } else if (structured.kind === 'task') {
      const table = structured.taskKind === 'workspace' ? 'agent_workspaces' : structured.taskKind === 'ai' ? 'ai_tasks' : null;
      if (!table) fail(400, 'CHAT_TASK_KIND', '任务类型无效。');
      const [task] = await queryFn(`SELECT id, goal, status FROM ${table} WHERE id=? AND user_id=?`, [structured.taskId,userId]);
      if (!task) fail(404, 'CHAT_TASK_NOT_FOUND', '任务不存在。');
      title = String(task.goal).slice(0,160);
      data = { taskId: task.id, taskKind: structured.taskKind, title, status: task.status };
    } else fail(400, 'CHAT_ATTACHMENT_KIND', '附件类型无效。');
    normalized = { kind: structured.kind, filename: title, title, mimeType: null, durationMs: null, content: null, data };
  }
  if (!normalized) fail(400, 'CHAT_ATTACHMENT_EMPTY', '附件内容缺失。');
  const { kind, filename, title, mimeType, durationMs, content, data } = normalized;
  const checksum = content ? crypto.createHash('sha256').update(content).digest('hex') : null;
  const requestHash = crypto.createHash('sha256').update(JSON.stringify({ threadId, kind, filename, mimeType, durationMs, checksum, data })).digest('hex');
  const row = await transact(async connection => {
    // Every API instance takes the same transaction lock before measuring and
    // reserving capacity. Parallel uploads cannot both spend the last bytes.
    await connection.query('SELECT pg_advisory_xact_lock(?,?)', [531941, 1]);
    const [existing] = await connection.query('SELECT * FROM chat_attachments WHERE user_id=? AND idempotency_key=?', [userId, idempotencyKey]);
    if (existing) {
      if (existing.request_hash !== requestHash) fail(409, 'CHAT_ATTACHMENT_IDEMPOTENCY_CONFLICT', '此附件请求已用于其他内容。');
      return existing;
    }
    const [usage] = await connection.query(`SELECT count(*)::bigint AS total_count,COALESCE(sum(byte_size),0)::bigint AS total_bytes,
      count(*) FILTER(WHERE user_id=?)::bigint AS user_count,COALESCE(sum(byte_size) FILTER(WHERE user_id=?),0)::bigint AS user_bytes FROM chat_attachments`, [userId,userId]);
    const bytes = content?.length || 0;
    if (Number(usage.user_bytes) + bytes > limits.userMaxBytes || Number(usage.user_count) + 1 > limits.userMaxCount)
      fail(409, 'CHAT_ATTACHMENT_USER_QUOTA', '你的聊天附件容量已满，请清理不再需要的消息附件后再试。');
    if (Number(usage.total_bytes) + bytes > limits.globalMaxBytes || Number(usage.total_count) + 1 > limits.globalMaxCount)
      fail(409, 'CHAT_ATTACHMENT_GLOBAL_CAPACITY', '聊天附件服务容量已满，请稍后重试或联系管理员。');
    const [created] = await connection.query(`INSERT INTO chat_attachments (id,user_id,thread_id,idempotency_key,request_hash,kind,filename,title,mime_type,byte_size,duration_ms,checksum_sha256,content,data)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?::jsonb) RETURNING *`, [crypto.randomUUID(),userId,threadId,idempotencyKey,requestHash,kind,filename,title,mimeType,bytes,durationMs,checksum,content,JSON.stringify(data)]);
    return created;
  });
  return projection(row);
}

export async function resolveChatAttachmentsForMessage({ userId, threadId, attachmentIds = [], queryFn = query }) {
  if (!Array.isArray(attachmentIds) || attachmentIds.length > 6 || new Set(attachmentIds).size !== attachmentIds.length) fail(400, 'CHAT_ATTACHMENTS_INVALID', '每条消息最多6个不同附件。');
  if (!attachmentIds.length) return [];
  const thread = await assertThread(userId, threadId, queryFn);
  if (thread.agent_id) fail(400, 'AGENT_ATTACHMENT_REFERENCE_REQUIRED', 'Agent会话请使用素材引用；语音可先转成文字后发送。');
  const result = [];
  for (const id of attachmentIds) {
    const [row] = await queryFn(`SELECT a.*, (a.created_at < clock_timestamp() - (? * INTERVAL '1 hour')
      AND NOT EXISTS(SELECT 1 FROM chat_attachment_references r WHERE r.attachment_id=a.id)) AS expired
      FROM chat_attachments a WHERE a.id=? AND a.user_id=? AND a.thread_id=?`, [config.chatAttachments.draftRetentionHours,id,userId,threadId]);
    if (!row) fail(404, 'CHAT_ATTACHMENT_NOT_FOUND', '附件不存在或不属于当前会话。');
    if (row.expired) fail(410, 'CHAT_ATTACHMENT_EXPIRED', '待发送附件已过期，请重新选择后发送。');
    result.push(projection(row));
  }
  return result;
}

export async function readChatAttachment({ userId, attachmentId, queryFn = query }) {
  const [row] = await queryFn(`SELECT a.* FROM chat_attachments a WHERE a.id=? AND EXISTS(
    SELECT 1 FROM chat_attachment_references r JOIN chat_messages m ON m.id=r.message_id JOIN chat_threads t ON t.id=m.thread_id
    WHERE t.user_id=? AND m.deleted_at IS NULL AND m.recalled_at IS NULL
    AND r.attachment_id=a.id
  )`, [attachmentId,userId]);
  if (!row || !row.content) fail(404, 'CHAT_ATTACHMENT_NOT_FOUND', '附件不存在、消息已撤回或无权读取。');
  return { attachment: projection(row), content: row.content };
}
