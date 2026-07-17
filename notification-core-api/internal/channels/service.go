package channels

import (
	"context"
	"errors"

	"github.com/jackc/pgx/v5/pgxpool"
)

type Config struct {
	Enabled            bool
	Direction          string
	RateLimitPerSecond int
	DailyQuota         int
	Provider           string
}

type Service struct{ db *pgxpool.Pool }

func NewService(db *pgxpool.Pool) Service { return Service{db: db} }

func (s Service) ValidateSend(ctx context.Context, tenantID, channel, direction string) error {
	const q = `
SELECT tc.enabled, tc.direction, COALESCE(pp.provider, '')
FROM tenant_channels tc
JOIN platform_channels pc ON pc.channel = tc.channel AND pc.enabled = true
LEFT JOIN tenant_provider_configs tpc ON tpc.tenant_id = tc.tenant_id AND tpc.channel = tc.channel AND tpc.is_default = true AND tpc.status = 'active'
LEFT JOIN platform_providers pp ON pp.provider = tpc.provider AND pp.enabled = true
WHERE tc.tenant_id = $1 AND tc.channel = $2`
	var cfg Config
	if err := s.db.QueryRow(ctx, q, tenantID, channel).Scan(&cfg.Enabled, &cfg.Direction, &cfg.Provider); err != nil {
		return err
	}
	if !cfg.Enabled {
		return errors.New("channel disabled")
	}
	if cfg.Direction != direction && cfg.Direction != "two_way" {
		return errors.New("channel direction not allowed")
	}
	if cfg.Provider == "" {
		return errors.New("provider not configured")
	}
	return nil
}
