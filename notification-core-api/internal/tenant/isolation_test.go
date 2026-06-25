package tenant

import "testing"

func TestTenantOwnershipAllowList(t *testing.T) {
	if !allowedTenantTables["notifications"] {
		t.Fatal("notifications must be available for tenant ownership checks")
	}
	if allowedTenantTables["users"] {
		t.Fatal("global users table must not be checked through tenant-owned resource helper")
	}
}
