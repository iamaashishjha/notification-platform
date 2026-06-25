DROP TABLE IF EXISTS security_events;
DROP TABLE IF EXISTS websocket_connection_tokens;
DROP TABLE IF EXISTS permission_cache_versions;
DROP TABLE IF EXISTS email_verification_tokens;
DROP TABLE IF EXISTS password_reset_tokens;
DROP TABLE IF EXISTS login_attempts;
DROP TABLE IF EXISTS auth_sessions;

ALTER TABLE tenant_api_keys
    DROP COLUMN IF EXISTS revoked_by,
    DROP COLUMN IF EXISTS revoked_at,
    DROP COLUMN IF EXISTS created_by,
    DROP COLUMN IF EXISTS scopes_json;

ALTER TABLE users
    DROP COLUMN IF EXISTS password_changed_at,
    DROP COLUMN IF EXISTS locked_until,
    DROP COLUMN IF EXISTS failed_login_count,
    DROP COLUMN IF EXISTS mfa_secret_encrypted,
    DROP COLUMN IF EXISTS mfa_enabled,
    DROP COLUMN IF EXISTS email_verified_at;
