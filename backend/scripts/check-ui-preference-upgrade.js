import path from "node:path";
import { fileURLToPath } from "node:url";
import { getPool, closeDatabase } from "../src/db.js";
import { loadMigrationFiles } from "../src/migration-files.js";
import { checkMigrationStatus } from "../src/migration-ledger.js";
import { normalizeStoredUIPreferences, unsupportedUIPreferencePaths } from "../../shared/ui-preferences.js";

// Run on a restored copy before deployment. Output aggregates only.
export async function checkUIPreferenceUpgrade({ pool, migrations, checkStatus = checkMigrationStatus, batchSize = 500 }) {
  if (!Number.isInteger(batchSize) || batchSize < 1 || batchSize > 5000) throw new TypeError("Invalid batch size");
  const client = await pool.connect();
  try {
    await client.query("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");
    await client.query("SET LOCAL statement_timeout = '30s'");
    const status = await checkStatus({ client, migrations });
    const names = migrations.map(item => item.filename).sort();
    const expectedPending = names.slice(status.appliedCount);
    const validBaseline = names[54] === "055_ui_preference_previews.sql" &&
      status.expectedCount === names.length && status.appliedCount >= 54 &&
      status.appliedCount + status.pending.length === names.length &&
      status.current === (status.pending.length === 0) &&
      JSON.stringify(status.pending) === JSON.stringify(expectedPending);
    if (status.message || !validBaseline) {
      return { ok: false, code: "UI_PREFERENCE_MIGRATION_BASELINE_INVALID", appliedCount: status.appliedCount,
        expectedCount: status.expectedCount, pending: status.pending };
    }
    if (status.pending.includes("055_ui_preference_previews.sql")) {
      const { rows } = await client.query(`SELECT count(*)::integer AS existing FROM unnest($1::text[]) name
        WHERE to_regclass('public.' || name) IS NOT NULL`, [[
        "ui_preference_previews", "idx_ui_preference_previews_user_status",
        "idx_ui_preference_previews_expiry", "idx_ui_preference_previews_input_message",
      ]]);
      if (Number(rows[0]?.existing || 0) > 0) return { ok: false, code: "UI_PREFERENCE_UNTRACKED_SCHEMA" };
    }
    if (status.pending.includes("056_workspace_agent_contributions.sql")) {
      const { rows } = await client.query("SELECT to_regclass('public.idx_agent_workspace_nodes_owner_agent_updated') AS existing");
      if (rows[0]?.existing) return { ok: false, code: "WORKSPACE_CONTRIBUTION_UNTRACKED_INDEX" };
    }
    const profiles = { scanned: 0, invalidStationConfig: 0, invalidPreferences: 0, exhaustedRevision: 0, unsupportedPreferences: 0 };
    let cursor = null;
    for (;;) {
      const { rows } = await client.query(`SELECT user_id, station_config, jsonb_typeof(station_config) AS config_type
        FROM user_profiles WHERE ($1::text IS NULL OR user_id > $1)
        ORDER BY user_id LIMIT $2`, [cursor, batchSize]);
      for (const row of rows) {
        profiles.scanned += 1;
        if (row.config_type !== null && row.config_type !== "object") {
          profiles.invalidStationConfig += 1;
          continue;
        }
        try {
          const preferences = normalizeStoredUIPreferences(row.station_config?.uiPreferences);
          if (preferences.revision >= Number.MAX_SAFE_INTEGER) profiles.exhaustedRevision += 1;
          if (unsupportedUIPreferencePaths(preferences).length) profiles.unsupportedPreferences += 1;
        } catch {
          profiles.invalidPreferences += 1;
        }
      }
      if (rows.length < batchSize) break;
      cursor = rows.at(-1).user_id;
    }
    const ok = !profiles.invalidStationConfig && !profiles.invalidPreferences && !profiles.exhaustedRevision && !profiles.unsupportedPreferences;
    return { ok, code: ok ? "UI_PREFERENCE_UPGRADE_READY" : "UI_PREFERENCE_DATA_INVALID",
      appliedCount: status.appliedCount, expectedCount: status.expectedCount, pending: status.pending, profiles };
  } finally {
    try { await client.query("ROLLBACK"); }
    finally { client.release(); }
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const result = await checkUIPreferenceUpgrade({ pool: await getPool(), migrations: await loadMigrationFiles() });
    console.log(JSON.stringify(result, null, 2));
    if (!result.ok) process.exitCode = 1;
  } catch {
    console.error(JSON.stringify({ ok: false, code: "UI_PREFERENCE_PREFLIGHT_FAILED" }));
    process.exitCode = 1;
  } finally {
    await closeDatabase();
  }
}
