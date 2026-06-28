package handlers

import (
	"encoding/json"
	"net/http"
	"strings"
	"time"

	"notification-core-api/internal/audit"
	"notification-core-api/internal/auth"
	httpmw "notification-core-api/internal/http/middleware"
	"notification-core-api/internal/notifications"

	"github.com/jackc/pgx/v5/pgxpool"
)

type Handler struct {
	db            *pgxpool.Pool
	auth          auth.Service
	audit         audit.Service
	notifications notifications.Service
}

func New(db *pgxpool.Pool, authSvc auth.Service, notificationsSvc notifications.Service) Handler {
	return Handler{db: db, auth: authSvc, audit: audit.NewService(db), notifications: notificationsSvc}
}

func (h Handler) Health(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, http.StatusOK, map[string]any{"status": "ok"})
}

func (h Handler) Ready(w http.ResponseWriter, r *http.Request) {
	if err := h.db.Ping(r.Context()); err != nil {
		writeJSON(w, http.StatusServiceUnavailable, map[string]any{"status": "not_ready"})
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"status": "ready"})
}

func (h Handler) Login(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Email    string `json:"email"`
		Password string `json:"password"`
	}
	if decode(w, r, &req) != nil {
		return
	}
	tokens, principal, err := h.auth.Login(r.Context(), req.Email, req.Password, clientIP(r), r.UserAgent(), httpmw.RequestID(r.Context()))
	if err != nil {
		_ = h.audit.SecurityEvent(r.Context(), audit.Event{ActorType: "anonymous", Action: "login.failed", ResourceType: "auth_session", IPAddress: clientIP(r), UserAgent: r.UserAgent(), RequestID: httpmw.RequestID(r.Context()), After: map[string]any{"email": req.Email, "reason": err.Error()}}, "warning")
		writeJSON(w, http.StatusUnauthorized, map[string]any{"error": "invalid credentials"})
		return
	}
	_ = h.audit.Write(r.Context(), audit.Event{TenantID: principal.TenantID, ActorUserID: principal.UserID, ActorType: "tenant_user", Action: "login.success", ResourceType: "auth_session", IPAddress: clientIP(r), UserAgent: r.UserAgent(), RequestID: httpmw.RequestID(r.Context()), After: map[string]any{"email": principal.Email}})
	writeJSON(w, http.StatusOK, map[string]any{"access_token": tokens.AccessToken, "refresh_token": tokens.RefreshToken, "user": principal})
}

func (h Handler) Me(w http.ResponseWriter, r *http.Request) {
	p, _ := httpmw.Principal(r.Context())
	writeJSON(w, http.StatusOK, map[string]any{"user": p})
}

func (h Handler) Refresh(w http.ResponseWriter, r *http.Request) {
	var req struct {
		RefreshToken string `json:"refresh_token"`
	}
	if decode(w, r, &req) != nil {
		return
	}
	tokens, principal, err := h.auth.Refresh(r.Context(), req.RefreshToken, clientIP(r), r.UserAgent())
	if err != nil {
		writeJSON(w, http.StatusUnauthorized, map[string]any{"error": "invalid refresh token"})
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"access_token": tokens.AccessToken, "refresh_token": tokens.RefreshToken, "user": principal})
}

func (h Handler) Logout(w http.ResponseWriter, r *http.Request) {
	var req struct {
		RefreshToken string `json:"refresh_token"`
	}
	if decode(w, r, &req) != nil {
		return
	}
	_ = h.auth.RevokeRefreshToken(r.Context(), req.RefreshToken)
	p, _ := httpmw.Principal(r.Context())
	_ = h.audit.Write(r.Context(), audit.Event{TenantID: p.TenantID, ActorUserID: p.UserID, ActorType: "tenant_user", Action: "logout", ResourceType: "auth_session", IPAddress: clientIP(r), UserAgent: r.UserAgent(), RequestID: httpmw.RequestID(r.Context())})
	writeJSON(w, http.StatusOK, map[string]any{"status": "ok"})
}

func (h Handler) WebSocketToken(w http.ResponseWriter, r *http.Request) {
	var req struct {
		TenantID       string `json:"tenant_id"`
		ExternalUserID string `json:"external_user_id"`
	}
	_ = json.NewDecoder(r.Body).Decode(&req)
	p, _ := httpmw.Principal(r.Context())
	if p.IsPlatform {
		p.TenantID = req.TenantID
	} else if req.TenantID != "" && req.TenantID != p.TenantID {
		writeJSON(w, http.StatusForbidden, map[string]any{"error": "cross-tenant websocket token denied"})
		return
	}
	if p.TenantID == "" {
		writeJSON(w, http.StatusBadRequest, map[string]any{"error": "tenant_id required"})
		return
	}
	token, err := h.auth.CreateWebSocketToken(r.Context(), p, req.ExternalUserID)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]any{"error": "token creation failed"})
		return
	}
	writeJSON(w, http.StatusCreated, map[string]any{"connection_token": token, "expires_in": 60})
}

func (h Handler) SendPublicNotification(w http.ResponseWriter, r *http.Request) {
	var req notifications.Request
	if decode(w, r, &req) != nil {
		return
	}
	accepted, err := h.notifications.Send(r.Context(), httpmw.TenantID(r.Context()), req, "api_key")
	if err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]any{"error": err.Error()})
		return
	}
	_ = h.audit.Write(r.Context(), audit.Event{TenantID: httpmw.TenantID(r.Context()), ActorType: "api_key", Action: "notification.send", ResourceType: "notification", ResourceID: accepted.NotificationID, IPAddress: clientIP(r), UserAgent: r.UserAgent(), RequestID: httpmw.RequestID(r.Context()), After: map[string]any{"channels": req.Channels, "event": req.Event}})
	writeJSON(w, http.StatusAccepted, accepted)
}

