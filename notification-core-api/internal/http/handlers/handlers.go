package handlers

import (
	"context"
	"encoding/json"
	"net/http"
	"strings"
	"time"

	"notification-core-api/internal/audit"
	"notification-core-api/internal/auth"
	httpmw "notification-core-api/internal/http/middleware"
	"notification-core-api/internal/notifications"
	emailpkg "notification-core-api/internal/providers/email"
	fcmpkg "notification-core-api/internal/providers/fcm"
	smspkg "notification-core-api/internal/providers/sms"
	"notification-core-api/internal/providers"
	"notification-core-api/internal/security"
	ws "notification-core-api/internal/websocket"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"go.uber.org/zap"
	"golang.org/x/crypto/bcrypt"
)

type Handler struct {
	db            *pgxpool.Pool
	auth          auth.Service
	audit         audit.Service
	notifications notifications.Service
	wsHub         *ws.Hub
	log           *zap.Logger
	encKey        []byte
}

func New(db *pgxpool.Pool, authSvc auth.Service, notificationsSvc notifications.Service) Handler {
	return Handler{db: db, auth: authSvc, audit: audit.NewService(db), notifications: notificationsSvc, log: zap.NewNop()}
}

func (h *Handler) SetLogger(log *zap.Logger) { h.log = log }

func (h *Handler) SetWSHub(hub *ws.Hub) { h.wsHub = hub }

func (h *Handler) SetEncryptionKey(key []byte) { h.encKey = key }

func (h Handler) WSServe(w http.ResponseWriter, r *http.Request) {
	ws.NewWSHandler(h.wsHub, h.db, h.auth, h.log).ServeWS(w, r)
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
	tenantID := httpmw.TenantID(r.Context())
	accepted, err := h.notifications.Send(r.Context(), tenantID, req, "api_key")
	if err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]any{"error": err.Error()})
		return
	}
	h.broadcastIfWebSocket(r.Context(), tenantID, accepted.NotificationID, req)
	_ = h.audit.Write(r.Context(), audit.Event{TenantID: tenantID, ActorType: "api_key", Action: "notification.send", ResourceType: "notification", ResourceID: accepted.NotificationID, IPAddress: clientIP(r), UserAgent: r.UserAgent(), RequestID: httpmw.RequestID(r.Context()), After: map[string]any{"channels": req.Channels, "event": req.Event}})
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
	if p.IsPlatform {
		if tenantID == "" {
			writeJSON(w, http.StatusBadRequest, map[string]any{"error": "tenant_id is required for platform admin"})
			return
		}
	} else {
		tenantID = p.TenantID
	}
	accepted, err := h.notifications.Send(r.Context(), tenantID, req.Request, "tenant_user")
	if err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]any{"error": err.Error()})
		return
	}
	h.broadcastIfWebSocket(r.Context(), tenantID, accepted.NotificationID, req.Request)
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
	p, _ := httpmw.Principal(r.Context())
	q := `SELECT id::text, name, slug, status, created_at FROM tenants`
	args := []any{}
	if !p.IsPlatform {
		q += ` WHERE id = $1`
		args = append(args, p.TenantID)
	}
	q += ` ORDER BY created_at DESC LIMIT 100`
	rows, err := h.db.Query(r.Context(), q, args...)
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

func (h Handler) DashboardStats(w http.ResponseWriter, r *http.Request) {
	p, _ := httpmw.Principal(r.Context())
	tenantScope := ""
	deliveryScope := ""
	tenantArgs := []any{}
	deliveryArgs := []any{}
	if !p.IsPlatform {
		tenantScope = " AND n.tenant_id = $1"
		tenantArgs = append(tenantArgs, p.TenantID)
		deliveryScope = " AND tenant_id = $1"
		deliveryArgs = append(deliveryArgs, p.TenantID)
	}

	var queued, sentToday, failed, retryCount, deadCount, activeCampaigns int
	_ = h.db.QueryRow(r.Context(), `SELECT COUNT(*) FROM notifications n WHERE n.status = 'queued'`+tenantScope, tenantArgs...).Scan(&queued)
	_ = h.db.QueryRow(r.Context(), `SELECT COUNT(*) FROM notification_deliveries WHERE status = 'sent' AND updated_at >= now() - interval '24 hours'`+deliveryScope, deliveryArgs...).Scan(&sentToday)
	_ = h.db.QueryRow(r.Context(), `SELECT COUNT(*) FROM notification_deliveries WHERE status = 'failed'`+deliveryScope, deliveryArgs...).Scan(&failed)

	retryQuery := `SELECT COUNT(*) FROM notification_deliveries WHERE response_json ? 'retry_count'`
	deadQuery := `SELECT COUNT(*) FROM notification_deliveries WHERE status = 'dead'`
	if !p.IsPlatform {
		retryQuery += ` AND tenant_id = $1`
		deadQuery += ` AND tenant_id = $1`
	}	
	_ = h.db.QueryRow(r.Context(), retryQuery, tenantArgs...).Scan(&retryCount)
	_ = h.db.QueryRow(r.Context(), deadQuery, tenantArgs...).Scan(&deadCount)

	campaignArgs := []any{}
	campaignScope := ""
	if !p.IsPlatform {
		campaignScope = " AND tenant_id = $1"
		campaignArgs = append(campaignArgs, p.TenantID)
	}
	_ = h.db.QueryRow(r.Context(), `SELECT COUNT(*) FROM campaigns WHERE status IN ('draft','pending_approval','approved')`+campaignScope, campaignArgs...).Scan(&activeCampaigns)

	totalDeliveries := sentToday + failed
	successRate := 0.0
	if totalDeliveries > 0 {
		successRate = float64(sentToday) / float64(totalDeliveries) * 100
	}

	wsActive := 0
	if h.wsHub != nil {
		wsActive = h.wsHub.ActiveConnections()
	}

	channelRows, err := h.db.Query(r.Context(), `SELECT channel, COUNT(*) FROM notification_deliveries WHERE updated_at >= now() - interval '24 hours'`+deliveryScope+` GROUP BY channel ORDER BY channel`, deliveryArgs...)
	channels := []map[string]any{}
	if err == nil {
		defer channelRows.Close()
		for channelRows.Next() {
			var ch string
			var cnt int
			if err := channelRows.Scan(&ch, &cnt); err == nil {
				channels = append(channels, map[string]any{"channel": ch, "count": cnt})
			}
		}
	}

	writeJSON(w, http.StatusOK, map[string]any{
		"queued":            queued,
		"sent_today":        sentToday,
		"failed":            failed,
		"retry_count":       retryCount,
		"dead_letter_count": deadCount,
		"active_campaigns":  activeCampaigns,
		"ws_connections":    wsActive,
		"success_rate":      successRate,
		"channels":          channels,
	})
}

