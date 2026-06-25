ALTER TABLE users
    ADD COLUMN IF NOT EXISTS email_verified_at timestamptz,
    ADD COLUMN IF NOT EXISTS mfa_enabled boolean NOT NULL DEFAULT false,
    ADD COLUMN IF NOT EXISTS mfa_secret_encrypted text,
    ADD COLUMN IF NOT EXISTS failed_login_count integer NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS locked_until timestamptz,
    ADD COLUMN IF NOT EXISTS password_changed_at timestamptz;

ALTER TABLE tenant_api_keys
    ADD COLUMN IF NOT EXISTS scopes_json jsonb NOT NULL DEFAULT '[]',
    ADD COLUMN IF NOT EXISTS created_by uuid REFERENCES users(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS revoked_at timestamptz,
    ADD COLUMN IF NOT EXISTS revoked_by uuid REFERENCES users(id) ON DELETE SET NULL;

CREATE TABLE auth_sessions (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    tenant_id uuid REFERENCES tenants(id) ON DELETE CASCADE,
    refresh_token_hash text NOT NULL UNIQUE,
    user_agent text,
    ip_address text,
    status text NOT NULL DEFAULT 'active',
    expires_at timestamptz NOT NULL,
    revoked_at timestamptz,
    revoked_reason text,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE login_attempts (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    email text NOT NULL,
    user_id uuid REFERENCES users(id) ON DELETE SET NULL,
    ip_address text,
    user_agent text,
    success boolean NOT NULL,
    failure_reason text,
    request_id text,
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE password_reset_tokens (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token_hash text NOT NULL UNIQUE,
    status text NOT NULL DEFAULT 'active',
    expires_at timestamptz NOT NULL,
    consumed_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE email_verification_tokens (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token_hash text NOT NULL UNIQUE,
    status text NOT NULL DEFAULT 'active',
    expires_at timestamptz NOT NULL,
    consumed_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE permission_cache_versions (
    tenant_id uuid REFERENCES tenants(id) ON DELETE CASCADE,
    user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    version integer NOT NULL DEFAULT 1,
    updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE websocket_connection_tokens (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    user_id uuid REFERENCES users(id) ON DELETE CASCADE,
    contact_id uuid REFERENCES contacts(id) ON DELETE CASCADE,
    external_user_id text,
    token_hash text NOT NULL UNIQUE,
    nonce text NOT NULL UNIQUE,
    status text NOT NULL DEFAULT 'active',
    expires_at timestamptz NOT NULL,
    used_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE security_events (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id uuid REFERENCES tenants(id) ON DELETE SET NULL,
    actor_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
    actor_type text NOT NULL,
    event_type text NOT NULL,
    severity text NOT NULL DEFAULT 'info',
    metadata_json jsonb NOT NULL DEFAULT '{}',
    request_id text,
    ip_address text,
    user_agent text,
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_auth_sessions_user_status ON auth_sessions(user_id, status, expires_at);
CREATE INDEX idx_login_attempts_email_created ON login_attempts(email, created_at);
CREATE INDEX idx_login_attempts_ip_created ON login_attempts(ip_address, created_at);
CREATE INDEX idx_password_reset_user_status ON password_reset_tokens(user_id, status, expires_at);
CREATE INDEX idx_email_verification_user_status ON email_verification_tokens(user_id, status, expires_at);
CREATE INDEX idx_ws_tokens_tenant_status ON websocket_connection_tokens(tenant_id, status, expires_at);
CREATE INDEX idx_security_events_tenant_created ON security_events(tenant_id, created_at);
CREATE UNIQUE INDEX idx_permission_cache_scope ON permission_cache_versions(user_id, COALESCE(tenant_id, '00000000-0000-0000-0000-000000000000'::uuid));
