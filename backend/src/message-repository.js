import crypto from "crypto";
import { query, withTransaction } from "./db.js";
import { HttpError } from "./http-error.js";
import {
  displayInitial,
  mapMessage,
  mapThread,
  normalizeOnlineUserIds,
  recallWindowMs,
  sqlLimit,
} from "./repository-mappers.js";

async function getUserProfileSummary(connection, userId) {
  const [rows] = await connection.execute(
    `SELECT
      u.id,
      u.display_name,
      p.nickname,
      p.avatar_text
    FROM users u
    JOIN user_profiles p ON p.user_id = u.id
    WHERE u.id = ? AND u.status = 'active'
    LIMIT 1`,
    [userId],
  );
  return rows[0] || null;
}

async function ensureDirectFriendThread(connection, ownerUserId, peerUserId) {
  const peer = await getUserProfileSummary(connection, peerUserId);
  if (!peer) {
    throw new HttpError(404, "Friend user not found");
  }

  const [existingRows] = await connection.execute(
    "SELECT * FROM chat_threads WHERE user_id = ? AND peer_user_id = ? LIMIT 1",
    [ownerUserId, peerUserId],
  );
  if (existingRows.length) {
    const existing = existingRows[0];
    const nextTitle = peer.nickname || peer.display_name;
    const nextAvatarText = peer.avatar_text || displayInitial(nextTitle);
    if (existing.title !== nextTitle || existing.avatar_text !== nextAvatarText) {
      await connection.execute(
        `UPDATE chat_threads
        SET title = ?, avatar_text = ?, status_text = '好友'
        WHERE id = ?`,
        [nextTitle, nextAvatarText, existing.id],
      );
    }
    return existing.id;
  }

  const threadId = crypto.randomUUID();
  await connection.execute(
    `INSERT INTO chat_threads
      (id, user_id, title, status_text, avatar_text, agent_id, peer_user_id, kind)
    VALUES (?, ?, ?, '好友', ?, NULL, ?, 'direct')
    ON CONFLICT (user_id, peer_user_id)
    WHERE peer_user_id IS NOT NULL
    DO UPDATE SET
      title = EXCLUDED.title,
      status_text = EXCLUDED.status_text,
      avatar_text = EXCLUDED.avatar_text,
      updated_at = chat_threads.updated_at
    RETURNING id`,
    [threadId, ownerUserId, peer.nickname || peer.display_name, peer.avatar_text || displayInitial(peer.display_name), peerUserId],
  );

  const [rows] = await connection.execute(
    "SELECT id FROM chat_threads WHERE user_id = ? AND peer_user_id = ? LIMIT 1",
    [ownerUserId, peerUserId],
  );
  return rows[0]?.id || threadId;
}

async function assertActiveFriendship(connection, userId, friendUserId) {
  if (userId === friendUserId) {
    throw new HttpError(400, "Cannot open a friend thread with yourself");
  }
  const [rows] = await connection.execute(
    `SELECT COUNT(*) AS total
    FROM social_relationships
    WHERE relation_type = 'friend'
      AND status = 'active'
      AND (
        (follower_user_id = ? AND followed_user_id = ?)
        OR (follower_user_id = ? AND followed_user_id = ?)
      )`,
    [userId, friendUserId, friendUserId, userId],
  );
  if (Number(rows[0]?.total || 0) !== 2) {
    throw new HttpError(403, "Friend relationship is required");
  }
}

export async function ensureFriendThreadPair(connection, userId, friendUserId) {
  const ownerThreadId = await ensureDirectFriendThread(connection, userId, friendUserId);
  await ensureDirectFriendThread(connection, friendUserId, userId);
  return ownerThreadId;
}

