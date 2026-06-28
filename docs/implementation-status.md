# Implementation Status

## Authentication
**Status: Complete**

- JWT login with access/refresh tokens ✓
- Refresh token rotation with hashed storage ✓
- Login attempt tracking with configurable lockout ✓
- Password reset: forgot + reset endpoints implemented ✓
- Email verification: request + verify endpoints implemented ✓
- MFA-ready schema present (table exists, no handler) ❌
- Audit/security event logging on login success/failure ✓
- Session revocation on logout ✓

## Authorization / RBAC
**Status: Complete**

- Permission middleware for admin routes ✓
- API-key scope middleware for public routes ✓
- Effective permissions query (role-based + user-level allow/deny) ✓
- Permission cache versioning schema ✓
- Role/permission/user-permission tables exist ✓
- RBAC CRUD handlers fully implemented (roles, permissions, assignments) ✓
- User-role assignment with permission cache invalidation ✓
- RBAC management UIs for roles and permissions (list/create/delete) ✓
- Granular permissions with broad permission fallback implemented ✓
- Backward-compatible: users.manage implies users.create/users.update/users.delete etc. ✓
- All route permissions updated to granular keys (users.create, providers.test, etc.) ✓
- Frontend action buttons gated by granular permissions ✓

## Multi-Tenant Isolation & Tenant Management UI
**Status: Complete**

- Tenant ID on all applicable tables ✓
- Tenant-owned resource access helper with allow-list ✓
- Tenant-scoped queries for notification logs ✓
- Cross-tenant WebSocket token rejection ✓
- Tenant status check before sends ✓
- Tenant features/channels/provider config runtime checks ✓
- ListTenants restricted: non-platform users see only their own tenant ✓
- DashboardStats activeCampaigns query scoped to tenant ✓
- DashboardStats sentToday/failed/channel queries fixed: separate deliveryScope for notification_deliveries (no broken n. alias) ✓
- RemoveGroupMember: tenant_id added to DELETE query ✓
- AddGroupMember: principal extraction + cross-tenant contact-group validation ✓
- UpdateFeature audit event includes TenantID ✓
- SendAdminNotification: platform admin requires tenant_id; tenant user forced to own tenant ✓
- CreateTenant: POST endpoint (platform-admin only) with name/slug validation ✓
- GetTenant: GET by ID with tenant-user isolation (platform can view any, tenant only own) ✓
- UpdateTenant: PATCH endpoint (platform-admin only) with dynamic field updates ✓
- UpdateTenantStatus: PATCH status endpoint (platform-admin only) with active/disabled/suspended ✓
- GetTenantOverview: GET with features, channels, providers, counts (users/contacts/templates/campaigns/api-keys) ✓
- TenantDetailPage: `/tenants/:id` with Overview/Features/Channels/Providers tabs ✓
- TenantsPage: Create/View/Edit/Disable row actions, create form, inline edit ✓
- All list pages: loading states, empty states, actions columns added ✓
- Auth: tenant CRUD permissions (tenants.view/create/update/delete) in granular-to-broad map ✓

## Contacts
**Status: Complete**

- Full CRUD handler: ListContacts, CreateContact, UpdateContact, DeleteContact ✓
- Tenant-isolated queries ✓
- Audit logging on all mutations ✓
- No Contact Channels sub-resource management in handler ❌
- Contact management UI with list/create/delete ✓

## Contact Groups
**Status: Complete**

- Full CRUD handler: ListGroups, CreateGroup, DeleteGroup ✓
- Member management: ListGroupMembers, AddGroupMember, RemoveGroupMember ✓
- Member count in list queries ✓
- Groups management UI with list/create/delete ✓

## Templates
**Status: Complete (backend)**

- Full CRUD handler: ListTemplates, CreateTemplate, UpdateTemplate, DeleteTemplate ✓
- Tenant-isolated queries ✓
- Audit logging on all mutations ✓
- No template rendering engine for variable substitution ❌
- Templates UI with list/create/delete ✓

## Notifications
**Status: Complete**