func (h Handler) ListAuditLogs(w http.ResponseWriter, r *http.Request) {
	p, _ := httpmw.Principal(r.Context())
	q := `SELECT id::text, action, actor_type, COALESCE(actor_user_id::text,''), resource_type, COALESCE(resource_id::text,''), ip_address, created_at FROM audit_logs`
	args := []any{}
	if !p.IsPlatform {
		q += ` WHERE tenant_id = $1`
		args = append(args, p.TenantID)
	}
	q += ` ORDER BY created_at DESC LIMIT 100`
	rows, err := h.db.Query(r.Context(), q, args...)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]any{"error": "query failed"})
		return
	}
	defer rows.Close()
	items := []map[string]any{}
	for rows.Next() {
		var id, action, actorType, actorUserID, resourceType, resourceID, ipAddress string
		var createdAt time.Time
		if err := rows.Scan(&id, &action, &actorType, &actorUserID, &resourceType, &resourceID, &ipAddress, &createdAt); err != nil {
			writeJSON(w, http.StatusInternalServerError, map[string]any{"error": "scan failed"})
			return
		}
		items = append(items, map[string]any{"id": id, "action": action, "actor_type": actorType, "actor_user_id": actorUserID, "resource_type": resourceType, "resource_id": resourceID, "ip_address": ipAddress, "created_at": createdAt})
	}
	writeJSON(w, http.StatusOK, map[string]any{"data": items})
}

func (h Handler) ListAPIKeys(w http.ResponseWriter, r *http.Request) {
	p, _ := httpmw.Principal(r.Context())
	q := `SELECT id::text, tenant_id::text, name, COALESCE(scopes_json::text,'[]'), status, COALESCE(last_used_at::text,''), created_at FROM tenant_api_keys`
	args := []any{}
	if !p.IsPlatform {
		q += ` WHERE tenant_id = $1`
		args = append(args, p.TenantID)
	}
	q += ` ORDER BY created_at DESC LIMIT 100`
	rows, err := h.db.Query(r.Context(), q, args...)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]any{"error": "query failed"})
		return
	}
	defer rows.Close()
	items := []map[string]any{}
	for rows.Next() {
		var id, tenantID, name, scopes, status, lastUsed string
		var createdAt time.Time
		if err := rows.Scan(&id, &tenantID, &name, &scopes, &status, &lastUsed, &createdAt); err != nil {
			writeJSON(w, http.StatusInternalServerError, map[string]any{"error": "scan failed"})
			return
		}
		items = append(items, map[string]any{"id": id, "tenant_id": tenantID, "name": name, "scopes": scopes, "status": status, "last_used_at": lastUsed, "created_at": createdAt})
	}
	writeJSON(w, http.StatusOK, map[string]any{"data": items})
}

func (h Handler) CreateAPIKey(w http.ResponseWriter, r *http.Request) {
	var req struct {
		TenantID  string   `json:"tenant_id"`
		Name      string   `json:"name"`
		Scopes    []string `json:"scopes"`
		ExpiresIn string   `json:"expires_in"`
	}
	if decode(w, r, &req) != nil {
		return
	}
	p, _ := httpmw.Principal(r.Context())
	tenantID := req.TenantID
	if !p.IsPlatform {
		tenantID = p.TenantID
	}
	if req.Name == "" {
		writeJSON(w, http.StatusBadRequest, map[string]any{"error": "name is required"})
		return
	}
	var expiresAt *time.Time
	if req.ExpiresIn != "" {
		d, err := time.ParseDuration(req.ExpiresIn)
		if err == nil {
			t := time.Now().UTC().Add(d)
			expiresAt = &t
		}
	}
	id, raw, err := h.auth.GenerateAPIKey(r.Context(), tenantID, req.Name, p.UserID, req.Scopes, expiresAt)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]any{"error": "api key creation failed"})
		return
	}
	_ = h.audit.Write(r.Context(), audit.Event{
		TenantID:     tenantID,
		ActorUserID:  p.UserID,
		ActorType:    "tenant_user",
		Action:       "api_key.create",
		ResourceType: "tenant_api_key",
		ResourceID:   id,
	})
	writeJSON(w, http.StatusCreated, map[string]any{"id": id, "api_key": raw, "message": "save this key - it will not be shown again"})
}

