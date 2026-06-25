package worker

import (
	"context"
	"os"
	"os/signal"
	"syscall"
	"time"

	"notification-core-api/internal/config"
	"notification-core-api/internal/database"
	"notification-core-api/internal/delivery"
	"notification-core-api/internal/logger"
	"notification-core-api/internal/notifications"
	"notification-core-api/internal/providers/email"
	"notification-core-api/internal/providers/fcm"
	"notification-core-api/internal/providers/sms"
	wsprovider "notification-core-api/internal/providers/websocket"
	"notification-core-api/internal/queue"

	"go.uber.org/zap"
)

func RunChannel(channel string, queueName string) {
	cfg := config.Load()
	log := logger.New(cfg)
	defer log.Sync()
	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()
	db, err := database.Connect(ctx, cfg.DatabaseURL)
	if err != nil {
		log.Fatal("database connect failed", zap.Error(err))
	}
	defer db.Close()
	q, err := queue.Connect(cfg.RabbitMQURL)
	if err != nil {
		log.Fatal("rabbitmq connect failed", zap.Error(err))
	}
	defer q.Close()
	provider := email.NewMock(log)
	switch channel {
	case "sms":
		provider = sms.NewMock(log)
	case "fcm":
		provider = fcm.NewMock(log)
	case "websocket":
		provider = wsprovider.NewMock(log)
	}
	if err := delivery.NewWorker(db, q, provider, log).Run(ctx, queueName); err != nil && ctx.Err() == nil {
		log.Fatal("worker stopped", zap.Error(err))
	}
}

func RunScheduler() {
	cfg := config.Load()
	log := logger.New(cfg)
	defer log.Sync()
	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()
	db, err := database.Connect(ctx, cfg.DatabaseURL)
	if err != nil {
		log.Fatal("database connect failed", zap.Error(err))
	}
	defer db.Close()
	q, err := queue.Connect(cfg.RabbitMQURL)
	if err != nil {
		log.Fatal("rabbitmq connect failed", zap.Error(err))
	}
	defer q.Close()
	service := notifications.NewService(db, q, log, cfg)
	ticker := time.NewTicker(cfg.SchedulerEvery)
	defer ticker.Stop()
	log.Info("scheduler running", zap.Duration("interval", cfg.SchedulerEvery))
	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			if err := service.RouteDueScheduled(ctx); err != nil {
				log.Error("scheduler pass failed", zap.Error(err))
			}
		}
	}
}
