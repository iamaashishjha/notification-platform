#!/usr/bin/env bash
set -Eeuo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKEND_DIR="$ROOT_DIR/notification-core-api"
FRONTEND_DIR="$ROOT_DIR/notification-admin-ui"
RUNTIME_DIR="$ROOT_DIR/.runtime"
LOG_DIR="$RUNTIME_DIR/logs"
PID_DIR="$RUNTIME_DIR/pids"
BACKEND_ENV="$BACKEND_DIR/.env.local"
FRONTEND_ENV="$FRONTEND_DIR/.env.local"
PROVIDER_CONFIG="$BACKEND_DIR/config/providers.local.json"
COMMAND=""
PROVIDER_MODE_OPTION=""
PACKAGE_MANAGER_OPTION=""
MIGRATE_FIRST_OPTION=""
WORKER_OPTION=""
SEED_OPTION=""

mkdir -p "$LOG_DIR" "$PID_DIR" "$BACKEND_DIR/config"

info() { printf '\033[1;34m==>\033[0m %s\n' "$*"; }
ok() { printf '\033[1;32mOK\033[0m  %s\n' "$*"; }
warn() { printf '\033[1;33mWARN\033[0m %s\n' "$*"; }
die() { printf '\033[1;31mERROR\033[0m %s\n' "$*" >&2; exit 1; }
has() { command -v "$1" >/dev/null 2>&1; }

check_docker() {
  has docker || die "Docker is not installed or is not on PATH."
  docker compose version >/dev/null 2>&1 || die "Docker Compose v2 ('docker compose') is required."
}

ensure_root_env() {
  if [[ ! -f "$ROOT_DIR/.env" ]]; then
    cp "$ROOT_DIR/.env.example" "$ROOT_DIR/.env"
    ok "Created .env from .env.example (local placeholders only)."
  fi
}

ensure_local_envs() {
  if [[ ! -f "$BACKEND_ENV" ]]; then
    cp "$ROOT_DIR/.env.local.example" "$BACKEND_ENV"
    ok "Created notification-core-api/.env.local."
  fi
  if [[ ! -f "$FRONTEND_ENV" ]]; then
    cp "$FRONTEND_DIR/.env.example" "$FRONTEND_ENV"
    ok "Created notification-admin-ui/.env.local."
  fi
  if [[ ! -f "$PROVIDER_CONFIG" ]]; then
    cp "$BACKEND_DIR/config/providers.local.example.json" "$PROVIDER_CONFIG"
    ok "Created mock provider configuration."
  fi
}

