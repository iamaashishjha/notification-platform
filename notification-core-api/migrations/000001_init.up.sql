CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE tenants (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    name text NOT NULL,
    slug text NOT NULL UNIQUE,
    status text NOT NULL DEFAULT 'active',
    config_json jsonb NOT NULL DEFAULT '{}',
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE tenant_features (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    feature_key text NOT NULL,
    enabled boolean NOT NULL DEFAULT false,
    config_json jsonb NOT NULL DEFAULT '{}',
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (tenant_id, feature_key)
);

CREATE TABLE tenant_channels (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    channel text NOT NULL,
    enabled boolean NOT NULL DEFAULT false,
    direction text NOT NULL DEFAULT 'one_way',
    rate_limit_per_second integer NOT NULL DEFAULT 10,
    daily_quota integer NOT NULL DEFAULT 10000,
    priority integer NOT NULL DEFAULT 5,
    config_json jsonb NOT NULL DEFAULT '{}',
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (tenant_id, channel)
);

CREATE TABLE tenant_provider_configs (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    channel text NOT NULL,
    provider text NOT NULL,
    config_json jsonb NOT NULL DEFAULT '{}',
    is_default boolean NOT NULL DEFAULT false,
    status text NOT NULL DEFAULT 'active',
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE tenant_api_keys (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    name text NOT NULL,
    key_hash text NOT NULL UNIQUE,
    status text NOT NULL DEFAULT 'active',
    last_used_at timestamptz,
    expires_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE users (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    email text NOT NULL UNIQUE,
    name text NOT NULL,
    password_hash text NOT NULL,
    is_platform_admin boolean NOT NULL DEFAULT false,
    status text NOT NULL DEFAULT 'active',
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE tenant_users (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    status text NOT NULL DEFAULT 'active',
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (tenant_id, user_id)
);

CREATE TABLE roles (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id uuid REFERENCES tenants(id) ON DELETE CASCADE,
    name text NOT NULL,
    key text NOT NULL,
    scope text NOT NULL DEFAULT 'tenant',
    status text NOT NULL DEFAULT 'active',
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (tenant_id, key)
);

CREATE TABLE permissions (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    key text NOT NULL UNIQUE,
    description text NOT NULL DEFAULT '',
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE role_permissions (
    role_id uuid NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
    permission_id uuid NOT NULL REFERENCES permissions(id) ON DELETE CASCADE,
    created_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (role_id, permission_id)
);

CREATE TABLE user_roles (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id uuid REFERENCES tenants(id) ON DELETE CASCADE,
    user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    role_id uuid NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE user_permissions (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id uuid REFERENCES tenants(id) ON DELETE CASCADE,
    user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    permission_id uuid NOT NULL REFERENCES permissions(id) ON DELETE CASCADE,
    effect text NOT NULL DEFAULT 'allow',
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE contacts (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    external_user_id text,
    name text NOT NULL,
    email text,
    phone text,
    metadata_json jsonb NOT NULL DEFAULT '{}',
    status text NOT NULL DEFAULT 'active',
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE contact_channels (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    contact_id uuid NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
    channel text NOT NULL,
    address text NOT NULL,
    verified boolean NOT NULL DEFAULT false,
    status text NOT NULL DEFAULT 'active',
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE contact_groups (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    name text NOT NULL,
    description text NOT NULL DEFAULT '',
    status text NOT NULL DEFAULT 'active',
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE contact_group_members (
    tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    group_id uuid NOT NULL REFERENCES contact_groups(id) ON DELETE CASCADE,
    contact_id uuid NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
    created_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (group_id, contact_id)
);

CREATE TABLE devices (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    contact_id uuid REFERENCES contacts(id) ON DELETE SET NULL,
    external_user_id text,
    platform text NOT NULL,
    fcm_token text,
    token_status text NOT NULL DEFAULT 'active',
    last_seen_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE websocket_sessions (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    contact_id uuid REFERENCES contacts(id) ON DELETE SET NULL,
    external_user_id text,
    device_id uuid REFERENCES devices(id) ON DELETE SET NULL,
    connection_id text NOT NULL,
    status text NOT NULL DEFAULT 'active',
    last_seen_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE notification_templates (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    template_key text NOT NULL,
    channel text NOT NULL,
    subject text,
    body text NOT NULL,
    locale text NOT NULL DEFAULT 'en',
    status text NOT NULL DEFAULT 'active',
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (tenant_id, template_key, channel, locale)
);

CREATE TABLE notifications (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    public_id text NOT NULL UNIQUE,
    event_key text NOT NULL,
    template_key text,
    target_type text NOT NULL,
    target_json jsonb NOT NULL DEFAULT '{}',
    data_json jsonb NOT NULL DEFAULT '{}',
    channels jsonb NOT NULL DEFAULT '[]',
    priority integer NOT NULL DEFAULT 5,
    schedule_type text NOT NULL DEFAULT 'instant',
    scheduled_at timestamptz,
    status text NOT NULL DEFAULT 'queued',
    idempotency_key text,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE notification_deliveries (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    notification_id uuid NOT NULL REFERENCES notifications(id) ON DELETE CASCADE,
    channel text NOT NULL,
    provider text NOT NULL,
    recipient_json jsonb NOT NULL DEFAULT '{}',
    status text NOT NULL DEFAULT 'queued',
    scheduled_at timestamptz,
    delivered_at timestamptz,
    provider_message_id text,
    response_json jsonb NOT NULL DEFAULT '{}',
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE delivery_attempts (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    delivery_id uuid NOT NULL REFERENCES notification_deliveries(id) ON DELETE CASCADE,
    attempt_no integer NOT NULL,
    status text NOT NULL,
    error text,
    response_json jsonb NOT NULL DEFAULT '{}',
    duration_ms integer NOT NULL DEFAULT 0,
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE in_app_notifications (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    notification_id uuid REFERENCES notifications(id) ON DELETE SET NULL,
    contact_id uuid REFERENCES contacts(id) ON DELETE SET NULL,
    external_user_id text,
    title text NOT NULL,
    body text NOT NULL,
    data_json jsonb NOT NULL DEFAULT '{}',
    status text NOT NULL DEFAULT 'unread',
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE notification_reads (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    in_app_notification_id uuid NOT NULL REFERENCES in_app_notifications(id) ON DELETE CASCADE,
    contact_id uuid REFERENCES contacts(id) ON DELETE SET NULL,
    read_at timestamptz NOT NULL DEFAULT now(),
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE campaigns (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    name text NOT NULL,
    template_key text,
    channels jsonb NOT NULL DEFAULT '[]',
    status text NOT NULL DEFAULT 'draft',
    scheduled_at timestamptz,
    created_by uuid REFERENCES users(id) ON DELETE SET NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE campaign_recipients (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    campaign_id uuid NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
    contact_id uuid REFERENCES contacts(id) ON DELETE SET NULL,
    recipient_json jsonb NOT NULL DEFAULT '{}',
    status text NOT NULL DEFAULT 'pending',
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE scheduled_jobs (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    notification_id uuid REFERENCES notifications(id) ON DELETE CASCADE,
    campaign_id uuid REFERENCES campaigns(id) ON DELETE CASCADE,
    job_type text NOT NULL,
    due_at timestamptz NOT NULL,
    status text NOT NULL DEFAULT 'pending',
    payload_json jsonb NOT NULL DEFAULT '{}',
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE audit_logs (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id uuid REFERENCES tenants(id) ON DELETE SET NULL,
    actor_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
    actor_type text NOT NULL,
    action text NOT NULL,
    resource_type text NOT NULL,
    resource_id text,
    before_json jsonb NOT NULL DEFAULT '{}',
    after_json jsonb NOT NULL DEFAULT '{}',
    ip_address text,
    user_agent text,
    request_id text,
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_tenants_status ON tenants(status);
CREATE INDEX idx_tenant_features_tenant_created ON tenant_features(tenant_id, created_at);
CREATE INDEX idx_tenant_channels_tenant_channel ON tenant_channels(tenant_id, channel);
CREATE INDEX idx_provider_tenant_channel ON tenant_provider_configs(tenant_id, channel, status);
CREATE INDEX idx_api_keys_tenant_status ON tenant_api_keys(tenant_id, status);
CREATE INDEX idx_contacts_tenant_created ON contacts(tenant_id, created_at);
CREATE INDEX idx_contacts_tenant_status ON contacts(tenant_id, status);
CREATE INDEX idx_contacts_external_user ON contacts(tenant_id, external_user_id);
CREATE INDEX idx_contact_channels_tenant_channel ON contact_channels(tenant_id, channel);
CREATE INDEX idx_devices_external_user ON devices(tenant_id, external_user_id);
CREATE INDEX idx_websocket_lookup ON websocket_sessions(tenant_id, contact_id, external_user_id, status);
CREATE INDEX idx_notifications_tenant_created ON notifications(tenant_id, created_at);
CREATE INDEX idx_notifications_tenant_status ON notifications(tenant_id, status);
CREATE INDEX idx_deliveries_notification ON notification_deliveries(notification_id);
CREATE INDEX idx_deliveries_status_scheduled ON notification_deliveries(status, scheduled_at);
CREATE INDEX idx_deliveries_tenant_channel ON notification_deliveries(tenant_id, channel);
CREATE INDEX idx_attempts_delivery ON delivery_attempts(delivery_id);
CREATE INDEX idx_campaign_recipients_status ON campaign_recipients(campaign_id, status);
CREATE INDEX idx_scheduled_due_status ON scheduled_jobs(status, due_at);
CREATE INDEX idx_audit_tenant_created ON audit_logs(tenant_id, created_at);
CREATE UNIQUE INDEX idx_roles_platform_key_unique ON roles(key) WHERE tenant_id IS NULL;
CREATE UNIQUE INDEX idx_user_roles_unique ON user_roles(user_id, role_id, COALESCE(tenant_id, '00000000-0000-0000-0000-000000000000'::uuid));
CREATE UNIQUE INDEX idx_provider_one_default ON tenant_provider_configs(tenant_id, channel) WHERE is_default = true AND status = 'active';
