
# Go Backend Agent Instructions

These instructions apply to all work under `notification-core-api/`.

## Verified Backend Stack

- Go
- standard `net/http`
- PostgreSQL 16
- `pgx`
- Redis
- RabbitMQ
- `zap`
- SQL migrations under `migrations/`
- SQL seeds under `seeds/`

Do not introduce a new router, ORM, logger, queue abstraction, or dependency
injection framework without a demonstrated project requirement.

## Backend Structure

Deployable binaries exist under `cmd/`.

Important binaries include:

- `cmd/api`
- `cmd/worker-router`
- `cmd/worker-scheduler`
- `cmd/worker-email`
- `cmd/worker-sms`
- `cmd/worker-fcm`
- `cmd/worker-websocket`
- `cmd/worker-retry`
- `cmd/worker-dead`

Application packages exist under `internal/`.

Before creating a new package, inspect whether the responsibility belongs in an
existing package.

## Tenant Isolation

Every query touching tenant-owned data must include explicit tenant scoping.

Do not rely only on:

- frontend filtering
- route paths
- request payload tenant IDs
- Redis keys
- globally stored state

Tenant identity must come from trusted authentication and server-side context.

For platform-admin operations that intentionally cross tenant boundaries:

- make the behavior explicit
- enforce platform-level authorization
- preserve audit logging
- avoid accidentally exposing cross-tenant data to tenant users

## Go Engineering Rules

- Follow existing package boundaries.
- Use idiomatic Go.
- Keep functions focused.
- Avoid circular dependencies.
- Keep interfaces close to their consumers.
- Do not create interfaces without a practical need.
- Pass `context.Context` through I/O operations.
- Do not store contexts inside structs.
- Handle meaningful errors.
- Wrap errors with useful operation context.
- Preserve error identity where callers need it.
- Avoid panic for normal failures.
- Avoid global mutable state.
- close resources correctly.
- respect cancellation and deadlines.
- avoid leaking goroutines.
- use bounded concurrency.
- avoid hidden side effects.

## HTTP Handlers

Handlers should:

- decode requests
- validate input
- resolve authenticated user and tenant context
- enforce permissions
- call existing service or application logic
- map errors to established API response formats
- preserve request ID and session context
- emit audit events for relevant mutations

Handlers should not contain:

- large SQL workflows
- provider-specific delivery logic
- long-running queue processing
- unbounded concurrent work

## PostgreSQL

Use `pgx` and existing query patterns.

Requirements:

- use parameterized SQL
- pass context to database operations
- include tenant filters
- keep transactions short
- add indexes deliberately
- avoid N+1 queries
- consider lock behavior
- handle concurrent updates
- preserve foreign keys and constraints
- use database constraints where they protect integrity
- consider duplicate processing and idempotency

Do not keep database transactions open while performing:

- provider API calls
- RabbitMQ operations
- Redis operations
- unrelated computation
- slow external I/O

## Migrations

For schema changes:

1. Add a migration under `migrations/`.
2. Inspect existing production data implications.
3. Consider table-locking risk.
4. Consider backfill strategy.
5. Add indexes where needed.
6. Preserve rollback safety where supported.
7. Update seed data where required.
8. Update related documentation.

## Seed Data

Update seed files when changing:

- roles
- permissions
- role-permission mappings
- default tenant behavior
- feature catalog entries
- platform channels
- tenant defaults
- provider defaults
- local development requirements

Never place production secrets in seed files.

## Redis

Redis is used for:

- rate limiting
- runtime capability checks
- cache-like behavior
- temporary state where explicitly designed

For every Redis change define:

- key format
- tenant scope
- TTL
- serialization
- invalidation
- miss behavior
- Redis failure behavior
- concurrency behavior

Redis must not become the only durable source of business data unless explicitly
required by architecture.

Avoid broad production scans such as:

```text
KEYS *
Consider cache stampede protection for high-traffic keys.
RabbitMQ
For every RabbitMQ workflow verify:
exchange name
queue name
routing key
durable configuration
payload structure
payload version compatibility
publisher error handling
consumer acknowledgement timing
retry behavior
dead-letter behavior
redelivery
duplicate processing
prefetch
bounded concurrency
graceful shutdown
Publishing successfully does not prove provider delivery succeeded.
Workers
Workers must support:
context cancellation
graceful shutdown
bounded concurrency
correct acknowledgement behavior
duplicate-safe processing
provider timeouts
retry classification
dead-letter handling
panic recovery where appropriate
structured logging
useful metrics
Do not create an unbounded goroutine per message, recipient, or provider call.
Delivery Idempotency
Assume RabbitMQ messages may be delivered more than once.
Review every worker for:
duplicate provider calls
duplicate delivery attempts
duplicate status transitions
repeated retries
worker crashes after provider success
crashes before database updates
retries after ambiguous provider responses
Use existing identifiers and database constraints to make processing as duplicate-safe as possible.
Providers
Mock providers are the local-safe default.
Before modifying or claiming real-provider support, verify:
tenant provider configuration lookup
provider adapter selection
credential loading
credential decryption where applicable
secret redaction
request timeout
response parsing
retry classification
delivery attempt persistence
metrics
logs
worker wiring
Do not expose provider credentials in:
logs
API responses
audit metadata
error payloads
frontend code
committed examples
Authentication and Authorization
Preserve:
JWT access token behavior
refresh token behavior
tenant API key behavior
short-lived WebSocket token behavior
role scope
tenant scope
platform-admin behavior
broad *.manage backward compatibility
New mutating endpoints require:
authentication
granular permission checks
tenant isolation
request validation
audit logging
Audit and Security Events
Relevant mutating operations should preserve audit records containing:
actor
tenant
request ID
session ID
action
resource type
resource identifier
safe metadata
Security-sensitive events should use the existing security event mechanism where appropriate.
Never store secrets or complete sensitive credentials in audit metadata.
Logging
Use existing zap logging conventions.
Include useful context such as:
request ID
session ID
tenant ID
notification ID
delivery ID
queue
provider
channel
operation
duration
error
Do not log:
passwords
API keys
JWTs
refresh tokens
provider credentials
authorization headers
private keys
sensitive message content unless explicitly safe
Testing and Validation
After backend changes, run:
go test ./...
When relevant, also run:
go test -race ./...
go vet ./...
Run project-specific build, migration, seed, and smoke commands when applicable.
Test relevant scenarios:
normal behavior
malformed input
unauthorized access
forbidden access
tenant isolation
missing resource
duplicate request
database failure
Redis failure
RabbitMQ failure
provider timeout
provider failure
transaction rollback
duplicate queue delivery
retry exhaustion
dead-letter behavior
context cancellation
graceful shutdown
Never claim a command passed unless it was actually executed.
