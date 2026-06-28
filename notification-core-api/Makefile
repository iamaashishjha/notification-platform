MIGRATE_URL ?= postgres://notification:notification@localhost:5432/notification?sslmode=disable

.PHONY: tidy run-api run-all-workers run-retry run-dead migrate-up migrate-down seed test build-all

tidy:
	go mod tidy

run-api:
	go run ./cmd/api

run-worker-router:
	go run ./cmd/worker-router

run-worker-scheduler:
	go run ./cmd/worker-scheduler

run-worker-email:
	go run ./cmd/worker-email

run-worker-sms:
	go run ./cmd/worker-sms

run-worker-fcm:
	go run ./cmd/worker-fcm

run-worker-websocket:
	go run ./cmd/worker-websocket

run-worker-retry:
	go run ./cmd/worker-retry

run-worker-dead:
	go run ./cmd/worker-dead

run-all-workers:
	for w in router scheduler email sms fcm websocket retry dead; do \
		go run "./cmd/worker-$$w" & \
	done

build-all:
	go build ./cmd/api
	go build ./cmd/worker-router
	go build ./cmd/worker-scheduler
	go build ./cmd/worker-email
	go build ./cmd/worker-sms
	go build ./cmd/worker-fcm
	go build ./cmd/worker-websocket
	go build ./cmd/worker-retry
	go build ./cmd/worker-dead

migrate-up:
	migrate -path migrations -database "$(MIGRATE_URL)" up

migrate-down:
	migrate -path migrations -database "$(MIGRATE_URL)" down 1

seed:
	DATABASE_URL="$(MIGRATE_URL)" sh scripts/seed.sh

test:
	go test ./...
