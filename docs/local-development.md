# Local development

The root runner is the supported entry point:

```sh
chmod +x run.sh stop.sh test-local.sh
./run.sh
```

It creates ignored local configuration from examples when needed. RabbitMQ is the implemented queue driver. `QUEUE_DRIVER=kafka` is reserved for future work and does not enable Kafka today.

## Full Docker mode

Choose option 1. The runner checks Docker Compose, creates `.env`, asks about provider mode, builds the API, six workers, and admin UI, and starts PostgreSQL, Redis, and RabbitMQ. Compose runs migrations and the local seed before starting the API.

Equivalent command:

```sh
docker compose --profile all up -d --build
```

## Hybrid local mode

Choose option 2 to keep PostgreSQL, Redis, and RabbitMQ in Docker while running Go and React with system tools. Install Go, Node.js, and one of npm, pnpm, or yarn first. The runner:

1. Starts infrastructure.
2. Creates `notification-core-api/.env.local` and `notification-admin-ui/.env.local`.
3. Runs migrations and seed data.
4. Starts the API, all workers, and Vite in the background.
5. Writes output to `.runtime/logs` and PIDs to `.runtime/pids`.

Errors remain visible in per-process logs, for example:

```sh
tail -f .runtime/logs/api.log
tail -f .runtime/logs/worker-email.log
tail -f .runtime/logs/admin-ui.log
```

## Individual modes

- Option 3 starts only PostgreSQL, Redis, and RabbitMQ for manual development.
- Option 4 loads `notification-core-api/.env.local` and runs `go run ./cmd/api`; it can run migrations first.
- Option 5 selects a JavaScript package manager, installs missing dependencies, and runs Vite.
- Option 6 starts one worker or all workers with `go run ./cmd/worker-<name>`.
- Option 7 securely prepares mock or provider-specific backend configuration.
- Option 8 runs local smoke tests.

The root Makefile exposes `run`, `stop`, `infra`, `api`, `workers`, `admin`, `migrate`, `seed`, `test-local`, and `logs` targets.

## Smoke tests

With the full stack running:

```sh
./test-local.sh
```

The script uses `curl`; `jq` is optional. It checks health, readiness, admin login, tenant API-key send, RabbitMQ publication, mock-worker processing, a sent delivery status in the admin feed, and the admin UI. Override endpoints with `API_URL` and `ADMIN_URL` if needed.

## URLs and local credentials

- API: <http://localhost:8080>
- Admin UI: <http://localhost:3000>
- RabbitMQ UI: <http://localhost:15672> (`notification` / `notification`)
- Platform admin: `admin@example.com` / `password`
- Tenant user: `tenant@example.com` / `password`
- Local tenant API key: `demo_tenant_api_key_local`

These credentials are development-only.

## Stop and clean up

Interactive stop (asks before removing volumes):

```sh
./stop.sh
```

Keep volumes without a prompt:

```sh
./stop.sh --keep-volumes
```

`make stop` uses the keep-volumes behavior. Removing volumes permanently deletes the local PostgreSQL data.

## Troubleshooting

- Port already in use: stop the conflicting program, or override `POSTGRES_PORT`, `REDIS_PORT`, `RABBITMQ_PORT`, `RABBITMQ_MANAGEMENT_PORT`, `API_PORT`, or `ADMIN_UI_PORT` in root `.env`. Container-to-container URLs do not change; hybrid backend URLs must use the selected host ports.
- API exits at startup: inspect `.runtime/logs/api.log` and confirm infrastructure is healthy with `docker compose --profile infra ps`.
- Notification stays queued: start the worker matching its channel; the smoke test uses the email worker.
- Login or API key fails: rerun `make seed`. Seed credentials are defined in `notification-core-api/seeds/local_seed.sql`.
- Dependency install fails: run the selected package manager directly in `notification-admin-ui` to see its full error.
- Stale local process: run `./stop.sh`; PID files are cleaned automatically.
- Compose profile confusion: use `--profile infra`, `api`, `workers`, `admin`, or `all`. Explicit service names are documented in the Makefile.

## Future Kafka support

Kafka is intentionally not included in Compose because no Kafka queue client exists in the Go application. Future work should implement the queue interface for Kafka, validate `QUEUE_DRIVER=kafka`, add Kafka services/profile, and extend the smoke test. RabbitMQ remains the safe default.
