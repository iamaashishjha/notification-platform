# Deployment Security

## Container Security

- Go API image uses a minimal Alpine runtime and runs as a non-root `app` user.
- React dev image runs as the `node` user.
- Migrations run in a dedicated one-shot container.
- Seed data runs in a separate one-shot container for local testing.
- API health check uses `GET /healthz`.

## Local Defaults

- Local Compose credentials are intentionally simple and must not be used in production.
- `.env.example` is safe as a template; production secrets must be injected through a secret manager or orchestrator.
- RabbitMQ management UI is exposed locally for development only.

## Production Recommendations

- Do not publish PostgreSQL, Redis, or RabbitMQ to the public internet.
- Place API and admin UI behind a TLS reverse proxy.
- Run admin UI as static assets behind hardened Nginx/Caddy/Traefik.
- Use private networks and security groups between app, DB, Redis, and RabbitMQ.
- Enable image scanning and pin base image digests for production.
- Run containers with read-only root filesystems where practical.
- Use Docker secrets, SOPS, Vault, cloud KMS, or platform-native secrets for sensitive values.
- Disable RabbitMQ management UI outside trusted admin networks.
- Configure resource limits for API and worker containers.
- Keep worker scaling controlled by queue depth and provider limits.

## Remaining Work

- Add production-specific Compose or Terraform profiles.
- Add container security policy examples.
- Add OpenTelemetry collector and log shipping profiles.
