WITH demo_tenant AS (
    INSERT INTO tenants (name, slug, status)
    VALUES ('E-Commerce Store', 'ecommerce', 'active')
    ON CONFLICT (slug) DO UPDATE SET name = EXCLUDED.name, status = EXCLUDED.status
    RETURNING id
),
admin_user AS (
    INSERT INTO users (email, name, password_hash, is_platform_admin, status)
    VALUES ('admin@example.com', 'Platform Admin', '$2a$10$JcPVLWyD/OGfk5LiBnLPYeQQF2qcI24P99nmHwDdIH0vy6XUerc86', true, 'active')
    ON CONFLICT (email) DO UPDATE SET name = EXCLUDED.name, password_hash = EXCLUDED.password_hash, is_platform_admin = true, status = 'active'
    RETURNING id
),
tenant_user AS (
    INSERT INTO users (email, name, password_hash, is_platform_admin, status)
    VALUES ('tenant@example.com', 'Tenant User', '$2a$10$JcPVLWyD/OGfk5LiBnLPYeQQF2qcI24P99nmHwDdIH0vy6XUerc86', false, 'active')
    ON CONFLICT (email) DO UPDATE SET name = EXCLUDED.name, password_hash = EXCLUDED.password_hash, is_platform_admin = false, status = 'active'
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
        -- Tenants
        ('tenants.view'), ('tenants.create'), ('tenants.update'), ('tenants.delete'),
        -- Users (broad + granular)
        ('users.view'), ('users.create'), ('users.update'), ('users.delete'),
        ('users.manage'), ('users.reset_password'), ('users.assign_roles'), ('users.assign_permissions'),
        -- Roles & permissions
        ('roles.manage'), ('permissions.manage'),
        -- Features (broad + granular)
        ('features.manage'), ('features.view'), ('features.update'),
        -- Channels (broad + granular)
        ('channels.manage'), ('channels.view'), ('channels.update'),
        -- Providers (broad + granular)
        ('providers.manage'), ('providers.view'), ('providers.create'), ('providers.update'), ('providers.delete'), ('providers.test'),
        -- API keys (broad + granular)
        ('api_keys.manage'), ('api_keys.view'), ('api_keys.create'), ('api_keys.revoke'),
        -- Contacts (broad + granular)
        ('contacts.view'), ('contacts.manage'), ('contacts.create'), ('contacts.update'), ('contacts.delete'),
        -- Groups (broad + granular)
        ('groups.manage'), ('groups.view'), ('groups.create'), ('groups.update'), ('groups.delete'), ('groups.members.manage'),
        -- Templates (broad + granular)
        ('templates.view'), ('templates.manage'), ('templates.create'), ('templates.update'), ('templates.delete'),
        -- Notifications (broad + granular)
        ('notifications.view'), ('notifications.manage'),
        ('notifications.create'), ('notifications.send'), ('notifications.bulk_send'),
        ('notifications.retry'), ('notifications.cancel'),
        -- Campaigns (broad + granular)
        ('campaigns.view'), ('campaigns.manage'), ('campaigns.create'),
        ('campaigns.update'), ('campaigns.approve'), ('campaigns.send'), ('campaigns.schedule'), ('campaigns.cancel'),
        -- Audit
        ('audit_logs.view'),
        -- Settings (broad + granular)
        ('settings.manage'), ('settings.view'), ('settings.update')
    ) AS p(key)
    ON CONFLICT (key) DO NOTHING
    RETURNING id
),
role_seed AS (
    INSERT INTO roles (tenant_id, name, key, scope, status)
    SELECT NULL, role_name, role_key, role_scope, 'active'
    FROM (VALUES
        ('Platform Admin', 'platform_admin', 'platform'),
        ('Platform Operator', 'platform_operator', 'platform'),
        ('Platform Support', 'platform_support', 'platform'),
        ('Tenant Admin', 'tenant_admin', 'tenant'),
        ('Tenant Manager', 'tenant_manager', 'tenant'),
        ('Tenant Support', 'tenant_support', 'tenant'),
        ('Tenant Viewer', 'tenant_viewer', 'tenant')
    ) AS defaults(role_name, role_key, role_scope)
    WHERE NOT EXISTS (SELECT 1 FROM roles r WHERE r.tenant_id IS NULL AND r.key = defaults.role_key)
    RETURNING id
)
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
JOIN permissions p ON
    r.key = 'platform_admin'
    OR (r.key = 'platform_operator' AND p.key = ANY(ARRAY[
        'tenants.view','tenants.update',
        'users.view','users.create','users.update','users.assign_roles',
        'roles.manage','permissions.manage',
        'features.view','features.update','channels.view','channels.update',
        'providers.view','providers.create','providers.update','providers.test',
        'api_keys.view','audit_logs.view',
        'notifications.view','notifications.send','notifications.retry','notifications.cancel',
        'campaigns.view','campaigns.approve','campaigns.send','campaigns.cancel',
        'settings.view','settings.update'
    ]))
    OR (r.key = 'platform_support' AND (
        p.key IN ('notifications.view','notifications.send','providers.view','providers.test','audit_logs.view','settings.view')
        OR p.key LIKE '%.view'
    ))
    OR (r.key = 'tenant_admin' AND p.key = ANY(ARRAY[
        'users.view','users.create','users.update','users.delete','users.assign_roles',
        'roles.manage','permissions.manage',
        'features.view','features.update','channels.view','channels.update',
        'providers.view','providers.create','providers.update','providers.delete','providers.test',
        'api_keys.view','api_keys.create','api_keys.revoke',
        'contacts.view','contacts.create','contacts.update','contacts.delete','contacts.manage',
        'groups.view','groups.create','groups.update','groups.delete','groups.members.manage','groups.manage',
        'templates.view','templates.create','templates.update','templates.delete','templates.manage',
        'notifications.view','notifications.create','notifications.send','notifications.bulk_send','notifications.retry','notifications.cancel',
        'campaigns.view','campaigns.create','campaigns.update','campaigns.approve','campaigns.send','campaigns.schedule','campaigns.cancel',
        'audit_logs.view','settings.view','settings.update'
    ]))
    OR (r.key = 'tenant_manager' AND p.key = ANY(ARRAY[
        'contacts.view','contacts.create','contacts.update','contacts.manage',
        'groups.view','groups.create','groups.update','groups.members.manage','groups.manage',
        'templates.view','templates.create','templates.update','templates.manage',
        'notifications.view','notifications.create','notifications.send','notifications.bulk_send',
        'campaigns.view','campaigns.create','campaigns.update','campaigns.schedule',
        'settings.view'
    ]))
    OR (r.key = 'tenant_support' AND p.key = ANY(ARRAY[
        'contacts.view','groups.view','templates.view','notifications.view','notifications.send','campaigns.view','audit_logs.view','settings.view'
    ]))
    OR (r.key = 'tenant_viewer' AND (
        p.key IN ('audit_logs.view','settings.view')
        OR p.key LIKE '%.view'
    ))