export async function ensureFriendThreadForUser(userId, friendUserId, onlineUserIds = []) {
  let threadId = null;
  await withTransaction(async (connection) => {
    await assertActiveFriendship(connection, userId, friendUserId);
    threadId = await ensureFriendThreadPair(connection, userId, friendUserId);
  });

  const thread = await getThreadForUser(userId, threadId, onlineUserIds);
  const messages = await listMessagesForThreads(userId, [thread.id]);
  return { thread, messages: messages[thread.id] || [] };
}

export async function mirrorDirectMessageToPeer({ thread, senderUser, content, metadata = {}, clientMessageId }) {
  if (!thread.peerUserId) {
    return null;
  }

  const peerThreadBundle = await ensureFriendThreadForUser(thread.peerUserId, senderUser.id);
  return addMessageToThread({
    userId: thread.peerUserId,
    threadId: peerThreadBundle.thread.id,
    senderType: "user",
    senderName: senderUser.displayName,
    content,
    metadata: { source: "direct", ...metadata, senderUserId: senderUser.id },
    clientMessageId,
    countUnread: true,
  });
}

export async function listThreadsForUser(userId, onlineUserIds = []) {
  const onlineIds = normalizeOnlineUserIds(onlineUserIds);
  const rows = await query(
    `SELECT
      t.*,
      peer_user.ai_id AS peer_ai_id,
      peer_user.presence_mode AS peer_presence_mode,
      (peer_user.id = ANY(?::text[])) AS peer_is_connected,
      peer_profile.avatar_config AS peer_avatar_config,
      last_message.content AS last_content,
      last_message.created_at AS last_message_at
    FROM chat_threads t
    LEFT JOIN users peer_user
      ON peer_user.id = t.peer_user_id
    LEFT JOIN user_profiles peer_profile
      ON peer_profile.user_id = t.peer_user_id
    LEFT JOIN chat_messages last_message
      ON last_message.id = (
        SELECT m.id
        FROM chat_messages m
        WHERE m.thread_id = t.id AND m.deleted_at IS NULL
        ORDER BY m.created_at DESC, m.id DESC
        LIMIT 1
      )
    WHERE t.user_id = ?
    ORDER BY t.pinned DESC, COALESCE(last_message.created_at, t.updated_at) DESC`,
    [onlineIds, userId],
  );

  return rows.map(mapThread);
}

export async function listThreadIdsUpdatedSince(userId, updatedAfter) {
  if (!updatedAfter) {
    const rows = await query(
      `SELECT id
      FROM chat_threads
      WHERE user_id = ?
      ORDER BY updated_at ASC, id ASC`,
      [userId],
    );
    return rows.map((row) => row.id);
  }

  const rows = await query(
    `SELECT id
    FROM chat_threads
    WHERE user_id = ? AND updated_at >= ?
    ORDER BY updated_at ASC, id ASC`,
    [userId, updatedAfter],
  );
  return rows.map((row) => row.id);
}

export async function listMessagesForThreads(userId, threadIds) {
  if (!threadIds.length) return {};

  const placeholders = threadIds.map(() => "?").join(",");
  const rows = await query(
    `SELECT m.*
    FROM chat_messages m
    JOIN chat_threads t ON t.id = m.thread_id
    WHERE t.user_id = ? AND m.thread_id IN (${placeholders}) AND m.deleted_at IS NULL
    ORDER BY m.created_at ASC, m.id ASC`,
    [userId, ...threadIds],
  );

  return rows.reduce((groups, row) => {
    const message = mapMessage(row);
    groups[message.threadId] ||= [];
    groups[message.threadId].push(message);
    return groups;
  }, {});
}

export async function listRecentMessagesForThread(userId, threadId, limit = 12) {
  const rows = await query(
    `SELECT *
    FROM (
      SELECT m.*
      FROM chat_messages m
      JOIN chat_threads t ON t.id = m.thread_id
      WHERE t.user_id = ? AND m.thread_id = ? AND m.deleted_at IS NULL
      ORDER BY m.created_at DESC, m.id DESC
      LIMIT ?
    ) recent
    ORDER BY recent.created_at ASC, recent.id ASC`,
    [userId, threadId, sqlLimit(limit, 12, 30)],
  );

  return rows.map(mapMessage);
}

