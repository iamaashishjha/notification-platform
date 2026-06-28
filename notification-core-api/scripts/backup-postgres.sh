#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
BACKUP_DIR="${PROJECT_DIR}/backups"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
OUTPUT="${BACKUP_DIR}/notification_db_${TIMESTAMP}.sql.gz"

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

mkdir -p "$BACKUP_DIR"

pg_dump "$PG_URL" --no-owner --no-acl | gzip > "$OUTPUT"

echo "Backup created: ${OUTPUT}"
echo "Size: $(du -h "$OUTPUT" | cut -f1)"