WHERE r.tenant_id IS NULL
ON CONFLICT DO NOTHING;

INSERT INTO user_roles (tenant_id, user_id, role_id)
SELECT NULL, u.id, r.id FROM users u JOIN roles r ON r.key = 'platform_admin'
WHERE u.email = 'admin@example.com'
ON CONFLICT DO NOTHING;

INSERT INTO user_roles (tenant_id, user_id, role_id)
SELECT t.id, u.id, r.id
FROM tenants t
JOIN users u ON u.email = 'tenant@example.com'
JOIN roles r ON r.tenant_id IS NULL AND r.key = 'tenant_admin'
WHERE t.slug = 'ecommerce'
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
WHERE t.slug = 'ecommerce'
ON CONFLICT (tenant_id, feature_key) DO UPDATE SET enabled = EXCLUDED.enabled;

INSERT INTO tenant_channels (tenant_id, channel, enabled, direction, rate_limit_per_second, daily_quota, priority, config_json)
SELECT t.id, c.channel, true, c.direction, 20, 50000, 5, '{}'::jsonb
FROM tenants t
CROSS JOIN (VALUES ('sms', 'one_way'), ('email', 'one_way'), ('fcm', 'one_way'), ('websocket', 'two_way')) AS c(channel, direction)
WHERE t.slug = 'ecommerce'
ON CONFLICT (tenant_id, channel) DO UPDATE SET enabled = true, direction = EXCLUDED.direction;

INSERT INTO tenant_provider_configs (tenant_id, channel, provider, config_json, is_default, status)
SELECT t.id, c.channel, 'mock', '{"secret":"[local-placeholder]"}'::jsonb, true, 'active'
FROM tenants t
CROSS JOIN (VALUES ('sms'), ('email'), ('fcm'), ('websocket')) AS c(channel)
WHERE t.slug = 'ecommerce'
ON CONFLICT (tenant_id, channel) WHERE is_default = true AND status = 'active'
DO UPDATE SET provider = EXCLUDED.provider, config_json = EXCLUDED.config_json;