export async function listMessagesForThreadSince(userId, threadId, createdAfter = null) {
  const rows = createdAfter
    ? await query(
        `SELECT m.*
        FROM chat_messages m
        JOIN chat_threads t ON t.id = m.thread_id
        WHERE t.user_id = ? AND m.thread_id = ? AND m.created_at >= ? AND m.deleted_at IS NULL
        ORDER BY m.created_at ASC, m.id ASC`,
        [userId, threadId, createdAfter],
      )
    : await query(
        `SELECT m.*
        FROM chat_messages m
        JOIN chat_threads t ON t.id = m.thread_id
        WHERE t.user_id = ? AND m.thread_id = ? AND m.deleted_at IS NULL
        ORDER BY m.created_at ASC, m.id ASC`,
        [userId, threadId],
      );

  return rows.map(mapMessage);
}

export async function getThreadForUser(userId, threadId, onlineUserIds = []) {
  const onlineIds = normalizeOnlineUserIds(onlineUserIds);
  const rows = await query(
    `SELECT
      t.*,
      peer_user.ai_id AS peer_ai_id,
      peer_user.presence_mode AS peer_presence_mode,
      (peer_user.id = ANY(?::text[])) AS peer_is_connected,
      peer_profile.avatar_config AS peer_avatar_config
    FROM chat_threads t
    LEFT JOIN users peer_user
      ON peer_user.id = t.peer_user_id
    LEFT JOIN user_profiles peer_profile
      ON peer_profile.user_id = t.peer_user_id
    WHERE t.user_id = ? AND t.id = ?
    LIMIT 1`,
    [onlineIds, userId, threadId],
  );
  return rows[0] ? mapThread(rows[0]) : null;
}

export async function getMessageForUser({ userId, threadId, messageId }) {
  const rows = await query(
    `SELECT m.*
    FROM chat_messages m
    JOIN chat_threads t ON t.id = m.thread_id
    WHERE t.user_id = ? AND t.id = ? AND m.id = ? AND m.deleted_at IS NULL
    LIMIT 1`,
    [userId, threadId, messageId],
  );
  return rows[0] ? mapMessage(rows[0]) : null;
}

