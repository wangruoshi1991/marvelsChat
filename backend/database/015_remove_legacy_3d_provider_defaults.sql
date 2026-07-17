ALTER TABLE generation_jobs
  ALTER COLUMN provider SET DEFAULT 'legacy';

ALTER TABLE station_model_assets
  ALTER COLUMN provider SET DEFAULT 'legacy';