func (h Handler) RevokeAPIKey(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	p, _ := httpmw.Principal(r.Context())
	q := `UPDATE tenant_api_keys SET status = 'revoked', revoked_at = now(), revoked_by = $2, updated_at = now() WHERE id = $1`
	args := []any{id, p.UserID}
	if !p.IsPlatform {
		q += ` AND tenant_id = $3`
		args = append(args, p.TenantID)
	}
	result, err := h.db.Exec(r.Context(), q, args...)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]any{"error": "revoke failed"})
		return
	}
	if result.RowsAffected() == 0 {
		writeJSON(w, http.StatusNotFound, map[string]any{"error": "api key not found"})
		return
	}
	_ = h.audit.Write(r.Context(), audit.Event{
		ActorUserID:  p.UserID,
		ActorType:    "tenant_user",
		Action:       "api_key.revoke",
		ResourceType: "tenant_api_key",
		ResourceID:   id,
	})
	writeJSON(w, http.StatusOK, map[string]any{"message": "api key revoked"})
}

func (h Handler) ListUsers(w http.ResponseWriter, r *http.Request) {
	p, _ := httpmw.Principal(r.Context())
	var rows pgx.Rows
	var err error
	if p.IsPlatform {
		rows, err = h.db.Query(r.Context(), `SELECT u.id::text, u.email, u.name, u.is_platform_admin, u.status, u.created_at FROM users u ORDER BY u.created_at DESC LIMIT 100`)
	} else {
		rows, err = h.db.Query(r.Context(), `SELECT u.id::text, u.email, u.name, u.is_platform_admin, u.status, u.created_at FROM users u JOIN tenant_users tu ON tu.user_id = u.id WHERE tu.tenant_id = $1 ORDER BY u.created_at DESC LIMIT 100`, p.TenantID)
	}
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]any{"error": "query failed"})
		return
	}
	defer rows.Close()
	items := []map[string]any{}
	for rows.Next() {
		var id, email, name, status string
		var isPlatform bool
		var createdAt time.Time
		if err := rows.Scan(&id, &email, &name, &isPlatform, &status, &createdAt); err != nil {
			writeJSON(w, http.StatusInternalServerError, map[string]any{"error": "scan failed"})
			return
		}
		items = append(items, map[string]any{"id": id, "email": email, "name": name, "is_platform_admin": isPlatform, "status": status, "created_at": createdAt})
	}
	writeJSON(w, http.StatusOK, map[string]any{"data": items})
}

func (h Handler) ListFeatures(w http.ResponseWriter, r *http.Request) {
	p, _ := httpmw.Principal(r.Context())
	q := `SELECT tf.id::text, tf.feature_key, tf.enabled, COALESCE(t.name,''), tf.created_at FROM tenant_features tf JOIN tenants t ON t.id = tf.tenant_id`
	args := []any{}
	if !p.IsPlatform {
		q += ` WHERE tf.tenant_id = $1`
		args = append(args, p.TenantID)
	}
	q += ` ORDER BY t.name, tf.feature_key LIMIT 200`
	rows, err := h.db.Query(r.Context(), q, args...)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]any{"error": "query failed"})
		return
	}
	defer rows.Close()
	items := []map[string]any{}
	for rows.Next() {
		var id, key, tenantName string
		var enabled bool
		var createdAt time.Time
		if err := rows.Scan(&id, &key, &enabled, &tenantName, &createdAt); err != nil {
			writeJSON(w, http.StatusInternalServerError, map[string]any{"error": "scan failed"})
			return
		}
		items = append(items, map[string]any{"id": id, "feature_key": key, "enabled": enabled, "tenant_name": tenantName, "created_at": createdAt})
	}
	writeJSON(w, http.StatusOK, map[string]any{"data": items})
}

func (h Handler) ListChannels(w http.ResponseWriter, r *http.Request) {
	p, _ := httpmw.Principal(r.Context())
	q := `SELECT tc.id::text, tc.channel, tc.enabled, tc.direction, tc.rate_limit_per_second, tc.daily_quota, COALESCE(t.name,'') FROM tenant_channels tc JOIN tenants t ON t.id = tc.tenant_id`
	args := []any{}
	if !p.IsPlatform {
		q += ` WHERE tc.tenant_id = $1`
		args = append(args, p.TenantID)
	}
	q += ` ORDER BY t.name, tc.channel LIMIT 200`
	rows, err := h.db.Query(r.Context(), q, args...)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]any{"error": "query failed"})
		return
	}
	defer rows.Close()
	items := []map[string]any{}
	for rows.Next() {
		var id, channel, direction, tenantName string
		var enabled bool
		var rateLimit, dailyQuota int
		if err := rows.Scan(&id, &channel, &enabled, &direction, &rateLimit, &dailyQuota, &tenantName); err != nil {
			writeJSON(w, http.StatusInternalServerError, map[string]any{"error": "scan failed"})
			return
		}
		items = append(items, map[string]any{"id": id, "channel": channel, "enabled": enabled, "direction": direction, "rate_limit_per_second": rateLimit, "daily_quota": dailyQuota, "tenant_name": tenantName})
	}
	writeJSON(w, http.StatusOK, map[string]any{"data": items})
}

