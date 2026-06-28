package main

import (
	"notification-core-api/internal/worker"
)

func main() { worker.RunDeadLetter() }
