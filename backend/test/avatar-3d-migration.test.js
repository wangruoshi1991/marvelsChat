import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const migrationUrl = new URL("../database/014_avatar_3d_web.sql", import.meta.url);
const qualityMigrationUrl = new URL(
  "../database/016_avatar_3d_quality_and_preview.sql",
  import.meta.url,
);
const faceFirstMigrationUrl = new URL(
  "../database/017_avatar_3d_face_first_pipeline.sql",
  import.meta.url,
);

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

test("avatar quality migration stores generation snapshots and preparing models", async () => {
  const sql = await readFile(qualityMigrationUrl, "utf8");

  assert.match(sql, /ADD COLUMN IF NOT EXISTS quality_preset/);
  assert.match(sql, /ADD COLUMN IF NOT EXISTS geometry_quality/);
  assert.match(sql, /ADD COLUMN IF NOT EXISTS texture_quality/);
  assert.match(sql, /'preparing'/);
  assert.match(sql, /ALTER COLUMN glb_storage_key DROP NOT NULL/);
  assert.match(sql, /ALTER COLUMN glb_mime_type DROP NOT NULL/);
  assert.match(sql, /ALTER COLUMN glb_byte_size DROP NOT NULL/);
  assert.doesNotMatch(sql, /DROP TABLE/);
});

test("face-first migration preserves legacy jobs and adds private reference sets", async () => {
  const sql = await readFile(faceFirstMigrationUrl, "utf8");

  assert.match(sql, /ADD COLUMN IF NOT EXISTS model_provider/);
  assert.match(sql, /ADD COLUMN IF NOT EXISTS reference_set_id/);
  assert.match(sql, /CREATE TABLE IF NOT EXISTS avatar_3d_reference_sets/);
  assert.match(sql, /CREATE TABLE IF NOT EXISTS avatar_3d_reference_images/);
  assert.match(sql, /CREATE TABLE IF NOT EXISTS avatar_3d_generation_attempts/);
  assert.match(sql, /queued_references/);
  assert.match(sql, /awaiting_reference_confirmation/);
  assert.match(sql, /quality_checking/);
  assert.match(sql, /quality_failed/);
  assert.match(sql, /CREATE INDEX IF NOT EXISTS idx_avatar_3d_reference_sets_source_photo/);
  assert.match(sql, /CREATE UNIQUE INDEX IF NOT EXISTS idx_avatar_3d_reference_image_view/);
  assert.match(
    sql,
    /CREATE UNIQUE INDEX IF NOT EXISTS idx_avatar_3d_reference_image_view\s+ON avatar_3d_reference_images \(reference_set_id, view\);/,
  );
  assert.match(
    sql,
    /CREATE UNIQUE INDEX IF NOT EXISTS idx_avatar_3d_reference_image_sequence\s+ON avatar_3d_reference_images \(reference_set_id, sequence_index\);/,
  );
  assert.match(sql, /CREATE INDEX IF NOT EXISTS idx_avatar_3d_generation_attempts_source_photo/);
  assert.match(sql, /CREATE INDEX IF NOT EXISTS idx_avatar_3d_jobs_source_photo/);
  assert.match(sql, /CREATE INDEX IF NOT EXISTS idx_avatar_3d_jobs_enhanced_photo/);
  assert.match(sql, /CREATE INDEX IF NOT EXISTS idx_avatar_3d_jobs_current_attempt/);
  assert.match(
    sql,
    /CREATE INDEX IF NOT EXISTS idx_avatar_3d_job_photos_job_user\s+ON avatar_3d_job_photos \(job_id, user_id\);/,
  );
  assert.match(
    sql,
    /FOREIGN KEY \(source_photo_id, user_id\)[\s\S]*?REFERENCES avatar_3d_job_photos \(id, user_id\)[\s\S]*?ON DELETE RESTRICT/,
  );
  assert.match(
    sql,
    /FOREIGN KEY \(job_id, user_id\)[\s\S]*?REFERENCES avatar_3d_jobs \(id, user_id\)/,
  );
  assert.doesNotMatch(
    sql,
    /fk_avatar_3d_reference_set_source_photo\s+FOREIGN KEY \(source_photo_id\)\s+REFERENCES/,
  );
  assert.match(sql, /REFERENCES avatar_3d_job_photos \(id, user_id\)/);
  assert.match(sql, /ADD COLUMN IF NOT EXISTS billing_disposition/);
  assert.match(sql, /billing_disposition IN \('charged', 'uncharged', 'unknown'\)/);
  assert.match(
    sql,
    /conname = 'avatar_3d_generation_attempts_quality_status_check'/,
  );
  assert.match(
    sql,
    /ADD CONSTRAINT avatar_3d_generation_attempts_quality_status_check\s+CHECK \(\s*quality_status IS NULL\s+OR quality_status IN \('passed', 'failed'\)\s*\)/,
  );
  assert.match(sql, /ALTER COLUMN max_quality_attempts SET DEFAULT 1/);
  assert.match(
    sql,
    /UPDATE avatar_3d_jobs\s+SET max_quality_attempts = 1\s+WHERE max_quality_attempts IS DISTINCT FROM 1/,
  );
  assert.match(
    sql,
    /DROP CONSTRAINT IF EXISTS avatar_3d_jobs_max_quality_attempts_check[\s\S]*?ADD CONSTRAINT avatar_3d_jobs_max_quality_attempts_check\s+CHECK \(max_quality_attempts = 1\)/,
  );
  assert.ok(
    sql.indexOf("DROP CONSTRAINT IF EXISTS avatar_3d_jobs_max_quality_attempts_check")
      < sql.indexOf("SET max_quality_attempts = 1"),
  );
  assert.ok(
    sql.indexOf("SET max_quality_attempts = 1")
      < sql.indexOf("ADD CONSTRAINT avatar_3d_jobs_max_quality_attempts_check"),
  );
  assert.ok(
    sql.indexOf("idx_avatar_3d_job_photos_id_user")
      < sql.indexOf("fk_avatar_3d_reference_set_source_photo"),
  );
  assert.ok(
    sql.indexOf("idx_avatar_3d_jobs_id_user")
      < sql.indexOf("fk_avatar_3d_photo_job_owner"),
  );
  assert.doesNotMatch(sql, /hunyuan|template_proposal|template_id|quality_retry|retry_queued/i);
  assert.doesNotMatch(sql, /DROP TABLE/);
});