func (h Handler) ListProviderConfigs(w http.ResponseWriter, r *http.Request) {
	p, _ := httpmw.Principal(r.Context())
	q := `SELECT tpc.id::text, tpc.channel, tpc.provider, tpc.is_default, tpc.status, COALESCE(t.name,'') FROM tenant_provider_configs tpc JOIN tenants t ON t.id = tpc.tenant_id`
	args := []any{}
	if !p.IsPlatform {
		q += ` WHERE tpc.tenant_id = $1`
		args = append(args, p.TenantID)
	}
	q += ` ORDER BY t.name, tpc.channel LIMIT 200`
	rows, err := h.db.Query(r.Context(), q, args...)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]any{"error": "query failed"})
		return
	}
	defer rows.Close()
	items := []map[string]any{}
	for rows.Next() {
		var id, channel, provider, tenantName string
		var isDefault bool
		var status string
		if err := rows.Scan(&id, &channel, &provider, &isDefault, &status, &tenantName); err != nil {
			writeJSON(w, http.StatusInternalServerError, map[string]any{"error": "scan failed"})
			return
		}
		items = append(items, map[string]any{"id": id, "channel": channel, "provider": provider, "is_default": isDefault, "status": status, "tenant_name": tenantName})
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

func (h Handler) CreateUser(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Email    string `json:"email"`
		Name     string `json:"name"`
		Password string `json:"password"`
		TenantID string `json:"tenant_id"`
	}
	if decode(w, r, &req) != nil {
		return
	}
	p, _ := httpmw.Principal(r.Context())
	if req.Email == "" || req.Name == "" || req.Password == "" {
		writeJSON(w, http.StatusBadRequest, map[string]any{"error": "email, name, and password are required"})
		return
	}
	hash, err := bcryptHash(req.Password)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]any{"error": "password hashing failed"})
		return
	}
	tenantID := req.TenantID
	if !p.IsPlatform {
		tenantID = p.TenantID
	}
	var userID string
	if err := h.db.QueryRow(r.Context(), `INSERT INTO users (email, name, password_hash, status) VALUES ($1,$2,$3,'active') RETURNING id::text`, req.Email, req.Name, hash).Scan(&userID); err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]any{"error": "create failed", "detail": err.Error()})
		return
	}
	if tenantID != "" {
		h.db.Exec(r.Context(), `INSERT INTO tenant_users (tenant_id, user_id, status) VALUES ($1,$2,'active') ON CONFLICT DO NOTHING`, tenantID, userID)
	}
	_ = h.audit.Write(r.Context(), audit.Event{TenantID: tenantID, ActorUserID: p.UserID, ActorType: "tenant_user", Action: "user.create", ResourceType: "user", ResourceID: userID, After: map[string]any{"email": req.Email, "name": req.Name}})
	writeJSON(w, http.StatusCreated, map[string]any{"id": userID, "message": "user created"})
}

func (h Handler) UpdateUser(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	var req struct {
		Name   string `json:"name"`
		Email  string `json:"email"`
		Status string `json:"status"`
	}
	if decode(w, r, &req) != nil {
		return
	}
	p, _ := httpmw.Principal(r.Context())
	q := `UPDATE users SET updated_at = now()`
	args := []any{}
	argN := 1
	if req.Name != "" {
		q += ", name = $" + itoa(argN); args = append(args, req.Name); argN++
	}
	if req.Email != "" {
		q += ", email = $" + itoa(argN); args = append(args, req.Email); argN++
	}
	if req.Status != "" {
		q += ", status = $" + itoa(argN); args = append(args, req.Status); argN++
	}
	q += " WHERE id = $" + itoa(argN); args = append(args, id); argN++
	if !p.IsPlatform {
		q += " AND EXISTS (SELECT 1 FROM tenant_users WHERE user_id = $" + itoa(argN) + " AND tenant_id = $" + itoa(argN+1) + ")"
		args = append(args, id, p.TenantID)
	}
	result, err := h.db.Exec(r.Context(), q, args...)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]any{"error": "update failed"})
		return
	}
	if result.RowsAffected() == 0 {
		writeJSON(w, http.StatusNotFound, map[string]any{"error": "user not found"})
		return
	}
	_ = h.audit.Write(r.Context(), audit.Event{ActorUserID: p.UserID, ActorType: "tenant_user", Action: "user.update", ResourceType: "user", ResourceID: id})
	writeJSON(w, http.StatusOK, map[string]any{"message": "user updated"})
}

func (h Handler) UpdateFeature(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	var req struct {
		Enabled bool `json:"enabled"`
	}
	if decode(w, r, &req) != nil {
		return
	}
	p, _ := httpmw.Principal(r.Context())
	q := `UPDATE tenant_features SET enabled = $2, updated_at = now() WHERE id = $1`
	if !p.IsPlatform {
		q += ` AND tenant_id = $3`
	}
	args := []any{id, req.Enabled}
	if !p.IsPlatform {
		args = append(args, p.TenantID)
	}
	result, err := h.db.Exec(r.Context(), q, args...)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]any{"error": "update failed"})
		return
	}
	if result.RowsAffected() == 0 {
		writeJSON(w, http.StatusNotFound, map[string]any{"error": "feature not found"})
		return
	}
	_ = h.audit.Write(r.Context(), audit.Event{TenantID: p.TenantID, ActorUserID: p.UserID, ActorType: "tenant_user", Action: "feature.update", ResourceType: "tenant_feature", ResourceID: id, After: map[string]any{"enabled": req.Enabled}})
	writeJSON(w, http.StatusOK, map[string]any{"message": "feature updated"})
}

func (h Handler) UpdateChannel(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	var req struct {
		Enabled            *bool `json:"enabled"`
		Direction          string `json:"direction"`
		RateLimitPerSecond *int  `json:"rate_limit_per_second"`
		DailyQuota         *int  `json:"daily_quota"`
		Priority           *int  `json:"priority"`
	}
	if decode(w, r, &req) != nil {
		return
	}
	p, _ := httpmw.Principal(r.Context())
	q := `UPDATE tenant_channels SET updated_at = now()`
	args := []any{}
	argN := 1
	if req.Enabled != nil {
		q += ", enabled = $" + itoa(argN); args = append(args, *req.Enabled); argN++
	}
	if req.Direction != "" {
		q += ", direction = $" + itoa(argN); args = append(args, req.Direction); argN++
	}
	if req.RateLimitPerSecond != nil {
		q += ", rate_limit_per_second = $" + itoa(argN); args = append(args, *req.RateLimitPerSecond); argN++
	}
	if req.DailyQuota != nil {
		q += ", daily_quota = $" + itoa(argN); args = append(args, *req.DailyQuota); argN++
	}
	if req.Priority != nil {
		q += ", priority = $" + itoa(argN); args = append(args, *req.Priority); argN++
	}
	q += " WHERE id = $" + itoa(argN); args = append(args, id); argN++
	if !p.IsPlatform {
		q += " AND tenant_id = $" + itoa(argN); args = append(args, p.TenantID); argN++
	}
	result, err := h.db.Exec(r.Context(), q, args...)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]any{"error": "update failed"})
		return
	}
	if result.RowsAffected() == 0 {
		writeJSON(w, http.StatusNotFound, map[string]any{"error": "channel not found"})
		return
	}
	_ = h.audit.Write(r.Context(), audit.Event{ActorUserID: p.UserID, ActorType: "tenant_user", Action: "channel.update", ResourceType: "tenant_channel", ResourceID: id})
	writeJSON(w, http.StatusOK, map[string]any{"message": "channel updated"})
}

