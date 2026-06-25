package features

import (
	"context"

	"github.com/jackc/pgx/v5/pgxpool"
)

type Service struct{ db *pgxpool.Pool }

func NewService(db *pgxpool.Pool) Service { return Service{db: db} }

func (s Service) Enabled(ctx context.Context, tenantID, key string) (bool, error) {
	const q = `SELECT enabled FROM tenant_features WHERE tenant_id = $1 AND feature_key = $2`
	var enabled bool
	if err := s.db.QueryRow(ctx, q, tenantID, key).Scan(&enabled); err != nil {
		return false, err
	}
	return enabled, nil
}
