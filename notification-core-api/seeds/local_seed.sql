WITH demo_tenant AS (
    INSERT INTO tenants (name, slug, status)
    VALUES ('Demo Ride App', 'demo-ride', 'active')
    ON CONFLICT (slug) DO UPDATE SET name = EXCLUDED.name, status = EXCLUDED.status
    RETURNING id
),
admin_user AS (
    INSERT INTO users (email, name, password_hash, is_platform_admin, status)
    VALUES ('admin@example.com', 'Platform Admin', '$2a$10$EixZaYVK1fsbw1ZfbX3OXePaWxn96p36BkNtYLI5KkX9ygM6wRxlW', true, 'active')
    ON CONFLICT (email) DO UPDATE SET name = EXCLUDED.name, is_platform_admin = true, status = 'active'
    RETURNING id
),
tenant_user AS (
    INSERT INTO users (email, name, password_hash, is_platform_admin, status)
    VALUES ('tenant@example.com', 'Tenant User', '$2a$10$EixZaYVK1fsbw1ZfbX3OXePaWxn96p36BkNtYLI5KkX9ygM6wRxlW', false, 'active')
    ON CONFLICT (email) DO UPDATE SET name = EXCLUDED.name, is_platform_admin = false, status = 'active'
    RETURNING id
),
tenant_membership AS (
    INSERT INTO tenant_users (tenant_id, user_id, status)
    SELECT demo_tenant.id, tenant_user.id, 'active' FROM demo_tenant, tenant_user
    ON CONFLICT (tenant_id, user_id) DO UPDATE SET status = 'active'
    RETURNING id
),
perms AS (
    INSERT INTO permissions (key, description)
    SELECT key, key FROM (VALUES
        ('tenants.view'), ('tenants.create'), ('tenants.update'), ('tenants.delete'),
        ('users.view'), ('users.create'), ('users.update'), ('users.delete'),
        ('roles.manage'), ('permissions.manage'), ('features.manage'), ('channels.manage'),
        ('providers.manage'), ('api_keys.manage'), ('contacts.view'), ('contacts.manage'),
        ('groups.manage'), ('templates.view'), ('templates.manage'), ('notifications.view'),
        ('notifications.create'), ('notifications.send'), ('notifications.bulk_send'),
        ('notifications.retry'), ('notifications.cancel'), ('campaigns.view'), ('campaigns.create'),
        ('campaigns.approve'), ('campaigns.send'), ('campaigns.schedule'), ('campaigns.cancel'),
        ('audit_logs.view'), ('settings.manage')
    ) AS p(key)
    ON CONFLICT (key) DO NOTHING
    RETURNING id
),
platform_role AS (
    INSERT INTO roles (tenant_id, name, key, scope, status)
    SELECT NULL, 'Platform Admin', 'platform_admin', 'platform', 'active'
    WHERE NOT EXISTS (SELECT 1 FROM roles WHERE tenant_id IS NULL AND key = 'platform_admin')
    RETURNING id
),
tenant_role AS (
    INSERT INTO roles (tenant_id, name, key, scope, status)
    SELECT demo_tenant.id, 'Tenant Admin', 'tenant_admin', 'tenant', 'active' FROM demo_tenant
    ON CONFLICT (tenant_id, key) DO UPDATE SET status = 'active'
    RETURNING id
)
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r CROSS JOIN permissions p
WHERE r.key IN ('platform_admin', 'tenant_admin')
ON CONFLICT DO NOTHING;

INSERT INTO user_roles (tenant_id, user_id, role_id)
SELECT NULL, u.id, r.id FROM users u JOIN roles r ON r.key = 'platform_admin'
WHERE u.email = 'admin@example.com'
ON CONFLICT DO NOTHING;

INSERT INTO user_roles (tenant_id, user_id, role_id)
SELECT t.id, u.id, r.id
FROM tenants t
JOIN users u ON u.email = 'tenant@example.com'
JOIN roles r ON r.tenant_id = t.id AND r.key = 'tenant_admin'
WHERE t.slug = 'demo-ride'
ON CONFLICT DO NOTHING;