- Full send flow: auth → tenant check → features → channels → rate limit → DB insert → queue publish ✓
- Public API key send endpoint ✓
- Admin JWT send endpoint ✓
- Scheduled notification support ✓
- Notification log listing (scoped by tenant) ✓
- Delivery records and delivery attempt tracking ✓
- Idempotency key support ✓
- Dashboard stats endpoint with real-time counts (enhanced with retry, dead-letter, WS, per-channel) ✓

## Deliveries
**Status: Complete**

- Delivery worker framework for email, SMS, FCM, WebSocket ✓
- Delivery attempt recording ✓
- Status tracking (sending → sent/failed) ✓
- Provider results stored in response_json ✓
- Retry/dead-letter processing for failed deliveries ✓

## Campaigns
**Status: Complete**

- Full CRUD handler: ListCampaigns, CreateCampaign, UpdateCampaign ✓
- Campaign status transitions: approve, send, cancel ✓
- Audit logging on all mutations ✓
- No audience/targeting logic in send action ❌
- Campaign management UI with list/create/approve/send/cancel ✓

## Scheduling
**Status: Complete (core)**

- Scheduler worker that polls due_at jobs ✓
- scheduled_jobs table with status tracking ✓
- Integration with notification send flow ✓
- Recurring schedule not implemented ❌

## Feature Flags
**Status: Complete**

- `tenant_features` table with runtime enable/disable ✓
- Feature check in send pipeline ✓
- ListFeatures/UpdateFeature handler endpoints ✓
- Feature management UI with list/create/edit ✓

## Provider Configurations
**Status: Complete**

- `tenant_provider_configs` table ✓
- Full CRUD handlers: List, Create, Update, Delete ✓
- Provider test endpoint: POST /admin/api/v1/providers/{id}/test ✓
- Real provider adapters:
  - SMTP email adapter ✓
  - Generic HTTP SMS adapter ✓
  - FCM HTTP v1 adapter (OAuth2 JWT-bearer) ✓
- Real WebSocket provider with in-memory hub ✓
- Mock providers for all channels ✓
- Channel-direction validation ✓
- Provider secret encryption: AES-256-GCM wired into create/update/test handlers ✓
- Encrypted config_json is decrypted transparently for test operations ✓
- Encryption key configured via APP_ENCRYPTION_KEY env var ✓
- All existing Decrypt calls fall through for unencrypted values (backward compatible) ✓

## API Keys
**Status: Complete**

- Hashed API key storage ✓
- Scope support ✓
- Expiration and revocation ✓
- Last-used tracking ✓
- ListAPIKeys, CreateAPIKey, RevokeAPIKey handlers implemented ✓
- Audit logging on create/revoke ✓
- API key management UI with create/revoke ✓

## Audit Logs
**Status: Complete**

- Audit log write service ✓
- Security event logging ✓
- Redaction before storage ✓
- Automatic audit on login/notification-send/logout ✓
- ListAuditLogs handler with tenant scoping ✓
- Audit log UI with table view ✓

## WebSocket
**Status: Complete**

- WebSocket connection token table and generation ✓
- Signed short-lived token issuance endpoint ✓
- Live WebSocket endpoint: GET /ws with token validation ✓
- In-memory connection hub with tenant isolation ✓
- Heartbeat ping/pong ✓
- Read/write pump goroutines ✓
- Connection registration in websocket_sessions table ✓
- Reconnect sync for unread in-app notifications ✓
- ACK support ✓
- Real WebSocket provider for API-level broadcast ✓

## In-App Notifications
**Status: Complete**

- Schema with `in_app_notifications` table ✓
- List, mark-read, mark-all-read, sync endpoints ✓
- Real-time delivery via WebSocket hub ✓
- Offline storage with sync-on-connect ✓

## FCM Provider
**Status: Complete**

- Mock FCM provider ✓
- Real FCM HTTP v1 adapter with OAuth2 JWT-bearer auth ✓
- Worker binary exists ✓

## Email Provider
**Status: Complete**

- Mock email provider ✓
- Real SMTP adapter via net/smtp ✓
- Worker binary exists ✓

## SMS Provider
**Status: Complete**

- Mock SMS provider ✓
- Real generic HTTP SMS adapter ✓
- Worker binary exists ✓

