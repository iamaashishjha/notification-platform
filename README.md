# Notification Platform

Modular multi-tenant notification platform with a Go backend, queue workers, PostgreSQL, Redis, RabbitMQ, and a React admin dashboard.

## Architecture

`notification-core-api` contains the REST API and worker binaries. The API accepts admin JWT requests and tenant API-key requests, validates tenant status, feature flags, channel settings, rate limits, and provider configuration, then stores notification records and publishes RabbitMQ jobs. Workers consume channel queues and write delivery attempts and delivery logs.

`notification-admin-ui` is a React dashboard for platform admins and tenant users. Navigation is permission-aware, using effective permissions from the authenticated user.

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
- Tenant API key: `demo_tenant_api_key_local`

Mock providers are the safe local default. Provider credentials belong only in ignored backend files, never in the frontend or committed examples. The current worker implementations deliver through mock adapters; email/SMS/FCM real-provider values can be prepared locally for future adapters but are not sent to those services yet.

See [Local development](docs/local-development.md) and [Provider configuration](docs/provider-configuration.md) for every mode, stopping/volume cleanup, troubleshooting, and security details.

## Migrations and Seed

Docker Compose runs migrations and seed data automatically. Manually:

```sh
cd notification-core-api
make migrate-up
make seed
```

Demo tenant slug: `demo-ride`.

Raw API keys are stored only as hashes. The seed prints the local key once for testing.

## Sample API Key Usage

```sh
curl -X POST http://localhost:8080/api/v1/notifications \
  -H "Authorization: Bearer demo_tenant_api_key_local" \
  -H "Content-Type: application/json" \
  -d '{
    "event": "ride.accepted",
    "channels": ["sms", "fcm"],
    "template": "ride_accepted",
    "target": {
      "type": "single",
      "recipient": {
        "phone": "9840000000",
        "email": "user@example.com",
        "fcm_token": "device_token",
        "external_user_id": "user_123"
      }
    },
    "data": {
      "customer_name": "Aashish",
      "driver_name": "Ram",
      "vehicle_no": "BA 2 PA 1234"
    },
    "priority": 5,
    "schedule": { "type": "instant" }
  }'
```

## Scheduled Notification

```json
{
  "event": "ride.accepted",
  "channels": ["sms"],
  "template": "ride_accepted",
  "target": { "type": "single", "recipient": { "phone": "9840000000" } },
  "data": { "customer_name": "Aashish" },
  "priority": 5,
  "schedule": { "type": "scheduled", "send_at": "2026-06-26T10:00:00+05:45" }
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

Passwords are bcrypt hashes. API keys are SHA-256 hashes. Provider secret encryption helpers are intentionally placeholder-ready for plugging in KMS or envelope encryption.

## Deployment Profiles

Lite: one VPS with Docker Compose, PostgreSQL, Redis, RabbitMQ, API, workers, and admin UI.

Standard: API/admin on one host, database on a managed or separate host, Redis and RabbitMQ separate.

Enterprise: multiple API replicas, independent worker pools, separate WebSocket nodes, PostgreSQL primary/replica, Redis cluster, and RabbitMQ cluster.

No code changes are required across profiles; change environment variables, server specs, and worker counts.
