import { withTransaction } from "./db.js";
import { HttpError } from "./http-error.js";
import { lockDirectConversation } from "./message-repository.js";

const unavailable = () => new HttpError(404, "私聊回执不可用。", { code: "CHAT_RECEIPTS_UNAVAILABLE" });

async function withDirectThread({ userId, threadId }, work) {
  return withTransaction(async connection => {
    const [thread] = await connection.query(`SELECT id, user_id, peer_user_id FROM chat_threads
      WHERE id = ? AND user_id = ? AND kind = 'direct' AND agent_id IS NULL
        AND group_id IS NULL AND peer_user_id IS NOT NULL`, [threadId, userId]);
    if (!thread) throw unavailable();
    // Share the send/recall lock: an ACK cannot bring a recalled copy back.
    await lockDirectConversation(connection, userId, thread.peer_user_id);
    const friends = await connection.query(`SELECT r.id FROM social_relationships r
      JOIN users owner ON owner.id = ? AND owner.status = 'active'
      JOIN users peer ON peer.id = ? AND peer.status = 'active'
      WHERE r.relation_type = 'friend' AND r.status = 'active'
        AND ((r.follower_user_id = ? AND r.followed_user_id = ?)
          OR (r.follower_user_id = ? AND r.followed_user_id = ?))
      ORDER BY r.id FOR SHARE OF r, owner, peer`,
    [userId, thread.peer_user_id, userId, thread.peer_user_id, thread.peer_user_id, userId]);
    if (friends.length !== 2) throw unavailable();
    return work(connection, thread);
  });
}

// Use account-local message IDs. Invalid, outgoing, deleted and recalled IDs
// are omitted, so a stale member of a batch cannot block valid acknowledgments.
export async function acknowledgeDirectMessageDelivery({ userId, threadId, messageIds }) {
  return withDirectThread({ userId, threadId }, async (connection, thread) => {
    const rows = await connection.query(`UPDATE chat_messages received
      SET recipient_received_at = COALESCE(received.recipient_received_at, CURRENT_TIMESTAMP)
      FROM chat_threads sent_thread, chat_messages sent
      WHERE received.id = ANY(?::bpchar[]) AND received.thread_id = ? AND received.user_id = ?
        AND received.sender_type = 'user' AND received.metadata ->> 'source' = 'direct'
        AND received.metadata ->> 'senderUserId' = ?
        AND received.deleted_at IS NULL AND received.recalled_at IS NULL
        AND sent_thread.user_id = ? AND sent_thread.peer_user_id = ?
        AND sent_thread.kind = 'direct' AND sent_thread.agent_id IS NULL AND sent_thread.group_id IS NULL
        AND sent.thread_id = sent_thread.id AND sent.user_id = sent_thread.user_id
        AND sent.client_message_id = received.client_message_id AND sent.sender_type = 'user'
        AND sent.metadata ->> 'source' = 'app' AND sent.metadata ->> 'senderUserId' = ?
        AND sent.deleted_at IS NULL AND sent.recalled_at IS NULL
      RETURNING received.id`,
    [messageIds, threadId, userId, thread.peer_user_id, thread.peer_user_id, userId, thread.peer_user_id]);
    return { acknowledgedMessageIds: rows.map(row => row.id) };
  });
}

export async function listDirectMessageReceipts({ userId, threadId, messageIds }) {
  return withDirectThread({ userId, threadId }, async (connection, thread) => {
    const rows = await connection.query(`SELECT sent.id,
        received.recipient_received_at IS NOT NULL AS delivered
      FROM chat_messages sent
      LEFT JOIN chat_threads received_thread ON received_thread.user_id = ?
        AND received_thread.peer_user_id = ? AND received_thread.kind = 'direct'
        AND received_thread.agent_id IS NULL AND received_thread.group_id IS NULL
      LEFT JOIN chat_messages received ON received.thread_id = received_thread.id
        AND received.user_id = received_thread.user_id AND received.client_message_id = sent.client_message_id
        AND received.sender_type = 'user' AND received.metadata ->> 'source' = 'direct'
        AND received.metadata ->> 'senderUserId' = ?
      WHERE sent.id = ANY(?::bpchar[]) AND sent.thread_id = ? AND sent.user_id = ?
        AND sent.sender_type = 'user' AND sent.metadata ->> 'source' = 'app'
        AND sent.metadata ->> 'senderUserId' = ?
        AND sent.deleted_at IS NULL AND sent.recalled_at IS NULL`,
    [thread.peer_user_id, userId, userId, messageIds, threadId, userId, userId]);
    // No read position, receiving timestamp, online status, device or session
    // identifier crosses this boundary. Recipient-local deletion cannot undo
    // a previously confirmed delivery.
    return { receipts: rows.map(row => ({ messageId: row.id, status: row.delivered ? "delivered" : "accepted" })) };
  });
}