func (h Handler) ListGroupMembers(w http.ResponseWriter, r *http.Request) {
	groupID := r.PathValue("id")
	p, _ := httpmw.Principal(r.Context())
	q := `SELECT c.id::text, c.name, COALESCE(c.email,''), COALESCE(c.phone,'') FROM contacts c JOIN contact_group_members cgm ON cgm.contact_id = c.id WHERE cgm.group_id = $1`
	args := []any{groupID}
	if !p.IsPlatform {
		q += ` AND c.tenant_id = $2`
		args = append(args, p.TenantID)
	}
	q += ` ORDER BY c.name`
	rows, err := h.db.Query(r.Context(), q, args...)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]any{"error": "query failed"})
		return
	}
	defer rows.Close()
	items := []map[string]any{}
	for rows.Next() {
		var id, name, email, phone string
		if err := rows.Scan(&id, &name, &email, &phone); err != nil {
			writeJSON(w, http.StatusInternalServerError, map[string]any{"error": "scan failed"})
			return
		}
		items = append(items, map[string]any{"id": id, "name": name, "email": email, "phone": phone})
	}
	writeJSON(w, http.StatusOK, map[string]any{"data": items})
}

func (h Handler) AddGroupMember(w http.ResponseWriter, r *http.Request) {
	groupID := r.PathValue("id")
	var req struct {
		ContactID string `json:"contact_id"`
	}
	if decode(w, r, &req) != nil {
		return
	}
	p, _ := httpmw.Principal(r.Context())
	var q string
	var args []any
	if !p.IsPlatform {
		q = `INSERT INTO contact_group_members (tenant_id, group_id, contact_id) SELECT $3, $1, $2 FROM contact_groups cg JOIN contacts c ON c.id = $2 WHERE cg.id = $1 AND cg.tenant_id = $3 AND c.tenant_id = $3 ON CONFLICT DO NOTHING`
		args = []any{groupID, req.ContactID, p.TenantID}
	} else {
		q = `INSERT INTO contact_group_members (tenant_id, group_id, contact_id) SELECT cg.tenant_id, $1, $2 FROM contact_groups cg JOIN contacts c ON c.id = $2 WHERE cg.id = $1 ON CONFLICT DO NOTHING`
		args = []any{groupID, req.ContactID}
	}
	_, err := h.db.Exec(r.Context(), q, args...)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]any{"error": "add failed"})
		return
	}
	_ = h.audit.Write(r.Context(), audit.Event{TenantID: p.TenantID, ActorUserID: p.UserID, ActorType: "tenant_user", Action: "group_member.add", ResourceType: "contact_group_member", ResourceID: groupID + "/" + req.ContactID})
	writeJSON(w, http.StatusCreated, map[string]any{"message": "member added"})
}

func (h Handler) RemoveGroupMember(w http.ResponseWriter, r *http.Request) {
	groupID := r.PathValue("id")
	contactID := r.PathValue("contact_id")
	p, _ := httpmw.Principal(r.Context())
	q := `DELETE FROM contact_group_members WHERE group_id = $1 AND contact_id = $2`
	args := []any{groupID, contactID}
	if !p.IsPlatform {
		q += ` AND tenant_id = $3`
		args = append(args, p.TenantID)
	}
	_, err := h.db.Exec(r.Context(), q, args...)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]any{"error": "remove failed"})
		return
	}
	_ = h.audit.Write(r.Context(), audit.Event{TenantID: p.TenantID, ActorUserID: p.UserID, ActorType: "tenant_user", Action: "group_member.remove", ResourceType: "contact_group_member", ResourceID: groupID + "/" + contactID})
	writeJSON(w, http.StatusOK, map[string]any{"message": "member removed"})
}

func (h Handler) CreateProviderConfig(w http.ResponseWriter, r *http.Request) {
	var req struct {
		TenantID   string `json:"tenant_id"`
		Channel    string `json:"channel"`
		Provider   string `json:"provider"`
		IsDefault  bool   `json:"is_default"`
		ConfigJSON string `json:"config_json"`
	}
	if decode(w, r, &req) != nil {
		return
	}
	p, _ := httpmw.Principal(r.Context())
	tenantID := req.TenantID
	if !p.IsPlatform {
		tenantID = p.TenantID
	}
	if req.Channel == "" || req.Provider == "" {
		writeJSON(w, http.StatusBadRequest, map[string]any{"error": "channel and provider are required"})
		return
	}
	configRaw := req.ConfigJSON
	if configRaw == "" {
		configRaw = "{}"
	}
	encrypted, err := security.Encrypt(configRaw)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]any{"error": "encryption failed"})
		return
	}
	var id string
	if err := h.db.QueryRow(r.Context(), `INSERT INTO tenant_provider_configs (tenant_id, channel, provider, is_default, status, config_json) VALUES ($1,$2,$3,$4,'active',$5::jsonb) RETURNING id::text`, nullIfEmpty(tenantID), req.Channel, req.Provider, req.IsDefault, encrypted).Scan(&id); err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]any{"error": "create failed", "detail": err.Error()})
		return
	}
	_ = h.audit.Write(r.Context(), audit.Event{TenantID: tenantID, ActorUserID: p.UserID, ActorType: "tenant_user", Action: "provider_config.create", ResourceType: "tenant_provider_config", ResourceID: id})
	writeJSON(w, http.StatusCreated, map[string]any{"id": id, "message": "provider config created"})
}

