-- Industry sample tenants
-- Each block creates a tenant with features, channels, mock providers, and sample templates.
-- Idempotent via ON CONFLICT.

-- 1. Fintech Payments
INSERT INTO tenants (name, slug, status)
VALUES ('Fintech Payments', 'fintech', 'active')
ON CONFLICT (slug) DO NOTHING;

-- 2. HRMS Portal
INSERT INTO tenants (name, slug, status)
VALUES ('HRMS Portal', 'hrms', 'active')
ON CONFLICT (slug) DO NOTHING;

-- 3. Healthcare App
INSERT INTO tenants (name, slug, status)
VALUES ('Healthcare App', 'healthcare', 'active')
ON CONFLICT (slug) DO NOTHING;

-- 4. Logistics Platform
INSERT INTO tenants (name, slug, status)
VALUES ('Logistics Platform', 'logistics', 'active')
ON CONFLICT (slug) DO NOTHING;

-- 5. EdTech Platform
INSERT INTO tenants (name, slug, status)
VALUES ('EdTech Platform', 'edtech', 'active')
ON CONFLICT (slug) DO NOTHING;

-- 6. Real Estate Marketplace
INSERT INTO tenants (name, slug, status)
VALUES ('Real Estate Marketplace', 'realestate', 'active')
ON CONFLICT (slug) DO NOTHING;

-- 7. Travel Booking
INSERT INTO tenants (name, slug, status)
VALUES ('Travel Booking', 'travel', 'active')
ON CONFLICT (slug) DO NOTHING;

-- 8. Food Delivery
INSERT INTO tenants (name, slug, status)
VALUES ('Food Delivery', 'food', 'active')
ON CONFLICT (slug) DO NOTHING;

-- 9. Banking Portal
INSERT INTO tenants (name, slug, status)
VALUES ('Banking Portal', 'banking', 'active')
ON CONFLICT (slug) DO NOTHING;

-- 10. Insurance Platform
INSERT INTO tenants (name, slug, status)
VALUES ('Insurance Platform', 'insurance', 'active')
ON CONFLICT (slug) DO NOTHING;

-- 11. Social Network
INSERT INTO tenants (name, slug, status)
VALUES ('Social Network', 'social', 'active')
ON CONFLICT (slug) DO NOTHING;

-- 12. Gaming Platform
INSERT INTO tenants (name, slug, status)
VALUES ('Gaming Platform', 'gaming', 'active')
ON CONFLICT (slug) DO NOTHING;

-- 13. IoT Dashboard
INSERT INTO tenants (name, slug, status)
VALUES ('IoT Dashboard', 'iot', 'active')
ON CONFLICT (slug) DO NOTHING;

-- 14. SaaS Metrics
INSERT INTO tenants (name, slug, status)
VALUES ('SaaS Metrics', 'saas', 'active')
ON CONFLICT (slug) DO NOTHING;

-- Features for all sample tenants
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
WHERE t.slug IN ('fintech','hrms','healthcare','logistics','edtech','realestate','travel','food','banking','insurance','social','gaming','iot','saas')
ON CONFLICT (tenant_id, feature_key) DO NOTHING;

-- Channels
INSERT INTO tenant_channels (tenant_id, channel, enabled, direction, rate_limit_per_second, daily_quota, priority, config_json)
SELECT t.id, c.channel, true, c.direction, 20, 50000, 5, '{}'::jsonb
FROM tenants t
CROSS JOIN (VALUES ('sms','one_way'), ('email','one_way'), ('fcm','one_way'), ('websocket','two_way')) AS c(channel, direction)
WHERE t.slug IN ('fintech','hrms','healthcare','logistics','edtech','realestate','travel','food','banking','insurance','social','gaming','iot','saas')
ON CONFLICT (tenant_id, channel) DO NOTHING;

