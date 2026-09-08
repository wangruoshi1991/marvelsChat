UPDATE user_agents
SET granted_scopes = CASE agent_id
  WHEN 'miaoxun-butler' THEN '["profile:read", "messages:read", "agents:invoke"]'::jsonb
  WHEN 'virtual-character' THEN '["profile:read", "messages:read"]'::jsonb
  WHEN 'site-builder' THEN '["profile:read", "station:read", "station:write"]'::jsonb
  WHEN 'model-3d' THEN '["profile:read", "station:read"]'::jsonb
  WHEN 'album-manager' THEN '["album:read", "album:write", "station:read", "station:write"]'::jsonb
  WHEN 'file-preprocessor' THEN '["files:read", "files:write", "station:read", "station:write"]'::jsonb
  WHEN 'comic-diary' THEN '["diary:read", "diary:write", "album:read", "station:read", "station:write"]'::jsonb
  WHEN 'video-production' THEN '["album:read", "diary:read", "files:read", "station:read", "station:write"]'::jsonb
END,
updated_at = CURRENT_TIMESTAMP
WHERE agent_id IN (
  'miaoxun-butler',
  'virtual-character',
  'site-builder',
  'model-3d',
  'album-manager',
  'file-preprocessor',
  'comic-diary',
  'video-production'
)
AND (
  granted_scopes IS NULL
  OR granted_scopes = '[]'::jsonb
  OR granted_scopes = '["profile:read", "messages:read"]'::jsonb
);
