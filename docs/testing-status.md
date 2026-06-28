# Testing Status

## Current Coverage

### Unit Tests
| Module | File | Status |
|--------|------|--------|
| RBAC/Permissions | `internal/auth/auth_test.go` | ✓ 18 granular permission fallback test cases |
| Security/Redaction | `internal/security/redact_test.go` | ✓ 11 tests: redaction, hashing, tokens, AES-GCM roundtrip, JSON, edge cases |
| Tenant Isolation | `internal/tenant/isolation_test.go` | ✓ 4 tests: allow-list coverage, forbidden tables, empty-param edge cases |
| Retry Backoff | `internal/retry/service_test.go` | ✓ 2 tests: exponential backoff formula and edge cases |
| Handler Structure | `internal/http/handlers/handlers_test.go` | ✓ 38 structural tests: handler existence, tenant scoping, encryption wiring, alias correctness, send-notification tenant behavior, tenant CRUD isolation, settings handler/permission checks, catalog handler existence |

### Smoke Tests
| Script | What it covers | Status |
|--------|---------------|--------|
| `test-local.sh` | Health, readiness, admin login, API key send, queue publish, delivery status, metrics endpoint, dashboard stats, admin UI | ✓ |

## Critical Missing Tests

### Authentication & Authorization
- Login success/failure flows
- Refresh token rotation
- Account lockout after max failures
- JWT verification with expired/invalid tokens
- API key verification with scopes
- Permission denial for unauthorized users
- API key CRUD handlers

### Tenant Isolation (Structural coverage now in handlers_test.go)
- Cross-tenant notification access rejection ✓ Structural check
- Tenant-scoped listing enforcement ✓ Structural check
- Admin vs tenant path differentiation ✓ Structural check
- Cross-tenant contact/template/campaign access ✓ Structural check

### Notifications & Delivery
- Full send pipeline: auth → tenant → feature → channel → rate limit → DB → queue
- Scheduled notification flow
- Delivery worker processing
- Delivery attempt recording

### Rate Limiting
- Fixed window enforcement
- Tenant/channel rate limit separation
- Daily quota enforcement

### WebSocket
- Token creation and validation
- Token expiry rejection

### RBAC CRUD
- Role create/update/delete handlers
- Permission assignment
- User-role assignment with cache invalidation

### Contacts, Templates, Campaigns CRUD
- All CRUD handler operations
- Tenant isolation on mutations
- Audit logging on mutations

### Password Reset & Email Verification
- Token generation and validation
- Token expiry and one-time use behavior

### Provider Adapters
- SMTP, HTTP SMS, FCM v1 send logic
- Provider test endpoint behavior
- Config redaction on secrets

## Recommended Test Additions

### Phase 1: Unit Tests (Highest Priority)
- Auth service: login, refresh, logout, lockout, API key verification
- Notification service: send validation, feature checks, channel checks
- Rate limiter: Allow/Deny logic
- All CRUD handler logic validation (with mocked DB where possible)

### Phase 2: Integration Tests
- Database-backed auth test suite using testcontainers or embedded DB
- Full notification send → queue → delivery worker → delivery status integration test
- Scheduled notification → scheduler worker → delivery integration test

### Phase 3: HTTP Handler Tests
- httptest-based endpoint tests for all handler routes
- Middleware tests for CORS, JWT, API key, permission, and scope middleware
- Request body validation tests

### Phase 4: Frontend Tests
- Auth context login/logout/token management
- Login page form submission
- API client error handling
- Permission-aware navigation rendering

### Phase 5: Performance Tests
- Rate limit enforcement under load
- Queue throughput
- Concurrent notification sends
