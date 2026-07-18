# Notification Platform

Modular multi-tenant notification platform with a Go backend, queue workers, PostgreSQL, Redis, RabbitMQ, and a React admin dashboard.

## Architecture

`notification-core-api` contains the REST API and worker binaries. The API accepts admin JWT requests and tenant API-key requests, validates tenant status, feature flags, channel settings, rate limits, and provider configuration, then stores notification records and publishes RabbitMQ jobs. Workers consume channel queues and write delivery attempts and delivery logs.

`notification-admin-ui` is a React dashboard for platform admins and tenant users. Navigation is permission-aware, using effective permissions from the authenticated user. The portal includes self-service investigation flows for notification logs, delivery attempts, lifecycle timelines, queue controls, provider configuration, audit logs, and manual notification sends.

Core principle:

```text
Code defines capabilities.
Database decides which tenant can use which capability.
Infrastructure decides how much traffic it can handle.
```

## Why Go and React

Go keeps the API and workers small, fast, and easy to ship as separate binaries. React provides a flexible admin UI for platform operations, tenant configuration, campaign work, logs, and manual sends.

## Local development

```sh
chmod +x run.sh stop.sh test-local.sh
./run.sh
```

The interactive runner can start the complete Docker stack, a hybrid setup (infrastructure in Docker and applications with system tools), infrastructure only, individual applications, or selected workers. Local system processes write logs and PID files under `.runtime/`.

Quick non-interactive targets are also available:

```sh
make infra       # PostgreSQL, Redis, RabbitMQ
make api         # Docker API (and its dependencies)
make workers     # Docker workers
make admin       # Docker admin UI
make test-local  # end-to-end local smoke checks
make stop        # keep database volumes
```

Local services:

- API: `http://localhost:8080`
- Admin UI: `http://localhost:3000`
- RabbitMQ management: `http://localhost:15672` (`notification` / `notification`)
- PostgreSQL: `localhost:5432`
- Redis: `localhost:6379`

Seed credentials:

- Platform admin: `admin@example.com` / `password`
- Tenant user: `tenant@example.com` / `password`
- Tenant API key: `demo_tenant_api_key_local` (for the e-commerce sample tenant)

Mock providers are the safe local default. Provider credentials belong only in ignored backend files, never in the frontend or committed examples. The current worker implementations deliver through mock adapters; email/SMS/FCM real-provider values can be prepared locally for future adapters but are not sent to those services yet.

See [Local development](docs/local-development.md) and [Provider configuration](docs/provider-configuration.md) for every mode, stopping/volume cleanup, troubleshooting, and security details.

## Migrations and Seed

Docker Compose runs migrations and seed data automatically. Manually:

```sh
cd notification-core-api
make migrate-up
make seed
```

The seed menu (`./run.sh` option 8) provides:
1. Fresh start — platform admin only, no sample tenants
2. Seed one sample tenant — choose from 14 industries (fintech, hrms, healthcare, etc.)
3. Seed all sample tenants
4. Local seed — e-commerce tenant with templates, contacts, and API key

Sample tenant slug: `ecommerce`.

Raw API keys are stored only as hashes. The seed prints the local key once for testing.

## Sample API Key Usage

```sh
curl -X POST http://localhost:8080/api/v1/notifications \
  -H "Authorization: Bearer demo_tenant_api_key_local" \
  -H "Content-Type: application/json" \
  -d '{
    "event": "order.confirmed",
    "channels": ["sms", "email"],
    "template": "order_confirmation",
    "target": {
      "type": "single",
      "recipient": {
        "phone": "+12025551234",
        "email": "jane@example.com",
        "fcm_token": "device_token",
        "external_user_id": "cust_001"
      }
    },
    "data": {
      "customer_name": "Jane Smith",
      "order_id": "ORD-12345",
      "total_amount": "99.99"
    },
    "priority": 5,
    "schedule": { "type": "instant" }
  }'
```

## Scheduled Notification

```json
{
  "event": "order.confirmed",
  "channels": ["sms"],
  "template": "order_confirmation",
  "target": { "type": "single", "recipient": { "phone": "+12025551234" } },
  "data": { "customer_name": "Jane Smith", "order_id": "ORD-12345" },
  "priority": 5,
  "schedule": { "type": "scheduled", "send_at": "2026-06-28T10:00:00Z" }
}
```