-- Mock providers
INSERT INTO tenant_provider_configs (tenant_id, channel, provider, config_json, is_default, status)
SELECT t.id, c.channel, 'mock', '{"secret":"[locally-encrypted]"}'::jsonb, true, 'active'
FROM tenants t
CROSS JOIN (VALUES ('sms'), ('email'), ('fcm'), ('websocket')) AS c(channel)
WHERE t.slug IN ('fintech','hrms','healthcare','logistics','edtech','realestate','travel','food','banking','insurance','social','gaming','iot','saas')
ON CONFLICT (tenant_id, channel) WHERE is_default = true AND status = 'active' DO NOTHING;

-- API keys
INSERT INTO tenant_api_keys (tenant_id, name, key_hash, scopes_json, status)
SELECT t.id, 'Sample API Key', encode(sha256(('sample_' || t.slug)::bytea), 'hex')::text, '["notifications:create", "devices:write", "in_app:read"]'::jsonb, 'active'
FROM tenants t
WHERE t.slug IN ('fintech','hrms','healthcare','logistics','edtech','realestate','travel','food','banking','insurance','social','gaming','iot','saas')
ON CONFLICT (key_hash) DO NOTHING;

-- Fintech templates
INSERT INTO notification_templates (tenant_id, template_key, channel, subject, body, status)
SELECT t.id, 'payment_received', 'sms', NULL, 'Your payment of ${{amount}} has been received. Ref: {{reference}}.', 'active' FROM tenants t WHERE t.slug = 'fintech'
UNION ALL
SELECT t.id, 'payment_received', 'email', 'Payment Received', 'Dear {{customer_name}},\n\nYour payment of ${{amount}} (Ref: {{reference}}) has been received successfully.', 'active' FROM tenants t WHERE t.slug = 'fintech'
UNION ALL
SELECT t.id, 'withdrawal_processed', 'sms', NULL, 'Your withdrawal of ${{amount}} has been processed. Expected arrival: {{date}}.', 'active' FROM tenants t WHERE t.slug = 'fintech'
ON CONFLICT (tenant_id, template_key, channel, locale) DO NOTHING;

-- HRMS templates
INSERT INTO notification_templates (tenant_id, template_key, channel, subject, body, status)
SELECT t.id, 'leave_approved', 'email', 'Leave Approved', 'Dear {{employee_name}},\n\nYour leave request from {{start_date}} to {{end_date}} has been approved.', 'active' FROM tenants t WHERE t.slug = 'hrms'
UNION ALL
SELECT t.id, 'payroll_processed', 'email', 'Payroll Processed', 'Dear {{employee_name}},\n\nYour salary for {{month}} has been processed. Net pay: ${{amount}}.', 'active' FROM tenants t WHERE t.slug = 'hrms'
UNION ALL
SELECT t.id, 'onboarding_welcome', 'email', 'Welcome to the Team!', 'Welcome {{employee_name}}! We are excited to have you on board starting {{start_date}}.', 'active' FROM tenants t WHERE t.slug = 'hrms'
ON CONFLICT (tenant_id, template_key, channel, locale) DO NOTHING;

-- Healthcare templates
INSERT INTO notification_templates (tenant_id, template_key, channel, subject, body, status)
SELECT t.id, 'appointment_reminder', 'sms', NULL, 'Reminder: Your appointment with {{doctor_name}} is on {{date}} at {{time}}. Reply C to confirm.', 'active' FROM tenants t WHERE t.slug = 'healthcare'
UNION ALL
SELECT t.id, 'lab_results_ready', 'email', 'Lab Results Ready', 'Dear {{patient_name}},\n\nYour lab results from {{date}} are now available in your patient portal.', 'active' FROM tenants t WHERE t.slug = 'healthcare'
UNION ALL
SELECT t.id, 'prescription_refill', 'sms', NULL, 'Your prescription for {{medication}} is ready for refill at {{pharmacy}}.', 'active' FROM tenants t WHERE t.slug = 'healthcare'
ON CONFLICT (tenant_id, template_key, channel, locale) DO NOTHING;