func (h Handler) UpdateProviderConfig(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	var req struct {
		Provider   string `json:"provider"`
		IsDefault  *bool  `json:"is_default"`
		Status     string `json:"status"`
		ConfigJSON string `json:"config_json"`
	}
	if decode(w, r, &req) != nil {
		return
	}
	p, _ := httpmw.Principal(r.Context())
	q := `UPDATE tenant_provider_configs SET updated_at = now()`
	args := []any{}
	argN := 1
	if req.Provider != "" {
		q += ", provider = $" + itoa(argN); args = append(args, req.Provider); argN++
	}
	if req.IsDefault != nil {
		q += ", is_default = $" + itoa(argN); args = append(args, *req.IsDefault); argN++
	}
	if req.Status != "" {
		q += ", status = $" + itoa(argN); args = append(args, req.Status); argN++
	}
	if req.ConfigJSON != "" {
		encrypted, err := security.Encrypt(req.ConfigJSON)
		if err != nil {
			writeJSON(w, http.StatusInternalServerError, map[string]any{"error": "encryption failed"})
			return
		}
		q += ", config_json = $" + itoa(argN) + "::jsonb"; args = append(args, encrypted); argN++
	}
	q += " WHERE id = $" + itoa(argN); args = append(args, id); argN++
	if !p.IsPlatform {
		q += " AND tenant_id = $" + itoa(argN); args = append(args, p.TenantID); argN++
	}
	result, err := h.db.Exec(r.Context(), q, args...)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]any{"error": "update failed"})
		return
	}
	if result.RowsAffected() == 0 {
		writeJSON(w, http.StatusNotFound, map[string]any{"error": "provider config not found"})
		return
	}
	_ = h.audit.Write(r.Context(), audit.Event{ActorUserID: p.UserID, ActorType: "tenant_user", Action: "provider_config.update", ResourceType: "tenant_provider_config", ResourceID: id})
	writeJSON(w, http.StatusOK, map[string]any{"message": "provider config updated"})
}

func (h Handler) DeleteProviderConfig(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	p, _ := httpmw.Principal(r.Context())
	q := `DELETE FROM tenant_provider_configs WHERE id = $1`
	args := []any{id}
	if !p.IsPlatform {
		q += " AND tenant_id = $2"
		args = append(args, p.TenantID)
	}
	result, err := h.db.Exec(r.Context(), q, args...)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]any{"error": "delete failed"})
		return
	}
	if result.RowsAffected() == 0 {
		writeJSON(w, http.StatusNotFound, map[string]any{"error": "provider config not found"})
		return
	}
	_ = h.audit.Write(r.Context(), audit.Event{ActorUserID: p.UserID, ActorType: "tenant_user", Action: "provider_config.delete", ResourceType: "tenant_provider_config", ResourceID: id})
	writeJSON(w, http.StatusOK, map[string]any{"message": "provider config deleted"})
}

func (h Handler) TestProviderConfig(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	p, _ := httpmw.Principal(r.Context())
	var channel, provider, configRaw string
	q := `SELECT channel, provider, config_json::text FROM tenant_provider_configs WHERE id = $1`
	args := []any{id}
	if !p.IsPlatform {
		q += ` AND tenant_id = $2`
		args = append(args, p.TenantID)
	}
	if err := h.db.QueryRow(r.Context(), q, args...).Scan(&channel, &provider, &configRaw); err != nil {
		writeJSON(w, http.StatusNotFound, map[string]any{"error": "provider config not found"})
		return
	}
	decrypted, err := security.Decrypt(configRaw)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]any{"error": "decryption failed"})
		return
	}
	var cfgMap map[string]any
	_ = json.Unmarshal([]byte(decrypted), &cfgMap)
	var testResult map[string]any
	switch channel {
	case "email":
		svc, err := emailpkg.NewReal(cfgMap, h.log)
		if err != nil {
			writeJSON(w, http.StatusBadRequest, map[string]any{"error": err.Error()})
			return
		}
		if svc == nil {
			writeJSON(w, http.StatusBadRequest, map[string]any{"error": "incomplete email config"})
			return
		}
		res, err := svc.Send(r.Context(), providers.Message{To: "test@example.com", Subject: "Test", Body: "This is a test from Notification Platform"})
		if err != nil {
			testResult = map[string]any{"status": "failed", "error": err.Error()}
		} else {
			testResult = map[string]any{"status": "sent", "provider_message_id": res.ProviderMessageID}
		}
	case "sms":
		svc, err := smspkg.NewReal(cfgMap, h.log)
		if err != nil {
			writeJSON(w, http.StatusBadRequest, map[string]any{"error": err.Error()})
			return
		}
		if svc == nil {
			writeJSON(w, http.StatusBadRequest, map[string]any{"error": "incomplete sms config"})
			return
		}
		res, err := svc.Send(r.Context(), providers.Message{To: "+15550000000", Body: "Test from Notification Platform"})
		if err != nil {
			testResult = map[string]any{"status": "failed", "error": err.Error()}
		} else {
			testResult = map[string]any{"status": "sent", "provider_message_id": res.ProviderMessageID}
		}
	case "fcm":
		svc, err := fcmpkg.NewReal(cfgMap, h.log)
		if err != nil {
			writeJSON(w, http.StatusBadRequest, map[string]any{"error": err.Error()})
			return
		}
		if svc == nil {
			writeJSON(w, http.StatusBadRequest, map[string]any{"error": "incomplete fcm config"})
			return
		}
		res, err := svc.Send(r.Context(), providers.Message{To: "", Data: map[string]any{"fcm_token": "test_token"}})
		if err != nil {
			testResult = map[string]any{"status": "failed", "error": err.Error()}
		} else {
			testResult = map[string]any{"status": "sent", "provider_message_id": res.ProviderMessageID}
		}
	default:
		testResult = map[string]any{"status": "skipped", "message": "unsupported channel: " + channel}
	}
	_ = h.audit.Write(r.Context(), audit.Event{TenantID: p.TenantID, ActorUserID: p.UserID, ActorType: "tenant_user", Action: "provider_config.test", ResourceType: "tenant_provider_config", ResourceID: id, After: testResult})
	writeJSON(w, http.StatusOK, map[string]any{"test": testResult})
}

