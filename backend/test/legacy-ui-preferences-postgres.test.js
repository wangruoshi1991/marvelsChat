import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { defaultUiPreferences } from "../../shared/legacy-ui-preferences.js";
import { defaultUIPreferences } from "../../shared/ui-preferences.js";
import { closeDatabase, query } from "../src/db.js";
import { createUiPreferencesRepository } from "../src/ui-preferences-repository.js";
import { readAppUIPreferences, writeAppUIPreferences } from "../src/ui-preferences-app-store.js";
import { updateUserStationConfig } from "../src/station-profile-repository.js";

const enabled = process.env.RUN_LEGACY_UI_PREFERENCES_POSTGRES === "1";

test("published and UI-Agent preferences retain independent values and revisions", {
  skip: !enabled && "Requires a dedicated loopback *_migration_test database",
}, async () => {
  const url = new URL(process.env.DATABASE_URL);
  assert.ok(["127.0.0.1", "localhost"].includes(url.hostname));
  assert.match(url.pathname, /_migration_test$/);
  assert.equal((await query("SELECT current_database() AS name"))[0].name, url.pathname.slice(1));
  const userId = randomUUID();
  const newOnlyUserId = randomUUID();
  const legacy = createUiPreferencesRepository();
  try {
    for (const [index, id] of [userId, newOnlyUserId].entries()) {
      await query("INSERT INTO users (id,email,password_hash,display_name,ai_id) VALUES (?,?,'test-only',?,?)", [id, `${id}@example.invalid`, `UI ${id.slice(0, 8)}`, `9${Date.now().toString().slice(-10)}${index}`]);
      await query("INSERT INTO user_profiles(user_id,nickname,avatar_text,station_config) VALUES (?, 'UI test', 'U', '{\"language\":\"zh\"}'::jsonb)", [id]);
    }
    const oldValue = defaultUiPreferences();
    oldValue.global.radius = "large";
    const oldSaved = await legacy.updateUserUiPreferences({ userId, expectedRevision: 0, confirmed: true, preferences: oldValue });
    assert.equal(oldSaved.revision, 1);

    const newValue = { ...defaultUIPreferences(), density: "compact" };
    const newSaved = await writeAppUIPreferences({ userId, expectedRevision: 0, preferences: newValue });
    assert.equal(newSaved.revision, 1);
    assert.equal(newSaved.density, "compact");
    const [profile] = await query("SELECT station_config FROM user_profiles WHERE user_id = ?", [userId]);
    assert.deepEqual(profile.station_config.uiPreferences, newSaved);
    assert.equal(profile.station_config.language, "zh");
    await assert.rejects(updateUserStationConfig(userId, { uiPreferences: { revision: 999 } }), error => error.status === 400);
    const updatedProfile = await updateUserStationConfig(userId, { language: "en" });
    assert.equal(updatedProfile.stationConfig.language, "en");
    assert.deepEqual(updatedProfile.stationConfig.uiPreferences, newSaved);
    const oldAfterAppSave = await legacy.getUserUiPreferences(userId);
    assert.deepEqual(oldAfterAppSave.preferences, oldSaved.preferences);
    assert.equal(oldAfterAppSave.revision, oldSaved.revision);
    assert.equal(oldAfterAppSave.source, oldSaved.source);
    assert.equal(oldAfterAppSave.updatedAt, oldSaved.updatedAt);

    oldValue.global.accent = "ocean";
    const nextOld = await legacy.updateUserUiPreferences({ userId, expectedRevision: 1, confirmed: true, preferences: oldValue });
    assert.equal(nextOld.revision, 2);
    assert.deepEqual(await readAppUIPreferences(userId), newSaved);
    await assert.rejects(legacy.updateUserUiPreferences({ userId, expectedRevision: 1, confirmed: true, preferences: oldValue }), error => error.status === 409);
    await assert.rejects(writeAppUIPreferences({ userId, expectedRevision: 0, preferences: newValue }), error => error.status === 409);

    const failing = createUiPreferencesRepository({ recordAudit: async () => { throw new Error("audit unavailable"); } });
    await assert.rejects(failing.updateUserUiPreferences({ userId, expectedRevision: 2, confirmed: true, preferences: defaultUiPreferences() }), /audit unavailable/);
    assert.deepEqual(await legacy.getUserUiPreferences(userId), nextOld);
    assert.deepEqual(await readAppUIPreferences(userId), newSaved);

    const absentLegacy = await legacy.getUserUiPreferences(newOnlyUserId);
    await writeAppUIPreferences({ userId: newOnlyUserId, expectedRevision: 0, preferences: newValue });
    assert.deepEqual(await legacy.getUserUiPreferences(newOnlyUserId), absentLegacy);

    const competing = await Promise.allSettled([
      writeAppUIPreferences({ userId, expectedRevision: 1, preferences: newValue }),
      writeAppUIPreferences({ userId, expectedRevision: 1, preferences: defaultUIPreferences() }),
    ]);
    assert.equal(competing.filter(result => result.status === "fulfilled").length, 1);
    assert.equal(competing.find(result => result.status === "rejected").reason.status, 409);
    assert.equal((await readAppUIPreferences(userId)).revision, 2);
  } finally {
    for (const id of [userId, newOnlyUserId]) {
      await query("DELETE FROM usage_events WHERE user_id = ?", [id]);
      await query("DELETE FROM users WHERE id = ?", [id]);
    }
    await closeDatabase();
  }
});