-- Logistics templates
INSERT INTO notification_templates (tenant_id, template_key, channel, subject, body, status)
SELECT t.id, 'shipment_dispatched', 'sms', NULL, 'Your shipment {{tracking_id}} has been dispatched. Expected delivery: {{delivery_date}}.', 'active' FROM tenants t WHERE t.slug = 'logistics'
UNION ALL
SELECT t.id, 'delivery_confirmed', 'email', 'Delivery Confirmed', 'Dear {{customer_name}},\n\nYour shipment {{tracking_id}} has been delivered successfully.', 'active' FROM tenants t WHERE t.slug = 'logistics'
ON CONFLICT (tenant_id, template_key, channel, locale) DO NOTHING;

-- EdTech templates
INSERT INTO notification_templates (tenant_id, template_key, channel, subject, body, status)
SELECT t.id, 'course_enrollment', 'email', 'Enrolled in {{course_name}}', 'Dear {{student_name}},\n\nYou have been enrolled in {{course_name}}. Start learning today!', 'active' FROM tenants t WHERE t.slug = 'edtech'
UNION ALL
SELECT t.id, 'assignment_due', 'sms', NULL, 'Reminder: {{assignment_name}} is due on {{due_date}}. Submit on time!', 'active' FROM tenants t WHERE t.slug = 'edtech'
ON CONFLICT (tenant_id, template_key, channel, locale) DO NOTHING;

-- Real Estate templates
INSERT INTO notification_templates (tenant_id, template_key, channel, subject, body, status)
SELECT t.id, 'new_listing_match', 'email', 'New Property Match', 'Hi {{buyer_name}},\n\nA new property matching your criteria is available: {{property_title}} for ${{price}}.', 'active' FROM tenants t WHERE t.slug = 'realestate'
UNION ALL
SELECT t.id, 'showing_scheduled', 'sms', NULL, 'Your showing for {{property_title}} is scheduled on {{date}} at {{time}}.', 'active' FROM tenants t WHERE t.slug = 'realestate'
ON CONFLICT (tenant_id, template_key, channel, locale) DO NOTHING;

-- Travel templates
INSERT INTO notification_templates (tenant_id, template_key, channel, subject, body, status)
SELECT t.id, 'booking_confirmed', 'email', 'Booking Confirmed', 'Dear {{customer_name}},\n\nYour {{booking_type}} booking (Ref: {{reference}}) is confirmed.\nCheck-in: {{check_in}}\nCheck-out: {{check_out}}', 'active' FROM tenants t WHERE t.slug = 'travel'
UNION ALL
SELECT t.id, 'flight_reminder', 'sms', NULL, 'Reminder: Your flight {{flight_no}} departs {{date}} at {{time}} from {{airport}}.', 'active' FROM tenants t WHERE t.slug = 'travel'
ON CONFLICT (tenant_id, template_key, channel, locale) DO NOTHING;

-- Food Delivery templates
INSERT INTO notification_templates (tenant_id, template_key, channel, subject, body, status)
SELECT t.id, 'order_placed', 'sms', NULL, 'Your order #{{order_id}} has been placed. Estimated delivery: {{eta}}.', 'active' FROM tenants t WHERE t.slug = 'food'
UNION ALL
SELECT t.id, 'order_out_for_delivery', 'sms', NULL, 'Your order #{{order_id}} is out for delivery! Track your delivery in real-time.', 'active' FROM tenants t WHERE t.slug = 'food'
UNION ALL
SELECT t.id, 'order_delivered', 'email', 'Order Delivered', 'Dear {{customer_name}},\n\nYour order #{{order_id}} has been delivered. Enjoy your meal!', 'active' FROM tenants t WHERE t.slug = 'food'
ON CONFLICT (tenant_id, template_key, channel, locale) DO NOTHING;

