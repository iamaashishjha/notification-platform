package http

import (
	"net/http"

	"notification-core-api/internal/auth"
	"notification-core-api/internal/config"
	"notification-core-api/internal/http/handlers"
	"notification-core-api/internal/http/middleware"
	"notification-core-api/internal/metrics"

	"go.uber.org/zap"
)

func NewRouter(cfg config.Config, log *zap.Logger, h handlers.Handler, authSvc auth.Service, metricsHandler http.HandlerFunc, metricsCollector ...*metrics.Collector) http.Handler {
	mux := http.NewServeMux()

	// Public endpoints
	mux.HandleFunc("GET /healthz", h.Health)
	mux.HandleFunc("GET /readyz", h.Ready)
	mux.HandleFunc("POST /admin/api/v1/auth/login", h.Login)
	mux.HandleFunc("POST /admin/api/v1/auth/refresh", h.Refresh)

	// Password reset (public)
	mux.HandleFunc("POST /admin/api/v1/auth/password/forgot", h.ForgotPassword)
	mux.HandleFunc("POST /admin/api/v1/auth/password/reset", h.ResetPassword)

	// Email verification (request requires JWT, verify is public)
	mux.Handle("POST /admin/api/v1/auth/email/verify/request", middleware.JWT(authSvc)(http.HandlerFunc(h.RequestEmailVerification)))
	mux.HandleFunc("POST /admin/api/v1/auth/email/verify", h.VerifyEmail)

	// JWT-protected admin routes
	mux.Handle("GET /admin/api/v1/auth/me", middleware.JWT(authSvc)(http.HandlerFunc(h.Me)))
	mux.Handle("POST /admin/api/v1/auth/logout", middleware.Chain(authSvc, "notifications.view", h.Logout))
	mux.Handle("POST /admin/api/v1/ws/token", middleware.Chain(authSvc, "notifications.view", h.WebSocketToken))
	mux.Handle("POST /admin/api/v1/notifications/send", middleware.Chain(authSvc, "notifications.send", h.SendAdminNotification))
	mux.Handle("GET /admin/api/v1/notifications", middleware.Chain(authSvc, "notifications.view", h.ListNotificationLogs))
	mux.Handle("GET /admin/api/v1/tenants", middleware.Chain(authSvc, "tenants.view", h.ListTenants))
	mux.Handle("POST /admin/api/v1/tenants", middleware.Chain(authSvc, "tenants.create", h.CreateTenant))
	mux.Handle("GET /admin/api/v1/tenants/{id}", middleware.Chain(authSvc, "tenants.view", h.GetTenant))
	mux.Handle("PATCH /admin/api/v1/tenants/{id}", middleware.Chain(authSvc, "tenants.update", h.UpdateTenant))
	mux.Handle("PATCH /admin/api/v1/tenants/{id}/status", middleware.Chain(authSvc, "tenants.update", h.UpdateTenantStatus))
	mux.Handle("GET /admin/api/v1/tenants/{id}/overview", middleware.Chain(authSvc, "tenants.view", h.GetTenantOverview))

	// Dashboard
	mux.Handle("GET /admin/api/v1/dashboard/stats", middleware.Chain(authSvc, "notifications.view", h.DashboardStats))

	// Audit logs
	mux.Handle("GET /admin/api/v1/audit-logs", middleware.Chain(authSvc, "audit_logs.view", h.ListAuditLogs))

	// API keys
	mux.Handle("GET /admin/api/v1/api-keys", middleware.Chain(authSvc, "api_keys.view", h.ListAPIKeys))
	mux.Handle("POST /admin/api/v1/api-keys", middleware.Chain(authSvc, "api_keys.create", h.CreateAPIKey))
	mux.Handle("DELETE /admin/api/v1/api-keys/{id}", middleware.Chain(authSvc, "api_keys.revoke", h.RevokeAPIKey))

	// Users
	mux.Handle("GET /admin/api/v1/users", middleware.Chain(authSvc, "users.view", h.ListUsers))
	mux.Handle("POST /admin/api/v1/users", middleware.Chain(authSvc, "users.create", h.CreateUser))
	mux.Handle("PUT /admin/api/v1/users/{id}", middleware.Chain(authSvc, "users.update", h.UpdateUser))

	// Roles
	mux.Handle("GET /admin/api/v1/roles", middleware.Chain(authSvc, "roles.manage", h.ListRoles))
	mux.Handle("POST /admin/api/v1/roles", middleware.Chain(authSvc, "roles.manage", h.CreateRole))
	mux.Handle("PUT /admin/api/v1/roles/{id}", middleware.Chain(authSvc, "roles.manage", h.UpdateRole))
	mux.Handle("DELETE /admin/api/v1/roles/{id}", middleware.Chain(authSvc, "roles.manage", h.DeleteRole))
	mux.Handle("GET /admin/api/v1/roles/{id}/permissions", middleware.Chain(authSvc, "roles.manage", h.ListRolePermissions))
	mux.Handle("POST /admin/api/v1/roles/{id}/permissions", middleware.Chain(authSvc, "roles.manage", h.AssignRolePermission))
	mux.Handle("DELETE /admin/api/v1/roles/{role_id}/permissions/{perm_id}", middleware.Chain(authSvc, "roles.manage", h.RemoveRolePermission))

	// User role assignments
	mux.Handle("GET /admin/api/v1/users/{user_id}/roles", middleware.Chain(authSvc, "roles.manage", h.ListUserRoles))
	mux.Handle("POST /admin/api/v1/users/{user_id}/roles", middleware.Chain(authSvc, "roles.manage", h.AssignUserRole))
	mux.Handle("DELETE /admin/api/v1/users/{user_id}/roles/{role_id}", middleware.Chain(authSvc, "roles.manage", h.RemoveUserRole))

	// Permissions
	mux.Handle("GET /admin/api/v1/permissions", middleware.Chain(authSvc, "permissions.manage", h.ListPermissions))

	// Features
	mux.Handle("GET /admin/api/v1/features", middleware.Chain(authSvc, "features.view", h.ListFeatures))
	mux.Handle("PUT /admin/api/v1/features/{id}", middleware.Chain(authSvc, "features.update", h.UpdateFeature))

	// Channels
	mux.Handle("GET /admin/api/v1/channels", middleware.Chain(authSvc, "channels.view", h.ListChannels))
	mux.Handle("PUT /admin/api/v1/channels/{id}", middleware.Chain(authSvc, "channels.update", h.UpdateChannel))

	// Provider configs
	mux.Handle("GET /admin/api/v1/providers", middleware.Chain(authSvc, "providers.view", h.ListProviderConfigs))
	mux.Handle("POST /admin/api/v1/providers", middleware.Chain(authSvc, "providers.create", h.CreateProviderConfig))
	mux.Handle("PUT /admin/api/v1/providers/{id}", middleware.Chain(authSvc, "providers.update", h.UpdateProviderConfig))
	mux.Handle("DELETE /admin/api/v1/providers/{id}", middleware.Chain(authSvc, "providers.delete", h.DeleteProviderConfig))
	mux.Handle("POST /admin/api/v1/providers/{id}/test", middleware.Chain(authSvc, "providers.test", h.TestProviderConfig))

	// Contacts
	mux.Handle("GET /admin/api/v1/contacts", middleware.Chain(authSvc, "contacts.view", h.ListContacts))
	mux.Handle("POST /admin/api/v1/contacts", middleware.Chain(authSvc, "contacts.create", h.CreateContact))
	mux.Handle("PUT /admin/api/v1/contacts/{id}", middleware.Chain(authSvc, "contacts.update", h.UpdateContact))
	mux.Handle("DELETE /admin/api/v1/contacts/{id}", middleware.Chain(authSvc, "contacts.delete", h.DeleteContact))

	// Contact groups
	mux.Handle("GET /admin/api/v1/groups", middleware.Chain(authSvc, "groups.view", h.ListGroups))
	mux.Handle("POST /admin/api/v1/groups", middleware.Chain(authSvc, "groups.create", h.CreateGroup))
	mux.Handle("DELETE /admin/api/v1/groups/{id}", middleware.Chain(authSvc, "groups.delete", h.DeleteGroup))
	mux.Handle("GET /admin/api/v1/groups/{id}/members", middleware.Chain(authSvc, "groups.view", h.ListGroupMembers))
	mux.Handle("POST /admin/api/v1/groups/{id}/members", middleware.Chain(authSvc, "groups.members.manage", h.AddGroupMember))
	mux.Handle("DELETE /admin/api/v1/groups/{id}/members/{contact_id}", middleware.Chain(authSvc, "groups.members.manage", h.RemoveGroupMember))

	// Templates
	mux.Handle("GET /admin/api/v1/templates", middleware.Chain(authSvc, "templates.view", h.ListTemplates))
	mux.Handle("POST /admin/api/v1/templates", middleware.Chain(authSvc, "templates.create", h.CreateTemplate))
	mux.Handle("PUT /admin/api/v1/templates/{id}", middleware.Chain(authSvc, "templates.update", h.UpdateTemplate))
	mux.Handle("DELETE /admin/api/v1/templates/{id}", middleware.Chain(authSvc, "templates.delete", h.DeleteTemplate))

	// Campaigns
	mux.Handle("GET /admin/api/v1/campaigns", middleware.Chain(authSvc, "campaigns.view", h.ListCampaigns))
	mux.Handle("POST /admin/api/v1/campaigns", middleware.Chain(authSvc, "campaigns.create", h.CreateCampaign))
	mux.Handle("PUT /admin/api/v1/campaigns/{id}", middleware.Chain(authSvc, "campaigns.view", h.UpdateCampaign))
	mux.Handle("POST /admin/api/v1/campaigns/{id}/approve", middleware.Chain(authSvc, "campaigns.approve", h.ApproveCampaign))
	mux.Handle("POST /admin/api/v1/campaigns/{id}/send", middleware.Chain(authSvc, "campaigns.send", h.SendCampaign))
	mux.Handle("POST /admin/api/v1/campaigns/{id}/cancel", middleware.Chain(authSvc, "campaigns.cancel", h.CancelCampaign))

	// WebSocket
	mux.HandleFunc("GET /ws", h.WSServe)

	// In-app notifications (JWT)
	mux.Handle("GET /admin/api/v1/in-app/notifications", middleware.Chain(authSvc, "notifications.view", h.ListInAppNotifications))
	mux.Handle("POST /admin/api/v1/in-app/notifications/{id}/read", middleware.Chain(authSvc, "notifications.view", h.MarkInAppRead))
	mux.Handle("POST /admin/api/v1/in-app/notifications/mark-all-read", middleware.Chain(authSvc, "notifications.view", h.MarkAllInAppRead))
	mux.Handle("POST /admin/api/v1/in-app/sync", middleware.Chain(authSvc, "notifications.view", h.SyncInApp))

	// Metrics
	if metricsHandler != nil {
		mux.HandleFunc("GET /metrics", metricsHandler)
	}

	// API-key-protected public routes
	mux.Handle("POST /api/v1/notifications", middleware.APIKeyScope(authSvc, "notifications:create")(http.HandlerFunc(h.SendPublicNotification)))

	var mc *metrics.Collector
	if len(metricsCollector) > 0 {
		mc = metricsCollector[0]
	}
	return middleware.CORS(cfg.CORSOrigins)(middleware.RequestLog(log, mc)(middleware.PanicRecovery(log, mc)(mux)))
}
