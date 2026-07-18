# Self-Service Operations

This document tracks portal and API capabilities intended to let tenant technical users and platform operators diagnose and recover notification issues without direct database or infrastructure access.

## Requirement Matrix

| Requirement | Backend | Frontend | Database | Permissions | Tests | Documentation | Status |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Notification explorer | Paginated/filterable `/admin/api/v1/notifications` | Filters, table, bottom pagination | Search indexes | `notifications.view` | Handler contract tests | This doc | Partial |
| Notification lifecycle timeline | `/admin/api/v1/notifications/{public_id}` derives timeline from notifications, deliveries, attempts | View modal with timeline | Existing delivery tables | `notifications.view` | Handler contract tests | This doc | Partial |
| Structured failure reasons | Provider-neutral normalization package | Failure code/action in detail modal | Existing response JSON | `notifications.view` | Unit tests | This doc | Partial |
| Retry and resend controls | Automatic retry worker exists | No manual retry/resend portal controls | Existing delivery tables | Existing retry permissions not granular enough | Retry service tests | Existing status docs | Partial |
| Dead-letter dashboard | Dead-letter worker marks deliveries `dead` | No dedicated DLQ dashboard | Existing delivery status | Not yet split into DLQ permissions | Retry tests | Existing status docs | Partial |
| Queue monitoring and controls | Tenant/channel queue controls API and worker enforcement | Queue controls page | `tenant_queue_controls` | `queue_controls.view/update` | Backend build/tests | Architecture docs | Partial |
| Provider health | Provider test endpoint exists; metrics exist | Provider CRUD/test only | Existing deliveries/providers | `providers.test/view` | Provider test source tests | Provider docs | Partial |
| Credential validation | Provider test decrypts encrypted config | Provider test action exists | Encrypted config JSON | `providers.test` | Source tests | Provider docs | Partial |
| Test notification center | Admin manual send endpoint | Send notification page | Existing notifications | `notifications.send` | Tenant handling tests | README | Partial |
| Webhook debugger | Webhook delivery/callback debug storage not present | Missing | Missing | Missing | Missing | This doc | Missing |
| Audit logs | Searchable/paginated audit logs with session view | Audit log page and tenant detail session view | `audit_logs` | `audit_logs.view` | Existing handler tests | Existing status docs | Complete |
| Rate limits and quotas | Redis rate limiter and tenant channel limits | Channel list shows rate/quota | `tenant_channels` | `channels.view/update` | Existing tests | Existing docs | Partial |
| Cost and usage dashboard | Missing aggregate model | Missing | Missing | Missing | Missing | This doc | Missing |
| Template preview and validation | Template CRUD only | Template CRUD only | Existing templates | Template permissions | Existing CRUD tests | Existing status docs | Missing |
| Template variable contracts | Missing | Missing | Missing | Missing | Missing | This doc | Missing |
| Campaign dry run/preflight | Campaign CRUD/status transitions | Campaign page | Existing campaign tables | Campaign permissions | Existing handler tests | Existing status docs | Missing |
| Pause/resume/cancel controls | Campaign cancel, queue pause/resume/stop | Campaign cancel and queues page | Existing campaign/queue tables | Campaign/queue permissions | Existing tests | Existing docs | Partial |
| Circuit breakers/failover | Missing state machine | Missing | Missing | Missing | Missing | This doc | Missing |
| Retention/replay | Basic backup/log retention scripts | Missing portal retention controls | Existing tables | Missing | Missing | Backup docs | Partial |
| Tenant diagnostics | Missing dedicated diagnostics endpoint/page | Missing | Existing config tables could support it | Missing | Missing | This doc | Missing |
| Recommendations/incidents | Missing | Missing | Missing | Missing | Missing | This doc | Missing |
| Live metrics | Prometheus `/metrics` | Dashboard stats only | Metrics in memory/Prometheus | Metrics endpoint public/internal | Metrics code present | Observability docs | Partial |
| Alerts | Missing | Missing | Missing | Missing | Missing | This doc | Missing |
| Diagnostic bundles | Missing | Missing | Missing | Missing | Missing | This doc | Missing |
| Platform operations view | Dashboard, catalog, queue controls | Platform nav | Existing config/metrics | Existing platform permissions | Existing tests | Architecture docs | Partial |
| Tenant integration guide | Tenant-scoped integration summary API | Tenant Integration page and Tenant Detail Integration tab | Existing tenant/API-key/channel/provider/notification tables | `integration.view`, existing API-key/send permissions | Handler contract tests, frontend build | Tenant integration guide | Partial |

## Implemented Investigation Workflow

1. Open **Notification Logs**.
2. Filter by notification ID, event, idempotency key, channel, or status.
3. Use bottom pagination for large result sets.
4. Click **View** on a notification.
5. Review delivery rows, attempt counts, normalized failure category, and suggested action.
6. Review the lifecycle timeline to identify whether the notification stopped at queueing, provider send, retry, delivery, block, or dead-letter.

Tenant users only query their own tenant data. Platform users may filter across tenants. Recipient and arbitrary JSON fields are redacted or masked before they are returned by the detail endpoint.

## New APIs

| Method | Path | Permission | Purpose |
| --- | --- | --- | --- |
| `GET` | `/admin/api/v1/notifications` | `notifications.view` | Paginated and filterable notification explorer list |
| `GET` | `/admin/api/v1/notifications/{public_id}` | `notifications.view` | Tenant-safe notification detail with deliveries, attempts, lifecycle timeline, and normalized failure details |

## Database Changes

Migration `000011_notification_explorer_indexes` adds indexes for notification investigation:

- `idx_notifications_tenant_idempotency`
- `idx_notifications_tenant_event_created`
- `idx_deliveries_tenant_status_updated`
- `idx_deliveries_tenant_channel_provider`
- `idx_attempts_tenant_created`

Rollback drops only those indexes.

## Remaining High-Priority Gaps

The current implementation is not yet a full self-service operations suite. The most important next items are:

- Manual retry/resend APIs and portal confirmations.
- Dedicated DLQ dashboard with replay/ack/delete workflows.
- Provider health model based on rolling metrics and validation state.
- Dedicated tenant diagnostics page.
- Webhook debugger with payload retention/redaction.
- Template preview and variable contracts.
- Campaign preflight validation.
- Circuit breakers and configurable routing/failover.
- Diagnostic bundle generation.
- Alert rules and acknowledgement workflows.
