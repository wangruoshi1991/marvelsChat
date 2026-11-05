import assert from "node:assert/strict";
import crypto from "node:crypto";
import test from "node:test";
import { getPool, closeDatabase } from "../src/db.js";
import { applyPendingMigrations } from "../src/migration-ledger.js";
import { loadMigrationFiles } from "../src/migration-files.js";
import { checkUIPreferenceUpgrade } from "../scripts/check-ui-preference-upgrade.js";
import { defaultUIPreferences } from "../../shared/ui-preferences.js";

const enabled = process.env.RUN_UI_PREFERENCE_PREFLIGHT_POSTGRES === "1";

test("read-only preflight detects malformed profiles and validates migration upgrade history", { skip: !enabled }, async () => {
  const database = new URL(process.env.DATABASE_URL);
  assert.ok(["127.0.0.1", "localhost"].includes(database.hostname));
  assert.match(database.pathname, /^\/miaoxun_ui_preflight_[a-z0-9_]+_migration_test$/);
  const pool = await getPool();
  const migrations = await loadMigrationFiles();
  const client = await pool.connect();
  try {
    const identity = await client.query("SELECT current_database() AS name");
    assert.equal(identity.rows[0].name, database.pathname.slice(1));
    await applyPendingMigrations({ client, migrations: migrations.filter(item => item.filename < "055_ui_preference_previews.sql") });
    const userId = crypto.randomUUID();
    await client.query("INSERT INTO users (id,email,password_hash,display_name,ai_id) VALUES ($1,$2,'test','test',$3)",
      [userId, `${userId}@example.invalid`, "987654320001"]);
    await client.query("INSERT INTO user_profiles (user_id,nickname,avatar_text,station_config) VALUES ($1,'test','T',$2::jsonb)",
      [userId, JSON.stringify({ uiPreferences: null })]);
    const invalid = await checkUIPreferenceUpgrade({ pool, migrations, batchSize: 1 });
    assert.equal(invalid.ok, false);
    assert.equal(invalid.profiles.invalidPreferences, 1);
    assert.equal(invalid.appliedCount, 54);
    await client.query("UPDATE user_profiles SET station_config = '{}'::jsonb WHERE user_id = $1", [userId]);
    const valid = await checkUIPreferenceUpgrade({ pool, migrations, batchSize: 1 });
    assert.equal(valid.ok, true);
    assert.equal(valid.profiles.scanned, 1);
    assert.deepEqual(valid.pending, migrations.filter(item => item.filename >= "055_ui_preference_previews.sql").map(item => item.filename));
    await client.query("CREATE TABLE ui_preference_previews (id uuid)");
    const residue = await checkUIPreferenceUpgrade({ pool, migrations });
    assert.equal(residue.ok, false);
    assert.equal(residue.code, "UI_PREFERENCE_UNTRACKED_SCHEMA");
    await client.query("DROP TABLE ui_preference_previews");
    if (migrations.some(item => item.filename === "056_workspace_agent_contributions.sql")) {
      await client.query("CREATE INDEX idx_agent_workspace_nodes_owner_agent_updated ON agent_workspace_nodes (id)");
      const indexResidue = await checkUIPreferenceUpgrade({ pool, migrations });
      assert.equal(indexResidue.ok, false);
      assert.equal(indexResidue.code, "WORKSPACE_CONTRIBUTION_UNTRACKED_INDEX");
      await client.query("DROP INDEX idx_agent_workspace_nodes_owner_agent_updated");
    }
    const alteredMigrations = migrations.map(item => item.filename === "054_chat_attachment_lifecycle.sql"
      ? { ...item, sql: `${item.sql}\n-- altered for checksum test` }
      : item);
    const checksumMismatch = await checkUIPreferenceUpgrade({ pool, migrations: alteredMigrations });
    assert.equal(checksumMismatch.ok, false);
    assert.equal(checksumMismatch.code, "UI_PREFERENCE_MIGRATION_BASELINE_INVALID");
    assert.equal(checksumMismatch.profiles, undefined);

    const historical = defaultUIPreferences();
    historical.revision = 7;
    historical.components.miao["miao.taskCard.participants"] = { slot: "floating" };
    historical.components.secondFloor["secondFloor.album.upload"] = { order: 3, label: "私有上传文案" };
    const historicalConfig = { uiPreferences: historical };
    await client.query("UPDATE user_profiles SET station_config = $1::jsonb WHERE user_id = $2",
      [JSON.stringify(historicalConfig), userId]);
    const assertHistoricalRejected = async () => {
      const summary = await checkUIPreferenceUpgrade({ pool, migrations, batchSize: 1 });
      assert.equal(summary.ok, false);
      assert.equal(summary.code, "UI_PREFERENCE_DATA_INVALID");
      assert.deepEqual(summary.profiles, { scanned: 1, invalidStationConfig: 0,
        invalidPreferences: 0, exhaustedRevision: 0, unsupportedPreferences: 1 });
      const output = JSON.stringify(summary);
      assert.ok(!output.includes(userId));
      assert.doesNotMatch(output, /floating|私有上传文案|uiPreferences|station_config/);
      const stored = await client.query("SELECT station_config FROM user_profiles WHERE user_id = $1", [userId]);
      assert.deepEqual(stored.rows[0].station_config, historicalConfig,
        "read-only preflight must not discard or normalize unsupported historical fields");
    };
    await assertHistoricalRejected();
    await applyPendingMigrations({ client, migrations });
    await assertHistoricalRejected();
    await client.query("UPDATE user_profiles SET station_config = '{}'::jsonb WHERE user_id = $1", [userId]);
    assert.equal((await checkUIPreferenceUpgrade({ pool, migrations })).ok, true);
  } finally {
    client.release();
    await closeDatabase();
  }
});