INSERT INTO tenant_features (tenant_id, feature_key, enabled, config_json)
SELECT t.id, f.key, true, '{}'::jsonb
FROM tenants t
CROSS JOIN (VALUES
    ('channel.sms'), ('channel.email'), ('channel.fcm'), ('channel.websocket'),
    ('channel.web_push'), ('channel.whatsapp'), ('mode.one_way'), ('mode.two_way'),
    ('contacts.enabled'), ('groups.enabled'), ('campaigns.enabled'), ('schedule.enabled'),
    ('bulk_import.enabled'), ('admin_send.enabled'), ('api_access.enabled'),
    ('approval_flow.enabled'), ('websocket.enabled'), ('in_app.enabled')
) AS f(key)
WHERE t.slug = 'demo-ride'
ON CONFLICT (tenant_id, feature_key) DO UPDATE SET enabled = EXCLUDED.enabled;

INSERT INTO tenant_channels (tenant_id, channel, enabled, direction, rate_limit_per_second, daily_quota, priority, config_json)
SELECT t.id, c.channel, true, c.direction, 20, 50000, 5, '{}'::jsonb
FROM tenants t
CROSS JOIN (VALUES ('sms', 'one_way'), ('email', 'one_way'), ('fcm', 'one_way'), ('websocket', 'two_way')) AS c(channel, direction)
WHERE t.slug = 'demo-ride'
ON CONFLICT (tenant_id, channel) DO UPDATE SET enabled = true, direction = EXCLUDED.direction;

INSERT INTO tenant_provider_configs (tenant_id, channel, provider, config_json, is_default, status)
SELECT t.id, c.channel, 'mock', '{"secret":"[local-placeholder]"}'::jsonb, true, 'active'
FROM tenants t
CROSS JOIN (VALUES ('sms'), ('email'), ('fcm'), ('websocket')) AS c(channel)
WHERE t.slug = 'demo-ride'
ON CONFLICT (tenant_id, channel) WHERE is_default = true AND status = 'active'
DO UPDATE SET provider = EXCLUDED.provider, config_json = EXCLUDED.config_json;

INSERT INTO tenant_api_keys (tenant_id, name, key_hash, scopes_json, status)
SELECT id, 'Local Demo API Key', '616362fb0756eb262a86640207b2e674c6842e8d20b69fe92850ca0cfe5c187c', '["notifications:create", "devices:write", "in_app:read"]'::jsonb, 'active'
FROM tenants WHERE slug = 'demo-ride'
ON CONFLICT (key_hash) DO UPDATE SET status = 'active', scopes_json = EXCLUDED.scopes_json;

INSERT INTO notification_templates (tenant_id, template_key, channel, subject, body, status)
SELECT id, 'ride_accepted', 'sms', NULL, 'Hi {{customer_name}}, {{driver_name}} accepted your ride in {{vehicle_no}}.', 'active' FROM tenants WHERE slug = 'demo-ride'
UNION ALL
SELECT id, 'ride_accepted', 'fcm', 'Ride accepted', '{{driver_name}} accepted your ride.', 'active' FROM tenants WHERE slug = 'demo-ride'
UNION ALL
SELECT id, 'welcome', 'email', 'Welcome', 'Welcome {{customer_name}} to Demo Ride App.', 'active' FROM tenants WHERE slug = 'demo-ride'
ON CONFLICT (tenant_id, template_key, channel, locale) DO UPDATE SET body = EXCLUDED.body, subject = EXCLUDED.subject;

WITH c AS (
    INSERT INTO contacts (tenant_id, external_user_id, name, email, phone, status)
    SELECT id, 'user_123', 'Aashish', 'user@example.com', '9840000000', 'active' FROM tenants WHERE slug = 'demo-ride'
    RETURNING id, tenant_id
),
g AS (
    INSERT INTO contact_groups (tenant_id, name, description, status)
    SELECT id, 'Demo Riders', 'Local testing contacts', 'active' FROM tenants WHERE slug = 'demo-ride'
    RETURNING id, tenant_id
)
INSERT INTO contact_group_members (tenant_id, group_id, contact_id)
SELECT c.tenant_id, g.id, c.id FROM c, g
ON CONFLICT DO NOTHING;

SELECT 'Local seed complete. Raw API key shown once for local testing: demo_tenant_api_key_local' AS message;