load_backend_env() {
  ensure_local_envs
  local line key value
  while IFS= read -r line || [[ -n "$line" ]]; do
    [[ -z "$line" || "$line" == \#* || "$line" != *=* ]] && continue
    key="${line%%=*}"
    value="${line#*=}"
    [[ "$key" =~ ^[A-Za-z_][A-Za-z0-9_]*$ ]] || die "Invalid environment key in $BACKEND_ENV: $key"
    export "$key=$value"
  done <"$BACKEND_ENV"
}

choose_package_manager() {
  local available=() choice default
  has npm && available+=(npm)
  has pnpm && available+=(pnpm)
  has yarn && available+=(yarn)
  ((${#available[@]})) || die "Install npm, pnpm, or yarn first."
  default="${available[0]}"
  if [[ -n "$PACKAGE_MANAGER_OPTION" ]]; then
    has "$PACKAGE_MANAGER_OPTION" || die "$PACKAGE_MANAGER_OPTION is not installed."
    PACKAGE_MANAGER="$PACKAGE_MANAGER_OPTION"
    return
  fi
  printf 'Available package managers: %s\n' "${available[*]}"
  read -r -p "Package manager [$default]: " choice
  choice="${choice:-$default}"
  has "$choice" || die "$choice is not installed."
  PACKAGE_MANAGER="$choice"
}

install_frontend_dependencies() {
  [[ -d "$FRONTEND_DIR/node_modules" ]] && return
  info "Installing frontend dependencies with $PACKAGE_MANAGER"
  case "$PACKAGE_MANAGER" in
    npm) (cd "$FRONTEND_DIR" && npm install) ;;
    pnpm) (cd "$FRONTEND_DIR" && pnpm install) ;;
    yarn) (cd "$FRONTEND_DIR" && yarn install) ;;
  esac
}

start_background() {
  local name="$1" directory="$2"; shift 2
  local pid_file="$PID_DIR/$name.pid" log_file="$LOG_DIR/$name.log"
  if [[ -f "$pid_file" ]] && kill -0 "$(<"$pid_file")" 2>/dev/null; then
    warn "$name is already running (PID $(<"$pid_file"))."
    return
  fi
  printf 'Starting %s: ' "$name"
  printf '%q ' "$@"
  printf '\nLog: %s\n' "$log_file"
  (
    cd "$directory"
    exec "$@"
  ) >"$log_file" 2>&1 &
  local pid=$!
  printf '%s\n' "$pid" >"$pid_file"
  sleep 1
  if ! kill -0 "$pid" 2>/dev/null; then
    tail -n 30 "$log_file" >&2 || true
    rm -f "$pid_file"
    die "$name exited during startup. See $log_file"
  fi
  ok "$name started (PID $pid)."
}

stop_background_processes() {
  local pid_file name pid
  shopt -s nullglob
  for pid_file in "$PID_DIR"/*.pid; do
    name="$(basename "$pid_file" .pid)"
    pid="$(<"$pid_file")"
    if [[ "$pid" =~ ^[0-9]+$ ]] && kill -0 "$pid" 2>/dev/null; then
      info "Stopping runner-managed $name (PID $pid)"
      kill "$pid" 2>/dev/null || true
      for _ in {1..20}; do
        kill -0 "$pid" 2>/dev/null || break
        sleep 0.25
      done
      kill -9 "$pid" 2>/dev/null || true
    fi
    rm -f "$pid_file"
  done
  shopt -u nullglob
}

seed_tenants() {
  check_docker
  info "Running database migrations first"
  (cd "$ROOT_DIR" && docker compose --profile api run --rm -T migrate </dev/null)

  local choice slug="" slugs
  cat <<'EOF'

Seed options
1. Fresh start (platform admin only, no sample tenants)
2. Seed one sample tenant (choose from 14 industries)
3. Seed all sample tenants (ecommerce + 14 industry tenants)
4. Load local_seed.sql (ecommerce sample tenant only)
EOF
  if [[ -n "$SEED_OPTION" ]]; then
    case "$SEED_OPTION" in
      fresh) choice=1 ;;
      all) choice=3 ;;
      local) choice=4 ;;
      *) choice=2; slug="$SEED_OPTION" ;;
    esac
  else
    read -r -p "Choose [4]: " choice
    choice="${choice:-4}"
  fi

  case "$choice" in
    1)
      info "Seeding platform admin user and permissions only"
      (cd "$ROOT_DIR" && docker compose --profile api run --rm -T seed </dev/null)
      info "Clearing all tenant data for fresh start..."
      docker compose --profile api run --rm -T -e PGPASSWORD=notification postgres psql -h postgres -U notification -d notification <<'SQL'
DELETE FROM contact_group_members;
DELETE FROM contact_groups;
DELETE FROM contacts;
DELETE FROM notification_templates;
DELETE FROM tenant_api_keys;
DELETE FROM tenant_provider_configs;
DELETE FROM tenant_channels;
DELETE FROM tenant_features;
DELETE FROM user_roles WHERE tenant_id IS NOT NULL;
DELETE FROM tenant_users;
DELETE FROM notifications;
DELETE FROM notification_deliveries;
DELETE FROM in_app_notifications;
DELETE FROM websocket_sessions;
DELETE FROM campaigns;
DELETE FROM campaign_recipients;
DELETE FROM scheduled_jobs;
DELETE FROM tenants;
SQL
      ok "Fresh start ready — platform admin only (admin@example.com / password)."
      ;;
    2|3)
      slugs=("fintech" "hrms" "healthcare" "logistics" "edtech" "realestate" "travel" "food" "banking" "insurance" "social" "gaming" "iot" "saas")
      if [[ "$choice" == 2 && -z "$slug" ]]; then
        info "Which sample tenant to seed?"
        cat <<'TENANTS'
1. fintech        - Fintech Payments
2. hrms           - HRMS Portal
3. healthcare     - Healthcare App
4. logistics      - Logistics Platform
5. edtech         - EdTech Platform
6. realestate     - Real Estate Marketplace
7. travel         - Travel Booking
8. food           - Food Delivery
9. banking        - Banking Portal
10. insurance     - Insurance Platform
11. social        - Social Network
12. gaming        - Gaming Platform
13. iot           - IoT Dashboard
14. saas          - SaaS Metrics
TENANTS
        read -r -p "Enter number (1-14): " slug
        case "$slug" in
          1|2|3|4|5|6|7|8|9|10|11|12|13|14) idx=$((slug - 1)); slug="${slugs[$idx]}" ;;
          *) die "Invalid choice." ;;
        esac
      elif [[ "$choice" == 2 ]]; then
        [[ " ${slugs[*]} " == *" $slug "* ]] || die "Unknown sample tenant: $slug"
      else
        slug="all"
      fi

      info "Seeding base (ecommerce + admin users)..."
      (cd "$ROOT_DIR" && docker compose --profile api run --rm -T seed </dev/null)

      info "Seeding sample tenants..."
      local seed_volume="$ROOT_DIR/notification-core-api/seeds:/seeds:ro"
      if [[ "$slug" == "all" ]]; then
        docker compose --profile api run --rm -T -e PGPASSWORD=notification -v "$seed_volume" postgres psql -h postgres -U notification -d notification -f /seeds/sample_tenants.sql
        ok "All 14 industry sample tenants seeded."
      else
        # Seed only the chosen tenant by running sample_tenants.sql then cleaning others
        docker compose --profile api run --rm -T -e PGPASSWORD=notification -v "$seed_volume" postgres psql -h postgres -U notification -d notification -f /seeds/sample_tenants.sql
        docker compose --profile api run --rm -T -e PGPASSWORD=notification postgres psql -h postgres -U notification -d notification \
          -c "DELETE FROM tenants WHERE slug NOT IN ('ecommerce','$slug');"
        ok "Seeded tenant: $slug."
      fi
      ;;
    4)
      (cd "$ROOT_DIR" && docker compose --profile api run --rm -T seed </dev/null)
      ok "Local seed complete. Ecommerce tenant ready."
      ;;
  esac
}

run_migrations_and_seed() {
  check_docker
  info "Running database migrations"
  (cd "$ROOT_DIR" && docker compose --profile api run --rm -T migrate </dev/null)
  info "Loading local seed data"
  (cd "$ROOT_DIR" && docker compose --profile api run --rm -T seed </dev/null)
}

start_infrastructure() {
  check_docker
  ensure_root_env
  info "Starting PostgreSQL, Redis, and RabbitMQ"
  (cd "$ROOT_DIR" && docker compose --profile infra up -d postgres redis rabbitmq)
  ok "Infrastructure started. RabbitMQ UI: http://localhost:15672"
  printf 'Kafka is an optional future queue mode; this project currently implements QUEUE_DRIVER=rabbitmq only.\n'
}

print_access() {
  cat <<'EOF'

Local URLs
  API:         http://localhost:8080
  Admin UI:    http://localhost:3000
  RabbitMQ UI: http://localhost:15672 (notification / notification)

Seed logins
  Platform admin: admin@example.com / password
  Tenant user:   tenant@example.com / password

Sample send
  curl -X POST http://localhost:8080/api/v1/notifications \
    -H 'Authorization: Bearer demo_tenant_api_key_local' \
    -H 'Content-Type: application/json' \
    -d '{"event":"local.test","channels":["email"],"template":"welcome","target":{"type":"single","recipient":{"email":"user@example.com"}},"data":{"customer_name":"Local User"},"priority":5,"schedule":{"type":"instant"}}'
EOF
}

update_env() {
  local key="$1" value="$2" file="$3" tmp found=0 line
  tmp="$(mktemp "$RUNTIME_DIR/env.XXXXXX")"
  while IFS= read -r line || [[ -n "$line" ]]; do
    if [[ "$line" == "$key="* ]]; then
      printf '%s=%s\n' "$key" "$value" >>"$tmp"
      found=1
    else
      printf '%s\n' "$line" >>"$tmp"
    fi
  done <"$file"
  ((found)) || printf '%s=%s\n' "$key" "$value" >>"$tmp"
  mv "$tmp" "$file"
}

update_provider_env() {
  local key="$1" value="$2"
  update_env "$key" "$value" "$BACKEND_ENV"
  [[ -f "$ROOT_DIR/.env" ]] && update_env "$key" "$value" "$ROOT_DIR/.env"
}

read_setting() {
  local key="$1" prompt="$2" secret="${3:-false}" value
  if [[ "$secret" == true ]]; then
    read -r -s -p "$prompt: " value
    printf '\n'
  else
    read -r -p "$prompt: " value
  fi
  [[ -z "$value" ]] || update_provider_env "$key" "$value"
}

write_provider_config() {
  local mode="$1" email="$2" sms="$3" fcm="$4"
  printf '{\n  "mode": "%s",\n  "email": { "provider": "%s" },\n  "sms": { "provider": "%s" },\n  "fcm": { "provider": "%s" },\n  "websocket": { "enabled": true }\n}\n' \
    "$mode" "$email" "$sms" "$fcm" >"$PROVIDER_CONFIG"
}

configure_email() {
  local provider
  read -r -p "Email provider (smtp/sendgrid/ses) [smtp]: " provider
  provider="${provider:-smtp}"
  case "$provider" in smtp|sendgrid|ses) ;; *) die "Unsupported email provider." ;; esac
  update_provider_env EMAIL_PROVIDER "$provider"
  case "$provider" in
    smtp)
      read_setting SMTP_HOST "SMTP host"
      read_setting SMTP_PORT "SMTP port [587]"
      read_setting SMTP_USERNAME "SMTP username"
      read_setting SMTP_PASSWORD "SMTP password (input hidden)" true
      read_setting SMTP_FROM "SMTP from address"
      ;;
    sendgrid) read_setting SENDGRID_API_KEY "SendGrid API key (input hidden)" true ;;
    ses) read_setting AWS_REGION "AWS region" ;;
  esac
  CONFIG_EMAIL="$provider"
}

configure_sms() {
  local provider
  read -r -p "SMS provider (sparrow/twilio/generic_http_sms) [sparrow]: " provider
  provider="${provider:-sparrow}"
  case "$provider" in sparrow|twilio|generic_http_sms) ;; *) die "Unsupported SMS provider." ;; esac
  update_provider_env SMS_PROVIDER "$provider"
  case "$provider" in
    sparrow)
      read_setting SPARROW_TOKEN "Sparrow token (input hidden)" true
      read_setting SPARROW_FROM "Sparrow sender"
      ;;
    twilio)
      read_setting TWILIO_ACCOUNT_SID "Twilio account SID"
      read_setting TWILIO_AUTH_TOKEN "Twilio auth token (input hidden)" true
      read_setting TWILIO_FROM "Twilio from number"
      ;;
    generic_http_sms)
      read_setting GENERIC_HTTP_SMS_URL "Generic SMS endpoint"
      read_setting GENERIC_HTTP_SMS_TOKEN "Generic SMS token (input hidden)" true
      ;;
  esac
  CONFIG_SMS="$provider"
}

configure_fcm() {
  read_setting FCM_PROJECT_ID "FCM project ID"
  read_setting FCM_SERVICE_ACCOUNT_PATH "Absolute service-account JSON path"
  CONFIG_FCM=fcm
}

configure_websocket() {
  local enabled
  read -r -p "Enable WebSocket/in-app locally? [Y/n]: " enabled
  [[ "${enabled,,}" == n ]] && enabled=false || enabled=true
  update_provider_env WEBSOCKET_ENABLED "$enabled"
}

configure_providers() {
  ensure_local_envs
  local choice
  CONFIG_EMAIL="${EMAIL_PROVIDER:-mock}"
  CONFIG_SMS="${SMS_PROVIDER:-mock}"
  CONFIG_FCM=mock
  cat <<'EOF'
1. Use mock providers (recommended locally)
2. Configure email provider
3. Configure SMS provider
4. Configure FCM provider
5. Configure WebSocket/in-app settings
6. Configure all
EOF
  read -r -p "Choose [1]: " choice
  choice="${choice:-1}"
  case "$choice" in
    1)
      update_provider_env PROVIDER_MODE mock
      update_provider_env EMAIL_PROVIDER mock
      update_provider_env SMS_PROVIDER mock
      write_provider_config mock mock mock mock
      ok "Mock providers configured."
      return
      ;;
    2) configure_email ;;
    3) configure_sms ;;
    4) configure_fcm ;;
    5) configure_websocket ;;
    6) configure_email; configure_sms; configure_fcm; configure_websocket ;;
    *) die "Invalid provider choice." ;;
  esac
  update_provider_env PROVIDER_MODE configured
  write_provider_config configured "$CONFIG_EMAIL" "$CONFIG_SMS" "$CONFIG_FCM"
  warn "Settings were stored without displaying secrets. Real provider adapters are not wired yet; workers still use mock delivery."
}

ask_provider_mode() {
  local answer
  if [[ -n "$PROVIDER_MODE_OPTION" ]]; then
    answer="$PROVIDER_MODE_OPTION"
  else
    read -r -p "Use mock providers for local delivery? [Y/n]: " answer
  fi
  if [[ "${answer,,}" == n ]]; then
    configure_providers
  else
    ensure_local_envs
    update_provider_env PROVIDER_MODE mock
    write_provider_config mock mock mock mock
  fi
}

start_api() {
  has go || die "Go is not installed or is not on PATH."
  load_backend_env
  start_background api "$BACKEND_DIR" go run ./cmd/api
}

start_worker() {
  local worker="$1"
  has go || die "Go is not installed or is not on PATH."
  load_backend_env
  start_background "worker-$worker" "$BACKEND_DIR" go run "./cmd/worker-$worker"
}

start_all_workers() {
  local worker
  for worker in router scheduler email sms fcm websocket retry dead; do start_worker "$worker"; done
}

start_admin() {
  has node || die "Node.js is not installed or is not on PATH."
  ensure_local_envs
  choose_package_manager
  install_frontend_dependencies
  start_background admin-ui "$FRONTEND_DIR" "$PACKAGE_MANAGER" run dev
}

full_docker() {
  check_docker
  ensure_root_env
  ask_provider_mode
  stop_background_processes
  info "Building and starting the complete Docker stack"
  (cd "$ROOT_DIR" && docker compose --profile all up -d --build)
  ok "Compose started migrations and local seed data before the API."
  print_access
}

hybrid_local() {
  start_infrastructure
  has go || die "Go is required for hybrid mode."
  has node || die "Node.js is required for hybrid mode."
  ensure_local_envs
  ask_provider_mode
  choose_package_manager
  install_frontend_dependencies
  run_migrations_and_seed
  start_api
  start_all_workers
  start_background admin-ui "$FRONTEND_DIR" "$PACKAGE_MANAGER" run dev
  print_access
  printf '\nLogs: %s | Stop: ./stop.sh\n' "$LOG_DIR"
}

backend_only() {
  local answer
  if [[ -n "$MIGRATE_FIRST_OPTION" ]]; then
    answer="$MIGRATE_FIRST_OPTION"
  else
    read -r -p "Run migrations first using Docker? [y/N]: " answer
  fi
  [[ "${answer,,}" == y ]] && run_migrations_and_seed
  start_api
  printf 'API: http://localhost:8080 | Log: %s/api.log | Stop: ./stop.sh\n' "$LOG_DIR"
}

workers_only() {
  local choice worker
  if [[ -n "$WORKER_OPTION" ]]; then
    choice="$WORKER_OPTION"
  else
    read -r -p "Worker (router/scheduler/email/sms/fcm/websocket/retry/dead/all) [all]: " choice
    choice="${choice:-all}"
  fi
  case "$choice" in
    all) start_all_workers ;;
    router|scheduler|email|sms|fcm|websocket|retry|dead) start_worker "$choice" ;;
    *) die "Unknown worker: $choice" ;;
  esac
  printf 'Worker logs: %s | Stop: ./stop.sh\n' "$LOG_DIR"
}

show_menu() {
  cat <<'EOF'

Notification Platform local runner
1.  Run everything with Docker Compose
2.  Run infrastructure with Docker, but Go backend and React UI using system tools
3.  Run only infrastructure services
4.  Run only Go backend locally
5.  Run only React admin UI locally
6.  Run workers locally
7.  Configure notification providers
8.  Seed menu (fresh start / sample tenants / local seed)
9.  Run local smoke tests
10. Stop all services
11. Exit

Queue note: RabbitMQ is the implemented default. Kafka is a future/advanced placeholder.
EOF
}

show_usage() {
  cat <<'EOF'
Usage: ./run.sh [command] [options]

Commands (names or menu numbers):
  docker|1       Run the complete Docker Compose stack
  hybrid|2       Run infrastructure in Docker and apps locally
  infra|3        Run infrastructure services only
  api|4          Run the Go API locally
  admin|5        Run the React admin UI locally
  workers|6      Run workers locally
  providers|7    Configure notification providers
  seed|8         Run database seeds
  test|9         Run local smoke tests
  stop|10        Stop all services
  help           Show this help

Options:
  --mock                 Use mock providers without prompting
  --configure-providers  Open provider configuration instead of using mocks
  --package-manager NAME Use npm, pnpm, or yarn without prompting
  --migrate              Run migrations and seeds before the local API
  --no-migrate           Start the local API without migrations
  --worker NAME          Start one worker, or "all"
  --seed MODE            Seed "fresh", "local", "all", or an industry slug

Examples:
  ./run.sh docker --mock
  ./run.sh hybrid --mock --package-manager npm
  ./run.sh api --migrate
  ./run.sh workers --worker email
  ./run.sh seed --seed fintech
EOF
}

parse_args() {
  while (($#)); do
    case "$1" in
      1|docker) COMMAND=1 ;;
      2|hybrid) COMMAND=2 ;;
      3|infra) COMMAND=3 ;;
      4|api) COMMAND=4 ;;
      5|admin) COMMAND=5 ;;
      6|workers) COMMAND=6 ;;
      7|providers) COMMAND=7 ;;
      8|seed) COMMAND=8 ;;
      9|test) COMMAND=9 ;;
      10|stop) COMMAND=10 ;;
      11|help|-h|--help) COMMAND=help ;;
      --mock) PROVIDER_MODE_OPTION=y ;;
      --configure-providers) PROVIDER_MODE_OPTION=n ;;
      --migrate) MIGRATE_FIRST_OPTION=y ;;
      --no-migrate) MIGRATE_FIRST_OPTION=n ;;
      --package-manager|--worker|--seed)
        (($# >= 2)) || die "$1 requires a value."
        case "$1" in
          --package-manager) PACKAGE_MANAGER_OPTION="$2" ;;
          --worker) WORKER_OPTION="$2" ;;
          --seed) SEED_OPTION="$2" ;;
        esac
        shift
        ;;
      *) die "Unknown option: $1 (run ./run.sh --help)" ;;
    esac
    shift
  done
}

main() {
  local choice
  parse_args "$@"
  if [[ "$COMMAND" == help ]]; then
    show_usage
    return
  elif [[ -n "$COMMAND" ]]; then
    choice="$COMMAND"
  else
    show_menu
    read -r -p "Choose an option: " choice
  fi
  case "$choice" in
    1) full_docker ;;
    2) hybrid_local ;;
    3) start_infrastructure ;;
    4) backend_only ;;
    5) start_admin ;;
    6) workers_only ;;
    7) configure_providers ;;
    8) seed_tenants ;;
    9) "$ROOT_DIR/test-local.sh" ;;
    10) "$ROOT_DIR/stop.sh" ;;
    11) exit 0 ;;
    *) die "Choose a number from 1 to 11." ;;
  esac
}

main "$@"
