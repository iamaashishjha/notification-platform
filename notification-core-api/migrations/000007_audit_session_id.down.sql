DROP INDEX IF EXISTS idx_security_events_session_created;
ALTER TABLE security_events
    DROP COLUMN IF EXISTS session_id;

DROP INDEX IF EXISTS idx_audit_session_created;
ALTER TABLE audit_logs
    DROP COLUMN IF EXISTS session_id;

DROP INDEX IF EXISTS idx_auth_sessions_trace;
ALTER TABLE auth_sessions
    DROP COLUMN IF EXISTS session_trace_id;
