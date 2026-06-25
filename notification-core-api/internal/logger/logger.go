package logger

import (
	"notification-core-api/internal/config"

	"go.uber.org/zap"
)

func New(cfg config.Config) *zap.Logger {
	if cfg.AppEnv == "local" {
		log, _ := zap.NewDevelopment()
		return log
	}
	log, _ := zap.NewProduction()
	return log
}
