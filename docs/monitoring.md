# Monitoring

## Metrics Endpoint

The API exposes Prometheus-compatible metrics at `GET /metrics`.

### Available Metrics

| Metric | Type | Description |
|--------|------|-------------|
| `notifications_sent_total` | counter | Total deliveries with status `sent` |
| `notifications_failed_total` | counter | Total deliveries with status `failed` |
| `notifications_retried_total` | counter | Total deliveries containing retry_count in response_json |
| `notifications_dead_lettered_total` | counter | Total deliveries with status `dead` |
| `queue_jobs_processed_total` | counter | Counter for processed queue jobs (atomic, in-process) |
| `queue_jobs_failed_total` | counter | Counter for failed queue jobs (atomic, in-process) |
| `campaigns_sent_total` | counter | Total campaigns with status `sent` |
| `websocket_connections_active` | gauge | Current active WebSocket connections |
| `request_duration_seconds` | histogram | Request latency distribution (stub - histogram buckets defined, no active instrumentation) |
| `worker_duration_seconds` | histogram | Worker processing duration (stub - histogram buckets defined, no active instrumentation) |

### Implementation Details

- Metrics are refreshed from PostgreSQL on each `/metrics` scrape.
- Queue job counters use atomic.Int64 and track in-process values.
- WebSocket connection count comes from the in-memory hub.
- The endpoint is not authenticated (Prometheus standard).

### Prometheus Scrape Config

```yaml
scrape_configs:
  - job_name: 'notification-platform'
    scrape_interval: 15s
    static_configs:
      - targets: ['localhost:8080']
```

## Dashboard

The admin UI dashboard at `/` provides operational visibility:
- Queued notifications
- Sent today
- Failed deliveries
- Delivery success rate
- Retry count
- Dead-letter count
- Active campaigns
- Active WebSocket connections
- Per-channel delivery counts (24h window)

## Logging

- Structured JSON logging via zap
- Log level configurable via `LOG_LEVEL` env var
- Request IDs propagated through context
- Sensitive headers (Authorization) redacted before logging

## Health Checks

- `GET /healthz` - Always returns 200 (process is alive)
- `GET /readyz` - Returns 200 when PostgreSQL is reachable