## Queue System
**Status: Complete**

- RabbitMQ client with durable queues ✓
- Router, scheduler, email, SMS, FCM, WebSocket, retry, dead-letter queues ✓
- JSON job serialization ✓
- Persistent delivery mode ✓
- Kafka queue driver not implemented (intentionally future work) ❌

## Retry System
**Status: Complete**

- Retry service with exponential backoff (2^attempt minutes) ✓
- Max delivery attempts from config (MaxDeliveryTries) ✓
- Delivery failures automatically published to retry queue ✓
- Retry worker consumes from retry queue, re-publishes to channel queues ✓
- Dead-letter queue for exhausted retries ✓
- Dead-letter worker records `dead` status in delivery records ✓
- Retry count tracking in delivery response_json ✓
- Dedicated worker binaries: worker-retry, worker-dead ✓
- Docker Compose services for retry and dead-letter workers ✓

## Security
**Status: Complete (core)**

- Redaction helpers for emails, phones, tokens, secrets ✓
- HashSecret utility for API keys, refresh tokens ✓
- Random token generation ✓
- AES-256-GCM encryption for provider config secrets ✓
- Tenant ownership allow-list ✓
- CORS middleware ✓
- Request ID generation ✓
- Authorization header redaction in logs ✓
- Rate limiting via Redis with DB-backed config ✓
- Password reset: hashed tokens, expiry, one-time use ✓
- Email verification: hashed tokens, expiry, one-time use ✓

## Prometheus Metrics
**Status: Complete**

- GET /metrics endpoint with 27+ metrics ✓
- Notification counters: sent_total, failed_total, retried_total, dead_lettered_total ✓
- Queue counters: processed, failed, publish, publish_failed, consume, retry, dead_letter ✓
- Worker counters: started_total, completed_total, failed_total, active_gauge ✓
- Provider counters: send_total, send_failed_total with provider_channel labels ✓
- WebSocket counters: active, messages_sent, messages_acked, disconnects, reconnect_syncs ✓
- System: panics_total, http_requests_total, request_duration_seconds (histogram) ✓
- Enhanced request logging with status, duration_ms, tenant_id, actor_id, remote_ip ✓
- Panic recovery middleware with stack trace logging ✓
- docs/observability.md with Prometheus config, Grafana panels, and alerts ✓

## Logging
**Status: Complete**

- Structured zap logger ✓
- Request logging with redacted auth headers ✓
- Request IDs ✓
- Worker logging ✓
- Duration tracking on deliveries ✓

## Admin UI
**Status: Complete**

- Login page ✓
- Dashboard page with real API data (8 stat cards + per-channel activity) ✓
- Notification logs list ✓
- Send notification form ✓
- Tenant list ✓
- Permission-aware sidebar ✓
- Auth context with token/user management ✓
- API client with token injection ✓
- Vite proxy configuration ✓
- Contacts page (list, create, delete) ✓
- Templates page (list, create, delete) ✓
- Campaigns page (list, create, approve, send, cancel) ✓
- Roles page (list, create, delete) ✓
- Permissions page (read-only list) ✓
- API Keys page (list, create, revoke) ✓
- Audit Logs page (read-only list) ✓
- Users page (list, create, update) ✓
- Features page (list, toggle) ✓
- Channels page (list, update) ✓
- Providers page (list, create, update, delete) ✓
- Groups page (list, create, delete, manage members) ✓
- Settings page ✓

## Local Runner Scripts
**Status: Complete**

- run.sh (interactive runner) ✓
- stop.sh (clean shutdown) ✓
- test-local.sh (smoke tests for health, login, send, metrics, dashboard, UI) ✓
- Makefile with targets for all workers and build-all ✓
- .env and .env.local management ✓

## Docker Support
**Status: Complete**

- docker-compose.yml with all services ✓
- PostgreSQL, Redis, RabbitMQ ✓
- API and worker binaries ✓
- React dev server ✓
- Non-root container users ✓
- Health checks ✓
- Profiles for selective startup ✓
- Production nginx build stage ✓

## Testing
**Status: Enhanced**

