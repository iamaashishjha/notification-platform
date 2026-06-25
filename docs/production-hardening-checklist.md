# Production Hardening Checklist

## TLS and Reverse Proxy

- Use TLS 1.2+ with automatic certificate renewal.
- Enable HSTS after validating HTTPS everywhere.
- Set secure proxy headers and trusted proxy IPs.
- Apply request body size limits and sane timeouts at the proxy.

## Firewall and Network

- Expose only ports 80/443 publicly.
- Restrict PostgreSQL, Redis, and RabbitMQ to private network access.
- Restrict RabbitMQ management to VPN/admin IP ranges.
- Deny outbound traffic except required provider APIs where feasible.

## PostgreSQL

- Use strong credentials and least-privilege users.
- Enable SSL for remote connections.
- Enable automated backups and point-in-time recovery.
- Test restore procedures regularly.
- Monitor slow queries, connection count, replication lag, and disk usage.

## Redis

- Require authentication and TLS when remote.
- Disable public access.
- Set memory limits and eviction policy intentionally.
- Monitor rejected connections, latency, memory, and key growth.

## RabbitMQ

- Use TLS and strong per-service credentials.
- Use separate vhosts/users for production.
- Configure queue durability, dead-letter queues, and alerting.
- Monitor queue depth, consumer count, unacked messages, and disk alarms.

## JWT and Session Strategy

- Use high-entropy JWT secrets or asymmetric keys.
- Add key IDs and staged rotation.
- Keep access tokens short-lived.
- Store refresh tokens hashed and rotate on every use.
- Revoke sessions on password reset, role changes, and account compromise.

## Secret Rotation

- Rotate JWT secrets, provider credentials, API keys, SMTP credentials, and encryption keys on a schedule.
- Support emergency revocation.
- Never expose raw API keys except at creation time.
- Back provider config encryption with KMS or Vault.

## Monitoring and Detection

- Collect structured logs with request IDs, tenant IDs, actor IDs, and notification IDs.
- Alert on login failures, lockouts, API-key failures, rate-limit spikes, queue dead-letter growth, and provider errors.
- Track audit-log writes and security events.
- Add uptime checks for API, admin UI, RabbitMQ, Redis, and PostgreSQL.

## Incident Response

- Document escalation contacts.
- Preserve audit logs and security events.
- Rotate affected secrets.
- Revoke affected sessions/API keys.
- Export tenant impact reports.
- Run post-incident review and add regression tests.