func (h Handler) ListInAppNotifications(w http.ResponseWriter, r *http.Request) {
	p, _ := httpmw.Principal(r.Context())
	q := `SELECT id::text, title, body, data_json, status, created_at FROM in_app_notifications WHERE tenant_id = $1`
	args := []any{p.TenantID}
	status := r.URL.Query().Get("status")
	if status != "" {
		q += ` AND status = $2`
		args = append(args, status)
	}
	q += ` ORDER BY created_at DESC LIMIT 100`
	rows, err := h.db.Query(r.Context(), q, args...)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]any{"error": "query failed"})
		return
	}
	defer rows.Close()
	items := []map[string]any{}
	for rows.Next() {
		var id, title, bodyRaw, status string
		var data []byte
		var createdAt time.Time
		if err := rows.Scan(&id, &title, &bodyRaw, &data, &status, &createdAt); err != nil {
			writeJSON(w, http.StatusInternalServerError, map[string]any{"error": "scan failed"})
			return
		}
		items = append(items, map[string]any{"id": id, "title": title, "body": bodyRaw, "data": string(data), "status": status, "created_at": createdAt})
	}
	writeJSON(w, http.StatusOK, map[string]any{"data": items})
}

func (h Handler) MarkInAppRead(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	p, _ := httpmw.Principal(r.Context())
	_, err := h.db.Exec(r.Context(), `UPDATE in_app_notifications SET status = 'read', updated_at = now() WHERE id = $1 AND tenant_id = $2 AND status = 'unread'`, id, p.TenantID)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]any{"error": "update failed"})
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"message": "marked as read"})
}

func (h Handler) MarkAllInAppRead(w http.ResponseWriter, r *http.Request) {
	p, _ := httpmw.Principal(r.Context())
	_, err := h.db.Exec(r.Context(), `UPDATE in_app_notifications SET status = 'read', updated_at = now() WHERE tenant_id = $1 AND status = 'unread'`, p.TenantID)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]any{"error": "update failed"})
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"message": "all marked as read"})
}

func (h Handler) SyncInApp(w http.ResponseWriter, r *http.Request) {
	p, _ := httpmw.Principal(r.Context())
	rows, err := h.db.Query(r.Context(), `SELECT id::text, title, body, data_json, created_at FROM in_app_notifications WHERE tenant_id = $1 AND status = 'unread' ORDER BY created_at DESC LIMIT 50`, p.TenantID)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]any{"error": "query failed"})
		return
	}
	defer rows.Close()
	items := []map[string]any{}
	for rows.Next() {
		var id, title, body string
		var data []byte
		var createdAt time.Time
		if err := rows.Scan(&id, &title, &body, &data, &createdAt); err != nil {
			continue
		}
		items = append(items, map[string]any{"id": id, "title": title, "body": body, "data": string(data), "created_at": createdAt})
	}
	writeJSON(w, http.StatusOK, map[string]any{"data": items})
}

func (h Handler) broadcastIfWebSocket(ctx context.Context, tenantID, notificationID string, req notifications.Request) {
	for _, ch := range req.Channels {
		if ch != "websocket" && ch != "in_app" {
			continue
		}
		body := req.Data
		if body == nil {
			body = map[string]any{}
		}
		title := "Notification"
		if t, ok := body["title"].(string); ok {
			title = t
		}
		if req.Template != "" {
			var subject string
			_ = h.db.QueryRow(ctx, `SELECT COALESCE(subject,'') FROM notification_templates WHERE tenant_id = $1 AND template_key = $2 AND channel = 'in_app' LIMIT 1`, tenantID, req.Template).Scan(&subject)
			if subject != "" {
				title = subject
			}
		}
		if h.wsHub != nil {
			h.wsHub.BroadcastToTenant(tenantID, ws.Delivery{
				NotificationID: notificationID,
				Title:          title,
				Body:           "",
				Data:           body,
				Channel:        ch,
			})
		}
		_, _ = h.db.Exec(ctx, `INSERT INTO in_app_notifications (tenant_id, notification_id, title, body, data_json, status) VALUES ($1,$2,$3,'',$4,'unread')`, tenantID, notificationID, title, toJSON(body))
	}
}

func toJSON(v any) string {
	b, _ := json.Marshal(v)
	return string(b)
}

