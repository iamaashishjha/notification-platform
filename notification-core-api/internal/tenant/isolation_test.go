package tenant

import (
	"testing"
)

func TestTenantOwnershipAllowList(t *testing.T) {
	// Must include all tenant-scoped resource tables
	requiredTables := []string{
		"tenant_features",
		"tenant_channels",
		"tenant_provider_configs",
		"tenant_api_keys",
		"notifications",
		"notification_deliveries",
		"notification_templates",
		"contacts",
		"contact_groups",
		"campaigns",
		"campaign_recipients",
		"in_app_notifications",
		"websocket_sessions",
		"scheduled_jobs",
		"devices",
		"contact_channels",
	}
	for _, table := range requiredTables {
		if !allowedTenantTables[table] {
			t.Errorf("table %q must be in allowedTenantTables for tenant ownership checks", table)
		}
	}

	// Global/system tables that must NOT be in the allow list
	forbiddenTables := []string{
		"users",
		"tenants",
		"roles",
		"permissions",
		"role_permissions",
		"user_roles",
		"tenant_users",
		"auth_sessions",
		"security_events",
		"audit_logs",
	}
	for _, table := range forbiddenTables {
		if allowedTenantTables[table] {
			t.Errorf("global table %q must NOT be in allowedTenantTables", table)
		}
	}
}

func TestCrossTenantAccessError(t *testing.T) {
	if ErrCrossTenantAccess == nil {
		t.Fatal("ErrCrossTenantAccess must be defined")
	}
	if ErrCrossTenantAccess.Error() != "resource does not belong to tenant" {
		t.Fatalf("unexpected error message: %s", ErrCrossTenantAccess.Error())
	}
}

func TestTenantIsolationForbiddenTables(t *testing.T) {
	// Verify the Service is never initialized for global tables
	// These should return the not-allowed error rather than trying to query
	svc := Service{}
	err := svc.EnsureResourceOwned(nil, "users", "some-id", "tenant-1")
	if err == nil {
		t.Fatal("users table should be rejected by EnsureResourceOwned")
	}
	if err.Error() != "tenant ownership check table is not allow-listed" {
		t.Fatalf("unexpected error: %v", err)
	}
}

func TestCrossTenantAccessWithEmptyParams(t *testing.T) {
	svc := Service{}
	if err := svc.EnsureResourceOwned(nil, "notifications", "", "tenant-1"); err != ErrCrossTenantAccess {
		t.Fatal("empty resourceID should return ErrCrossTenantAccess")
	}
	if err := svc.EnsureResourceOwned(nil, "notifications", "some-id", ""); err != ErrCrossTenantAccess {
		t.Fatal("empty tenantID should return ErrCrossTenantAccess")
	}
}
