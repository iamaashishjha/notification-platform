package queue

import (
	"context"
	"errors"
	"fmt"
	"regexp"
	"strings"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

var queueSlugPattern = regexp.MustCompile(`[^a-z0-9]+`)

type Control struct {
	ID                string `json:"id"`
	TenantID          string `json:"tenant_id"`
	TenantName        string `json:"tenant_name,omitempty"`
	Channel           string `json:"channel"`
	QueueName         string `json:"queue_name"`
	Status            string `json:"status"`
	MaxAttempts       int    `json:"max_attempts"`
	RetryDelaySeconds int    `json:"retry_delay_seconds"`
	Notes             string `json:"notes"`
	UpdatedAt         any    `json:"updated_at"`
}

func NameForTenant(slug, channel string) string {
	slug = strings.Trim(queueSlugPattern.ReplaceAllString(strings.ToLower(slug), "-"), "-")
	if slug == "" {
		slug = "tenant"
	}
	return fmt.Sprintf("tenant.%s.%s", slug, strings.ToLower(channel))
}

func EnsureControl(ctx context.Context, db *pgxpool.Pool, tenantID, channel string) (Control, error) {
	var slug string
	if err := db.QueryRow(ctx, `SELECT slug FROM tenants WHERE id = $1`, tenantID).Scan(&slug); err != nil {
		return Control{}, err
	}
	queueName := NameForTenant(slug, channel)
	_, err := db.Exec(ctx, `
INSERT INTO tenant_queue_controls (tenant_id, channel, queue_name)
VALUES ($1,$2,$3)
ON CONFLICT (tenant_id, channel) DO NOTHING`, tenantID, channel, queueName)
	if err != nil {
		return Control{}, err
	}
	return GetControl(ctx, db, tenantID, channel)
}

func GetControl(ctx context.Context, db *pgxpool.Pool, tenantID, channel string) (Control, error) {
	var c Control
	err := db.QueryRow(ctx, `
SELECT tqc.id::text, tqc.tenant_id::text, tqc.channel, tqc.queue_name, tqc.status, tqc.max_attempts, tqc.retry_delay_seconds, tqc.notes, tqc.updated_at
FROM tenant_queue_controls tqc
WHERE tqc.tenant_id = $1 AND tqc.channel = $2`, tenantID, channel).Scan(&c.ID, &c.TenantID, &c.Channel, &c.QueueName, &c.Status, &c.MaxAttempts, &c.RetryDelaySeconds, &c.Notes, &c.UpdatedAt)
	if errors.Is(err, pgx.ErrNoRows) {
		return EnsureControl(ctx, db, tenantID, channel)
	}
	return c, err
}
