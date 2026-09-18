CREATE FUNCTION profile_languages_valid(language_codes TEXT[])
RETURNS BOOLEAN
LANGUAGE SQL
IMMUTABLE
STRICT
AS $$
  SELECT cardinality(language_codes) <= 10
    AND (cardinality(language_codes) = 0 OR array_ndims(language_codes) = 1)
    AND language_codes <@ ARRAY['zh', 'en', 'ja', 'ko', 'fr', 'de', 'es', 'pt', 'ru', 'ar']::TEXT[]
    AND cardinality(language_codes) = (SELECT COUNT(DISTINCT code) FROM unnest(language_codes) AS code);
$$;

ALTER TABLE user_profiles
  ADD COLUMN headline VARCHAR(80) NOT NULL DEFAULT '',
  ADD COLUMN public_location VARCHAR(120) NOT NULL DEFAULT '',
  ADD COLUMN experience_years SMALLINT,
  ADD COLUMN languages TEXT[] NOT NULL DEFAULT '{}'::TEXT[],
  ADD CONSTRAINT chk_user_profiles_headline_trimmed CHECK (headline = btrim(headline)),
  ADD CONSTRAINT chk_user_profiles_public_location_trimmed CHECK (public_location = btrim(public_location)),
  ADD CONSTRAINT chk_user_profiles_experience_years CHECK (experience_years BETWEEN 0 AND 80),
  ADD CONSTRAINT chk_user_profiles_languages CHECK (profile_languages_valid(languages));

COMMENT ON COLUMN user_profiles.public_location IS 'Voluntary public city-level location; never populated from GPS community or activity_area.';
COMMENT ON COLUMN user_profiles.experience_years IS 'Self-declared whole years of professional experience; NULL means not supplied.';
COMMENT ON COLUMN user_profiles.languages IS 'Self-declared language codes displayed with public profile biography visibility.';
