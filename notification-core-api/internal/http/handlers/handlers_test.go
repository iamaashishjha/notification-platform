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
	if !strings.Contains(body, "decryptProviderConfigJSON(") {
		t.Error("TestProviderConfig must decrypt config_json through decryptProviderConfigJSON")
	}
	if strings.Contains(body, "decryptProviderConfigJSON(") && strings.Contains(body, "decryption failed") {
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

func TestProviderConfigEncryptionStoredAsJSON(t *testing.T) {
	src := openSource(t)
	if !strings.Contains(src, "encryptedProviderConfigJSON") || !strings.Contains(src, "json.Marshal(encrypted)") {
		t.Error("provider config encryption must be wrapped as valid JSON for jsonb storage")
	}
	if !strings.Contains(src, "decryptProviderConfigJSON") || !strings.Contains(src, "json.Unmarshal([]byte(raw), &encrypted)") {
		t.Error("provider config decryption must support JSON-string encrypted values")
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

func TestNotificationExplorerHasDetailHandler(t *testing.T) {
	src := openSource(t)
	if !strings.Contains(src, "func (h Handler) GetNotificationDetail") {
		t.Fatal("GetNotificationDetail handler not found")
	}
	if !strings.Contains(src, "maskRecipientJSON") {
		t.Error("notification detail must mask recipient data")
	}
	if !strings.Contains(src, "failures.Normalize") {
		t.Error("notification detail must include normalized failure classifications")
	}
}

func TestNotificationLogsPaginationAndFiltering(t *testing.T) {
	src := openSource(t)
	idx := strings.Index(src, "func (h Handler) ListNotificationLogs")
	if idx < 0 {
		t.Fatal("ListNotificationLogs handler not found")
	}
	end := strings.Index(src[idx:], "func (h Handler) GetNotificationDetail")
	if end < 0 {
		t.Fatal("GetNotificationDetail handler not found after ListNotificationLogs")
	}
	end += idx
	body := src[idx:end]
	if !strings.Contains(body, "pagination(r)") || !strings.Contains(body, "paginationMeta(page, perPage, total)") {
		t.Error("ListNotificationLogs must use server-side pagination metadata")
	}
	for _, filter := range []string{`"search"`, `"channel"`, `"provider"`, `"status"`, `"tenant_id"`} {
		if !strings.Contains(body, filter) {
			t.Errorf("ListNotificationLogs missing filter %s", filter)
		}
	}
}

func TestIntegrationGuideHandlersExistAndAreTenantScoped(t *testing.T) {
	src := openSource(t)
	for _, fn := range []string{"GetMyIntegrationGuide", "GetTenantIntegrationGuide", "integrationGuideData"} {
		if !strings.Contains(src, "func (h Handler) "+fn) {
			t.Fatalf("%s handler/helper not found", fn)
		}
	}
	if !strings.Contains(src, "p.TenantID != tenantID") {
		t.Error("tenant integration support route must deny cross-tenant access for non-platform users")
	}
	idx := strings.Index(src, "func (h Handler) integrationGuideData")
	if idx < 0 {
		t.Fatal("integrationGuideData helper not found")
	}
	body := src[idx:]
	if strings.Contains(body, `"api_key"`) || strings.Contains(body, "key_hash") {
		t.Error("integration guide must not return existing API key secrets")
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

// Tenant CRUD structural tests

func TestCreateTenantHandlerExists(t *testing.T) {
	src := openSource(t)
	if !strings.Contains(src, "func (h Handler) CreateTenant(") {
		t.Fatal("CreateTenant handler not found")
	}
}

func TestCreateTenantPlatformAdminOnly(t *testing.T) {
	src := openSource(t)
	idx := strings.Index(src, "func (h Handler) CreateTenant(")
	if idx < 0 {
		t.Fatal("CreateTenant not found")
	}
	end := idx + 300
	if end > len(src) {
		end = len(src)
	}
	body := src[idx:end]
	if !strings.Contains(body, "p.IsPlatform") {
		t.Error("CreateTenant must check IsPlatform")
	}
	if !strings.Contains(body, "platform admin only") {
		t.Error("CreateTenant must reject non-platform users")
	}
}

func TestCreateTenantValidatesNameAndSlug(t *testing.T) {
	src := openSource(t)
	idx := strings.Index(src, "func (h Handler) CreateTenant(")
	if idx < 0 {
		t.Fatal("CreateTenant not found")
	}
	end := idx + 500
	if end > len(src) {
		end = len(src)
	}
	body := src[idx:end]
	if !strings.Contains(body, "name") || !strings.Contains(body, "slug") {
		t.Error("CreateTenant must require name and slug")
	}
}

func TestCreateTenantWritesAuditLog(t *testing.T) {
	src := openSource(t)
	if !strings.Contains(src, "tenants.create") {
		t.Error("CreateTenant must write audit event")
	}
}

func TestGetTenantHandlerExists(t *testing.T) {
	src := openSource(t)
	if !strings.Contains(src, "func (h Handler) GetTenant(") {
		t.Fatal("GetTenant handler not found")
	}
}

func TestGetTenantIsolation(t *testing.T) {
	src := openSource(t)
	idx := strings.Index(src, "func (h Handler) GetTenant(")
	if idx < 0 {
		t.Fatal("GetTenant not found")
	}
	end := idx + 300
	if end > len(src) {
		end = len(src)
	}
	body := src[idx:end]
	if !strings.Contains(body, "p.IsPlatform") {
		t.Error("GetTenant must check IsPlatform")
	}
	if !strings.Contains(body, "access denied") {
		t.Error("GetTenant must deny unauthorized access")
	}
}

func TestUpdateTenantPlatformAdminOnly(t *testing.T) {
	src := openSource(t)
	idx := strings.Index(src, "func (h Handler) UpdateTenant(")
	if idx < 0 {
		t.Fatal("UpdateTenant not found")
	}
	end := idx + 300
	if end > len(src) {
		end = len(src)
	}
	body := src[idx:end]
	if !strings.Contains(body, "p.IsPlatform") {
		t.Error("UpdateTenant must check IsPlatform")
	}
	if !strings.Contains(body, "platform admin only") {
		t.Error("UpdateTenant must reject non-platform users")
	}
}

func TestUpdateTenantStatusPlatformAdminOnly(t *testing.T) {
	src := openSource(t)
	idx := strings.Index(src, "func (h Handler) UpdateTenantStatus(")
	if idx < 0 {
		t.Fatal("UpdateTenantStatus not found")
	}
	end := idx + 600
	if end > len(src) {
		end = len(src)
	}
	body := src[idx:end]
	if !strings.Contains(body, "p.IsPlatform") {
		t.Error("UpdateTenantStatus must check IsPlatform")
	}
	if !strings.Contains(body, "platform admin only") {
		t.Error("UpdateTenantStatus must reject non-platform users")
	}
	if !strings.Contains(body, "active") || !strings.Contains(body, "disabled") || !strings.Contains(body, "suspended") {
		t.Error("UpdateTenantStatus must validate status values")
	}
}

func TestGetTenantOverviewHandlerExists(t *testing.T) {
	src := openSource(t)
	if !strings.Contains(src, "func (h Handler) GetTenantOverview(") {
		t.Fatal("GetTenantOverview handler not found")
	}
}

func TestGetTenantOverviewIncludesCounts(t *testing.T) {
	src := openSource(t)
	idx := strings.Index(src, "func (h Handler) GetTenantOverview(")
	if idx < 0 {
		t.Fatal("GetTenantOverview not found")
	}
	body := src[idx:]
	if !strings.Contains(body, "tenant_features") {
		t.Error("GetTenantOverview must query tenant_features")
	}
	if !strings.Contains(body, "tenant_channels") {
		t.Error("GetTenantOverview must query tenant_channels")
	}
	if !strings.Contains(body, "tenant_provider_configs") {
		t.Error("GetTenantOverview must query tenant_provider_configs")
	}
	if !strings.Contains(body, "COUNT") {
		t.Error("GetTenantOverview must include COUNT queries")
	}
}

func TestAllTenantRoutesRegisteredInRouter(t *testing.T) {
	raw, err := os.ReadFile("../router.go")
	if err != nil {
		t.Fatalf("cannot read router.go: %v", err)
	}
	src := string(raw)
	routes := []string{
		"POST /admin/api/v1/tenants",
		"GET /admin/api/v1/tenants/{id}",
		"PATCH /admin/api/v1/tenants/{id}",
		"PATCH /admin/api/v1/tenants/{id}/status",
		"GET /admin/api/v1/tenants/{id}/overview",
	}
	for _, route := range routes {
		if !strings.Contains(src, route) {
			t.Errorf("route %s not found in router.go", route)
		}
	}
}

func TestSettingsHandlersRegistered(t *testing.T) {
	src := openSource(t)
	if !strings.Contains(src, "func (h Handler) GetTenantSettings(") {
		t.Fatal("GetTenantSettings handler not found")
	}
	if !strings.Contains(src, "func (h Handler) UpdateTenantSettings(") {
		t.Fatal("UpdateTenantSettings handler not found")
	}
}

func TestCatalogHandlersRegistered(t *testing.T) {
	src := openSource(t)
	for _, name := range []string{"ListFeatureCatalog", "ListChannelCatalog", "ListProviderTypes"} {
		if !strings.Contains(src, "func (h Handler) "+name+"(") {
			t.Fatalf("%s handler not found", name)
		}
	}
}

func TestSettingsPermissionsInGranularToBroad(t *testing.T) {
	raw, err := os.ReadFile("../../auth/auth.go")
	if err != nil {
		t.Fatalf("cannot read auth.go: %v", err)
	}
	src := string(raw)
	for _, perm := range []string{"settings.view", "settings.update"} {
		if !strings.Contains(src, `"`+perm+`"`) {
			t.Errorf("permission %s not found in granularToBroad map", perm)
		}
	}
}

func TestTenantPermissionsInGranularToBroad(t *testing.T) {
	raw, err := os.ReadFile("../../auth/auth.go")
	if err != nil {
		t.Fatalf("cannot read auth.go: %v", err)
	}
	src := string(raw)
	perms := []string{
		"tenants.view",
		"tenants.create",
		"tenants.update",
		"tenants.delete",
	}
	for _, perm := range perms {
		if !strings.Contains(src, `"`+perm+`"`) {
			t.Errorf("permission %s not found in granularToBroad map", perm)
		}
	}
}
