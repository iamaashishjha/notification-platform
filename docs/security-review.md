# Security Review

No software can be guaranteed vulnerability-free. This platform now uses defense-in-depth controls for authentication, authorization, tenant isolation, auditability, secret protection, and abuse prevention, with remaining risks documented for production hardening.

## Identified Risks

- Backend API: initial endpoints accepted JWT/API-key auth but did not enforce server-side permissions on each protected route.
- Admin API: UI hid routes by permission, but backend route guards were incomplete.
- Authentication: initial login issued only access tokens and had no refresh-token rotation, lockout tracking, or session revocation.
- Authorization and RBAC: effective permissions existed but were not consistently enforced by middleware.
- Multi-tenant isolation: list notification logs were tenant-filtered for tenant users, but reusable ownership helpers were missing for future CRUD handlers.
- WebSocket implementation: live transport was represented as a worker/provider placeholder and did not have a signed connection-token boundary.
- Notification pipeline: send-time feature/channel checks existed, but rate limiting was a placeholder.
- Provider configuration: provider secrets could be stored in JSON without an encryption-ready abstraction.
- Queue workers: workers log operational metadata and use mock providers, but retry/dead-letter policy still needs deeper implementation.
- Docker setup: runtime containers initially ran as default users and API health checks were missing.
- Database access layer: SQL is parameterized, but future dynamic ownership checks must stay allow-listed to avoid table-name injection.

## Implemented Mitigations

- Added server-side permission middleware for admin routes.
- Added API-key scope middleware for public tenant endpoints.
- Added request IDs and redacted Authorization logging.
- Added refresh-token sessions with hashed token storage and rotation.
- Added login attempt tracking and configurable account lockout.
- Added password reset, email verification, MFA-ready, WebSocket token, session, security event, and permission cache schema structures.
- Added scoped, hashed, expirable, revocable API-key columns.
- Added redaction helpers for email, phone, token, JSON, nested secret fields, and encryption-ready placeholders.
- Added redacting audit/security event service.
- Added tenant ownership helper with an allow-list of tenant-owned tables.
- Added Redis-backed fixed-window tenant, channel, and daily quota rate limiting.
- Added security-focused unit tests for redaction, permission checks, and tenant ownership allow-list behavior.
- Added non-root API runtime user and API health check in Docker Compose.

## Remaining Risks

- The live WebSocket endpoint is not fully implemented yet; only signed short-lived connection-token issuance exists in this slice.
- Refresh tokens are returned to the SPA as JSON. Production should prefer HttpOnly, Secure, SameSite cookies or a dedicated BFF.
- Redis rate limits currently use fixed defaults in code; DB-driven per-tenant values should be loaded into the limiter path.
- Provider secret encryption is placeholder-ready, not backed by KMS or envelope encryption.
- Retry/dead-letter policy is not yet complete for all workers.
- Full CRUD modules are placeholders; each future handler must use tenant ownership checks and permission middleware.
- Backend compilation could not be verified on this host because Go and Docker daemon are unavailable.

## Production Hardening Recommendations

- Terminate TLS at a reverse proxy and set HSTS.
- Use strong random `JWT_SECRET` and rotate it with a documented key-id strategy.
- Store refresh tokens in HttpOnly cookies, not browser local storage.
- Use managed secret storage or KMS for provider credentials, JWT secrets, and encryption keys.
- Run PostgreSQL, Redis, and RabbitMQ on private networks only.
- Enable PostgreSQL SSL, least-privilege DB users, backups, and PITR.
- Require Redis auth/TLS and disable public network access.
- Require RabbitMQ TLS, strong credentials, and least-privilege vhosts/users.
- Add OpenTelemetry traces, security alerting, and audit-log retention policy.
- Run SAST, dependency scanning, image scanning, and migration checks in CI.
