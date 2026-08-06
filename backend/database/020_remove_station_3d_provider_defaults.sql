ALTER TABLE generation_jobs
  ALTER COLUMN provider DROP DEFAULT;

ALTER TABLE station_model_assets
  ALTER COLUMN provider DROP DEFAULT;
