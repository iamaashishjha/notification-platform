# Notification Core API

Go API and worker project for the multi-tenant notification platform.

## Local Commands

```sh
go mod tidy
go run ./cmd/api
go run ./cmd/worker-sms
```

Migrations use `golang-migrate`:

```sh
make migrate-up
make seed
```

The local seed creates:

- `admin@example.com` / `password`
- `tenant@example.com` / `password`
- raw tenant API key: `demo_tenant_api_key_local`
