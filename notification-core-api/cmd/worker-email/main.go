package main

import (
	"notification-core-api/internal/queue"
	"notification-core-api/internal/worker"
)

func main() { worker.RunChannel("email", queue.EmailQueue) }
