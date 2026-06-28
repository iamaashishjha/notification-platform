# Implementation Roadmap

Current state as of completion of the current cycle.

## Completed (All 11 Phases)

### Phase 1: Re-Audit
- All docs, router, handlers, providers, scripts re-read and reconciled

### Phase 2: Real WebSocket
- Live WS endpoint with token validation, hub, heartbeat, reconnect sync
- In-app notification CRUD (list, read, mark-all-read, sync)
- Real WS provider broadcasting through hub

### Phase 3: Real Provider Adapters
- SMTP email (net/smtp)
- Generic HTTP SMS (configurable gateway)
- FCM HTTP v1 (OAuth2 JWT-bearer)
- Provider test endpoint (POST /admin/api/v1/providers/{id}/test)

### Phase 4: Password Reset + Email Verification
- Forgot/reset with hashed one-time tokens
- Request/verify with hashed one-time tokens

### Phase 5: Prometheus Metrics
- /metrics endpoint with 8+ metrics
- docs/monitoring.md

### Phase 6: Dashboard Enhancement
- Enhanced backend stats (retry, dead-letter, WS, success rate, per-channel)
- Updated frontend (8 stat cards + channel activity)

### Phase 7: Dynamic Rate Limits
- DB-backed rate limit config with 5-minute cache
- Uses rate_limit_per_second and daily_quota from tenant_channels

### Phase 8: Runner System Review
- All workers in run.sh, docker-compose.yml, Makefile

### Phase 9: Testing Expansion
- Security tests expanded (hash, token, encryption, JSON redaction, edge cases)
- Retry backoff calculation test

### Phase 10: Security Review Round 2
- Tenant isolation fix for UpdateFeature
- docs/security-review.md with remediation plan

### Phase 11: Final Validation
- All 9 Go binaries build clean
- TypeScript compiles clean
- Vite production build succeeds
- Docker Compose config valid
- All tests pass

## Completed

### Phase 12: Tenant Isolation Test Hardening
- Fixed 3 critical/high bugs: DashboardStats delivery alias crash, RemoveGroupMember no tenant isolation, AddGroupMember no principal check
- Added 15 structural handler isolation tests (handlers_test.go)
- Expanded isolation_test.go with full table coverage and edge cases
- Run.sh seed menu added for sample tenants

## Completed

### Phase 14: Tenant Management CRUD + UI Polish
- Added CreateTenant, GetTenant, UpdateTenant, UpdateTenantStatus, GetTenantOverview backend handlers
- Created TenantDetailPage with Overview/Features/Channels/Providers tabs
- Updated TenantsPage with Create/View/Edit/Disable actions, create form, inline edit
- Added tenant permissions (tenants.view/create/update/delete) to granular-to-broad map
- Added loading/empty states and Actions columns to all list pages
- Added View/Test/Delete actions to providers page
- Added View detail to audit logs page
- Added tenant CRUD structural tests (9 new tests, 30 total)

### Phase 13: Seed Menu + Send Notification Fixes
- Fixed run.sh seed menu: proper volume mounts, ON CONFLICT idempotency, fresh start clears all tenant data, single/all tenant seeding works correctly
- Converted sample_tenants.sql to all ON CONFLICT patterns
- Fixed SendNotificationPage UI: platform admin gets tenant dropdown, tenant user sees auto-tenant info (no tenant_id input)
- Fixed backend SendAdminNotification: platform admin must provide tenant_id, tenant user forced to own tenant
- Added 6 structural tests verifying send notification tenant handling

## Remaining Work

### Phase 2: Provider Secret Encryption (Security)
**Priority**: High
Replace encryption placeholders with KMS/Vault/envelope encryption for provider secrets.

### Phase 3: Integration Tests
**Priority**: High
Add integration tests with real PostgreSQL, Redis, and RabbitMQ.

### Phase 4: API Endpoint Tests
**Priority**: Medium
Add HTTP endpoint tests using httptest for all handler routes.

### Phase 5: MFA Support
**Priority**: Low
Implement TOTP-based MFA using existing schema.

### Phase 6: Recurring Schedules
**Priority**: Low
Add cron-like recurring schedule support.

### Phase 7: Refresh Token Cookie Strategy
**Priority**: Medium
Move refresh tokens to HttpOnly Secure cookies or BFF pattern.

### Phase 8: Production Profile
**Priority**: Medium
Add production Docker Compose profile with scaling and nginx reverse proxy.

### Phase 9: Granular Permissions (Completed)
Split "manage" permissions into create/read/update/delete with backward-compatible fallback.
Updated route middleware, seed data, and frontend action gating.
18 test cases for permission fallback.

### Phase 10: Observability Improvements (Completed)
Expanded /metrics to 27+ metrics (worker, provider, WS, queue, panic, request).
Enhanced request logging with duration_ms, tenant_id, actor_id, remote_ip.
Panic recovery middleware.
docs/observability.md with alerts and Grafana recommendations.

### Phase 11: Backup and Retention (Completed)
backup-postgres.sh, restore-postgres.sh, prune-old-logs.sh.
docs/backup-restore.md.
.gitignore updates.

### Phase 12: Frontend Tests
**Priority**: Medium
Add React component tests with Vitest.
