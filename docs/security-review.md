# Security Review

## Findings

### 1. RBAC Enforcement

**Status**: Acceptable

- All admin routes use `middleware.Chain(authSvc, "permission.name", handler)` which calls `HasPermission`.
- Platform admins bypass permission checks (intentional).
- Non-platform users must have explicit role-based or user-level permissions.
- Some routes use broad permissions like "users.manage" rather than granular create/update/delete scopes.

### 2. Tenant Isolation

**Status**: Acceptable

- All list handlers check `IsPlatform` and scope queries with `WHERE tenant_id = $1` for non-platform users.
- Mutation handlers validate tenant ownership via conditional WHERE clauses.
- Cross-tenant WebSocket token requests are rejected.
- API key verification returns tenant_id from the key record, not from user input.
- DashboardStats delivery queries fixed: separate `deliveryScope` for `notification_deliveries` (notifications use `n.` alias, deliveries use bare `tenant_id`).
- RemoveGroupMember: added `AND tenant_id = $3` to DELETE query.
- AddGroupMember: added principal extraction with `cg.tenant_id = $3 AND c.tenant_id = $3` cross-tenant validation.
- Structural handler tests verify all 40+ handlers for tenant isolation patterns.
- SendAdminNotification: platform admin must provide `tenant_id` (400 if missing); tenant user silently forced to own tenant (cross-tenant override impossible via request body).

**Issue (low — resolved)**: The `UpdateFeature` handler now validates tenant ownership via `WHERE id = $1 AND tenant_id = $3` for non-platform users, and the audit event includes `TenantID`. Verified by handler structural test.

### 3. API Key Security

**Status**: Acceptable

- Keys stored as SHA-256 hashes.
- Raw key shown once on creation, not stored.
- Scope enforcement via API key scope middleware.
- Revocation sets `status = 'revoked'` and checks `revoked_at IS NULL` in queries.
- Expiration checked in VerifyAPIKey.

### 4. Password Storage

**Status**: Acceptable

- Passwords hashed with bcrypt (DefaultCost = 10).
- Password reset tokens hashed with SHA-256, one-time use, 1-hour expiry.
- Email verification tokens hashed with SHA-256, one-time use, 24-hour expiry.

### 5. Refresh Token Security

**Status**: Acceptable

- Refresh tokens stored as SHA-256 hashes in `auth_sessions` table.
- Rotation on each refresh (old session marked `rotated`).
- Logout revokes the session.
- No HttpOnly cookie support (tokens returned in JSON response body).

**Issue (medium)**: Refresh tokens are returned in JSON responses, accessible to JavaScript. A BFF pattern or HttpOnly cookies would mitigate XSS risk.

### 6. Provider Secret Leakage

**Status**: Acceptable with caveats

- Provider configs stored as `config_json` with raw values.
- ListProviderConfigs endpoint does NOT return config_json.
- UpdateProviderConfig accepts new config values.
- Provider test passes config_json internally, does not leak in output.

**Issue (high — resolved)**: Provider secrets are stored encrypted using AES-256-GCM with a key derived via SHA-256 from `APP_ENCRYPTION_KEY`. Encryption is wired into CreateProviderConfig, UpdateProviderConfig, and decryption into TestProviderConfig.

### 7. WebSocket Auth

**Status**: Acceptable

- One-time connection tokens stored hashed in `websocket_connection_tokens` table.
- Token validated against DB on connection, then marked `used`.
- JWT fallback for admin connections.
- Tenant isolation enforced.

### 8. Rate Limiting

**Status**: Acceptable

- Redis-based fixed window rate limiter.
- Per-tenant and per-channel limits loaded from DB with 5-minute cache.
- Daily quota enforced separately.

### 9. Metrics Endpoint

**Status**: Acceptable

- `/metrics` endpoint exposes aggregate counts only (no PII).
- Not authenticated (Prometheus standard).

### 10. Audit Logging

**Status**: Acceptable

- All mutations audited (login, logout, CRUD operations, notification sends).
- Security events logged to separate `security_events` table.
- Sensitive values redacted via `security.RedactMap` before storage.
- IP address and user agent captured.

## Remediation Plan

### High Priority (Resolved)
1. **Encrypt provider secrets at rest**: AES-256-GCM wired into CreateProviderConfig, UpdateProviderConfig, TestProviderConfig. Verified by structural handler tests.

### Medium Priority
2. **Move refresh tokens to HttpOnly cookies**: Requires BFF or API changes.
3. **Add tenant ownership check to UpdateFeature**: Resolved — `AND tenant_id = $3` added, audit event includes TenantID. Structural test verifies.

### Low Priority
4. **Granular permissions**: Implemented and verified with 18 test cases.
5. **Add MFA support**: Use the existing `mfa_secret_encrypted` column.
