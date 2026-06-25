package tenant

import (
	"context"
	"errors"

	"github.com/jackc/pgx/v5"
)

var ErrCrossTenantAccess = errors.New("resource does not belong to tenant")

func (s Service) EnsureResourceOwned(ctx context.Context, tableName, resourceID, tenantID string) error {
	if tenantID == "" || resourceID == "" {
		return ErrCrossTenantAccess
	}
	if !allowedTenantTables[tableName] {
		return errors.New("tenant ownership check table is not allow-listed")
	}
	sql := "SELECT tenant_id::text FROM " + tableName + " WHERE id = $1"
	var ownerTenantID string
	if err := s.db.QueryRow(ctx, sql, resourceID).Scan(&ownerTenantID); err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return ErrCrossTenantAccess
		}
		return err
	}
	if ownerTenantID != tenantID {
		return ErrCrossTenantAccess
	}
	return nil
}

var allowedTenantTables = map[string]bool{
	"tenant_features":         true,
	"tenant_channels":         true,
	"tenant_provider_configs": true,
	"tenant_api_keys":         true,
	"contacts":                true,
	"contact_channels":        true,
	"contact_groups":          true,
	"devices":                 true,
	"websocket_sessions":      true,
	"notification_templates":  true,
	"notifications":           true,
	"notification_deliveries": true,
	"in_app_notifications":    true,
	"campaigns":               true,
	"campaign_recipients":     true,
	"scheduled_jobs":          true,
}
