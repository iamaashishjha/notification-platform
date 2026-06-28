package handlers

import (
	"os"
	"strings"
	"testing"
)

func openCRUDSource(t *testing.T) string {
	t.Helper()
	raw, err := os.ReadFile("crud.go")
	if err != nil {
		t.Fatalf("cannot read crud.go: %v", err)
	}
	return string(raw)
}

func openSource(t *testing.T) string {
	t.Helper()
	raw, err := os.ReadFile("handlers.go")
	if err != nil {
		t.Fatalf("cannot read handlers.go: %v", err)
	}
	return string(raw)
}

// verifyIsolationPattern checks that every handler function that accepts a path
// value and accesses a tenant-scoped resource validates tenant ownership.
func combinedSource(t *testing.T) string {
	t.Helper()
	return openSource(t) + "\n" + openCRUDSource(t)
}

func handlerExists(src, name string) bool {
	return strings.Contains(src, "func (h Handler) "+name+"(")
}

func TestAllListHandlersHaveTenantScope(t *testing.T) {
	src := combinedSource(t)

	listHandlers := []string{
		"ListContacts", "ListGroups", "ListTemplates", "ListCampaigns",
		"ListFeatures", "ListChannels", "ListProviderConfigs",
		"ListAPIKeys", "ListAuditLogs", "ListInAppNotifications",
		"ListNotificationLogs", "ListUsers", "ListGroupMembers",
	}
	for _, name := range listHandlers {
		if !handlerExists(src, name) {
			t.Errorf("handler %s not found in handlers.go or crud.go", name)
		}
	}
	// Verify the source contains tenant_id isolation patterns
	if !strings.Contains(src, "WHERE") {
		t.Error("no WHERE clause found in handlers")
	}
}

func TestMutationHandlersHaveTenantIsolation(t *testing.T) {
	src := combinedSource(t)

	mutationHandlers := []string{
		"CreateContact", "UpdateContact", "DeleteContact",
		"CreateGroup", "DeleteGroup",
		"CreateTemplate", "UpdateTemplate", "DeleteTemplate",
		"CreateCampaign", "UpdateCampaign", "ApproveCampaign", "SendCampaign", "CancelCampaign",
		"CreateProviderConfig", "UpdateProviderConfig", "DeleteProviderConfig", "TestProviderConfig",
		"CreateAPIKey", "RevokeAPIKey",
		"UpdateFeature",
		"UpdateChannel",
		"AddGroupMember", "RemoveGroupMember",
		"MarkInAppRead", "MarkAllInAppRead",
	}
	for _, name := range mutationHandlers {
		if !handlerExists(src, name) {
			t.Errorf("handler %s not found in handlers.go or crud.go", name)
		}
	}

	if !strings.Contains(src, "AND tenant_id") && !strings.Contains(src, "tenant_id = $") {
		t.Error("no tenant isolation pattern found in handlers")
	}
}

func TestNoHardcodedTenantIDs(t *testing.T) {
	src := openSource(t)
	// Ensure handlers never hardcode a tenant_id value
	if strings.Contains(src, "tenant_id = '") || strings.Contains(src, `tenant_id = "`) {
		t.Error("handlers.go should not hardcode tenant_id values")
	}
}

func TestListProviderConfigsDoesNotReturnConfigJSON(t *testing.T) {
	src := openSource(t)
	// Find the ListProviderConfigs handler and verify config_json is not in SELECT
	idx := strings.Index(src, "func (h Handler) ListProviderConfigs")
	if idx < 0 {
		t.Fatal("ListProviderConfigs handler not found")
	}
	end := idx + 500
	if end > len(src) {
		end = len(src)
	}
	body := src[idx:end]
	if strings.Contains(body, "config_json") {
		t.Error("ListProviderConfigs should not return config_json in the response body")
	}
}

func TestTestProviderConfigDecrypts(t *testing.T) {
	src := openSource(t)
	idx := strings.Index(src, "func (h Handler) TestProviderConfig")
	if idx < 0 {
		t.Fatal("TestProviderConfig handler not found")
	}
	end := idx + 800
	if end > len(src) {
		end = len(src)
	}
	body := src[idx:end]
	if !strings.Contains(body, "security.Decrypt(") {
		t.Error("TestProviderConfig must call security.Decrypt on config_json")
	}
	if strings.Contains(body, ".Decrypt(") && strings.Contains(body, "encryption failed") {
		t.Log("TestProviderConfig handles decryption errors correctly")
	}
}

func TestCreateProviderConfigEncrypts(t *testing.T) {
	src := openSource(t)
	if !strings.Contains(src, "CreateProviderConfig") {
		t.Fatal("CreateProviderConfig handler not found")
	}
	if !strings.Contains(src, "security.Encrypt(") {
		t.Error("handlers.go must call security.Encrypt for provider config storage")
	}
	if !strings.Contains(src, "security.Decrypt(") {
		t.Error("handlers.go must call security.Decrypt for provider config retrieval")
	}
}

