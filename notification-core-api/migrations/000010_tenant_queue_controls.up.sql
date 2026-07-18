CREATE TABLE tenant_queue_controls (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    channel text NOT NULL,
    queue_name text NOT NULL UNIQUE,
    status text NOT NULL DEFAULT 'active',
    max_attempts integer NOT NULL DEFAULT 3,
    retry_delay_seconds integer NOT NULL DEFAULT 60,
    notes text NOT NULL DEFAULT '',
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    updated_by uuid REFERENCES users(id) ON DELETE SET NULL,
    UNIQUE (tenant_id, channel),
    CHECK (status IN ('active', 'paused', 'stopped')),
    CHECK (max_attempts BETWEEN 1 AND 20),
    CHECK (retry_delay_seconds BETWEEN 0 AND 86400)
);

INSERT INTO tenant_queue_controls (tenant_id, channel, queue_name)
SELECT tc.tenant_id, tc.channel, 'tenant.' || regexp_replace(lower(t.slug), '[^a-z0-9]+', '-', 'g') || '.' || tc.channel
FROM tenant_channels tc
JOIN tenants t ON t.id = tc.tenant_id
ON CONFLICT (tenant_id, channel) DO NOTHING;

CREATE INDEX idx_tenant_queue_controls_status ON tenant_queue_controls(status, channel);
CREATE INDEX idx_tenant_queue_controls_tenant ON tenant_queue_controls(tenant_id, channel);
