CREATE INDEX IF NOT EXISTS idx_notifications_tenant_idempotency ON notifications(tenant_id, idempotency_key) WHERE idempotency_key IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_notifications_tenant_event_created ON notifications(tenant_id, event_key, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_deliveries_tenant_status_updated ON notification_deliveries(tenant_id, status, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_deliveries_tenant_channel_provider ON notification_deliveries(tenant_id, channel, provider, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_attempts_tenant_created ON delivery_attempts(tenant_id, created_at DESC);