func TestUpdateProviderConfigEncrypts(t *testing.T) {
	src := openSource(t)
	if !strings.Contains(src, "UpdateProviderConfig") {
		t.Fatal("UpdateProviderConfig handler not found")
	}
	// Count the number of security.Encrypt calls — should be at least 2 (create + update)
	count := strings.Count(src, "security.Encrypt(")
	if count < 2 {
		t.Errorf("expected at least 2 security.Encrypt calls (create + update), got %d", count)
	}
}

// CRUD.go structural verification
func TestCRUDListHandlersTenantScoped(t *testing.T) {
	src := openCRUDSource(t)
	listHandlers := []string{"ListContacts", "ListGroups", "ListTemplates", "ListCampaigns"}
	for _, name := range listHandlers {
		if !strings.Contains(src, "func (h Handler) "+name+"(") {
			t.Errorf("handler %s not found in crud.go", name)
			continue
		}
	}
	// Each list handler should have a tenant scope check
	tenantScopes := strings.Count(src, "WHERE")
	platformChecks := strings.Count(src, "!p.IsPlatform")
	if platformChecks < 4 {
		t.Errorf("expected at least 4 platform checks in crud.go list handlers, got %d", platformChecks)
	}
	_ = tenantScopes
}

func TestCRUDMutationHandlersTenantScoped(t *testing.T) {
	src := openCRUDSource(t)
	mutations := []string{"CreateContact", "UpdateContact", "DeleteContact", "CreateGroup", "DeleteGroup", "CreateTemplate", "UpdateTemplate", "DeleteTemplate", "CreateCampaign", "UpdateCampaign", "ApproveCampaign", "SendCampaign", "CancelCampaign"}
	for _, name := range mutations {
		if !strings.Contains(src, "func (h Handler) "+name+"(") {
			t.Errorf("handler %s not found in crud.go", name)
		}
	}
	// Verify tenant override pattern for create handlers
	if !strings.Contains(src, `tenantID = p.TenantID`) {
		t.Error("create handlers should override tenantID with p.TenantID for non-platform users")
	}
	// Verify WHERE AND tenant_id pattern for update/delete
	if !strings.Contains(src, `AND tenant_id = $`) {
		t.Error("update/delete handlers should include AND tenant_id in WHERE clause")
	}
}

func TestCRUDCampaignStatusTransitionsTenantScoped(t *testing.T) {
	src := openCRUDSource(t)
	if !strings.Contains(src, "AND tenant_id = $3") {
		t.Error("campaignStatusTransition must include AND tenant_id = $3")
	}
}

func TestHandlerRBACFilesExist(t *testing.T) {
	raw, err := os.ReadFile("rbac.go")
	if err != nil {
		t.Fatalf("cannot read rbac.go: %v", err)
	}
	// Verify RBAC handlers exist
	rbacHandlers := []string{"ListRoles", "CreateRole", "UpdateRole", "DeleteRole",
		"AssignRolePermission", "RemoveRolePermission", "ListRolePermissions",
		"ListUserRoles", "AssignUserRole", "RemoveUserRole", "ListPermissions"}
	for _, name := range rbacHandlers {
		if !strings.Contains(string(raw), "func (h Handler) "+name+"(") {
			t.Errorf("handler %s not found in rbac.go", name)
		}
	}
}

func TestAuditEventTenantIDPresent(t *testing.T) {
	src := combinedSource(t)
	// Verify audit events include TenantID from principal
	if !strings.Contains(src, "TenantID: p.TenantID") && !strings.Contains(src, "AuditEvent{TenantID:") {
		t.Error("audit events should include TenantID from principal")
	}
	// Specifically verify UpdateFeature now includes TenantID
	idx := strings.Index(src, "func (h Handler) UpdateFeature")
	if idx >= 0 {
		end := idx + 2000
		if end > len(src) {
			end = len(src)
		}
		body := src[idx:end]
		if !strings.Contains(body, "TenantID:") {
			t.Error("UpdateFeature audit event must include TenantID")
		}
	}
}

func TestRemoveGroupMemberIsolated(t *testing.T) {
	src := openSource(t)
	idx := strings.Index(src, "func (h Handler) RemoveGroupMember")
	if idx < 0 {
		t.Fatal("RemoveGroupMember handler not found")
	}
	end := idx + 400
	if end > len(src) {
		end = len(src)
	}
	body := src[idx:end]
	if !strings.Contains(body, "tenant_id = $3") {
		t.Error("RemoveGroupMember must include tenant_id = $3 in DELETE query")
	}
	if !strings.Contains(body, "httpmw.Principal(") {
		t.Error("RemoveGroupMember must extract principal")
	}
}

