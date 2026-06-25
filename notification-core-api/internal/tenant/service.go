package tenant

import (
	"context"
	"errors"

	"github.com/jackc/pgx/v5/pgxpool"
)

type Service struct{ db *pgxpool.Pool }

func NewService(db *pgxpool.Pool) Service { return Service{db: db} }

func (s Service) EnsureActive(ctx context.Context, tenantID string) error {
	const q = `SELECT status FROM tenants WHERE id = $1`
	var status string
	if err := s.db.QueryRow(ctx, q, tenantID).Scan(&status); err != nil {
		return err
	}
	if status != "active" {
		return errors.New("tenant is not active")
	}
	return nil
}
