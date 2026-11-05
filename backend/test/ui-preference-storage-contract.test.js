import assert from "node:assert/strict";
import test from "node:test";
import { loadMigrationFiles } from "../src/migration-files.js";
import { mapProfile } from "../src/repository-mappers.js";
import { defaultUIPreferences } from "../../shared/ui-preferences.js";

test("UI preference migrations continue after the published schema 054 sequence", async () => {
  const filenames = (await loadMigrationFiles()).map(({ filename }) => filename);
  assert.ok(filenames.includes("051_user_ui_preferences.sql"));
  assert.ok(filenames.includes("052_group_chat.sql"));
  assert.ok(filenames.includes("053_chat_attachments.sql"));
  assert.ok(filenames.includes("054_chat_attachment_lifecycle.sql"));
  assert.ok(filenames.includes("055_ui_preference_previews.sql"));
  assert.equal(filenames.includes("051_ui_preference_previews.sql"), false);
});

test("bootstrap profile mapping reads UI preferences from station config", () => {
  const preferences = {
    ...defaultUIPreferences(),
    revision: 7,
    density: "compact",
  };
  const mapped = mapProfile({
    user_id: "user-1",
    nickname: "Gary",
    station_config: JSON.stringify({
      uiPreferences: preferences,
      unrelated: "preserved",
    }),
  });

  assert.equal(mapped.stationConfig.unrelated, "preserved");
  assert.deepEqual(mapped.stationConfig.uiPreferences, preferences);
  assert.throws(() => mapProfile({ user_id: "user-1", station_config: { uiPreferences: { ...preferences, revision: 9007199254740992 } } }),
    /revision/);
  assert.throws(() => mapProfile({ user_id: "user-1", station_config: { uiPreferences: null } }),
    /Stored UI preferences must be an object/);
});
