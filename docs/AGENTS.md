# Documentation Agent Instructions

These instructions apply to all files under `docs/`.

## Documentation Purpose

The `docs/` directory is the authoritative explanation of:

- architecture
- provider configuration
- security
- observability
- deployment
- local development
- operations
- implementation status
- known limitations

Documentation should explain:

- what the system does
- how the system works
- why important decisions were made
- which features are complete
- which features remain incomplete

## Documentation Navigation

Documentation is interconnected.

When adding, moving, renaming, or deleting documentation:

- update parent indexes
- update inbound links
- use relative links
- preserve heading anchors where possible
- avoid orphan documents
- search for stale references

## Accuracy Rules

Do not claim that a feature is complete based only on:

- database schema existence
- migration existence
- UI existence
- route existence
- handler existence
- worker binary existence
- provider adapter existence
- queue publication
- mock-provider success

Verify the full execution path before changing implementation status.

## Important Known Gaps

Be especially careful when documenting:

- template rendering
- campaign recipient resolution
- campaign fan-out
- recurring schedules
- MFA and TOTP
- real-provider worker wiring
- integration testing
- frontend testing
- production Compose configuration
- nginx or production proxy configuration

## Status Terminology

Use clear labels such as:

- implemented and verified
- implemented but not integration-tested
- partially implemented
- mock-provider only
- schema only
- UI only
- planned
- known gap
- not implemented

Avoid vague labels such as:

- done
- complete
- production ready

unless the full claim has been verified.

## Required Documentation Updates

Update documentation when changes affect:

- API contracts
- request or response fields
- worker behavior
- RabbitMQ exchanges
- RabbitMQ queues
- routing keys
- retries
- dead-letter handling
- provider configuration
- database schema
- migrations
- seed data
- roles
- permissions
- tenant capabilities
- authentication
- WebSocket behavior
- Redis keys
- environment variables
- local commands
- deployment
- observability
- known limitations

## Documentation Quality

Relevant documents should clearly state:

- purpose
- scope
- assumptions
- current behavior
- important data flow
- dependencies
- failure behavior
- security implications
- tenant implications
- examples where useful
- related documents
- implementation status

Do not simply duplicate source code.

Explain behavior and reasoning.