-- Banking templates
INSERT INTO notification_templates (tenant_id, template_key, channel, subject, body, status)
SELECT t.id, 'transaction_alert', 'sms', NULL, 'Alert: ${{amount}} debited from account ****{{last_four}} on {{date}}. Available balance: ${{balance}}.', 'active' FROM tenants t WHERE t.slug = 'banking'
UNION ALL
SELECT t.id, 'statement_ready', 'email', 'Monthly Statement', 'Dear {{customer_name}},\n\nYour account statement for {{month}} is now available.', 'active' FROM tenants t WHERE t.slug = 'banking'
UNION ALL
SELECT t.id, 'fraud_alert', 'sms', NULL, 'ALERT: Unusual transaction of ${{amount}} detected on your account. Reply Y if this was you, N to block.', 'active' FROM tenants t WHERE t.slug = 'banking'
ON CONFLICT (tenant_id, template_key, channel, locale) DO NOTHING;

-- Insurance templates
INSERT INTO notification_templates (tenant_id, template_key, channel, subject, body, status)
SELECT t.id, 'premium_due', 'email', 'Premium Payment Due', 'Dear {{policyholder}},\n\nYour {{policy_type}} premium of ${{amount}} is due on {{due_date}}.', 'active' FROM tenants t WHERE t.slug = 'insurance'
UNION ALL
SELECT t.id, 'claim_approved', 'sms', NULL, 'Your claim #{{claim_id}} has been approved. ${{amount}} will be credited within 5 business days.', 'active' FROM tenants t WHERE t.slug = 'insurance'
ON CONFLICT (tenant_id, template_key, channel, locale) DO NOTHING;

-- Social Network templates
INSERT INTO notification_templates (tenant_id, template_key, channel, subject, body, status)
SELECT t.id, 'friend_request', 'fcm', 'New Friend Request', '{{sender_name}} sent you a friend request.', 'active' FROM tenants t WHERE t.slug = 'social'
UNION ALL
SELECT t.id, 'message_received', 'fcm', 'New Message', '{{sender_name}}: {{message_preview}}', 'active' FROM tenants t WHERE t.slug = 'social'
UNION ALL
SELECT t.id, 'post_liked', 'fcm', 'New Like', '{{liker_name}} liked your post.', 'active' FROM tenants t WHERE t.slug = 'social'
ON CONFLICT (tenant_id, template_key, channel, locale) DO NOTHING;

-- Gaming templates
INSERT INTO notification_templates (tenant_id, template_key, channel, subject, body, status)
SELECT t.id, 'match_found', 'fcm', 'Match Found!', 'A {{game_mode}} match is ready. Join now!', 'active' FROM tenants t WHERE t.slug = 'gaming'
UNION ALL
SELECT t.id, 'tournament_reminder', 'email', 'Tournament Starting Soon', 'Dear {{player_name}},\n\nThe {{tournament_name}} tournament starts in 30 minutes!', 'active' FROM tenants t WHERE t.slug = 'gaming'
UNION ALL
SELECT t.id, 'reward_earned', 'fcm', 'Reward Unlocked', 'You earned {{reward_name}}! Check your inventory.', 'active' FROM tenants t WHERE t.slug = 'gaming'
ON CONFLICT (tenant_id, template_key, channel, locale) DO NOTHING;

-- IoT templates
INSERT INTO notification_templates (tenant_id, template_key, channel, subject, body, status)
SELECT t.id, 'device_offline', 'sms', NULL, 'ALERT: Device {{device_name}} ({{device_id}}) has gone offline.', 'active' FROM tenants t WHERE t.slug = 'iot'
UNION ALL
SELECT t.id, 'threshold_breach', 'email', 'Threshold Breach Alert', 'Sensor {{sensor_name}} at {{location}} has breached {{threshold}} threshold. Current value: {{value}}.', 'active' FROM tenants t WHERE t.slug = 'iot'
ON CONFLICT (tenant_id, template_key, channel, locale) DO NOTHING;

