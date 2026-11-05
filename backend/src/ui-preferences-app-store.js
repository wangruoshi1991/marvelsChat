import {
  defaultUIPreferences,
  normalizeStoredUIPreferences,
  normalizeUIPreferences,
} from "../../shared/ui-preferences.js";
import { HttpError } from "./http-error.js";
import { createUsageEvent } from "./repositories.js";
import { query, withTransaction } from "./db.js";

const toJson = (value) => JSON.stringify(value);

export function mapAppUIPreferences(row = {}) {
  const config = typeof row.station_config === "string" ? JSON.parse(row.station_config) : row.station_config;
  return normalizeStoredUIPreferences(config?.uiPreferences);
}

export async function readAppUIPreferences(userId, queryFn = query, lock = false) {
  const rows = await queryFn(
    `SELECT station_config FROM user_profiles WHERE user_id = ?${lock ? " FOR UPDATE" : ""}`,
    [userId],
  );
  if (!rows.length) throw new HttpError(404, "UI preference profile not found.", { code: "UI_PREFERENCES_PROFILE_NOT_FOUND" });
  return mapAppUIPreferences(rows[0]);
}

export async function writeAppUIPreferences({
  userId,
  expectedRevision,
  preferences,
  queryFn,
  recordAudit = createUsageEvent,
  event = {},
}) {
  const existing = queryFn ? { query: queryFn } : null;
  if (existing) return writeWithConnection(existing, { userId, expectedRevision, preferences, recordAudit, event });
  return withTransaction((connection) =>
    writeWithConnection(connection, { userId, expectedRevision, preferences, recordAudit, event }),
  );
}

async function writeWithConnection(
  connection,
  { userId, expectedRevision, preferences, recordAudit, event },
) {
  if (!Number.isSafeInteger(expectedRevision) || expectedRevision < 0 || expectedRevision >= Number.MAX_SAFE_INTEGER) {
    throw new HttpError(400, "UI preference revision is invalid.", {
      code: "UI_PREFERENCE_REVISION_INVALID",
    });
  }
  const owners = await connection.query("SELECT id FROM users WHERE id = ? FOR UPDATE", [userId]);
  if (!owners.length) {
    throw new HttpError(404, "UI preference owner not found.", {
      code: "UI_PREFERENCES_OWNER_NOT_FOUND",
    });
  }
  const current = await readAppUIPreferences(userId, connection.query.bind(connection), true);
  if (current.revision !== expectedRevision) {
    throw new HttpError(409, "UI preferences changed; refresh before confirming.", {
      code: "UI_PREFERENCE_REVISION_CONFLICT",
      expectedRevision,
      currentRevision: current.revision,
    });
  }
  const next = {
    ...normalizeUIPreferences(preferences),
    revision: expectedRevision + 1,
  };
  const rows = await connection.query(
    `UPDATE user_profiles
       SET station_config = jsonb_set(COALESCE(station_config, '{}'::jsonb), '{uiPreferences}', ?::jsonb, true)
     WHERE user_id = ? AND COALESCE((station_config->'uiPreferences'->>'revision')::numeric, 0) = ?
     RETURNING station_config`,
    [toJson(next), userId, expectedRevision],
  );
  if (!rows.length) {
    throw new HttpError(409, "UI preferences changed; refresh before confirming.", {
      code: "UI_PREFERENCE_REVISION_CONFLICT",
      expectedRevision,
      currentRevision: current.revision,
    });
  }
  if (event.eventType) {
    await recordAudit({
      userId,
      targetType: event.targetType || "user_profiles",
      targetId: event.targetId || userId,
      eventType: event.eventType,
      payload: { ...event.payload, previousRevision: expectedRevision, revision: next.revision },
    }, connection.query.bind(connection));
  }
  return mapAppUIPreferences(rows[0]);
}

export const defaultAppUIPreferences = () => defaultUIPreferences();
