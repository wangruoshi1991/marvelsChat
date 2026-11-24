-- Foreground, ordinary direct-friend audio calls. SDP/ICE never enter SQL.
CREATE TABLE chat_voice_calls (
  id CHAR(36) PRIMARY KEY,
  caller_user_id CHAR(36) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  callee_user_id CHAR(36) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  thread_id CHAR(36) NOT NULL REFERENCES chat_threads(id) ON DELETE CASCADE,
  caller_session_id CHAR(36) NOT NULL REFERENCES auth_sessions(id) ON DELETE CASCADE,
  callee_session_id CHAR(36) REFERENCES auth_sessions(id) ON DELETE CASCADE,
  request_id CHAR(36) NOT NULL,
  instance_id CHAR(36) NOT NULL,
  state VARCHAR(16) NOT NULL CHECK (state IN ('ringing','accepted','ended')),
  end_reason VARCHAR(40),
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  accepted_at TIMESTAMPTZ,
  ended_at TIMESTAMPTZ,
  ring_expires_at TIMESTAMPTZ NOT NULL,
  hard_expires_at TIMESTAMPTZ NOT NULL,
  caller_seen_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  callee_seen_at TIMESTAMPTZ,
  UNIQUE (caller_user_id, request_id),
  CHECK (caller_user_id <> callee_user_id),
  CHECK (state <> 'ringing' OR (callee_session_id IS NULL AND accepted_at IS NULL)),
  CHECK (state <> 'accepted' OR (callee_session_id IS NOT NULL AND accepted_at IS NOT NULL AND callee_seen_at IS NOT NULL)),
  CHECK ((state = 'ended') = (end_reason IS NOT NULL AND ended_at IS NOT NULL)),
  CHECK (ring_expires_at > created_at AND hard_expires_at > created_at)
);
-- An account can occupy only one active call, across either role or device.
CREATE TABLE chat_voice_call_participants (
  user_id CHAR(36) PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  call_id CHAR(36) NOT NULL REFERENCES chat_voice_calls(id) ON DELETE CASCADE,
  role VARCHAR(6) NOT NULL CHECK (role IN ('caller','callee')),
  UNIQUE(call_id,role)
);
CREATE INDEX idx_chat_voice_calls_active ON chat_voice_calls(created_at,id) WHERE state <> 'ended';
CREATE INDEX idx_chat_voice_calls_retention ON chat_voice_calls(ended_at) WHERE state = 'ended';
