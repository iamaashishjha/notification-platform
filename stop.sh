#!/usr/bin/env bash
set -Eeuo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PID_DIR="$ROOT_DIR/.runtime/pids"
KEEP_VOLUMES=false
[[ "${1:-}" == "--keep-volumes" ]] && KEEP_VOLUMES=true

printf 'Stopping local background processes...\n'
if [[ -d "$PID_DIR" ]]; then
  shopt -s nullglob
  for pid_file in "$PID_DIR"/*.pid; do
    name="$(basename "$pid_file" .pid)"
    pid="$(<"$pid_file")"
    if [[ "$pid" =~ ^[0-9]+$ ]] && kill -0 "$pid" 2>/dev/null; then
      printf '  stopping %s (PID %s)\n' "$name" "$pid"
      kill "$pid" 2>/dev/null || true
      for _ in {1..20}; do
        kill -0 "$pid" 2>/dev/null || break
        sleep 0.25
      done
      kill -9 "$pid" 2>/dev/null || true
    fi
    rm -f "$pid_file"
  done
fi

if command -v docker >/dev/null 2>&1 && docker compose version >/dev/null 2>&1; then
  printf 'Stopping Docker Compose services (database volumes are kept)...\n'
  (cd "$ROOT_DIR" && docker compose --profile all down --remove-orphans)
  if [[ "$KEEP_VOLUMES" == false ]]; then
    read -r -p "Delete PostgreSQL and other Compose volumes too? [y/N]: " answer
    if [[ "${answer,,}" == y ]]; then
      (cd "$ROOT_DIR" && docker compose --profile all down --volumes --remove-orphans)
      printf 'Volumes deleted.\n'
    fi
  fi
else
  printf 'Docker Compose not available; skipped Compose shutdown.\n'
fi

printf 'All runner-managed services stopped.\n'

