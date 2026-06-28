package ratelimit

import (
	"context"
	"fmt"
	"sync"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/redis/go-redis/v9"
)

type Service struct {
	redis *redis.Client
	db    *pgxpool.Pool
	mu    sync.RWMutex
	cache map[string]channelLimits
}

type channelLimits struct {
	ratePerSecond int
	dailyQuota    int
	fetched       time.Time
}

func NewService(redisAddr string) Service {
	return Service{redis: redis.NewClient(&redis.Options{Addr: redisAddr}), cache: make(map[string]channelLimits)}
}

func (s *Service) SetDB(db *pgxpool.Pool) { s.db = db }

func (s Service) Allow(ctx context.Context, tenantID, channel string) (bool, error) {
	if tenantID == "" || channel == "" {
		return false, nil
	}
	ratePS, dailyQuota := s.loadLimits(ctx, tenantID, channel)
	if ok, err := s.AllowKey(ctx, fmt.Sprintf("tenant:%s:rate", tenantID), int64(ratePS), time.Second); err != nil || !ok {
		return ok, err
	}
	day := time.Now().UTC().Format("2006-01-02")
	return s.AllowKey(ctx, fmt.Sprintf("tenant:%s:daily:%s:%s", tenantID, channel, day), int64(dailyQuota), 24*time.Hour)
}

func (s Service) loadLimits(ctx context.Context, tenantID, channel string) (ratePS, dailyQuota int) {
	ratePS = 100
	dailyQuota = 50000
	if s.db == nil {
		return
	}
	cacheKey := tenantID + ":" + channel
	s.mu.RLock()
	if cached, ok := s.cache[cacheKey]; ok && time.Since(cached.fetched) < 5*time.Minute {
		s.mu.RUnlock()
		return cached.ratePerSecond, cached.dailyQuota
	}
	s.mu.RUnlock()
	s.mu.Lock()
	defer s.mu.Unlock()
	if cached, ok := s.cache[cacheKey]; ok && time.Since(cached.fetched) < 5*time.Minute {
		return cached.ratePerSecond, cached.dailyQuota
	}
	_ = s.db.QueryRow(ctx, `SELECT rate_limit_per_second, daily_quota FROM tenant_channels WHERE tenant_id = $1 AND channel = $2`, tenantID, channel).Scan(&ratePS, &dailyQuota)
	if ratePS <= 0 {
		ratePS = 100
	}
	if dailyQuota <= 0 {
		dailyQuota = 50000
	}
	s.cache[cacheKey] = channelLimits{ratePerSecond: ratePS, dailyQuota: dailyQuota, fetched: time.Now()}
	return
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
