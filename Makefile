.PHONY: run stop infra api workers admin migrate seed test-local logs

run:
	./run.sh

stop:
	./stop.sh --keep-volumes

infra:
	docker compose --profile infra up -d postgres redis rabbitmq

api:
	docker compose --profile api up -d --build notification-api

workers:
	docker compose --profile workers up -d --build worker-router worker-scheduler worker-email worker-sms worker-fcm worker-websocket worker-retry worker-dead

admin:
	docker compose --profile admin up -d --build notification-admin-ui

migrate:
	docker compose --profile api run --rm migrate

seed:
	docker compose --profile api run --rm seed

test-local:
	./test-local.sh

logs:
	docker compose --profile all logs -f