-- SaaS templates
INSERT INTO notification_templates (tenant_id, template_key, channel, subject, body, status)
SELECT t.id, 'usage_threshold', 'email', 'Usage Threshold Reached', 'Hi {{account_name}},\n\nYour {{metric_name}} usage has reached {{percentage}}% of your plan limit.', 'active' FROM tenants t WHERE t.slug = 'saas'
UNION ALL
SELECT t.id, 'trial_expiring', 'email', 'Trial Ending Soon', 'Hi {{account_name}},\n\nYour trial expires on {{expiry_date}}. Upgrade to keep your workspace active.', 'active' FROM tenants t WHERE t.slug = 'saas'
UNION ALL
SELECT t.id, 'invoice_ready', 'email', 'Invoice Ready', 'Your invoice for {{billing_period}} is ready. Total: ${{amount}}.', 'active' FROM tenants t WHERE t.slug = 'saas'
ON CONFLICT (tenant_id, template_key, channel, locale) DO NOTHING;

-- Contacts for all 14 sample tenants
INSERT INTO contacts (tenant_id, external_user_id, name, email, phone, status)
SELECT id, 'fin_cust_001', 'Alice Johnson', 'alice@fintech.example', '+12025551201', 'active' FROM tenants WHERE slug = 'fintech'
ON CONFLICT DO NOTHING;

INSERT INTO contacts (tenant_id, external_user_id, name, email, phone, status)
SELECT id, 'hr_emp_001', 'Bob Williams', 'bob@hrms.example', '+12025551202', 'active' FROM tenants WHERE slug = 'hrms'
ON CONFLICT DO NOTHING;

INSERT INTO contacts (tenant_id, external_user_id, name, email, phone, status)
SELECT id, 'pat_001', 'Carol Davis', 'carol@health.example', '+12025551203', 'active' FROM tenants WHERE slug = 'healthcare'
ON CONFLICT DO NOTHING;

INSERT INTO contacts (tenant_id, external_user_id, name, email, phone, status)
SELECT id, 'log_cust_001', 'David Brown', 'david@logistics.example', '+12025551204', 'active' FROM tenants WHERE slug = 'logistics'
ON CONFLICT DO NOTHING;

INSERT INTO contacts (tenant_id, external_user_id, name, email, phone, status)
SELECT id, 'stu_001', 'Eve Martinez', 'eve@edtech.example', '+12025551205', 'active' FROM tenants WHERE slug = 'edtech'
ON CONFLICT DO NOTHING;

INSERT INTO contacts (tenant_id, external_user_id, name, email, phone, status)
SELECT id, 're_cust_001', 'Frank Lee', 'frank@realestate.example', '+12025551206', 'active' FROM tenants WHERE slug = 'realestate'
ON CONFLICT DO NOTHING;

INSERT INTO contacts (tenant_id, external_user_id, name, email, phone, status)
SELECT id, 'trav_cust_001', 'Grace Kim', 'grace@travel.example', '+12025551207', 'active' FROM tenants WHERE slug = 'travel'
ON CONFLICT DO NOTHING;

INSERT INTO contacts (tenant_id, external_user_id, name, email, phone, status)
SELECT id, 'food_cust_001', 'Henry Chen', 'henry@food.example', '+12025551208', 'active' FROM tenants WHERE slug = 'food'
ON CONFLICT DO NOTHING;

INSERT INTO contacts (tenant_id, external_user_id, name, email, phone, status)
SELECT id, 'bank_cust_001', 'Iris Wang', 'iris@banking.example', '+12025551209', 'active' FROM tenants WHERE slug = 'banking'
ON CONFLICT DO NOTHING;

INSERT INTO contacts (tenant_id, external_user_id, name, email, phone, status)
SELECT id, 'ins_pol_001', 'Jack Smith', 'jack@insurance.example', '+12025551210', 'active' FROM tenants WHERE slug = 'insurance'
ON CONFLICT DO NOTHING;

