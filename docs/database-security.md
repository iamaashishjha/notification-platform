# Database Security

## Current Controls

- PostgreSQL tables use primary keys, foreign keys, status columns, timestamps, and tenant-scoped indexes.
- Tenant-owned tables include `tenant_id` where applicable.
- Query code avoids `SELECT *`.
- Application queries use parameterized placeholders for user-provided values.
- API keys, refresh tokens, reset tokens, verification tokens, and WebSocket connection tokens are stored as hashes.
- Additive migration `000002_security_hardening` adds session, lockout, reset, verification, scoped API-key, WebSocket token, permission cache, and security event tables.
- Tenant ownership helper uses an explicit allow-list before dynamic table ownership checks.

## Tenant Isolation Rules

- Tenant users must query tenant-owned resources with `tenant_id = principal.tenant_id`.
- Platform admins may query across tenants only on routes guarded by platform-capable permissions.
- Direct resource access must validate ownership before read/update/delete.
- Future CRUD endpoints should use `tenant.Service.EnsureResourceOwned` before mutating tenant-owned records.
- Cross-tenant IDs from request bodies must be rejected unless the principal is a platform admin and the route explicitly allows platform scope.

## Query Requirements

- Keep all data values parameterized.
- Avoid dynamic SQL. If a table name must be dynamic, use an allow-list and never accept raw client input as SQL.
- Use transactions for multi-step writes such as notification creation and delivery creation.
- Do not store raw secrets in JSON columns.
- Redact sensitive before/after data before inserting audit logs.

## Indexes and Constraints

- Tenant/time, tenant/status, tenant/channel, notification, campaign/status, scheduled delivery, WebSocket lookup, and audit indexes are present.
- API key hashes, refresh token hashes, reset token hashes, and verification token hashes are unique.
- Role and provider uniqueness constraints prevent duplicate active defaults.

## Remaining Hardening

- Add row-level security policies if PostgreSQL becomes directly accessible to more than this service.
- Split application DB users by capability for API, migrations, and read-only reporting.
- Add soft-delete columns to mutable business tables if legal/audit requirements require recoverability.
- Add encrypted column support using application-level envelope encryption or a KMS-backed extension.
