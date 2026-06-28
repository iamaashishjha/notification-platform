# Architecture

The platform is a modular monolith split into two deployable projects:

- `notification-core-api`: Go API and worker binaries.
- `notification-admin-ui`: React dashboard for platform and tenant users.

Shared state lives in PostgreSQL, Redis, and RabbitMQ. API processes are stateless. Queue-specific workers can be scaled independently with Docker Compose, for example `docker compose --profile all up -d --scale worker-sms=5`.

The main send path is:

1. Authenticate with JWT or tenant API key.
2. Resolve tenant and enforce tenant isolation.
3. Check `tenant_features`, `tenant_channels`, rate limits, quotas, and provider config.
4. Store notification and delivery rows.
5. Publish channel jobs to RabbitMQ.
6. Workers use tenant provider config and mock providers locally.
7. Delivery attempts, audit logs, and delivery status are persisted.

DB configuration decides which tenant can use a feature. Infrastructure sizing and worker counts decide throughput.