INSERT INTO contacts (tenant_id, external_user_id, name, email, phone, status)
SELECT id, 'social_usr_001', 'Kate Brown', 'kate@social.example', '+12025551211', 'active' FROM tenants WHERE slug = 'social'
ON CONFLICT DO NOTHING;

INSERT INTO contacts (tenant_id, external_user_id, name, email, phone, status)
SELECT id, 'game_usr_001', 'Leo Park', 'leo@gaming.example', '+12025551212', 'active' FROM tenants WHERE slug = 'gaming'
ON CONFLICT DO NOTHING;

INSERT INTO contacts (tenant_id, external_user_id, name, email, phone, status)
SELECT id, 'iot_dev_001', 'Maria Santos', 'maria@iot.example', '+12025551213', 'active' FROM tenants WHERE slug = 'iot'
ON CONFLICT DO NOTHING;

INSERT INTO contacts (tenant_id, external_user_id, name, email, phone, status)
SELECT id, 'saas_acc_001', 'Nathan Green', 'nathan@saas.example', '+12025551214', 'active' FROM tenants WHERE slug = 'saas'
ON CONFLICT DO NOTHING;

-- Groups: unique per tenant
INSERT INTO contact_groups (tenant_id, name, description, status)
SELECT t.id, t.name || ' Customers', 'Primary customer segment for ' || t.name, 'active' FROM tenants t WHERE t.slug IN ('fintech','hrms','healthcare','logistics','edtech','realestate','travel','food','banking','insurance','social','gaming','iot','saas')
ON CONFLICT (tenant_id, name) DO NOTHING;

INSERT INTO contact_groups (tenant_id, name, description, status)
SELECT t.id, t.name || ' VIP', 'VIP segment for ' || t.name, 'active' FROM tenants t WHERE t.slug IN ('fintech','hrms','healthcare','logistics','edtech','realestate','travel','food','banking','insurance','social','gaming','iot','saas')
ON CONFLICT (tenant_id, name) DO NOTHING;

INSERT INTO contact_groups (tenant_id, name, description, status)
SELECT t.id, t.name || ' Trial Users', 'Trial/free tier users for ' || t.name, 'active' FROM tenants t WHERE t.slug IN ('fintech','hrms','healthcare','logistics','edtech','realestate','travel','food','banking','insurance','social','gaming','iot','saas')
ON CONFLICT (tenant_id, name) DO NOTHING;

-- Add each tenant's contact to their primary group
INSERT INTO contact_group_members (tenant_id, group_id, contact_id)
SELECT t.id, g.id, c.id
FROM tenants t
JOIN contact_groups g ON g.tenant_id = t.id AND g.name = t.name || ' Customers'
JOIN contacts c ON c.tenant_id = t.id
WHERE t.slug IN ('fintech','hrms','healthcare','logistics','edtech','realestate','travel','food','banking','insurance','social','gaming','iot','saas')
ON CONFLICT DO NOTHING;

-- Draft campaigns for each sample tenant
INSERT INTO campaigns (tenant_id, name, description, status, scheduled_at)
SELECT id, 'Q4 Promotional', 'Q4 promotional campaign', 'draft', NULL FROM tenants WHERE slug IN ('fintech','hrms','healthcare','logistics','edtech','realestate','travel','food','banking','insurance','social','gaming','iot','saas')
ON CONFLICT DO NOTHING;

INSERT INTO campaigns (tenant_id, name, description, status, scheduled_at)
SELECT id, 'Welcome Series', 'New user onboarding campaign', 'draft', NULL FROM tenants WHERE slug IN ('fintech','hrms','healthcare','logistics','edtech','realestate','travel','food','banking','insurance','social','gaming','iot','saas')
ON CONFLICT DO NOTHING;

SELECT 'Sample tenants seeded. Unique groups per tenant, campaigns, and contacts added.' AS message;