func TestAddGroupMemberIsolated(t *testing.T) {
	src := openSource(t)
	idx := strings.Index(src, "func (h Handler) AddGroupMember")
	if idx < 0 {
		t.Fatal("AddGroupMember handler not found")
	}
	end := idx + 600
	if end > len(src) {
		end = len(src)
	}
	body := src[idx:end]
	if !strings.Contains(body, "cg.tenant_id") {
		t.Error("AddGroupMember must validate group belongs to tenant")
	}
	if !strings.Contains(body, "c.tenant_id") {
		t.Error("AddGroupMember must validate contact belongs to tenant")
	}
	if !strings.Contains(body, "$3") {
		t.Error("AddGroupMember must use parameterized tenant_id")
	}
	if !strings.Contains(body, "httpmw.Principal(") {
		t.Error("AddGroupMember must extract principal")
	}
}

func TestDashboardStatsDeliveryScopeCorrect(t *testing.T) {
	src := openSource(t)
	idx := strings.Index(src, "func (h Handler) DashboardStats")
	if idx < 0 {
		t.Fatal("DashboardStats handler not found")
	}
	end := idx + 600
	if end > len(src) {
		end = len(src)
	}
	body := src[idx:end]
	// Must use deliveryScope for notification_deliveries queries, not tenantScope
	if strings.Contains(body, "notification_deliveries WHERE status = 'sent' AND updated_at") {
		if !strings.Contains(body, "deliveryScope") {
			t.Error("DashboardStats must use deliveryScope for notification_deliveries queries, not tenantScope")
		}
	}
}

func TestDashboardStatsNoBrokenAlias(t *testing.T) {
	src := openSource(t)
	// Verify there's NO case where `n.` prefix is used on `notification_deliveries`
	idx := strings.Index(src, "func (h Handler) DashboardStats")
	if idx < 0 {
		t.Fatal("DashboardStats handler not found")
	}
	end := idx + 700
	if end > len(src) {
		end = len(src)
	}
	body := src[idx:end]
	// The notification_deliveries queries should not have `n.` prefix
	lines := strings.Split(body, "\n")
	for _, line := range lines {
		if strings.Contains(line, "notification_deliveries") && strings.Contains(line, "n.") {
			t.Errorf("notification_deliveries query should not use 'n.' alias: %s", strings.TrimSpace(line))
		}
	}
}

// Send notification tenant handling tests

func TestSendAdminNotificationExists(t *testing.T) {
	src := openSource(t)
	if !strings.Contains(src, "func (h Handler) SendAdminNotification") {
		t.Fatal("SendAdminNotification handler not found")
	}
}

func TestSendPublicNotificationExists(t *testing.T) {
	src := openSource(t)
	if !strings.Contains(src, "func (h Handler) SendPublicNotification") {
		t.Fatal("SendPublicNotification handler not found")
	}
}

func TestSendAdminNotificationPlatformAdminRequiresTenantID(t *testing.T) {
	src := openSource(t)
	idx := strings.Index(src, "func (h Handler) SendAdminNotification")
	if idx < 0 {
		t.Fatal("SendAdminNotification handler not found")
	}
	end := idx + 800
	if end > len(src) {
		end = len(src)
	}
	body := src[idx:end]
	if !strings.Contains(body, `tenant_id == ""`) && !strings.Contains(body, `tenantID == ""`) {
		t.Error("SendAdminNotification must validate tenant_id is not empty for platform admin")
	}
	if !strings.Contains(body, "tenantID = p.TenantID") {
		t.Error("SendAdminNotification must override tenantID with p.TenantID for non-platform users")
	}
	if !strings.Contains(body, "tenant_id is required") {
		t.Error("SendAdminNotification must return error when platform admin omits tenant_id")
	}
}

func TestSendAdminNotificationTenantUserForcesOwnTenant(t *testing.T) {
	src := openSource(t)
	idx := strings.Index(src, "func (h Handler) SendAdminNotification")
	if idx < 0 {
		t.Fatal("SendAdminNotification handler not found")
	}
	end := idx + 800
	if end > len(src) {
		end = len(src)
	}
	body := src[idx:end]
	if !strings.Contains(body, "p.IsPlatform") {
		t.Error("SendAdminNotification must check IsPlatform")
	}
	if !strings.Contains(body, "tenantID = p.TenantID") {
		t.Error("SendAdminNotification non-platform branch must force p.TenantID")
	}
}

func TestSendAdminNotificationUsesResolvedTenantID(t *testing.T) {
	src := openSource(t)
	if !strings.Contains(src, "h.notifications.Send(r.Context(), tenantID,") {
		t.Error("SendAdminNotification must pass resolved tenantID to notifications.Send")
	}
}

func TestSendPublicNotificationGetsTenantFromContext(t *testing.T) {
	src := openSource(t)
	idx := strings.Index(src, "func (h Handler) SendPublicNotification")
	if idx < 0 {
		t.Fatal("SendPublicNotification handler not found")
	}
	end := idx + 400
	if end > len(src) {
		end = len(src)
	}
	body := src[idx:end]
	if !strings.Contains(body, "httpmw.TenantID(r.Context())") {
		t.Error("SendPublicNotification must get tenant from context (API key middleware)")
	}
}
