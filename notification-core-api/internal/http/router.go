package http

import (
	"net/http"

	"notification-core-api/internal/auth"
	"notification-core-api/internal/config"
	"notification-core-api/internal/http/handlers"
	"notification-core-api/internal/http/middleware"

	"go.uber.org/zap"
)

func NewRouter(cfg config.Config, log *zap.Logger, h handlers.Handler, authSvc auth.Service) http.Handler {
	mux := http.NewServeMux()
	mux.HandleFunc("GET /healthz", h.Health)
	mux.HandleFunc("GET /readyz", h.Ready)
	mux.HandleFunc("POST /admin/api/v1/auth/login", h.Login)
	mux.HandleFunc("POST /admin/api/v1/auth/refresh", h.Refresh)

	admin := middleware.JWT(authSvc)(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch {
		case r.Method == http.MethodGet && r.URL.Path == "/admin/api/v1/auth/me":
			h.Me(w, r)
		case r.Method == http.MethodPost && r.URL.Path == "/admin/api/v1/auth/logout":
			middleware.RequirePermission(authSvc, "notifications.view")(http.HandlerFunc(h.Logout)).ServeHTTP(w, r)
		case r.Method == http.MethodPost && r.URL.Path == "/admin/api/v1/ws/token":
			middleware.RequirePermission(authSvc, "notifications.view")(http.HandlerFunc(h.WebSocketToken)).ServeHTTP(w, r)
		case r.Method == http.MethodPost && r.URL.Path == "/admin/api/v1/notifications/send":
			middleware.RequirePermission(authSvc, "notifications.send")(http.HandlerFunc(h.SendAdminNotification)).ServeHTTP(w, r)
		case r.Method == http.MethodGet && r.URL.Path == "/admin/api/v1/notifications":
			middleware.RequirePermission(authSvc, "notifications.view")(http.HandlerFunc(h.ListNotificationLogs)).ServeHTTP(w, r)
		case r.Method == http.MethodGet && r.URL.Path == "/admin/api/v1/tenants":
			middleware.RequirePermission(authSvc, "tenants.view")(http.HandlerFunc(h.ListTenants)).ServeHTTP(w, r)
		default:
			h.Placeholder(w, r)
		}
	}))
	mux.Handle("/admin/api/v1/", admin)

	publicAPI := middleware.APIKey(authSvc)(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch {
		case r.Method == http.MethodPost && r.URL.Path == "/api/v1/notifications":
			middleware.RequireScope("notifications:create")(http.HandlerFunc(h.SendPublicNotification)).ServeHTTP(w, r)
		default:
			h.Placeholder(w, r)
		}
	}))
	mux.Handle("/api/v1/", publicAPI)

	return middleware.CORS(cfg.CORSOrigins)(middleware.RequestLog(log)(mux))
}
