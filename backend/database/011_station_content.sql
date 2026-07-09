CREATE TABLE IF NOT EXISTS station_diary_entries (
  id CHAR(36) PRIMARY KEY,
  user_id CHAR(36) NOT NULL,
  title VARCHAR(120) NOT NULL,
  body TEXT NOT NULL,
  mood VARCHAR(40),
  visibility VARCHAR(20) NOT NULL DEFAULT 'private' CHECK (visibility IN ('private', 'friends', 'public')),
  source VARCHAR(20) NOT NULL DEFAULT 'manual' CHECK (source IN ('manual', 'agent')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  deleted_at TIMESTAMPTZ,
  CONSTRAINT fk_station_diary_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_station_diary_user_created
  ON station_diary_entries (user_id, created_at DESC)
  WHERE deleted_at IS NULL;

DROP TRIGGER IF EXISTS trg_station_diary_touch_updated_at ON station_diary_entries;
CREATE TRIGGER trg_station_diary_touch_updated_at
BEFORE UPDATE ON station_diary_entries
FOR EACH ROW EXECUTE FUNCTION touch_updated_at();

CREATE TABLE IF NOT EXISTS station_albums (
  id CHAR(36) PRIMARY KEY,
  user_id CHAR(36) NOT NULL,
  title VARCHAR(120) NOT NULL,
  description TEXT,
  visibility VARCHAR(20) NOT NULL DEFAULT 'private' CHECK (visibility IN ('private', 'friends', 'public')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  deleted_at TIMESTAMPTZ,
  CONSTRAINT fk_station_albums_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_station_albums_user_created
  ON station_albums (user_id, created_at DESC)
  WHERE deleted_at IS NULL;

DROP TRIGGER IF EXISTS trg_station_albums_touch_updated_at ON station_albums;
CREATE TRIGGER trg_station_albums_touch_updated_at
BEFORE UPDATE ON station_albums
FOR EACH ROW EXECUTE FUNCTION touch_updated_at();

CREATE TABLE IF NOT EXISTS station_media_assets (
  id CHAR(36) PRIMARY KEY,
  user_id CHAR(36) NOT NULL,
  album_id CHAR(36),
  kind VARCHAR(20) NOT NULL DEFAULT 'image' CHECK (kind IN ('image', 'video')),
  storage_provider VARCHAR(40) NOT NULL DEFAULT 'pending',
  storage_key VARCHAR(512),
  original_filename VARCHAR(180),
  mime_type VARCHAR(120),
  byte_size INTEGER CHECK (byte_size IS NULL OR byte_size >= 0),
  width INTEGER CHECK (width IS NULL OR width >= 0),
  height INTEGER CHECK (height IS NULL OR height >= 0),
  caption TEXT,
  status VARCHAR(20) NOT NULL DEFAULT 'pending_upload' CHECK (status IN ('pending_upload', 'uploaded', 'rejected', 'deleted')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  deleted_at TIMESTAMPTZ,
  CONSTRAINT fk_station_media_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_station_media_album FOREIGN KEY (album_id) REFERENCES station_albums(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_station_media_user_created
  ON station_media_assets (user_id, created_at DESC)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_station_media_album_created
  ON station_media_assets (album_id, created_at DESC)
  WHERE album_id IS NOT NULL AND deleted_at IS NULL;

DROP TRIGGER IF EXISTS trg_station_media_touch_updated_at ON station_media_assets;
CREATE TRIGGER trg_station_media_touch_updated_at
BEFORE UPDATE ON station_media_assets
FOR EACH ROW EXECUTE FUNCTION touch_updated_at();

CREATE TABLE IF NOT EXISTS station_outfits (
  id CHAR(36) PRIMARY KEY,
  user_id CHAR(36) NOT NULL,
  title VARCHAR(120) NOT NULL,
  note TEXT,
  avatar_config JSONB NOT NULL DEFAULT '{}'::jsonb,
  media_asset_id CHAR(36),
  visibility VARCHAR(20) NOT NULL DEFAULT 'private' CHECK (visibility IN ('private', 'friends', 'public')),
  source VARCHAR(20) NOT NULL DEFAULT 'manual' CHECK (source IN ('manual', 'agent')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  deleted_at TIMESTAMPTZ,
  CONSTRAINT fk_station_outfits_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_station_outfits_media FOREIGN KEY (media_asset_id) REFERENCES station_media_assets(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_station_outfits_user_created
  ON station_outfits (user_id, created_at DESC)
  WHERE deleted_at IS NULL;

DROP TRIGGER IF EXISTS trg_station_outfits_touch_updated_at ON station_outfits;
CREATE TRIGGER trg_station_outfits_touch_updated_at
BEFORE UPDATE ON station_outfits
FOR EACH ROW EXECUTE FUNCTION touch_updated_at();