export async function addMessageToThread({
  userId,
  threadId,
  senderType,
  senderName,
  content,
  metadata = {},
  clientMessageId = crypto.randomUUID(),
  countUnread,
}) {
  const messageId = crypto.randomUUID();
  const shouldIncreaseUnread = countUnread ?? senderType !== "user";

  await withTransaction(async (connection) => {
    const [threads] = await connection.execute(
      "SELECT id, peer_user_id FROM chat_threads WHERE user_id = ? AND id = ? LIMIT 1",
      [userId, threadId],
    );
    if (!threads.length) throw new HttpError(404, "Thread not found");
    const resolvedMetadata =
      threads[0].peer_user_id && senderType === "user"
        ? { ...metadata, senderUserId: metadata.senderUserId || userId }
        : metadata;

    await connection.execute(
      `INSERT INTO chat_messages
        (id, thread_id, user_id, sender_type, sender_name, content, metadata, client_message_id)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [messageId, threadId, userId, senderType, senderName, content, JSON.stringify(resolvedMetadata), clientMessageId],
    );

    await connection.execute(
      `UPDATE chat_threads
      SET
        updated_at = CURRENT_TIMESTAMP,
        unread_count = CASE WHEN ? THEN unread_count + 1 ELSE unread_count END
      WHERE id = ?`,
      [shouldIncreaseUnread, threadId],
    );
  });

  const rows = await query("SELECT * FROM chat_messages WHERE id = ? LIMIT 1", [messageId]);
  return mapMessage(rows[0]);
}

export async function deleteMessageForUser({ userId, threadId, messageId }) {
  const rows = await query(
    `SELECT m.id
    FROM chat_messages m
    JOIN chat_threads t ON t.id = m.thread_id
    WHERE t.user_id = ? AND t.id = ? AND m.id = ? AND m.deleted_at IS NULL
    LIMIT 1`,
    [userId, threadId, messageId],
  );
  if (!rows.length) throw new HttpError(404, "Message not found");

  await query(
    `UPDATE chat_messages
    SET deleted_at = CURRENT_TIMESTAMP
    WHERE id = ?`,
    [messageId],
  );
}

export async function recallMessageForUser({ userId, threadId, messageId }) {
  const rows = await query(
    `SELECT
      m.*,
      t.peer_user_id,
      (m.created_at >= CURRENT_TIMESTAMP - (? * INTERVAL '1 second')) AS within_recall_window
    FROM chat_messages m
    JOIN chat_threads t ON t.id = m.thread_id
    WHERE t.user_id = ? AND t.id = ? AND m.id = ? AND m.deleted_at IS NULL
    LIMIT 1`,
    [Math.floor(recallWindowMs / 1000), userId, threadId, messageId],
  );
  if (!rows.length) throw new HttpError(404, "Message not found");

  const message = mapMessage(rows[0]);
  const senderUserId =
    typeof message.metadata?.senderUserId === "string" ? message.metadata.senderUserId : message.userId;
  if (message.senderType !== "user" || senderUserId !== userId) {
    throw new HttpError(403, "Only the sender can recall this message");
  }
  if (message.recalledAt) {
    return { message, peerUserId: rows[0].peer_user_id || null, peerMessage: null };
  }
  if (rows[0].within_recall_window !== true) {
    throw new HttpError(409, "消息发出超过 1 分钟，不能撤回");
  }

  const clientMessageId = rows[0].client_message_id;
  if (!clientMessageId) {
    throw new HttpError(409, "This message was created before recall tracking was enabled");
  }
  await query(
    `UPDATE chat_messages
    SET
      recalled_at = CURRENT_TIMESTAMP,
      content = '',
      metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object('recalledByUserId', ?)
    WHERE client_message_id = ? AND metadata ->> 'senderUserId' = ? AND recalled_at IS NULL`,
    [userId, clientMessageId, userId],
  );

  const updatedRows = await query(
    `SELECT m.*, t.user_id AS owner_user_id
    FROM chat_messages m
    JOIN chat_threads t ON t.id = m.thread_id
    WHERE m.client_message_id = ? AND m.metadata ->> 'senderUserId' = ?
    ORDER BY m.created_at ASC, m.id ASC`,
    [clientMessageId, userId],
  );
  const ownRow = updatedRows.find((row) => row.owner_user_id === userId);
  const peerRow = updatedRows.find((row) => row.owner_user_id !== userId);

  return {
    message: ownRow ? mapMessage(ownRow) : message,
    peerUserId: peerRow?.owner_user_id || null,
    peerMessage: peerRow ? mapMessage(peerRow) : null,
  };
}

export async function markThreadReadForUser(userId, threadId) {
  const rows = await query("SELECT id FROM chat_threads WHERE user_id = ? AND id = ? LIMIT 1", [
    userId,
    threadId,
  ]);
  if (!rows.length) {
    throw new HttpError(404, "Thread not found");
  }

  await query(
    `UPDATE chat_threads
    SET unread_count = 0
    WHERE user_id = ? AND id = ?`,
    [userId, threadId],
  );
}

export async function setThreadMutedForUser(userId, threadId, muted) {
  const rows = await query(
    `UPDATE chat_threads
    SET muted = ?
    WHERE user_id = ? AND id = ?
    RETURNING muted`,
    [muted, userId, threadId],
  );
  if (!rows.length) {
    throw new HttpError(404, "Thread not found");
  }
  return { muted: Boolean(rows[0].muted) };
}
