import crypto from "node:crypto";
import { HttpError } from "./http-error.js";

export const discussionHistoryHash = row => {
  // Preserve the already persisted metadata-only Butler history hashes.
  const values = [row.sender_type, row.content, row.metadata.workspaceContext, row.metadata.workspaceDiscussion?.agentVersion];
  if (row.metadata.workspaceContext?.nodeId) values.push(row.metadata.workspaceContributionDiscussion);
  return crypto.createHash("sha256").update(JSON.stringify(values)).digest("hex");
};

const changed = () => new HttpError(409, "本轮讨论引用的历史消息已删除、撤回或变化，请重新核对原贡献。", {
  code: "WORKSPACE_DISCUSSION_HISTORY_CHANGED",
});

// A reply can quote earlier discussion replies. Walk their recorded provenance
// as well, so recalling a turn also closes later answers derived from it.
export async function validateDiscussionHistory(connection, { userId, threadId, history, transitive = false }) {
  let pending = history;
  const validated = new Map();
  while (pending?.length) {
    const expected = new Map();
    for (const item of pending) {
      if (!item || typeof item.id !== "string" || typeof item.hash !== "string" ||
          (validated.has(item.id) && validated.get(item.id) !== item.hash) ||
          (expected.has(item.id) && expected.get(item.id) !== item.hash)) throw changed();
      if (!validated.has(item.id)) expected.set(item.id, item.hash);
    }
    if (!expected.size) return;
    const rows = await connection.query(`SELECT id,sender_type,content,metadata FROM chat_messages WHERE user_id = ? AND thread_id = ?
      AND id = ANY(?::text[]) AND deleted_at IS NULL AND recalled_at IS NULL ORDER BY id FOR SHARE`,
    [userId, threadId, [...expected.keys()]]);
    if (rows.length !== expected.size || rows.some(row => discussionHistoryHash(row) !== expected.get(row.id))) throw changed();
    pending = [];
    for (const row of rows) {
      validated.set(row.id, expected.get(row.id));
      if (transitive && row.metadata.workspaceDiscussion?.history) pending.push(...row.metadata.workspaceDiscussion.history);
    }
  }
}
