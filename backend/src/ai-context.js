import { fileReference, maxFileCharacters, canonicalReferenceTitle } from './file-content.js';
import crypto from "node:crypto";
import { z } from "zod";
import { query } from "./db.js";
import { HttpError } from "./http-error.js";

export const aiContextReferenceSchema = z.object({
  kind: z.enum(["chat-message", "station-album", "station-diary", "station-photo", "station-file"]),
  id: z.string().uuid(),
  version: z.string().regex(/^[a-f0-9]{64}$/).optional(),
  title: z.string().max(160).optional(),
}).strict();
export const aiContextReferencesSchema = z.array(aiContextReferenceSchema).max(6).default([]);

const definitions = {
  "station-file": {
    scope: "files:read",
    sql: "SELECT id, original_filename, mime_type, checksum_sha256, extracted_text, parse_version, status FROM file_assets WHERE id = ? AND user_id = ? AND deleted_at IS NULL AND status = 'processed' AND extracted_text IS NOT NULL AND parse_version = 'utf8-text-v1'",
    project: row => ({ title: row.original_filename, content: row.extracted_text, parseVersion: row.parse_version }),
  },
  "chat-message": {
    scope: "messages:read",
    sql: `SELECT id, content, sender_name, thread_id FROM chat_messages
      WHERE id = ? AND user_id = ? AND deleted_at IS NULL AND recalled_at IS NULL`,
    project: row => ({ title: "聊天消息", content: String(row.content).slice(0, 4000), sender: row.sender_name, threadId: row.thread_id }),
  },
  "station-album": {
    scope: "album:read",
    sql: "SELECT id, title, description FROM station_albums WHERE id = ? AND user_id = ? AND deleted_at IS NULL",
    project: row => ({ title: row.title, description: String(row.description || "").slice(0, 4000) }),
  },
  "station-diary": {
    scope: "station:read",
    sql: "SELECT id, title, body FROM station_diary_entries WHERE id = ? AND user_id = ? AND deleted_at IS NULL",
    project: row => ({ title: row.title, content: String(row.body).slice(0, 4000) }),
  },
  "station-photo": {
    scope: "album:read",
    sql: `SELECT id, kind, caption, original_filename, content_revision_at FROM station_media_assets
      WHERE id = ? AND user_id = ? AND deleted_at IS NULL AND status = 'uploaded'`,
    project: row => ({ title: row.original_filename || "相册素材", kind: row.kind, caption: String(row.caption || "").slice(0, 4000), contentRevision: row.content_revision_at }),
  },
};

// Client titles and bodies never grant access or become model context. Resolve
// the selected resource under the current owner and declared/granted scopes.
export async function resolveAIContextReferences({ userId, refs, grantedScopes, queryFn = query, lock = false }) {
  const parsed = aiContextReferencesSchema.parse(refs);
  const references = [];
  const context = [];
  // Stable lock order prevents two multi-reference completions from deadlocking.
  for (const ref of [...parsed].sort((a, b) => `${a.kind}:${a.id}`.localeCompare(`${b.kind}:${b.id}`))) {
    const definition = definitions[ref.kind];
    if (!grantedScopes.includes(definition.scope)) {
      throw new HttpError(403, "此 Agent 尚未获准读取所选上下文。请在“我 → 我的 Agent”确认授权范围后新建任务，或移除引用。", { code: "AI_CONTEXT_SCOPE_REQUIRED" });
    }
    const [row] = await queryFn(`${definition.sql}${lock ? " FOR SHARE" : ""}`, [ref.id, userId]);
    if (!row) throw new HttpError(404, "引用内容已删除、撤回或不可访问。", { code: "AI_CONTEXT_NOT_FOUND" });
    const data = definition.project(row);
    // Hash the full selected record, including content outside the display cap.
    const version = ref.kind === "station-file" ? fileReference(row).version : crypto.createHash("sha256").update(JSON.stringify(row)).digest("hex");
    if (ref.version && ref.version !== version) {
      throw new HttpError(409, "引用内容已变化，请重新选择后发送。", { code: "AI_CONTEXT_CHANGED" });
    }
    references.push({ kind: ref.kind, id: ref.id, version, title: canonicalReferenceTitle(data.title) });
    context.push({ kind: ref.kind, id: ref.id, ...data });
  }
  if (context.filter(item => item.kind === 'station-file').reduce((sum, item) => sum + Array.from(item.content).length, 0) > maxFileCharacters) {
    throw new HttpError(413, '所选文件正文总计不能超过50000字符。', { code: 'FILE_CONTEXT_TOO_LARGE' });
  }
  return { references, context };
}
