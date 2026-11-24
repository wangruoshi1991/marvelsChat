import { createHash } from "node:crypto";
import { z } from "zod";
import { withTransaction } from "./db.js";
import { HttpError } from "./http-error.js";
import { publicMessage } from "./public-message.js";
import { mapMessage } from "./repository-mappers.js";

const cursorPayload = z.tuple([
  z.literal(1),
  z.string(),
  z.iso.datetime({ precision: 6 }).refine((date) => !date.startsWith("0000-")),
  z.uuid(),
]);

function decodeCursor(cursor, scope) {
  try {
    const [, cursorScope, createdAt, id] = cursorPayload.parse(
      JSON.parse(Buffer.from(cursor, "base64url").toString("utf8")),
    );
    if (cursorScope === scope) return { createdAt, id };
  } catch {
    // The cursor is supplied by the client and may be malformed.
  }
  throw new HttpError(400, "Invalid message search cursor");
}

export async function searchChatMessages({ userId, threadId, q, cursor, limit }) {
  const scope = createHash("sha256")
    .update(JSON.stringify([userId, threadId, q]))
    .digest("base64url");
  const before = cursor ? decodeCursor(cursor, scope) : null;
  const rows = await withTransaction(async (connection) => {
    await connection.query("SET LOCAL statement_timeout = '1500ms'");
    return connection.query(
      `SELECT match.*,
        to_char(match.created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS cursor_created_at
      FROM chat_threads t
      LEFT JOIN LATERAL (
        SELECT m.* FROM chat_messages m
        WHERE m.thread_id = t.id
          AND m.deleted_at IS NULL AND m.recalled_at IS NULL
          AND m.sender_type <> 'agent'
          AND m.metadata -> 'workspaceContext' ->> 'nodeId' IS NULL
          AND m.metadata -> 'agentWorkspace' ->> 'id' IS NULL
          AND strpos(lower(m.content), lower(?::text)) > 0
          ${before ? "AND (m.created_at, m.id) < (?::timestamptz, ?::char(36))" : ""}
        ORDER BY m.created_at DESC, m.id DESC
        LIMIT ?
      ) match ON true
      WHERE t.user_id = ? AND t.id = ? AND t.kind IN ('direct', 'group') AND t.agent_id IS NULL
      ORDER BY match.created_at DESC, match.id DESC`,
      [q, ...(before ? [before.createdAt, before.id] : []), limit + 1, userId, threadId],
    );
  }).catch((error) => {
    if (error.code === "57014") {
      throw new HttpError(503, "Message search timed out", { code: "CHAT_SEARCH_TIMEOUT" });
    }
    throw error;
  });

  if (!rows.length) throw new HttpError(404, "Thread not found");
  if (!rows[0].id) return { items: [], nextCursor: null };

  const last = rows[limit - 1];
  const nextCursor = rows.length > limit
    ? Buffer.from(JSON.stringify([1, scope, last.cursor_created_at, last.id])).toString("base64url")
    : null;
  return { items: rows.slice(0, limit).map(mapMessage).map(publicMessage), nextCursor };
}
