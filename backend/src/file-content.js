import crypto from 'node:crypto';
import path from 'node:path';
import { HttpError } from './http-error.js';
export const fileParseVersion = 'utf8-text-v1';
export const maxFileBytes = 256 * 1024;
export const maxFileCharacters = 50_000;
const formats = { '.txt': ['text/plain'], '.md': ['text/markdown', 'text/plain'], '.markdown': ['text/markdown', 'text/plain'], '.json': ['application/json', 'text/plain'], '.csv': ['text/csv', 'text/plain'], '.tsv': ['text/tab-separated-values', 'text/plain'] };
const fail = (status, code, message) => { throw new HttpError(status, message, { code }); };
export function validateUploadedTextMetadata({ originalFilename, mimeType }) {
  if (typeof originalFilename !== 'string' || Buffer.from(originalFilename, 'utf8').toString('utf8') !== originalFilename || !originalFilename.trim() || originalFilename.length > 180 || (Array.from(originalFilename).some(char => char.charCodeAt(0) < 32) || /[/\\]/.test(originalFilename))) fail(400, 'FILE_NAME_INVALID', '文件名称无效。');
  const allowed = formats[path.extname(originalFilename).toLowerCase()];
  if (!allowed || !allowed.includes(mimeType)) fail(415, 'FILE_FORMAT_UNSUPPORTED', '仅支持 UTF-8 TXT、Markdown、JSON、CSV 和 TSV 文本文件。');
}
// Public title schemas count UTF-16 units. Keep that bound without splitting
// an astral character into an invalid surrogate that PostgreSQL JSONB rejects.
export function canonicalReferenceTitle(value) {
  let title = '';
  for (const character of String(value)) {
    if (title.length + character.length > 160) break;
    title += character;
  }
  return title;
}
export function parseUploadedText({ originalFilename, mimeType, bytes }) {
  validateUploadedTextMetadata({ originalFilename, mimeType });
  if (!Buffer.isBuffer(bytes)) fail(400, 'FILE_BODY_REQUIRED', '请上传文件内容。');
  if (bytes.length > maxFileBytes) fail(413, 'FILE_TOO_LARGE', '文件不能超过256 KiB。');
  let content;
  try { content = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes); } catch { fail(400, 'FILE_UTF8_INVALID', '文件必须使用有效 UTF-8 编码。'); }
  if (!content.trim() || content.includes('\0')) fail(400, 'FILE_TEXT_INVALID', '文件为空或包含无效文字。');
  if (Array.from(content).length > maxFileCharacters) fail(413, 'FILE_TEXT_TOO_LARGE', '文件正文不能超过50000字符。');
  return { content, checksumSha256: crypto.createHash('sha256').update(bytes).digest('hex'), parseVersion: fileParseVersion };
}
export function fileReference(row) {
  if (row.status !== 'processed' || row.deleted_at || (!row.extracted_text && !row.content_hash) || !row.parse_version) return null;
  const record = { id: row.id, original_filename: row.original_filename, mime_type: row.mime_type, checksum_sha256: row.checksum_sha256, content_hash: row.content_hash || crypto.createHash('sha256').update(row.extracted_text).digest('hex'), parse_version: row.parse_version };
  return { kind: 'station-file', id: row.id, version: crypto.createHash('sha256').update(JSON.stringify(record)).digest('hex'), title: canonicalReferenceTitle(row.original_filename) };
}
