import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const migrationUrl = new URL("../database/013_homepage_v1.sql", import.meta.url);

test("homepage migration is additive and creates every lifecycle table", async () => {
  const sql = await readFile(migrationUrl, "utf8");

  for (const table of [
    "station_site_generation_jobs",
    "station_sites",
    "station_site_releases",
    "station_site_preview_tokens",
    "user_consents",
  ]) {
    assert.match(sql, new RegExp(`CREATE TABLE IF NOT EXISTS ${table}`));
  }

  assert.match(sql, /ADD COLUMN IF NOT EXISTS revision INTEGER NOT NULL DEFAULT 1/);
  assert.match(sql, /ADD COLUMN IF NOT EXISTS selected_media_asset_ids JSONB NOT NULL DEFAULT '\[\]'::jsonb/);
  assert.match(sql, /UNIQUE \(user_id, idempotency_key\)/);
  assert.match(sql, /CHECK \(visibility IN \('private', 'link'\)\)/);
  assert.doesNotMatch(sql, /DROP TABLE/);
});
