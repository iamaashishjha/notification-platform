#!/usr/bin/env sh
set -eu

psql "${DATABASE_URL:-postgres://notification:notification@localhost:5432/notification?sslmode=disable}" -f seeds/local_seed.sql