func (h Handler) SendAdminNotification(w http.ResponseWriter, r *http.Request) {
	var req struct {
		TenantID string `json:"tenant_id"`
		notifications.Request
	}
	if decode(w, r, &req) != nil {
		return
	}
	p, _ := httpmw.Principal(r.Context())
	tenantID := req.TenantID
	if !p.IsPlatform {
		tenantID = p.TenantID
	}
	accepted, err := h.notifications.Send(r.Context(), tenantID, req.Request, "tenant_user")
	if err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]any{"error": err.Error()})
		return
	}
	_ = h.audit.Write(r.Context(), audit.Event{TenantID: tenantID, ActorUserID: p.UserID, ActorType: "tenant_user", Action: "manual_notification.send", ResourceType: "notification", ResourceID: accepted.NotificationID, IPAddress: clientIP(r), UserAgent: r.UserAgent(), RequestID: httpmw.RequestID(r.Context()), After: map[string]any{"channels": req.Channels, "event": req.Event}})
	writeJSON(w, http.StatusAccepted, accepted)
}

func (h Handler) ListNotificationLogs(w http.ResponseWriter, r *http.Request) {
	p, _ := httpmw.Principal(r.Context())
	if !p.IsPlatform {
		h.listTenantNotificationLogs(w, r, p.TenantID)
		return
	}
	rows, err := h.db.Query(r.Context(), `
SELECT n.public_id, t.name, n.event_key, n.status,
       COALESCE((SELECT d.status FROM notification_deliveries d WHERE d.notification_id = n.id ORDER BY d.updated_at DESC LIMIT 1), 'pending') AS delivery_status,
       n.created_at
FROM notifications n
JOIN tenants t ON t.id = n.tenant_id
ORDER BY n.created_at DESC LIMIT 100`)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]any{"error": "query failed"})
		return
	}
	defer rows.Close()
	items := []map[string]any{}
	for rows.Next() {
		var publicID, tenantName, event, status, deliveryStatus string
		var createdAt time.Time
		if err := rows.Scan(&publicID, &tenantName, &event, &status, &deliveryStatus, &createdAt); err != nil {
			writeJSON(w, http.StatusInternalServerError, map[string]any{"error": "scan failed"})
			return
		}
		items = append(items, map[string]any{"public_id": publicID, "tenant": tenantName, "event": event, "status": status, "delivery_status": deliveryStatus, "created_at": createdAt})
	}
	writeJSON(w, http.StatusOK, map[string]any{"data": items})
}

func (h Handler) listTenantNotificationLogs(w http.ResponseWriter, r *http.Request, tenantID string) {
	rows, err := h.db.Query(r.Context(), `
SELECT n.public_id, t.name, n.event_key, n.status,
       COALESCE((SELECT d.status FROM notification_deliveries d WHERE d.notification_id = n.id ORDER BY d.updated_at DESC LIMIT 1), 'pending') AS delivery_status,
       n.created_at
FROM notifications n
JOIN tenants t ON t.id = n.tenant_id
WHERE n.tenant_id = $1
ORDER BY n.created_at DESC LIMIT 100`, tenantID)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]any{"error": "query failed"})
		return
	}
	defer rows.Close()
	items := []map[string]any{}
	for rows.Next() {
		var publicID, tenantName, event, status, deliveryStatus string
		var createdAt time.Time
		if err := rows.Scan(&publicID, &tenantName, &event, &status, &deliveryStatus, &createdAt); err != nil {
			writeJSON(w, http.StatusInternalServerError, map[string]any{"error": "scan failed"})
			return
		}
		items = append(items, map[string]any{"public_id": publicID, "tenant": tenantName, "event": event, "status": status, "delivery_status": deliveryStatus, "created_at": createdAt})
	}
	writeJSON(w, http.StatusOK, map[string]any{"data": items})
}

func (h Handler) ListTenants(w http.ResponseWriter, r *http.Request) {
	rows, err := h.db.Query(r.Context(), `SELECT id::text, name, slug, status, created_at FROM tenants ORDER BY created_at DESC LIMIT 100`)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]any{"error": "query failed"})
		return
	}
	defer rows.Close()
	items := []map[string]any{}
	for rows.Next() {
		var id, name, slug, status string
		var createdAt time.Time
		if err := rows.Scan(&id, &name, &slug, &status, &createdAt); err != nil {
			writeJSON(w, http.StatusInternalServerError, map[string]any{"error": "scan failed"})
			return
		}
		items = append(items, map[string]any{"id": id, "name": name, "slug": slug, "status": status, "created_at": createdAt})
	}
	writeJSON(w, http.StatusOK, map[string]any{"data": items})
}

func (h Handler) Placeholder(w http.ResponseWriter, r *http.Request) {
	name := strings.TrimPrefix(r.URL.Path, "/admin/api/v1/")
	writeJSON(w, http.StatusOK, map[string]any{"data": []any{}, "module": name})
}

func decode(w http.ResponseWriter, r *http.Request, dest any) error {
	r.Body = http.MaxBytesReader(w, r.Body, 1<<20)
	if err := json.NewDecoder(r.Body).Decode(dest); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]any{"error": "invalid json"})
		return err
	}
	return nil
}

func writeJSON(w http.ResponseWriter, status int, body any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(body)
}

func clientIP(r *http.Request) string {
	if forwarded := r.Header.Get("X-Forwarded-For"); forwarded != "" {
		return strings.TrimSpace(strings.Split(forwarded, ",")[0])
	}
	return strings.TrimSpace(strings.Split(r.RemoteAddr, ":")[0])
}
