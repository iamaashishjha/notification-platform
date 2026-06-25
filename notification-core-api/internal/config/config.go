package config

import (
	"os"
	"strconv"
	"strings"
	"time"
)

type Config struct {
	AppEnv            string
	HTTPAddr          string
	DatabaseURL       string
	RedisAddr         string
	RabbitMQURL       string
	JWTSecret         string
	CORSOrigins       []string
	SchedulerEvery    time.Duration
	MaxDeliveryTries  int
	LoginMaxFailures  int
	LoginLockout      time.Duration
	RefreshTokenTTL   time.Duration
	AccessTokenTTL    time.Duration
	WebSocketTokenTTL time.Duration
}

func Load() Config {
	return Config{
		AppEnv:            env("APP_ENV", "local"),
		HTTPAddr:          env("HTTP_ADDR", ":8080"),
		DatabaseURL:       env("DATABASE_URL", "postgres://notification:notification@postgres:5432/notification?sslmode=disable"),
		RedisAddr:         env("REDIS_ADDR", "redis:6379"),
		RabbitMQURL:       env("RABBITMQ_URL", "amqp://notification:notification@rabbitmq:5672/"),
		JWTSecret:         env("JWT_SECRET", "local-dev-change-me"),
		CORSOrigins:       strings.Split(env("CORS_ORIGINS", "http://localhost:3000"), ","),
		SchedulerEvery:    time.Duration(envInt("SCHEDULER_INTERVAL_SECONDS", 15)) * time.Second,
		MaxDeliveryTries:  envInt("MAX_DELIVERY_ATTEMPTS", 3),
		LoginMaxFailures:  envInt("LOGIN_MAX_FAILURES", 5),
		LoginLockout:      time.Duration(envInt("LOGIN_LOCKOUT_MINUTES", 15)) * time.Minute,
		RefreshTokenTTL:   time.Duration(envInt("REFRESH_TOKEN_TTL_HOURS", 24*14)) * time.Hour,
		AccessTokenTTL:    time.Duration(envInt("ACCESS_TOKEN_TTL_MINUTES", 15)) * time.Minute,
		WebSocketTokenTTL: time.Duration(envInt("WEBSOCKET_TOKEN_TTL_SECONDS", 60)) * time.Second,
	}
}

func env(key, fallback string) string {
	if value := strings.TrimSpace(os.Getenv(key)); value != "" {
		return value
	}
	return fallback
}

func envInt(key string, fallback int) int {
	raw := strings.TrimSpace(os.Getenv(key))
	if raw == "" {
		return fallback
	}
	value, err := strconv.Atoi(raw)
	if err != nil {
		return fallback
	}
	return value
}