func (h Handler) ForgotPassword(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Email string `json:"email"`
	}
	if decode(w, r, &req) != nil {
		return
	}
	if req.Email == "" {
		writeJSON(w, http.StatusBadRequest, map[string]any{"error": "email is required"})
		return
	}
	var userID string
	err := h.db.QueryRow(r.Context(), `SELECT id::text FROM users WHERE email = $1 AND status = 'active'`, req.Email).Scan(&userID)
	if err != nil {
		_ = h.audit.Write(r.Context(), audit.Event{ActorType: "anonymous", Action: "password.forgot.not_found", ResourceType: "password_reset", After: map[string]any{"email": req.Email}})
		writeJSON(w, http.StatusOK, map[string]any{"message": "if the email exists, a reset link has been sent"})
		return
	}
	token, err := security.RandomToken("prt", 32)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]any{"error": "token generation failed"})
		return
	}
	_, err = h.db.Exec(r.Context(), `INSERT INTO password_reset_tokens (user_id, token_hash, expires_at) VALUES ($1,$2,now() + interval '1 hour')`, userID, security.HashSecret(token))
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]any{"error": "token creation failed"})
		return
	}
	_ = h.audit.SecurityEvent(r.Context(), audit.Event{ActorUserID: userID, ActorType: "user", Action: "password.reset_requested", ResourceType: "password_reset", After: map[string]any{"email": req.Email}}, "info")
	h.log.Info("password reset token created", zap.String("user_id", userID), zap.String("token", token))
	writeJSON(w, http.StatusOK, map[string]any{"message": "if the email exists, a reset link has been sent"})
}

func (h Handler) ResetPassword(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Token       string `json:"token"`
		NewPassword string `json:"new_password"`
	}
	if decode(w, r, &req) != nil {
		return
	}
	if req.Token == "" || req.NewPassword == "" {
		writeJSON(w, http.StatusBadRequest, map[string]any{"error": "token and new_password are required"})
		return
	}
	if len(req.NewPassword) < 8 {
		writeJSON(w, http.StatusBadRequest, map[string]any{"error": "password must be at least 8 characters"})
		return
	}
	var userID string
	err := h.db.QueryRow(r.Context(), `SELECT user_id::text FROM password_reset_tokens WHERE token_hash = $1 AND status = 'active' AND expires_at > now()`, security.HashSecret(req.Token)).Scan(&userID)
	if err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]any{"error": "invalid or expired token"})
		return
	}
	hash, err := bcryptHash(req.NewPassword)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]any{"error": "password hashing failed"})
		return
	}
	_, err = h.db.Exec(r.Context(), `UPDATE password_reset_tokens SET status = 'consumed', consumed_at = now() WHERE token_hash = $1`, security.HashSecret(req.Token))
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]any{"error": "token consumption failed"})
		return
	}
	_, err = h.db.Exec(r.Context(), `UPDATE users SET password_hash = $1, password_changed_at = now(), updated_at = now() WHERE id = $2`, hash, userID)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]any{"error": "password update failed"})
		return
	}
	_ = h.audit.SecurityEvent(r.Context(), audit.Event{ActorUserID: userID, ActorType: "user", Action: "password.reset_completed", ResourceType: "user", ResourceID: userID}, "info")
	writeJSON(w, http.StatusOK, map[string]any{"message": "password has been reset"})
}

func (h Handler) RequestEmailVerification(w http.ResponseWriter, r *http.Request) {
	p, _ := httpmw.Principal(r.Context())
	var email string
	err := h.db.QueryRow(r.Context(), `SELECT email FROM users WHERE id = $1`, p.UserID).Scan(&email)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]any{"error": "user not found"})
		return
	}
	var verifiedAt *time.Time
	var mfaEnabled bool
	_ = h.db.QueryRow(r.Context(), `SELECT email_verified_at, COALESCE(mfa_enabled,false) FROM users WHERE id = $1`, p.UserID).Scan(&verifiedAt, &mfaEnabled)
	if verifiedAt != nil {
		writeJSON(w, http.StatusOK, map[string]any{"message": "email already verified"})
		return
	}
	token, err := security.RandomToken("evt", 32)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]any{"error": "token generation failed"})
		return
	}
	_, err = h.db.Exec(r.Context(), `INSERT INTO email_verification_tokens (user_id, token_hash, expires_at) VALUES ($1,$2,now() + interval '24 hours')`, p.UserID, security.HashSecret(token))
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]any{"error": "token creation failed"})
		return
	}
	h.log.Info("email verification token created", zap.String("user_id", p.UserID), zap.String("email", email))
	writeJSON(w, http.StatusOK, map[string]any{"message": "verification email sent"})
}

func (h Handler) VerifyEmail(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Token string `json:"token"`
	}
	if decode(w, r, &req) != nil {
		return
	}
	if req.Token == "" {
		writeJSON(w, http.StatusBadRequest, map[string]any{"error": "token is required"})
		return
	}
	var userID string
	err := h.db.QueryRow(r.Context(), `SELECT user_id::text FROM email_verification_tokens WHERE token_hash = $1 AND status = 'active' AND expires_at > now()`, security.HashSecret(req.Token)).Scan(&userID)
	if err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]any{"error": "invalid or expired token"})
		return
	}
	_, err = h.db.Exec(r.Context(), `UPDATE email_verification_tokens SET status = 'consumed', consumed_at = now() WHERE token_hash = $1`, security.HashSecret(req.Token))
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]any{"error": "token consumption failed"})
		return
	}
	_, err = h.db.Exec(r.Context(), `UPDATE users SET email_verified_at = now(), updated_at = now() WHERE id = $1`, userID)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]any{"error": "verification failed"})
		return
	}
	_ = h.audit.Write(r.Context(), audit.Event{ActorUserID: userID, ActorType: "user", Action: "email.verified", ResourceType: "user", ResourceID: userID})
	writeJSON(w, http.StatusOK, map[string]any{"message": "email verified"})
}

func bcryptHash(password string) (string, error) {
	hash, err := bcrypt.GenerateFromPassword([]byte(password), bcrypt.DefaultCost)
	if err != nil {
		return "", err
	}
	return string(hash), nil
}

func nullIfEmpty(value string) any {
	if value == "" {
		return nil
	}
	return value
}