INSERT INTO tenant_api_keys (tenant_id, name, key_hash, scopes_json, status)
SELECT id, name || ' API Key', '616362fb0756eb262a86640207b2e674c6842e8d20b69fe92850ca0cfe5c187c', '["notifications:create", "devices:write", "in_app:read"]'::jsonb, 'active'
FROM tenants WHERE slug = 'ecommerce'
ON CONFLICT (key_hash) DO UPDATE SET name = EXCLUDED.name, status = 'active', scopes_json = EXCLUDED.scopes_json;

INSERT INTO notification_templates (tenant_id, template_key, channel, subject, body, status)
SELECT id, 'order_confirmation', 'sms', NULL, 'Hi {{customer_name}}, your order #{{order_id}} of ${{total_amount}} is confirmed. Thank you for shopping with us!', 'active' FROM tenants WHERE slug = 'ecommerce'
UNION ALL
SELECT id, 'order_confirmation', 'email', 'Order Confirmed', 'Dear {{customer_name}},\n\nYour order #{{order_id}} for ${{total_amount}} has been confirmed.\n\nThank you for your purchase!', 'active' FROM tenants WHERE slug = 'ecommerce'
UNION ALL
SELECT id, 'welcome', 'email', 'Welcome', 'Welcome {{customer_name}} to E-Commerce Store!', 'active' FROM tenants WHERE slug = 'ecommerce'
ON CONFLICT (tenant_id, template_key, channel, locale) DO UPDATE SET body = EXCLUDED.body, subject = EXCLUDED.subject;

-- Contacts
INSERT INTO contacts (tenant_id, external_user_id, name, email, phone, status)
SELECT id, 'cust_001', 'Jane Smith', 'jane@example.com', '+12025551234', 'active' FROM tenants WHERE slug = 'ecommerce'
ON CONFLICT DO NOTHING;

INSERT INTO contacts (tenant_id, external_user_id, name, email, phone, status)
SELECT id, 'cust_002', 'John Doe', 'john@example.com', '+12025551235', 'active' FROM tenants WHERE slug = 'ecommerce'
ON CONFLICT DO NOTHING;

-- Groups with unique names
INSERT INTO contact_groups (tenant_id, name, description, status)
SELECT id, 'E-commerce VIP Customers', 'High-value customer segment', 'active' FROM tenants WHERE slug = 'ecommerce'
ON CONFLICT (tenant_id, name) DO UPDATE SET description = EXCLUDED.description;

INSERT INTO contact_groups (tenant_id, name, description, status)
SELECT id, 'Newsletter Subscribers', 'Email newsletter subscribers', 'active' FROM tenants WHERE slug = 'ecommerce'
ON CONFLICT (tenant_id, name) DO UPDATE SET description = EXCLUDED.description;

-- Group members
INSERT INTO contact_group_members (tenant_id, group_id, contact_id)
SELECT t.id, g.id, c.id
FROM tenants t
JOIN contact_groups g ON g.tenant_id = t.id AND g.name = 'E-commerce VIP Customers'
JOIN contacts c ON c.tenant_id = t.id AND c.external_user_id = 'cust_001'
WHERE t.slug = 'ecommerce'
ON CONFLICT DO NOTHING;

INSERT INTO contact_group_members (tenant_id, group_id, contact_id)
SELECT t.id, g.id, c.id
FROM tenants t
JOIN contact_groups g ON g.tenant_id = t.id AND g.name = 'Newsletter Subscribers'
JOIN contacts c ON c.tenant_id = t.id AND c.external_user_id IN ('cust_001', 'cust_002')
WHERE t.slug = 'ecommerce'
ON CONFLICT DO NOTHING;

-- Campaigns
INSERT INTO campaigns (tenant_id, name, description, status, scheduled_at)
SELECT id, 'Summer Sale 2025', 'Annual summer sale campaign', 'draft', NULL FROM tenants WHERE slug = 'ecommerce'
ON CONFLICT DO NOTHING;

INSERT INTO campaigns (tenant_id, name, description, status, scheduled_at)
SELECT id, 'New Product Launch', 'Launch campaign for new product line', 'approved', '2025-12-01 09:00:00+00' FROM tenants WHERE slug = 'ecommerce'
ON CONFLICT DO NOTHING;

SELECT 'Local seed complete. Users: admin@example.com / tenant@example.com. Groups: E-commerce VIP Customers, Newsletter Subscribers.' AS message;
