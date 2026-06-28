#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

RETENTION_DAYS="${LOG_RETENTION_DAYS:-30}"
RUNTIME_LOGS="${PROJECT_DIR}/.runtime/logs"
APP_LOGS="${PROJECT_DIR}/logs"
declare -a TO_DELETE

if [ -d "$RUNTIME_LOGS" ]; then
  while IFS= read -r -d '' f; do
    TO_DELETE+=("$f")
  done < <(find "$RUNTIME_LOGS" -type f -name "*.log" -mtime "+${RETENTION_DAYS}" -print0 2>/dev/null || true)
fi

if [ -n "${APP_LOG_DIR:-}" ] && [ -d "$APP_LOG_DIR" ]; then
  while IFS= read -r -d '' f; do
    TO_DELETE+=("$f")
  done < <(find "$APP_LOG_DIR" -type f -name "*.log" -mtime "+${RETENTION_DAYS}" -print0 2>/dev/null || true)
fi

if [ ${#TO_DELETE[@]} -eq 0 ]; then
  echo "No log files older than ${RETENTION_DAYS} days found."
  exit 0
fi

echo "Will delete ${#TO_DELETE[@]} log file(s) older than ${RETENTION_DAYS} days:"
printf '  %s\n' "${TO_DELETE[@]}"

if [ "${FORCE:-0}" != "1" ]; then
  read -rp "Continue? (yes/no): " CONFIRM
  if [ "$CONFIRM" != "yes" ]; then
    echo "Prune cancelled."
    exit 0
  fi
fi

for f in "${TO_DELETE[@]}"; do
  rm -f "$f"
  echo "Deleted: $f"
done

echo "Prune complete. Removed ${#TO_DELETE[@]} file(s)."