The scheduler worker scans `scheduled_jobs` where `due_at <= now()` and queues channel delivery jobs.

## Campaign Flow

The schema includes `campaigns`, `campaign_recipients`, and `scheduled_jobs` for draft, approval, send-now, scheduled send, cancellation, and delivery result tracking. The UI includes a campaign module placeholder ready for CRUD and approval forms.

## Worker Scaling

```sh
docker compose --profile all up -d --scale worker-sms=5
docker compose --profile all up -d --scale worker-fcm=5
```

API nodes remain stateless. PostgreSQL, Redis, and RabbitMQ are shared state.

## Feature Flags and Tenant Isolation

Feature flags live in `tenant_features`. Channel behavior lives in `tenant_channels`. Provider configuration lives in `tenant_provider_configs`. Send-time checks are runtime DB checks, so enabling or disabling tenant capabilities does not require code changes.

Every major table includes `tenant_id` where applicable, and query code avoids `SELECT *`.

## Logging, Audit, and Security

The backend uses structured logs and central redaction helpers for secrets, API keys, JWTs, provider tokens, emails, phone numbers, and config secret fields. Audit logs capture login, tenant, API key, provider, RBAC, template, campaign, manual send, retry, and cancellation actions as the implementation expands.

Every HTTP request is logged with request_id, method, path, status, duration_ms, tenant_id, actor_id, and remote_ip. A panic recovery middleware catches panics, logs stack traces, and returns 500.

Passwords are bcrypt hashes. API keys are SHA-256 hashes. Provider secrets are encrypted at rest with AES-256-GCM using `APP_ENCRYPTION_KEY`. The encrypted config is decrypted transparently during provider test operations.

## Observability

Prometheus-format metrics at `GET /metrics` (27+ metrics): notification counters, queue stats, worker stats, provider send/fail rates (by channel), WebSocket stats, panic counter, HTTP request rate and latency histogram. See `docs/observability.md` for Prometheus scrape config, Grafana panel recommendations, and critical alerts.

## Self-Service Operations

The notification explorer supports paginated search by notification ID, event, idempotency key, channel, provider, status, tenant, and date range. Opening a notification shows a tenant-safe lifecycle timeline built from notification, delivery, and attempt records, including normalized failure categories and suggested actions.

See [Self-service operations](docs/self-service-operations.md) for the requirement matrix, implemented APIs, database indexes, and remaining operations roadmap.

## Tenant Integration Guide

Tenant technical users can open **Integration** from the tenant portal to view tenant-aware setup status, API base URL, authentication guidance, rate limits, credential metadata, checklist progress, recent delivery errors, and copyable examples for cURL, JavaScript, Node.js, PHP, Laravel, Python, and Go.

Platform administrators can open the same tenant-scoped guide under **Tenants → Tenant Details → Integration**. Existing API key secrets are never redisplayed.

See [Tenant integration guide](docs/tenant-integration-guide.md) for endpoints, permissions, security notes, and current OpenAPI/webhook limitations.

## Granular Permissions

Broad "manage" permissions (e.g. `users.manage`, `providers.manage`) are split into granular view/create/update/delete/test/revoke permissions. Backward compatibility is maintained: users holding a broad permission automatically satisfy all corresponding granular permission checks. Action buttons in the frontend are gated by the specific granular permission required.

## Backup and Restore

Scripts under `notification-core-api/scripts/`:
- `backup-postgres.sh` - gzip-compressed timestamped dump to `backups/`
- `restore-postgres.sh` - restore with confirmation prompt
- `prune-old-logs.sh` - remove log files older than `LOG_RETENTION_DAYS` (default 30)

## Deployment Profiles

Lite: one VPS with Docker Compose, PostgreSQL, Redis, RabbitMQ, API, workers, and admin UI.

Standard: API/admin on one host, database on a managed or separate host, Redis and RabbitMQ separate.

Enterprise: multiple API replicas, independent worker pools, separate WebSocket nodes, PostgreSQL primary/replica, Redis cluster, and RabbitMQ cluster.

No code changes are required across profiles; change environment variables, server specs, and worker counts.
