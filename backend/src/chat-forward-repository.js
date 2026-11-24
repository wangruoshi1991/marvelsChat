import crypto from "node:crypto";
import { copyForwardedChatAttachments } from "./chat-attachment-service.js";
import { withTransaction } from "./db.js";
import { listActiveGroupMessageRecipients } from "./group-chat-repository.js";
import { HttpError } from "./http-error.js";
import {
  directConversationLockKey,
  ensureDirectFriendThread,
  insertHumanMessageCopy,
  lockDirectConversation,
} from "./message-repository.js";
import { assertMatchingMessageRetry } from "./message-request.js";
import { mapMessage } from "./repository-mappers.js";

const unavailable = () => new HttpError(404, "会话或消息不存在。", { code: "CHAT_FORWARD_NOT_FOUND" });
const sameKeyConflict = () => new HttpError(409, "此消息标识已被其他请求使用。", { code: "CHAT_FORWARD_KEY_CONFLICT" });

function conversationKey(thread) {
  return thread.group_id
    ? `group:${thread.group_id}`
    : directConversationLockKey(thread.user_id, thread.peer_user_id);
}

async function lockConversations(connection, threads) {
  // Recall and ordinary sends take one of these same locks before message
  // rows. Cross-conversation forwards must agree on a total lock order.
  const byLock = new Map(threads.map(thread => [conversationKey(thread), thread]));
  for (const key of [...byLock.keys()].sort()) {
    const thread = byLock.get(key);
    if (thread.group_id) {
      await connection.query("SELECT id FROM chat_groups WHERE id = ? FOR UPDATE", [thread.group_id]);
    } else {
      await lockDirectConversation(connection, thread.user_id, thread.peer_user_id);
    }
  }
}

async function directRecipients(connection, thread) {
  const { id, user_id: userId, peer_user_id: peerId } = thread;
  const friends = await connection.query(`SELECT r.id FROM social_relationships r
    JOIN users peer ON peer.id = ? AND peer.status = 'active'
    WHERE r.relation_type = 'friend' AND r.status = 'active'
      AND ((r.follower_user_id = ? AND r.followed_user_id = ?)
        OR (r.follower_user_id = ? AND r.followed_user_id = ?))
    ORDER BY r.id FOR SHARE OF r, peer`, [peerId, userId, peerId, peerId, userId]);
  if (friends.length !== 2) throw new HttpError(403, "好友关系已失效，无法转发。", { code: "CHAT_FORWARD_FRIEND_REQUIRED" });
  const peerThreadId = await ensureDirectFriendThread(connection, peerId, userId);
  return [{ id, user_id: userId }, { id: peerThreadId, user_id: peerId }];
}

async function forwardInTransaction(connection, { user, threadId, messageId, targetThreadId, clientMessageId }) {
  const requestFingerprint = crypto.createHash("sha256")
    .update(JSON.stringify(["chat-forward", threadId, messageId, targetThreadId]))
    .digest("hex");
  const threads = await connection.query(`SELECT id, user_id, kind, peer_user_id, group_id FROM chat_threads
    WHERE user_id = ? AND id = ANY(?::text[]) AND agent_id IS NULL
      AND ((kind = 'direct' AND peer_user_id IS NOT NULL) OR (kind = 'group' AND group_id IS NOT NULL))`,
  [user.id, [threadId, targetThreadId]]);
  const sourceThread = threads.find(thread => thread.id === threadId);
  const target = threads.find(thread => thread.id === targetThreadId);
  if (!target) throw unavailable();
  await lockConversations(connection, threads);

  const [previous] = await connection.query(`SELECT * FROM chat_messages
    WHERE user_id = ? AND client_message_id = ? AND sender_type = 'user'
      AND metadata ->> 'source' = 'app'`, [user.id, clientMessageId]);
  if (previous) {
    if (previous.thread_id !== targetThreadId || previous.metadata?.forwarded !== true) throw sameKeyConflict();
    const message = mapMessage(previous);
    assertMatchingMessageRetry(message, requestFingerprint);
    if (message.deletedAt) throw new HttpError(409, "这条消息已删除，不能重试。", { code: "MESSAGE_DELETED" });
    return { message, deliveries: [], reused: true };
  }
  if (!sourceThread) throw unavailable();

  // The left member's own history stays readable. The target, by contrast,
  // must still grant the sender write access at the time of a new forward.
  const recipients = target.group_id
    ? await listActiveGroupMessageRecipients(connection, target.group_id)
    : await directRecipients(connection, target);
  if (!recipients.some(recipient => recipient.user_id === user.id))
    throw new HttpError(403, "你已退出群聊，无法转发。", { code: "CHAT_FORWARD_GROUP_LEFT" });

  const [source] = await connection.query(`SELECT id, content, metadata FROM chat_messages
    WHERE id = ? AND thread_id = ? AND user_id = ? AND sender_type = 'user'
      AND deleted_at IS NULL AND recalled_at IS NULL FOR SHARE`,
  [messageId, threadId, user.id]);
  if (!source) throw unavailable();
  if (source.metadata?.sticker || source.metadata?.workspaceContext || source.metadata?.agentWorkspace ||
      source.metadata?.contentPreview || source.metadata?.contentPreviewContext)
    throw new HttpError(400, "仅支持转发文字、图片、录音、视频和文件。", { code: "CHAT_FORWARD_KIND_UNSUPPORTED" });
  const attachments = await copyForwardedChatAttachments(connection, {
    userId: user.id, targetThreadId, sourceMessage: source,
  });
  if (!source.content && !attachments.length) throw unavailable();

  let message;
  const deliveries = [];
  for (const recipient of recipients) {
    const own = recipient.user_id === user.id;
    const copy = await insertHumanMessageCopy(connection, {
      userId: recipient.user_id,
      threadId: recipient.id,
      senderName: user.displayName,
      content: source.content,
      clientMessageId,
      countUnread: !own,
      metadata: {
        source: own ? "app" : target.kind,
        senderUserId: user.id,
        requestFingerprint,
        forwarded: true,
        ...(target.group_id ? { groupId: target.group_id } : {}),
        ...(attachments.length ? { attachments } : {}),
      },
    });
    if (own) message = copy;
    else deliveries.push({ userId: recipient.user_id, message: copy });
  }
  return { message, deliveries, reused: false };
}

export async function forwardChatMessage(input) {
  try {
    return await withTransaction(connection => forwardInTransaction(connection, input));
  } catch (error) {
    // Unique indexes also arbitrate cross-destination races and collisions
    // with ordinary sends, which do not share both conversation locks.
    if (error?.code === "23505" &&
      ["uniq_messages_owner_client_message", "uniq_messages_thread_client_message"].includes(error.constraint)) {
      throw sameKeyConflict();
    }
    throw error;
  }
}
