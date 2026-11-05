import crypto from "node:crypto";
import { query, withTransaction } from "./db.js";
import { HttpError } from "./http-error.js";
import { getThreadForUser, listMessagesForThreads } from "./message-repository.js";
import { mapMessage } from "./repository-mappers.js";

const fingerprint = value => crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex");

export async function createGroupChat({ userId, title, memberUserIds, idempotencyKey }) {
  const peers = [...new Set(memberUserIds)].sort();
  if (peers.includes(userId) || peers.length !== memberUserIds.length || peers.length < 2 || peers.length > 49)
    throw new HttpError(400, "请选择 2–49 位不同好友。", { code: "GROUP_MEMBERS_INVALID" });
  const requestHash = fingerprint([title, peers]);
  const result = await withTransaction(async connection => {
    // Serialize per creator so a retry cannot create another group or membership set.
    await connection.query("SELECT id FROM users WHERE id = ? AND status = 'active' FOR UPDATE", [userId]);
    const [previous] = await connection.query("SELECT * FROM chat_groups WHERE creator_user_id = ? AND idempotency_key = ?", [userId, idempotencyKey]);
    if (previous) {
      if (previous.request_fingerprint !== requestHash) throw new HttpError(409, "群聊提交标识已被其他请求使用。");
      return { groupId: previous.id, created: false };
    }
    for (const peerId of peers) {
      const rows = await connection.query(`SELECT r.id FROM social_relationships r
        JOIN users u ON u.id = ? AND u.status = 'active'
        WHERE r.relation_type = 'friend' AND r.status = 'active'
        AND ((r.follower_user_id = ? AND r.followed_user_id = ?) OR (r.follower_user_id = ? AND r.followed_user_id = ?))
        FOR SHARE OF r`, [peerId, userId, peerId, peerId, userId]);
      if (rows.length !== 2) throw new HttpError(403, "只能邀请当前好友加入群聊。", { code: "GROUP_FRIEND_REQUIRED" });
    }
    const groupId = crypto.randomUUID();
    await connection.query("INSERT INTO chat_groups(id, creator_user_id, title, idempotency_key, request_fingerprint) VALUES (?, ?, ?, ?, ?)", [groupId, userId, title, idempotencyKey, requestHash]);
    for (const memberId of [userId, ...peers]) {
      await connection.query("INSERT INTO chat_group_members(group_id, user_id) VALUES (?, ?)", [groupId, memberId]);
      await connection.query(`INSERT INTO chat_threads(id, user_id, title, status_text, avatar_text, kind, group_id)
        VALUES (?, ?, ?, ?, '群', 'group', ?)`, [crypto.randomUUID(), memberId, title, `${peers.length + 1} 人群聊`, groupId]);
    }
    return { groupId, created: true };
  });
  const threads = await query("SELECT id, user_id FROM chat_threads WHERE group_id = ?", [result.groupId]);
  const thread = await getThreadForUser(userId, threads.find(t => t.user_id === userId).id);
  const messages = await listMessagesForThreads(userId, [thread.id]);
  return { ...result, thread, messages: messages[thread.id] || [], recipients: threads.map(t => t.user_id) };
}

export async function getGroupMembers({ userId, groupId }) {
  const member = await query("SELECT user_id FROM chat_group_members WHERE group_id = ? AND user_id = ? AND left_at IS NULL", [groupId, userId]);
  if (!member.length) throw new HttpError(404, "群聊不存在或你已退出。");
  return query(`SELECT m.user_id AS id, COALESCE(NULLIF(p.nickname, ''), u.display_name) AS name,
    p.avatar_text AS "avatarText" FROM chat_group_members m JOIN users u ON u.id = m.user_id
    JOIN user_profiles p ON p.user_id = u.id WHERE m.group_id = ? AND m.left_at IS NULL ORDER BY m.joined_at, m.user_id`, [groupId]);
}

