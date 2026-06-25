package main

import (
	"context"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"notification-core-api/internal/auth"
	"notification-core-api/internal/config"
	"notification-core-api/internal/database"
	httpapp "notification-core-api/internal/http"
	"notification-core-api/internal/http/handlers"
	"notification-core-api/internal/logger"
	"notification-core-api/internal/notifications"
	"notification-core-api/internal/queue"

	"go.uber.org/zap"
)

func main() {
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

	authSvc := auth.NewService(db, cfg)
	notificationSvc := notifications.NewService(db, q, log, cfg)
	h := handlers.New(db, authSvc, notificationSvc)
	server := &http.Server{Addr: cfg.HTTPAddr, Handler: httpapp.NewRouter(cfg, log, h, authSvc), ReadHeaderTimeout: 5 * time.Second}

	go func() {
		log.Info("api listening", zap.String("addr", cfg.HTTPAddr))
		if err := server.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			log.Fatal("api failed", zap.Error(err))
		}
	}()

	<-ctx.Done()
	shutdownCtx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	_ = server.Shutdown(shutdownCtx)
}
