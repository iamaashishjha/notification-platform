#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

if [ -z "${1:-}" ]; then
  echo "Usage: $0 <backup-file>"
  echo "Example: $0 backups/notification_db_20250101_120000.sql.gz"
  exit 1
fi

BACKUP_FILE="$1"
if [ ! -f "$BACKUP_FILE" ]; then
  echo "ERROR: Backup file not found: $BACKUP_FILE" >&2
  exit 1
fi

echo "WARNING: This will overwrite the current database!"
echo "  Backup file: ${BACKUP_FILE}"
read -rp "Are you sure? Type 'yes' to continue: " CONFIRM
if [ "$CONFIRM" != "yes" ]; then
  echo "Restore cancelled."
  exit 0
fi

if [ -f "${PROJECT_DIR}/.env" ]; then
  set -a; source "${PROJECT_DIR}/.env"; set +a
fi

if [ -n "${DATABASE_URL:-}" ]; then
  PG_URL="$DATABASE_URL"
elif [ -n "${POSTGRES_USER:-}" ] && [ -n "${POSTGRES_DB:-}" ]; then
  PG_URL="postgres://${POSTGRES_USER}:${POSTGRES_PASSWORD:-}@${POSTGRES_HOST:-localhost}:${POSTGRES_PORT:-5432}/${POSTGRES_DB}?sslmode=${PGSSLMODE:-disable}"
else
  echo "ERROR: Set DATABASE_URL or POSTGRES_USER/POSTGRES_DB" >&2
  exit 1
fi

if [[ "$BACKUP_FILE" == *.gz ]]; then
  gunzip -c "$BACKUP_FILE" | psql "$PG_URL"
else
  psql "$PG_URL" < "$BACKUP_FILE"
fi

echo "Restore completed from: ${BACKUP_FILE}"
