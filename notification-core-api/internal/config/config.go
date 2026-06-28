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
	EncryptionKey    string
}

func Load() Config {
	httpAddr := env("HTTP_ADDR", "")
	if httpAddr == "" {
		httpAddr = ":" + env("APP_PORT", "8080")
	}
	redisAddr := env("REDIS_ADDR", "")
	if redisAddr == "" {
		redisAddr = redisAddress(env("REDIS_URL", "redis://redis:6379/0"))
	}
	return Config{
		AppEnv:            env("APP_ENV", "local"),
		HTTPAddr:          httpAddr,
		DatabaseURL:       env("DATABASE_URL", "postgres://notification:notification@postgres:5432/notification?sslmode=disable"),
		RedisAddr:         redisAddr,
		RabbitMQURL:       env("RABBITMQ_URL", "amqp://notification:notification@rabbitmq:5672/"),
		JWTSecret:         env("JWT_SECRET", "local-dev-change-me"),
		CORSOrigins:       strings.Split(env("CORS_ORIGINS", env("CORS_ALLOWED_ORIGINS", "http://localhost:3000")), ","),
		SchedulerEvery:    time.Duration(envInt("SCHEDULER_INTERVAL_SECONDS", 15)) * time.Second,
		MaxDeliveryTries:  envInt("MAX_DELIVERY_ATTEMPTS", 3),
		LoginMaxFailures:  envInt("LOGIN_MAX_FAILURES", 5),
		LoginLockout:      time.Duration(envInt("LOGIN_LOCKOUT_MINUTES", 15)) * time.Minute,
		RefreshTokenTTL:   time.Duration(envInt("REFRESH_TOKEN_TTL_HOURS", 24*14)) * time.Hour,
		AccessTokenTTL:    time.Duration(envInt("ACCESS_TOKEN_TTL_MINUTES", 15)) * time.Minute,
		WebSocketTokenTTL: time.Duration(envInt("WEBSOCKET_TOKEN_TTL_SECONDS", 60)) * time.Second,
		EncryptionKey:     env("APP_ENCRYPTION_KEY", "local-dev-change-me-must-be-32-bytes!"),
	}
}

func redisAddress(raw string) string {
	raw = strings.TrimSpace(raw)
	raw = strings.TrimPrefix(raw, "redis://")
	if at := strings.LastIndex(raw, "@"); at >= 0 {
		raw = raw[at+1:]
	}
	if slash := strings.Index(raw, "/"); slash >= 0 {
		raw = raw[:slash]
	}
	if raw == "" {
		return "redis:6379"
	}
	return raw
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
