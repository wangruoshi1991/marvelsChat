import { defaultUiPreferences, diffUiPreferences, normalizeUiPreferences, UI_PREFERENCES_VERSION } from "../../shared/legacy-ui-preferences.js";
import { query, withTransaction } from "./db.js";
import { HttpError } from "./http-error.js";
import { createUsageEvent } from "./repositories.js";

const map = (row) => ({
  version: Number(row.version),
  revision: Number(row.revision),
  preferences: normalizeUiPreferences(row.preferences),
  source: row.source,
  updatedAt: row.updated_at instanceof Date ? row.updated_at.toISOString() : new Date(row.updated_at).toISOString(),
});

const normalizeInput = (value) => {
  try { return normalizeUiPreferences(value); }
  catch (error) {
    if (error.code !== "UI_PREFERENCES_INVALID") throw error;
    throw new HttpError(400, "UI preferences contain unsupported presentation data.", { code: error.code, path: error.path });
  }
};

export function createUiPreferencesRepository({ runQuery = query, transaction = withTransaction, recordAudit = createUsageEvent } = {}) {
  const getUserUiPreferences = async (userId, readQuery = runQuery) => {
    const rows = await readQuery("SELECT version, revision, preferences, source, updated_at FROM user_ui_preferences WHERE user_id = ? LIMIT 1", [userId]);
    if (!rows.length) return { version: UI_PREFERENCES_VERSION, revision: 0, preferences: defaultUiPreferences(), source: "user_confirmed", updatedAt: null };
    return map(rows[0]);
  };

  const updateUserUiPreferences = async ({ userId, expectedRevision, confirmed, preferences, source = "user_confirmed", audit = {} }) => {
    if (confirmed !== true) throw new HttpError(400, "Confirm the UI preference preview before saving.", { code: "UI_PREFERENCES_CONFIRMATION_REQUIRED" });
    if (!Number.isSafeInteger(expectedRevision) || expectedRevision < 0 || expectedRevision >= 2147483647) throw new HttpError(400, "expectedRevision must be a non-negative supported integer", { code: "UI_PREFERENCES_REVISION_REQUIRED" });
    if (!["user_confirmed", "ai_confirmed"].includes(source)) throw new HttpError(400, "Unsupported UI preference source", { code: "UI_PREFERENCES_SOURCE_INVALID" });
    const normalized = normalizeInput(preferences);
    return transaction(async (connection) => {
      const owners = await connection.query("SELECT id FROM users WHERE id = ? FOR UPDATE", [userId]);
      if (!owners.length) throw new HttpError(404, "UI preference owner not found.", { code: "UI_PREFERENCES_OWNER_NOT_FOUND" });
      const rows = await connection.query("SELECT version, revision, preferences, source, updated_at FROM user_ui_preferences WHERE user_id = ? FOR UPDATE", [userId]);
      const currentRevision = rows.length ? Number(rows[0].revision) : 0;
      if (currentRevision !== expectedRevision) throw new HttpError(409, "UI preferences changed; refresh before confirming this suggestion.", { code: "UI_PREFERENCES_REVISION_CONFLICT", expectedRevision, currentRevision });
      const changedPaths = diffUiPreferences(rows.length ? map(rows[0]).preferences : defaultUiPreferences(), normalized).map((change) => change.path);
      const nextRevision = currentRevision + 1;
      if (rows.length) {
        await connection.execute("UPDATE user_ui_preferences SET version = ?, revision = ?, preferences = ?::jsonb, source = ?, updated_at = CURRENT_TIMESTAMP WHERE user_id = ?", [UI_PREFERENCES_VERSION, nextRevision, JSON.stringify(normalized), source, userId]);
      } else {
        await connection.execute("INSERT INTO user_ui_preferences (user_id, version, revision, preferences, source) VALUES (?, ?, ?, ?::jsonb, ?)", [userId, UI_PREFERENCES_VERSION, nextRevision, JSON.stringify(normalized), source]);
      }
      await recordAudit({
        userId, eventType: "ui_preferences.confirm", targetType: "user_ui_preferences", targetId: userId,
        payload: { revision: nextRevision, previousRevision: currentRevision, source, version: UI_PREFERENCES_VERSION, changedPaths },
        ipHash: audit.ipHash || null, userAgent: audit.userAgent || "",
      }, connection.query);
      return getUserUiPreferences(userId, connection.query);
    });
  };
  return { getUserUiPreferences, updateUserUiPreferences };
}

const repository = createUiPreferencesRepository();
export const getUserUiPreferences = repository.getUserUiPreferences;
export const updateUserUiPreferences = repository.updateUserUiPreferences;