- auth_test.go covers permission checks ✓
- redact_test.go covers security redaction (expanded with hash, token, AES-GCM encrypt/decrypt roundtrip, JSON, edge cases) ✓
- isolation_test.go covers tenant ownership allow-list (expanded: all tenant-scoped tables verified, forbidden global tables rejected, empty-param edge cases) ✓
- handlers_test.go covers structural tenant isolation verification (all 40+ handler existence checks, provider encryption patterns, tenant scoping in list/mutation handlers, RemoveGroupMember/AddGroupMember isolation, DashboardStats delivery alias correctness, audit event TenantID presence) ✓
- retry/service_test.go covers backoff calculation ✓
- No integration tests with real DB/Redis/RabbitMQ ❌
- No API endpoint tests ❌
- No notification pipeline tests ❌
- No WebSocket auth tests ❌
- test-local.sh provides basic smoke tests (health, login, send, metrics, dashboard, UI) ✓

## Phase 15: UI Polish & Settings
**Status: Complete**

- Provider config edit UI (inline row edit, masked secrets, channel/provider/default/status fields) ✓
- Send notification with recipient mode selection (contact, group, direct email, direct phone, FCM token, FCM topic, WebSocket user) ✓
- Send notification loads contacts, groups, and templates for the selected tenant ✓
- Settings page with real form (timezone, country, default sender, default SMS, branding logo, metadata) ✓
- Settings saved to tenant's config_json via GET/PUT settings API ✓
- Backend GetTenantSettings/UpdateTenantSettings handlers with tenant-isolation ✓
- Settings routes registered with middleware (settings.view, settings.update permissions) ✓
- Structural tests for settings handlers and permissions ✓
- Lucide-react icons (Plus, Eye, Pencil, Trash2, Play, Power, Send, XCircle, UserPlus, UserX) on all 12 list page action buttons ✓
- TypeScript strict mode clean, Vite build passes ✓

## Phase 16: Tenant-Centric Admin Console Refactor
**Status: Complete**

### Backend
- Platform catalog endpoints: GET /admin/api/v1/feature-catalog, /channel-catalog, /provider-types (GROUP BY queries, no tenant rows) ✓
- Catalog routes registered with existing view permissions ✓
- Structural tests for catalog handlers (handler existence + permissions) ✓

### Frontend — Information Architecture
- Sidebar refactored into grouped sections (Platform/Data/Security/System for platform admin, Overview/Notifications/Address Book/Content/Access/Configuration for tenant user) ✓
- Permissions page added to sidebar navigation ✓
- Removed unused ModulePage.tsx dead code ✓

### Frontend — Platform Catalog Pages
- FeaturesPage: now shows Feature Catalog (no tenant_name column) with description, tenant usage count, "Manage" link to tenants ✓
- ChannelsPage: now shows Channel Catalog (no tenant_name column) with description, tenant usage count, "Configure" link ✓
- ProvidersPage: now shows Provider Types (no tenant_name column) with supported channels, tenant usage count ✓

### Frontend — View/Edit/Delete Buttons Added
- UsersPage: View detail drawer, inline Edit (name/email), Delete ✓
- ContactsPage: inline Edit (name/email/phone/external_ref) ✓
- TemplatesPage: View preview drawer, inline Edit (key/channel/subject/body) ✓
- RolesPage: View detail drawer, inline Edit (name/key) ✓
- GroupsPage: loading state added ✓

### Frontend — Fixes
- LoginPage: removed hardcoded demo credentials (admin@example.com/password) ✓
- SettingsPage: added tenant selector dropdown for platform admin ✓
- DashboardPage: added loading skeleton animation, removed filler "Operations" panel ✓
- SendNotificationPage: channel checkboxes instead of comma-separated text, removed demo default values (event/templateKey/payload), added scheduled send datetime picker, event validation, loading indicator for tenant data ✓
- PermissionsPage: added loading state + empty state ✓
- NotificationsPage: View/detail drill-down ✓

### Validation
- `go test ./...` — all pass ✓
- `go build ./cmd/...` — clean ✓
- `npx tsc --noEmit` — 0 errors ✓
- `npx vite build` — production build succeeds ✓
