ALTER TABLE auth_sessions
    ADD COLUMN IF NOT EXISTS session_trace_id text;

UPDATE auth_sessions
SET session_trace_id = 'sess_' || replace(id::text, '-', '')
WHERE session_trace_id IS NULL OR session_trace_id = '';

ALTER TABLE auth_sessions
    ALTER COLUMN session_trace_id SET NOT NULL;

CREATE INDEX IF NOT EXISTS idx_auth_sessions_trace ON auth_sessions(session_trace_id);

ALTER TABLE audit_logs
    ADD COLUMN IF NOT EXISTS session_id text;

CREATE INDEX IF NOT EXISTS idx_audit_session_created ON audit_logs(session_id, created_at DESC);

ALTER TABLE security_events
    ADD COLUMN IF NOT EXISTS session_id text;

CREATE INDEX IF NOT EXISTS idx_security_events_session_created ON security_events(session_id, created_at DESC);
