DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM user_profiles
    WHERE jsonb_typeof(avatar_config) <> 'object'
  ) THEN
    RAISE EXCEPTION 'user_profiles.avatar_config must contain JSON objects';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM station_outfits
    WHERE jsonb_typeof(avatar_config) <> 'object'
  ) THEN
    RAISE EXCEPTION 'station_outfits.avatar_config must contain JSON objects';
  END IF;
END $$;

UPDATE user_profiles
SET avatar_config = jsonb_set(
  avatar_config,
  '{accent}',
  to_jsonb(
    CASE avatar_config ->> 'palette'
      WHEN 'sunrise' THEN 'sunrise'
      WHEN 'mint' THEN 'mint'
      WHEN 'sky' THEN 'sky'
      WHEN 'grape' THEN 'violet'
      WHEN 'mono' THEN 'mint'
    END
  ),
  true
)
WHERE NOT (avatar_config ? 'accent')
  AND avatar_config ->> 'palette' IN ('sunrise', 'mint', 'sky', 'grape', 'mono');

UPDATE station_outfits
SET avatar_config = jsonb_set(
  avatar_config,
  '{accent}',
  to_jsonb(
    CASE avatar_config ->> 'palette'
      WHEN 'sunrise' THEN 'sunrise'
      WHEN 'mint' THEN 'mint'
      WHEN 'sky' THEN 'sky'
      WHEN 'grape' THEN 'violet'
      WHEN 'mono' THEN 'mint'
    END
  ),
  true
)
WHERE NOT (avatar_config ? 'accent')
  AND avatar_config ->> 'palette' IN ('sunrise', 'mint', 'sky', 'grape', 'mono');

UPDATE user_profiles
SET avatar_config = avatar_config - 'palette' - 'shape'
WHERE avatar_config ?| ARRAY['palette', 'shape'];

UPDATE station_outfits
SET avatar_config = avatar_config - 'palette' - 'shape'
WHERE avatar_config ?| ARRAY['palette', 'shape'];

ALTER TABLE user_profiles
  ADD CONSTRAINT chk_user_profiles_avatar_config_v2
  CHECK (
    jsonb_typeof(avatar_config) = 'object'
    AND NOT (avatar_config ?| ARRAY['palette', 'shape'])
  );

ALTER TABLE station_outfits
  ADD CONSTRAINT chk_station_outfits_avatar_config_v2
  CHECK (
    jsonb_typeof(avatar_config) = 'object'
    AND NOT (avatar_config ?| ARRAY['palette', 'shape'])
  );
