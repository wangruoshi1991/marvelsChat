-- Track whether an Agent alias came from the system catalogue or from the user.
-- This lets catalogue renames update untouched defaults without overwriting a
-- user-selected conversation name.
ALTER TABLE user_agents
  ADD COLUMN IF NOT EXISTS alias_source VARCHAR(20) NOT NULL DEFAULT 'system';

UPDATE user_agents
   SET alias_source = 'system'
 WHERE alias_source IS NULL OR alias_source = '';

ALTER TABLE user_agents
  DROP CONSTRAINT IF EXISTS chk_user_agents_alias_source;

ALTER TABLE user_agents
  ADD CONSTRAINT chk_user_agents_alias_source
  CHECK (alias_source IN ('system', 'custom'));

-- Existing non-empty aliases predate this marker. They are retained as
-- system defaults when they match a deployed Agent's current name; the
-- catalogue repository will only migrate aliases that still match its old
-- display name.
