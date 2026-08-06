import crypto from "crypto";
import { query } from "./db.js";
import { HttpError } from "./http-error.js";

export const NOTIFICATION_KINDS = Object.freeze({
  FOLLOW_CREATED: "follow.created",
  FRIEND_REQUEST: "friend.request",
  FRIEND_ACCEPTED: "friend.accepted",
});

const notificationTemplates = Object.freeze({
  [NOTIFICATION_KINDS.FOLLOW_CREATED]: ({ actorName }) => ({
    title: "新的关注",
    body: `${actorName || "有人"} 关注了你。`,
  }),
  [NOTIFICATION_KINDS.FRIEND_REQUEST]: ({ actorName }) => ({
    title: "好友申请",
    body: `${actorName || "有人"} 请求添加你为好友。`,
  }),
  [NOTIFICATION_KINDS.FRIEND_ACCEPTED]: ({ actorName }) => ({
    title: "好友申请已通过",
    body: `${actorName || "对方"} 已通过你的好友申请。`,
  }),
});

const toIso = (value) => (value instanceof Date ? value.toISOString() : value || null);

const parseJson = (value, fallback = null) => {
  if (value === null || value === undefined) return fallback;
  if (typeof value === "object") return value;

  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
};

const mapNotification = (row) => ({
  id: row.id,
  kind: row.kind,
  title: row.title,
  body: row.body || "",
  targetType: row.target_type || "",
  targetId: row.target_id || "",
  actorUserId: row.actor_user_id || null,
  actorName: row.actor_name || "",
  payload: {
    ...parseJson(row.payload, {}),
    ...(row.friend_request_status ? { friendRequestStatus: row.friend_request_status } : {}),
  },
  readAt: toIso(row.read_at),
  createdAt: toIso(row.created_at),
});

export async function createNotification({
  userId,
  actorUserId = null,
  actorName = "",
  kind,
  targetType = null,
  targetId = null,
  payload = {},
}) {
  const template = notificationTemplates[kind];
  if (!template) {
    throw new HttpError(500, `Unsupported notification kind: ${kind}`);
  }

  const id = crypto.randomUUID();
  const content = template({ actorName });
  await query(
    `INSERT INTO notifications
      (id, user_id, actor_user_id, kind, title, body, target_type, target_id, payload)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?::jsonb)`,
    [
      id,
      userId,
      actorUserId,
      kind,
      content.title,
      content.body,
      targetType,
      targetId,
      JSON.stringify(payload),
    ],
  );
  return {
    id,
    userId,
    kind,
    title: content.title,
    body: content.body,
    targetType,
    targetId,
    actorUserId,
    actorName,
    payload,
  };
}

export async function listNotificationsForUser(userId, limit = 40) {
  const safeLimit = Number.isInteger(Number(limit))
    ? Math.min(Math.max(Number(limit), 1), 100)
    : 40;
  const rows = await query(
    `SELECT
      n.*,
      actor.display_name AS actor_name,
      request.status AS friend_request_status
    FROM notifications n
    LEFT JOIN users actor ON actor.id = n.actor_user_id
    LEFT JOIN social_requests request
      ON n.target_type = 'friend_request' AND request.id = n.target_id
    WHERE n.user_id = ?
    ORDER BY n.created_at DESC
    LIMIT ${safeLimit}`,
    [userId],
  );
  return rows.map(mapNotification);
}

export async function unreadNotificationCount(userId) {
  const rows = await query(
    "SELECT COUNT(*) AS total FROM notifications WHERE user_id = ? AND read_at IS NULL",
    [userId],
  );
  return Number(rows[0]?.total || 0);
}

export async function markNotificationsRead(userId) {
  await query(
    "UPDATE notifications SET read_at = CURRENT_TIMESTAMP WHERE user_id = ? AND read_at IS NULL",
    [userId],
  );
  return { ok: true };
}

export async function markNotificationRead(userId, notificationId) {
  const rows = await query(
    `UPDATE notifications
    SET read_at = COALESCE(read_at, CURRENT_TIMESTAMP)
    WHERE user_id = ? AND id = ?
    RETURNING id`,
    [userId, notificationId],
  );
  if (!rows.length) {
    throw new HttpError(404, "Notification not found");
  }
  return { ok: true };
}

export async function markNotificationsForTargetRead(userId, targetType, targetId) {
  await query(
    `UPDATE notifications
    SET read_at = COALESCE(read_at, CURRENT_TIMESTAMP)
    WHERE user_id = ? AND target_type = ? AND target_id = ? AND read_at IS NULL`,
    [userId, targetType, targetId],
  );
  return { ok: true };
}
