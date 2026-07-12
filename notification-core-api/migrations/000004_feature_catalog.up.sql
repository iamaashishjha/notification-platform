CREATE TABLE feature_catalog (
    identifier text PRIMARY KEY,
    name text NOT NULL,
    description text NOT NULL,
    category text NOT NULL,
    status text NOT NULL DEFAULT 'active',
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO feature_catalog (identifier, name, description, category) VALUES
    ('contacts.enabled', 'Contact Management', 'Maintain a searchable customer address book for notification delivery.', 'Audience'),
    ('groups.enabled', 'Contact Groups', 'Organize contacts into reusable audiences and recipient groups.', 'Audience'),
    ('bulk_import.enabled', 'Bulk Contact Import', 'Upload and onboard large contact lists in a single operation.', 'Audience'),
    ('templates.enabled', 'Notification Templates', 'Create reusable message content with dynamic personalization variables.', 'Content'),
    ('campaigns.enabled', 'Notification Campaigns', 'Plan, manage, and deliver coordinated notifications to an audience.', 'Campaigns'),
    ('approval_flow.enabled', 'Campaign Approvals', 'Require review and approval before a campaign can be delivered.', 'Campaigns'),
    ('schedule.enabled', 'Scheduled Delivery', 'Schedule notifications and campaigns for delivery at a future date and time.', 'Delivery'),
    ('admin_send.enabled', 'Send from Admin', 'Allow authorized users to send notifications manually from the admin portal.', 'Delivery'),
    ('api_access.enabled', 'API Access', 'Allow secure programmatic access through tenant API keys.', 'Integration'),
    ('audit.enabled', 'Audit Trail', 'Record configuration and administrative changes for accountability.', 'Governance'),
    ('in_app.enabled', 'In-App Notification Center', 'Provide users with a persistent notification inbox inside the application.', 'Delivery'),
    ('websocket.enabled', 'Real-Time Notifications', 'Deliver live notifications to connected applications without page refreshes.', 'Delivery'),
    ('channel.email', 'Email Channel', 'Deliver formatted notifications to email addresses.', 'Channels'),
    ('channel.sms', 'SMS Channel', 'Deliver concise text notifications to mobile phone numbers.', 'Channels'),
    ('channel.fcm', 'Mobile Push Channel', 'Deliver push notifications to Android and iOS applications through Firebase.', 'Channels'),
    ('channel.websocket', 'WebSocket Channel', 'Deliver real-time messages to connected web applications.', 'Channels'),
    ('channel.web_push', 'Web Push Channel', 'Deliver browser push notifications even when the application is not open.', 'Channels'),
    ('channel.whatsapp', 'WhatsApp Channel', 'Deliver approved notification messages through WhatsApp.', 'Channels'),
    ('mode.one_way', 'One-Way Messaging', 'Send outbound notifications without expecting a recipient response.', 'Messaging'),
    ('mode.two_way', 'Two-Way Messaging', 'Support interactive conversations and recipient responses.', 'Messaging')
ON CONFLICT (identifier) DO UPDATE SET
    name = EXCLUDED.name,
    description = EXCLUDED.description,
    category = EXCLUDED.category,
    updated_at = now();

ALTER TABLE tenant_features
    ADD CONSTRAINT tenant_features_feature_identifier_fkey
    FOREIGN KEY (feature_key) REFERENCES feature_catalog(identifier)
    ON UPDATE CASCADE ON DELETE RESTRICT;

CREATE INDEX idx_feature_catalog_category ON feature_catalog(category, name);
