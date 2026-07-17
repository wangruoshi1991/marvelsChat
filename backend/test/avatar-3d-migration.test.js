import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const migrationUrl = new URL("../database/014_avatar_3d_web.sql", import.meta.url);

test("avatar 3D migration creates private jobs, photos, previews, and models", async () => {
  const sql = await readFile(migrationUrl, "utf8");

  for (const table of [
    "avatar_3d_jobs",
    "avatar_3d_job_photos",
    "avatar_3d_style_previews",
    "avatar_3d_models",
  ]) {
    assert.match(sql, new RegExp(`CREATE TABLE IF NOT EXISTS ${table}`));
  }

  assert.match(sql, /UNIQUE \(user_id, idempotency_key_hash\)/);
  assert.match(sql, /CHECK \(style IN \('realistic', 'cartoon'\)\)/);
  assert.match(sql, /submission_unknown/);
  assert.match(sql, /CREATE UNIQUE INDEX IF NOT EXISTS idx_avatar_3d_one_active_job/);
  assert.match(sql, /WHERE status IN \(/);
  assert.match(sql, /ON DELETE CASCADE/);
  assert.doesNotMatch(sql, /DROP TABLE/);
});
