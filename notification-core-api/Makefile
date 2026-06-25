MIGRATE_URL ?= postgres://notification:notification@localhost:5432/notification?sslmode=disable

.PHONY: tidy run-api migrate-up migrate-down seed test

tidy:
	go mod tidy

run-api:
	go run ./cmd/api

migrate-up:
	migrate -path migrations -database "$(MIGRATE_URL)" up

migrate-down:
	migrate -path migrations -database "$(MIGRATE_URL)" down 1

seed:
	DATABASE_URL="$(MIGRATE_URL)" sh scripts/seed.sh

test:
	go test ./...
