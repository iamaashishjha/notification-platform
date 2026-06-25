package ratelimit

import (
	"context"
	"fmt"
	"time"

	"github.com/redis/go-redis/v9"
)

type Service struct {
	redis *redis.Client
}

func NewService(redisAddr string) Service {
	return Service{redis: redis.NewClient(&redis.Options{Addr: redisAddr})}
}

func (s Service) Allow(ctx context.Context, tenantID, channel string) (bool, error) {
	if tenantID == "" || channel == "" {
		return false, nil
	}
	if ok, err := s.AllowKey(ctx, fmt.Sprintf("tenant:%s:rate", tenantID), 100, time.Second); err != nil || !ok {
		return ok, err
	}
	if ok, err := s.AllowKey(ctx, fmt.Sprintf("tenant:%s:channel:%s:rate", tenantID, channel), 20, time.Second); err != nil || !ok {
		return ok, err
	}
	day := time.Now().UTC().Format("2006-01-02")
	return s.AllowKey(ctx, fmt.Sprintf("tenant:%s:daily:%s:%s", tenantID, channel, day), 50000, 24*time.Hour)
}

func (s Service) AllowKey(ctx context.Context, key string, limit int64, window time.Duration) (bool, error) {
	count, err := s.redis.Incr(ctx, key).Result()
	if err != nil {
		return false, err
	}
	if count == 1 {
		if err := s.redis.Expire(ctx, key, window).Err(); err != nil {
			return false, err
		}
	}
	return count <= limit, nil
}
