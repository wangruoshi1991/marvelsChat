import assert from "node:assert/strict";
import test from "node:test";
import { checkUIPreferenceUpgrade } from "../scripts/check-ui-preference-upgrade.js";
import { defaultUIPreferences } from "../../shared/ui-preferences.js";

function fakePool(batches, migrationStatus) {
  const statements = [];
  let index = 0;
  const client = {
    async query(sql) {
      statements.push(sql);
      if (sql.includes("FROM user_profiles")) return { rows: batches[index++] || [] };
      return { rows: [] };
    },
    release() { statements.push("RELEASE"); },
  };
  return { pool: { connect: async () => client }, statements,
    checkStatus: async () => migrationStatus };
}

const ready054 = { current: false, appliedCount: 54, expectedCount: 55, pending: ["055_ui_preference_previews.sql"] };
const migrations = [
  ...Array.from({ length: 54 }, (_, index) => ({ filename: `${String(index + 1).padStart(3, '0')}_test.sql` })),
  { filename: "055_ui_preference_previews.sql" },
];

test("read-only preflight reports aggregate unsafe data without exposing profiles", async () => {
  const valid = defaultUIPreferences();
  const fixture = fakePool([[
    { user_id: "private-1", config_type: "object", station_config: {} },
    { user_id: "private-2", config_type: "object", station_config: { uiPreferences: valid } },
    { user_id: "private-3", config_type: "array", station_config: [] },
    { user_id: "private-4", config_type: "object", station_config: { uiPreferences: null } },
    { user_id: "private-5", config_type: "object", station_config: { uiPreferences: { ...valid, revision: Number.MAX_SAFE_INTEGER } } },
  ]], ready054);
  const summary = await checkUIPreferenceUpgrade({ ...fixture, migrations, batchSize: 10 });
  assert.equal(summary.ok, false);
  assert.deepEqual(summary.profiles, { scanned: 5, invalidStationConfig: 1, invalidPreferences: 1, exhaustedRevision: 1, unsupportedPreferences: 0 });
  assert.doesNotMatch(JSON.stringify(summary), /private-|uiPreferences|station_config/);
  assert.match(fixture.statements[0], /READ ONLY/);
  assert.equal(fixture.statements.at(-2), "ROLLBACK");
  assert.equal(fixture.statements.at(-1), "RELEASE");
});

test("upgrade preflight rejects readable historical preferences with unsupported capabilities", async () => {
  const historical = defaultUIPreferences();
  historical.components.miao["miao.taskCard.participants"] = { slot: "floating" };
  const fixture = fakePool([[{ user_id: "private-history", config_type: "object", station_config: { uiPreferences: historical } }]], ready054);
  const summary = await checkUIPreferenceUpgrade({ ...fixture, migrations });
  assert.equal(summary.ok, false);
  assert.equal(summary.profiles.unsupportedPreferences, 1);
  assert.equal(summary.profiles.invalidPreferences, 0);
  assert.doesNotMatch(JSON.stringify(summary), /private-history|floating/);
});

test("preflight rejects unexpected migration history before reading profile data", async () => {
  const fixture = fakePool([], { ...ready054, pending: ["054_chat_attachment_lifecycle.sql", "055_ui_preference_previews.sql"] });
  const summary = await checkUIPreferenceUpgrade({ ...fixture, migrations });
  assert.equal(summary.ok, false);
  assert.equal(summary.code, "UI_PREFERENCE_MIGRATION_BASELINE_INVALID");
  assert.ok(fixture.statements.every(sql => !sql.includes("FROM user_profiles")));
});

test("preflight accepts a complete 054 baseline with later migrations pending", async () => {
  const later = { filename: "056_workspace_contributions.sql" };
  const fixture = fakePool([], { ...ready054, expectedCount: 56, pending: ["055_ui_preference_previews.sql", later.filename] });
  const summary = await checkUIPreferenceUpgrade({ ...fixture, migrations: [...migrations, later] });
  assert.equal(summary.ok, true);
  assert.deepEqual(summary.pending, ["055_ui_preference_previews.sql", later.filename]);
});

test("preflight rolls back and releases its connection when profile reading fails", async () => {
  const fixture = fakePool([], ready054);
  const client = await fixture.pool.connect();
  const query = client.query;
  client.query = async (sql) => {
    if (sql.includes("FROM user_profiles")) throw new Error("database read failed");
    return query(sql);
  };
  await assert.rejects(checkUIPreferenceUpgrade({ ...fixture, migrations }), /database read failed/);
  assert.equal(fixture.statements.at(-2), "ROLLBACK");
  assert.equal(fixture.statements.at(-1), "RELEASE");
});
