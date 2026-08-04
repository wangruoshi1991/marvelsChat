UPDATE user_profiles AS profile
SET station_config = COALESCE(profile.station_config, '{}'::jsonb)
  - 'siteLayout'
  - 'siteDraftId'
WHERE EXISTS (
  SELECT 1
  FROM station_site_drafts AS draft
  WHERE draft.id = profile.station_config ->> 'siteDraftId'
    AND draft.source <> 'model'
);

DELETE FROM station_site_drafts
WHERE source <> 'model';

ALTER TABLE station_site_drafts
  ALTER COLUMN source DROP DEFAULT;

ALTER TABLE station_site_drafts
  DROP CONSTRAINT IF EXISTS station_site_drafts_source_check;

ALTER TABLE station_site_drafts
  ADD CONSTRAINT station_site_drafts_source_check
  CHECK (source = 'model');
