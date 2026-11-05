import assert from "node:assert/strict";
import test from "node:test";
import {
  mapAppUIPreferences,
  readAppUIPreferences,
  writeAppUIPreferences,
} from "../src/ui-preferences-app-store.js";
import { defaultUIPreferences } from "../../shared/ui-preferences.js";

const owner = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

test("App preference reads use the profile and default an absent preference", async () => {
  const calls = [];
  const read = await readAppUIPreferences(owner, async (sql, params) => {
    calls.push({ sql, params });
    return [{ station_config: {} }];
  });
  assert.deepEqual(read, defaultUIPreferences());
  assert.match(calls[0].sql, /FROM user_profiles/);
  assert.match(calls[0].sql, /station_config/);
  assert.throws(() => mapAppUIPreferences({ station_config: { uiPreferences: null } }), /Stored UI preferences must be an object/);
});

test("App preference writes lock the owner and use app revision CAS", async () => {
  const calls = [];
  const next = { ...defaultUIPreferences(), density: "compact" };
  const saved = await writeAppUIPreferences({
    userId: owner,
    expectedRevision: 0,
    preferences: next,
    queryFn: async (sql, params = []) => {
      calls.push({ sql, params });
      if (sql.startsWith("SELECT id FROM users")) return [{ id: owner }];
      if (sql.startsWith("SELECT station_config")) return [{ station_config: {} }];
      if (sql.startsWith("UPDATE user_profiles")) {
        return [{ station_config: { uiPreferences: JSON.parse(params[0]) } }];
      }
      return [];
    },
  });

  assert.equal(saved.revision, 1);
  assert.equal(saved.density, "compact");
  const save = calls.find(({ sql }) => sql.startsWith("UPDATE user_profiles"));
  assert.match(save.sql, /station_config->'uiPreferences'->>'revision'/);
  assert.equal(save.params[2], 0);
  assert.deepEqual(mapAppUIPreferences({ station_config: {} }), defaultUIPreferences());
});
