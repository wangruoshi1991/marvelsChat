import assert from "node:assert/strict";
import test from "node:test";

import { createAccountRepository } from "../src/account-repository.js";

test("account storage inventory includes every persisted private asset column", async () => {
  let storageSql = "";
  const repository = createAccountRepository({
    queryImpl: async (sql) => {
      storageSql = sql;
      return [{ provider: "oss", object_key: "users/u/model.glb" }];
    },
  });

  const objects = await repository.listUserStorageObjects("user-1");

  for (const expected of [
    "station_media_assets",
    "file_assets",
    "station_model_assets",
    "source_storage_key",
    "normalized_storage_key",
    "enhanced_storage_key",
    "avatar_3d_style_previews",
    "avatar_3d_reference_images",
    "glb_storage_key",
    "mobile_glb_storage_key",
    "thumbnail_storage_key",
  ]) {
    assert.match(storageSql, new RegExp(expected));
  }
  assert.deepEqual(objects, [
    { provider: "oss", objectKey: "users/u/model.glb" },
  ]);
});

test("account database deletion detaches cyclic 3D references before deleting the user", async () => {
  const calls = [];
  const connection = {
    execute: async (sql) => {
      calls.push(sql.replace(/\s+/g, " ").trim());
      if (sql.includes("SELECT id FROM users")) return [[{ id: "user-1" }]];
      if (sql.includes("DELETE FROM users")) return [[{ id: "user-1" }]];
      return [[]];
    },
  };
  const repository = createAccountRepository({
    withTransactionImpl: async (work) => work(connection),
  });

  await repository.deleteUserAccount({ userId: "user-1" });

  const joined = calls.join("\n");
  assert.match(joined, /SELECT id FROM users.*FOR UPDATE/);
  assert.match(joined, /UPDATE avatar_3d_jobs/);
  assert.match(joined, /UPDATE avatar_3d_generation_attempts/);
  assert.match(joined, /DELETE FROM usage_events/);
  assert.match(joined, /DELETE FROM agent_runs/);
  assert.match(joined, /DELETE FROM notifications/);
  assert.match(joined, /DELETE FROM users.*RETURNING id/);
});
