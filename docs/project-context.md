# Project Context

This document summarizes the current state of the notification platform so future work can continue from the same mental model.

## What We Are Building

A modular, multi-tenant notification platform with two interconnected projects:

- `notification-core-api`: Go backend API and queue worker system.
- `notification-admin-ui`: React/Vite/TypeScript admin and tenant dashboard.

The platform is designed around this principle:

```text
Code defines capabilities.
Database decides which tenant can use which capability.
Infrastructure decides how much traffic it can handle.
```

No tenant-specific behavior should be hardcoded.

## Current Structure

Root:

- `docker-compose.yml`: local stack for PostgreSQL, Redis, RabbitMQ, API, workers, and UI.
- `README.md`: architecture and local usage.
- `docs/`: architecture, security, deployment, database, production hardening, and this context file.

Backend:

- Go API in `notification-core-api/cmd/api`.
- Worker binaries for router, scheduler, email, SMS, FCM, and WebSocket.
- PostgreSQL migrations in `notification-core-api/migrations`.
- Local seed data in `notification-core-api/seeds/local_seed.sql`.
- Security utilities under `internal/security`.
- Auth/RBAC under `internal/auth`.
- Tenant isolation helpers under `internal/tenant`.
- Queue abstraction under `internal/queue`.
- Mock providers under `internal/providers`.

Frontend:

- React dashboard in `notification-admin-ui`.
- Login, dashboard, tenant list, notification logs, and manual send flow.
- Permission-aware sidebar based on effective permissions.

## Main Features Implemented

- Docker Compose local stack.
- Go API health/readiness endpoints.
- JWT admin login.
- Refresh-token session rotation with hashed token storage.
- Login attempt tracking and account lockout schema/logic.
- API-key authentication with hashed keys and scopes.
- Server-side permission checks for protected admin endpoints.
- Runtime feature/channel/provider checks before sending notifications.
- RabbitMQ publishing and worker consumers.
- Mock SMS, email, FCM, and WebSocket providers.
- Notification delivery records and delivery attempts.
- Scheduled notification table and scheduler worker.
- Audit/security event infrastructure with redaction.
- Redis-backed fixed-window rate limiting.
- Tenant ownership helper for future CRUD IDOR prevention.
- Security-focused tests for redaction, permission checks, and tenant ownership allow-list.

## Security Hardening Added

Security work was done as an upgrade, not a rewrite.

Added:

- `docs/security-review.md`
- `docs/database-security.md`
- `docs/deployment-security.md`
- `docs/production-hardening-checklist.md`
- Migration `000002_security_hardening`
- Session, reset-token, email-verification, WebSocket-token, security-event, and permission-cache tables.
- Redaction helpers for emails, phones, tokens, JSON secret fields, and Authorization headers.
- Encryption-ready placeholder helpers for future KMS/envelope encryption.
- API-key scopes, revocation, expiration, and audit-ready columns.
- Non-root Go API container runtime user.
- API healthcheck in Compose.

Important: do not claim the platform is perfectly secure. The security posture is defense-in-depth with documented remaining risks.

## Verification Already Performed

Backend:

```sh
GOCACHE=/tmp/notification-go-build-cache GOPATH=/tmp/notification-go-path go test ./...
```

Passed.

Frontend:

```sh
npm run build
npm audit --omit=dev
```

Both passed. `npm audit --omit=dev` reported `0 vulnerabilities` after upgrading Vite to `^6.4.3`.

Docker:

```sh
docker compose config
```

Passed.

## Git State

The current overall project was committed.

Commit:

```text
c79a7c7 Build secure notification platform scaffold
```

Both projects have their own `.gitignore`:

- `notification-core-api/.gitignore`
- `notification-admin-ui/.gitignore`

## Local Seed Credentials

Platform admin:

```text
admin@example.com / password
```

Tenant user:

```text
tenant@example.com / password
```

Demo tenant:

```text
ecommerce
```

Local tenant API key:

```text
demo_tenant_api_key_local
```

The raw API key is for local testing only. Stored API keys are hashed.

## Known Remaining Work

- Implement full CRUD modules for tenants, users, roles, permissions, contacts, groups, templates, providers, campaigns, API keys, and audit logs.
- Add full live WebSocket endpoint with heartbeat, ACK, replay protection, reconnect sync, and connection limits.
- Replace encryption placeholders with KMS/Vault/envelope encryption.
- Load rate-limit values dynamically from tenant/channel configuration.
- Complete retry and dead-letter policies.
- Move refresh tokens to HttpOnly Secure cookies or a BFF pattern for production.
- Add integration tests with PostgreSQL, Redis, and RabbitMQ.
- Add CI for Go tests, frontend build, dependency audit, migration checks, and container scanning.

## Guidance For Future Changes

- Do not rewrite the scaffold from scratch.
- Extend existing modules and preserve the modular architecture.
- Keep tenant isolation server-side, not only in the UI.
- Every protected admin route needs permission middleware.
- Every public tenant route needs API-key scope checks.
- Every tenant-owned read/update/delete must filter or validate by `tenant_id`.
- Do not log raw secrets, JWTs, refresh tokens, API keys, provider credentials, or FCM tokens.
- Prefer additive migrations.
- Keep local development Docker-friendly and production deployment configurable through env/secrets/worker counts.