/** All member copies commit together. Sender identity is never the local thread owner. */
export async function sendGroupMessage({ userId, senderName, threadId, content, clientMessageId, requestFingerprint, metadata = {} }) {
  return withTransaction(async connection => {
    const [thread] = await connection.query("SELECT group_id FROM chat_threads WHERE id = ? AND user_id = ? AND kind = 'group'", [threadId, userId]);
    if (!thread?.group_id) throw new HttpError(404, "群聊不存在。");
    await connection.query("SELECT id FROM chat_groups WHERE id = ? FOR UPDATE", [thread.group_id]);
    const members = await connection.query(`SELECT t.id, t.user_id FROM chat_group_members m JOIN chat_threads t ON t.group_id = m.group_id AND t.user_id = m.user_id
      JOIN users u ON u.id = m.user_id AND u.status = 'active'
      WHERE m.group_id = ? AND m.left_at IS NULL ORDER BY t.user_id`, [thread.group_id]);
    if (!members.some(m => m.user_id === userId)) throw new HttpError(403, "你已退出群聊。");
    const [existing] = await connection.query("SELECT * FROM chat_messages WHERE thread_id = ? AND client_message_id = ?", [threadId, clientMessageId]);
    if (existing) {
      if (existing.metadata?.source !== 'app' || existing.metadata?.senderUserId !== userId || existing.metadata?.requestFingerprint !== requestFingerprint)
        throw new HttpError(409, "消息标识已被其他请求使用。");
      if (existing.deleted_at) throw new HttpError(409, "这条消息已删除，不能重发。");
      return { message: mapMessage(existing), deliveries: [], reused: true };
    }
    const deliveries = [];
    let message;
    for (const member of members) {
      const own = member.user_id === userId;
      let memberMetadata = metadata;
      if (metadata.replyTo?.messageId) {
        const [target] = await connection.query("SELECT client_message_id, metadata FROM chat_messages WHERE id = ? AND thread_id = ? AND recalled_at IS NULL AND deleted_at IS NULL", [metadata.replyTo.messageId, threadId]);
        if (!target) throw new HttpError(404, "回复目标不存在或已撤回。");
        const [localTarget] = await connection.query(`SELECT id FROM chat_messages WHERE thread_id = ? AND client_message_id = ?
          AND metadata ->> 'senderUserId' = ? AND recalled_at IS NULL AND deleted_at IS NULL`, [member.id, target.client_message_id, target.metadata?.senderUserId]);
        memberMetadata = { ...metadata, replyTo: { ...metadata.replyTo, messageId: localTarget?.id || null } };
      }
      const [row] = await connection.query(`INSERT INTO chat_messages(id, thread_id, user_id, sender_type, sender_name, content, metadata, client_message_id)
        VALUES (?, ?, ?, 'user', ?, ?, ?::jsonb, ?) RETURNING *`, [crypto.randomUUID(), member.id, member.user_id, senderName, content,
        JSON.stringify({ ...memberMetadata, source: own ? 'app' : 'group', groupId: thread.group_id, senderUserId: userId, requestFingerprint }), clientMessageId]);
      await connection.query("UPDATE chat_threads SET updated_at = CURRENT_TIMESTAMP, unread_count = unread_count + ? WHERE id = ?", [own ? 0 : 1, member.id]);
      if (own) message = mapMessage(row);
      else deliveries.push({ userId: member.user_id, message: mapMessage(row) });
    }
    return { message, deliveries, reused: false };
  });
}

export async function leaveGroupChat({ userId, groupId }) {
  return withTransaction(async connection => {
    await connection.query("SELECT id FROM chat_groups WHERE id = ? FOR UPDATE", [groupId]);
    const rows = await connection.query("UPDATE chat_group_members SET left_at = CURRENT_TIMESTAMP WHERE group_id = ? AND user_id = ? AND left_at IS NULL RETURNING user_id", [groupId, userId]);
    if (!rows.length) throw new HttpError(404, "群聊不存在或已退出。");
    await connection.query("UPDATE chat_threads SET status_text = '已退出群聊', updated_at = CURRENT_TIMESTAMP WHERE group_id = ? AND user_id = ?", [groupId, userId]);
    await connection.query(`UPDATE chat_threads SET status_text = (SELECT COUNT(*)::text || ' 人群聊' FROM chat_group_members WHERE group_id = ? AND left_at IS NULL), updated_at = CURRENT_TIMESTAMP
      WHERE group_id = ? AND user_id IN (SELECT user_id FROM chat_group_members WHERE group_id = ? AND left_at IS NULL)`, [groupId, groupId, groupId]);
    return { ok: true };
  });
}
