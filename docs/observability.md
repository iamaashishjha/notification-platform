# Observability

## Metrics Endpoint

`GET /metrics` returns Prometheus-format text on port 8080.

### Available Metrics

| Metric | Type | Labels | Source |
|--------|------|--------|--------|
| `notifications_sent_total` | counter | — | DB: notification_deliveries |
| `notifications_failed_total` | counter | — | DB |
| `notifications_retried_total` | counter | — | DB |
| `notifications_dead_lettered_total` | counter | — | DB |
| `campaigns_sent_total` | counter | — | DB |
| `queue_jobs_processed_total` | counter | — | DB |
| `queue_jobs_failed_total` | counter | — | DB |
| `queue_publish_total` | counter | — | DB |
| `queue_publish_failed_total` | counter | — | DB |
| `queue_consume_total` | counter | — | DB |
| `retry_queue_total` | counter | — | DB |
| `dead_letter_total` | counter | — | DB |
| `worker_jobs_started_total` | counter | — | DB |
| `worker_jobs_completed_total` | counter | — | DB |
| `worker_jobs_failed_total` | counter | — | DB |
| `worker_active_gauge` | gauge | — | DB |
| `provider_send_total` | counter | `provider_channel` | DB |
| `provider_send_failed_total` | counter | `provider_channel` | DB |
| `websocket_connections_active` | gauge | — | process |
| `websocket_messages_sent_total` | counter | — | process |
| `websocket_messages_acked_total` | counter | — | process |
| `websocket_disconnects_total` | counter | — | process |
| `websocket_reconnect_syncs_total` | counter | — | process |
| `panics_total` | counter | — | process |
| `http_requests_total` | counter | `method` | process |
| `request_duration_seconds` | histogram | — | process |
| `worker_duration_seconds` | histogram | — | stub |

All DB-backed metrics refresh on each /metrics scrape.

## Request Logging

Every HTTP request is logged as a structured JSON line:

```json
{
  "level": "info",
  "request_id": "req_abc123",
  "method": "POST",
  "path": "/admin/api/v1/auth/login",
  "status": 200,
  "duration_ms": 42,
  "remote_ip": "10.0.0.1",
  "user_agent": "axios/1.6",
  "tenant_id": "uuid-here",
  "actor_id": "uuid-here"
}
```

## Panic Recovery

The PanicRecovery middleware catches all panics, logs the stack trace with request context, increments `panics_total`, and returns 500.

## Recommended Prometheus Scrape Config

```yaml
scrape_configs:
  - job_name: 'notification-api'
    scrape_interval: 15s
    metrics_path: /metrics
    static_configs:
      - targets: ['api:8080']
```

## Recommended Grafana Panels

### Notifications Panel
- Rate of `notifications_sent_total[5m]`
- Rate of `notifications_failed_total[5m]`
- Success rate = sent / (sent + failed)

### Worker Panel
- Rate of `worker_jobs_started_total[5m]`
- Rate of `worker_jobs_failed_total[5m]`
- Gauge: `worker_active_gauge`

### Queue Panel
- Rate of `queue_consume_total[5m]`
- Gauge: `dead_letter_total`
- Gauge: `retry_queue_total`

### Provider Panel
- Rate of `provider_send_total[5m]` by `provider_channel`
- Rate of `provider_send_failed_total[5m]` by `provider_channel`

### WebSocket Panel
- Gauge: `websocket_connections_active`
- Rate of `websocket_disconnects_total[5m]`

### API Panel
- Rate of `http_requests_total[5m]` by `method`
- Histogram quantiles from `request_duration_seconds`

### Panic Panel
- Rate of `panics_total[5m]` — should be zero

## Critical Alerts

| Alert | Condition | Priority |
|-------|-----------|----------|
| High failed delivery rate | `rate(notifications_failed_total[5m]) > 10` | P1 |
| Dead-letter queue not empty | `dead_letter_total > 0` | P1 |
| Provider failure spike | `rate(provider_send_failed_total[5m]) > 5` | P2 |
| API 5xx spike | `rate(http_requests_total{method=~".* 5xx"}[5m]) > 5` | P2 |
| WebSocket disconnect spike | `rate(websocket_disconnects_total[5m]) > 10` | P3 |
| Active connections drop to 0 | `websocket_connections_active == 0` | P3 |
| Panic detected | `rate(panics_total[5m]) > 0` | P1 |

## Worker Observability

Each worker logs structured JSON with:
- `worker` (channel name)
- `delivery_id`
- `notification_id`
- `channel`
- `duration_ms`
- `status` (sent/failed)
- `error` (if failed)

Workers use the same logger package as the API and write to stdout.
