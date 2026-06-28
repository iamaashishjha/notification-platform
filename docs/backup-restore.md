# Backup and Restore

## Backup Strategy

### Automated Backups

Run `scripts/backup-postgres.sh` to create a timestamped, gzip-compressed dump:

```bash
./scripts/backup-postgres.sh
```

Output: `backups/notification_db_YYYYMMDD_HHMMSS.sql.gz`

The script reads `DATABASE_URL` from `.env` or falls back to individual `POSTGRES_*` variables.

### Recommended Production Schedule

Add a cron entry for daily backups:

```cron
0 2 * * * /path/to/notification-platform/scripts/backup-postgres.sh
```

### Offsite Backup

Backup files are local. For production, copy them to offsite/cloud storage:

```bash
aws s3 cp backups/notification_db_*.sql.gz s3://my-backup-bucket/notifications/
```

or

```bash
rsync -avz backups/ user@offsite-server:/backups/notifications/
```

## Restore Strategy

```bash
./scripts/restore-postgres.sh backups/notification_db_20250101_120000.sql.gz
```

The script will:
1. Require an explicit backup file path
2. Ask for confirmation before proceeding
3. Read DATABASE_URL from .env

WARNING: Restore overwrites the current database.

## Retention Policy

Log files are pruned automatically. Run:

```bash
LOG_RETENTION_DAYS=30 ./scripts/prune-old-logs.sh
```

Default retention is 30 days. Set `FORCE=1` to skip confirmation.

### What is pruned
- `.runtime/logs/*.log` older than retention
- `logs/*.log` if other log directory is configured
- Never deletes database data

## Disaster Recovery

In case of total data loss:

1. Start fresh infrastructure: `docker compose --profile all up -d`
2. Run migrations: `go run ./cmd/migrate`
3. Restore latest backup: `./scripts/restore-postgres.sh backups/notification_db_latest.sql.gz`
4. Verify: check admin login and dashboard stats

If no backup exists:
1. Run migrations and seed to create baseline data
2. Manually recreate provider configs and API keys
3. Users will need password resets
