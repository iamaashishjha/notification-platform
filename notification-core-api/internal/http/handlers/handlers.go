package handlers

import (
	"context"
	"encoding/json"
	"net/http"
	"strconv"
	"strings"
	"time"

	"notification-core-api/internal/audit"
	"notification-core-api/internal/auth"
	"notification-core-api/internal/failures"
	httpmw "notification-core-api/internal/http/middleware"
	"notification-core-api/internal/notifications"
	"notification-core-api/internal/providers"
	emailpkg "notification-core-api/internal/providers/email"
	fcmpkg "notification-core-api/internal/providers/fcm"
	smspkg "notification-core-api/internal/providers/sms"
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
	_ = h.audit.Write(r.Context(), audit.Event{TenantID: principal.TenantID, ActorUserID: principal.UserID, ActorType: "tenant_user", Action: "login.success", ResourceType: "auth_session", IPAddress: clientIP(r), UserAgent: r.UserAgent(), RequestID: httpmw.RequestID(r.Context()), SessionID: principal.SessionID, After: map[string]any{"email": principal.Email}})
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
	page, perPage, offset := pagination(r)
	q := `
FROM notifications n
JOIN tenants t ON t.id = n.tenant_id
LEFT JOIN LATERAL (
	SELECT d.status, d.channel, d.provider, d.updated_at, d.response_json
	FROM notification_deliveries d
	WHERE d.notification_id = n.id
	ORDER BY d.updated_at DESC
	LIMIT 1
) d ON true`
	where := []string{}
	args := []any{}
	add := func(condition string, value any) {
		args = append(args, value)
		where = append(where, condition+" $"+strconv.Itoa(len(args)))
	}
	if !p.IsPlatform {
		add("n.tenant_id =", p.TenantID)
	} else if tenantID := r.URL.Query().Get("tenant_id"); tenantID != "" {
		add("n.tenant_id =", tenantID)
	}
	if search := strings.TrimSpace(r.URL.Query().Get("search")); search != "" {
		args = append(args, "%"+strings.ToLower(search)+"%")
		where = append(where, "(lower(n.public_id) LIKE $"+strconv.Itoa(len(args))+" OR lower(n.event_key) LIKE $"+strconv.Itoa(len(args))+" OR lower(COALESCE(n.idempotency_key,'')) LIKE $"+strconv.Itoa(len(args))+")")
	}
	if channel := strings.TrimSpace(r.URL.Query().Get("channel")); channel != "" {
		add("d.channel =", channel)
	}
	if provider := strings.TrimSpace(r.URL.Query().Get("provider")); provider != "" {
		add("d.provider =", provider)
	}
	if status := strings.TrimSpace(r.URL.Query().Get("status")); status != "" {
		add("COALESCE(d.status,n.status) =", status)
	}
	if from := strings.TrimSpace(r.URL.Query().Get("from")); from != "" {
		add("n.created_at >=", from)
	}
	if to := strings.TrimSpace(r.URL.Query().Get("to")); to != "" {
		add("n.created_at <=", to)
	}
	if len(where) > 0 {
		q += " WHERE " + strings.Join(where, " AND ")
	}
	var total int
	if err := h.db.QueryRow(r.Context(), "SELECT COUNT(*) "+q, args...).Scan(&total); err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]any{"error": "count failed"})
		return
	}
	listArgs := append([]any{}, args...)
	listArgs = append(listArgs, perPage, offset)
	rows, err := h.db.Query(r.Context(), `
SELECT n.public_id, n.tenant_id::text, t.name, n.event_key, n.status, COALESCE(d.status,'pending'),
       COALESCE(d.channel,''), COALESCE(d.provider,''), n.idempotency_key, n.created_at, n.updated_at
`+q+` ORDER BY n.created_at DESC LIMIT $`+strconv.Itoa(len(args)+1)+` OFFSET $`+strconv.Itoa(len(args)+2), listArgs...)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]any{"error": "query failed"})
		return
	}
	defer rows.Close()
	items := []map[string]any{}
	for rows.Next() {
		var publicID, tenantID, tenantName, event, status, deliveryStatus, channel, provider string
		var idempotencyKey *string
		var createdAt time.Time
		var updatedAt time.Time
		if err := rows.Scan(&publicID, &tenantID, &tenantName, &event, &status, &deliveryStatus, &channel, &provider, &idempotencyKey, &createdAt, &updatedAt); err != nil {
			writeJSON(w, http.StatusInternalServerError, map[string]any{"error": "scan failed"})
			return
		}
		items = append(items, map[string]any{"public_id": publicID, "tenant_id": tenantID, "tenant": tenantName, "event": event, "status": status, "delivery_status": deliveryStatus, "channel": channel, "provider": provider, "idempotency_key": idempotencyKey, "created_at": createdAt, "updated_at": updatedAt})
	}
	writeJSON(w, http.StatusOK, map[string]any{"data": items, "meta": paginationMeta(page, perPage, total)})
}

func (h Handler) GetNotificationDetail(w http.ResponseWriter, r *http.Request) {
	p, _ := httpmw.Principal(r.Context())
	publicID := r.PathValue("public_id")
	q := `
SELECT n.id::text, n.tenant_id::text, t.name, n.public_id, n.event_key, COALESCE(n.template_key,''), n.target_type,
       n.target_json, n.data_json, n.channels, n.priority, n.schedule_type, n.scheduled_at, n.status,
       COALESCE(n.idempotency_key,''), n.created_at, n.updated_at
FROM notifications n
JOIN tenants t ON t.id = n.tenant_id
WHERE n.public_id = $1`
	args := []any{publicID}
	if !p.IsPlatform {
		q += " AND n.tenant_id = $2"
		args = append(args, p.TenantID)
	}
	var id, tenantID, tenantName, event, templateKey, targetType, status, idempotencyKey, scheduleType string
	var targetRaw, dataRaw, channelsRaw []byte
	var priority int
	var scheduledAt *time.Time
	var createdAt, updatedAt time.Time
	if err := h.db.QueryRow(r.Context(), q, args...).Scan(&id, &tenantID, &tenantName, &publicID, &event, &templateKey, &targetType, &targetRaw, &dataRaw, &channelsRaw, &priority, &scheduleType, &scheduledAt, &status, &idempotencyKey, &createdAt, &updatedAt); err != nil {
		if err == pgx.ErrNoRows {
			writeJSON(w, http.StatusNotFound, map[string]any{"error": "notification not found"})
			return
		}
		writeJSON(w, http.StatusInternalServerError, map[string]any{"error": "query failed"})
		return
	}
	deliveries, timeline, err := h.notificationDeliveries(r.Context(), id)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]any{"error": "delivery query failed"})
		return
	}
	timeline = append([]map[string]any{{
		"type":        "created",
		"timestamp":   createdAt,
		"source":      "api",
		"explanation": "Notification request accepted by the platform.",
	}}, timeline...)
	if scheduledAt != nil {
		timeline = append(timeline, map[string]any{"type": "scheduled", "timestamp": scheduledAt, "source": "scheduler", "explanation": "Notification is scheduled for future queueing."})
	}
	writeJSON(w, http.StatusOK, map[string]any{"data": map[string]any{
		"id": id, "tenant_id": tenantID, "tenant": tenantName, "public_id": publicID, "event": event,
		"template_key": templateKey, "target_type": targetType, "target": maskRecipientJSON(targetRaw),
		"data": json.RawMessage(security.RedactJSON(dataRaw)), "channels": json.RawMessage(channelsRaw), "priority": priority,
		"schedule_type": scheduleType, "scheduled_at": scheduledAt, "status": status, "idempotency_key": idempotencyKey,
		"created_at": createdAt, "updated_at": updatedAt, "deliveries": deliveries, "timeline": timeline,
	}})
}

func (h Handler) ListTenants(w http.ResponseWriter, r *http.Request) {
	p, _ := httpmw.Principal(r.Context())
	q := `SELECT id::text, name, slug, status, created_at FROM tenants`
	args := []any{}
	if !p.IsPlatform {
		q += ` WHERE id = $1`
		args = append(args, p.TenantID)
	}
	q += ` ORDER BY created_at DESC`
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

func (h Handler) GetMyIntegrationGuide(w http.ResponseWriter, r *http.Request) {
	p, _ := httpmw.Principal(r.Context())
	if p.TenantID == "" {
		writeJSON(w, http.StatusBadRequest, map[string]any{"error": "tenant context required"})
		return
	}
	h.writeIntegrationGuide(w, r, p.TenantID)
}

func (h Handler) GetTenantIntegrationGuide(w http.ResponseWriter, r *http.Request) {
	p, _ := httpmw.Principal(r.Context())
	tenantID := r.PathValue("id")
	if !p.IsPlatform && p.TenantID != tenantID {
		writeJSON(w, http.StatusForbidden, map[string]any{"error": "access denied"})
		return
	}
	h.writeIntegrationGuide(w, r, tenantID)
}

func (h Handler) writeIntegrationGuide(w http.ResponseWriter, r *http.Request, tenantID string) {
	data, err := h.integrationGuideData(r.Context(), r, tenantID)
	if err != nil {
		if err == pgx.ErrNoRows {
			writeJSON(w, http.StatusNotFound, map[string]any{"error": "tenant not found"})
			return
		}
		writeJSON(w, http.StatusInternalServerError, map[string]any{"error": "integration query failed"})
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"data": data})
}

func (h Handler) ListAuditLogs(w http.ResponseWriter, r *http.Request) {
	p, _ := httpmw.Principal(r.Context())
	tenantFilter := r.URL.Query().Get("tenant_id")
	q := `SELECT al.id::text, COALESCE(al.tenant_id::text,''), al.action, al.actor_type, COALESCE(al.actor_user_id::text,''), al.resource_type, COALESCE(al.resource_id::text,''), COALESCE(al.ip_address,''), COALESCE(al.request_id,''), COALESCE(al.session_id,''), al.created_at`
	args := []any{}
	if p.IsPlatform {
		q += `, COALESCE(t.name,'') AS tenant_name FROM audit_logs al LEFT JOIN tenants t ON t.id = al.tenant_id`
		if tenantFilter != "" {
			q += ` WHERE al.tenant_id = $1`
			args = append(args, tenantFilter)
		}
	} else {
		q += ` FROM audit_logs al WHERE al.tenant_id = $1`
		args = append(args, p.TenantID)
	}
	q += ` ORDER BY al.created_at DESC`
	rows, err := h.db.Query(r.Context(), q, args...)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]any{"error": "query failed"})
		return
	}
	defer rows.Close()
	items := []map[string]any{}
	for rows.Next() {
		var id, tenantID, action, actorType, actorUserID, resourceType, resourceID, ipAddress, requestID, sessionID string
		var createdAt time.Time
		if p.IsPlatform {
			var tenantName string
			if err := rows.Scan(&id, &tenantID, &action, &actorType, &actorUserID, &resourceType, &resourceID, &ipAddress, &requestID, &sessionID, &createdAt, &tenantName); err != nil {
				writeJSON(w, http.StatusInternalServerError, map[string]any{"error": "scan failed"})
				return
			}
			items = append(items, map[string]any{"id": id, "tenant_id": tenantID, "action": action, "actor_type": actorType, "actor_user_id": actorUserID, "resource_type": resourceType, "resource_id": resourceID, "ip_address": ipAddress, "request_id": requestID, "session_id": sessionID, "created_at": createdAt, "tenant_name": tenantName})
		} else {
			if err := rows.Scan(&id, &tenantID, &action, &actorType, &actorUserID, &resourceType, &resourceID, &ipAddress, &requestID, &sessionID, &createdAt); err != nil {
				writeJSON(w, http.StatusInternalServerError, map[string]any{"error": "scan failed"})
				return
			}
			items = append(items, map[string]any{"id": id, "tenant_id": tenantID, "action": action, "actor_type": actorType, "actor_user_id": actorUserID, "resource_type": resourceType, "resource_id": resourceID, "ip_address": ipAddress, "request_id": requestID, "session_id": sessionID, "created_at": createdAt})
		}
	}
	writeJSON(w, http.StatusOK, map[string]any{"data": items})
}

func (h Handler) ListAPIKeys(w http.ResponseWriter, r *http.Request) {
	p, _ := httpmw.Principal(r.Context())
	tenantFilter := r.URL.Query().Get("tenant_id")
	q := `SELECT ak.id::text, ak.tenant_id::text, ak.name, COALESCE(ak.scopes_json::text,'[]'), ak.status, COALESCE(ak.last_used_at::text,''), ak.created_at`
	args := []any{}
	if p.IsPlatform {
		q += `, COALESCE(t.name,'') AS tenant_name FROM tenant_api_keys ak LEFT JOIN tenants t ON t.id = ak.tenant_id`
		if tenantFilter != "" {
			q += ` WHERE ak.tenant_id = $1`
			args = append(args, tenantFilter)
		}
	} else {
		q += ` FROM tenant_api_keys ak WHERE ak.tenant_id = $1`
		args = append(args, p.TenantID)
	}
	q += ` ORDER BY ak.created_at DESC`
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
		if p.IsPlatform {
			var tenantName string
			if err := rows.Scan(&id, &tenantID, &name, &scopes, &status, &lastUsed, &createdAt, &tenantName); err != nil {
				writeJSON(w, http.StatusInternalServerError, map[string]any{"error": "scan failed"})
				return
			}
			items = append(items, map[string]any{"id": id, "tenant_id": tenantID, "tenant_name": tenantName, "name": name, "scopes": scopes, "status": status, "last_used_at": lastUsed, "created_at": createdAt})
		} else {
			if err := rows.Scan(&id, &tenantID, &name, &scopes, &status, &lastUsed, &createdAt); err != nil {
				writeJSON(w, http.StatusInternalServerError, map[string]any{"error": "scan failed"})
				return
			}
			items = append(items, map[string]any{"id": id, "tenant_id": tenantID, "name": name, "scopes": scopes, "status": status, "last_used_at": lastUsed, "created_at": createdAt})
		}
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
	if tenantID == "" {
		writeJSON(w, http.StatusBadRequest, map[string]any{"error": "tenant_id is required"})
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
	tenantFilter := r.URL.Query().Get("tenant_id")
	userScope := r.URL.Query().Get("scope")
	var rows pgx.Rows
	var err error
	if p.IsPlatform {
		q := `SELECT u.id::text, u.email, u.name, u.is_platform_admin, u.status, u.created_at,
			COALESCE((SELECT STRING_AGG(DISTINCT r.name, ', ') FROM user_roles ur JOIN roles r ON r.id = ur.role_id WHERE ur.user_id = u.id), '') AS roles,
			COALESCE((SELECT STRING_AGG(DISTINCT t.name, ', ') FROM tenant_users tu JOIN tenants t ON t.id = tu.tenant_id WHERE tu.user_id = u.id), '') AS tenants
			FROM users u`
		args := []any{}
		where := []string{}
		if userScope == "platform" {
			where = append(where, "u.is_platform_admin = true")
		} else if userScope == "tenant" {
			where = append(where, "u.is_platform_admin = false")
		}
		if tenantFilter != "" {
			where = append(where, "u.id IN (SELECT user_id FROM tenant_users WHERE tenant_id = $"+itoa(len(args)+1)+")")
			args = append(args, tenantFilter)
		}
		if len(where) > 0 {
			q += ` WHERE ` + strings.Join(where, ` AND `)
		}
		q += ` ORDER BY u.created_at DESC`
		rows, err = h.db.Query(r.Context(), q, args...)
	} else {
		rows, err = h.db.Query(r.Context(), `SELECT u.id::text, u.email, u.name, u.is_platform_admin, u.status, u.created_at,
			COALESCE((SELECT STRING_AGG(DISTINCT r.name, ', ') FROM user_roles ur JOIN roles r ON r.id = ur.role_id WHERE ur.user_id = u.id AND ur.tenant_id = tu.tenant_id), '') AS roles
			FROM users u JOIN tenant_users tu ON tu.user_id = u.id WHERE tu.tenant_id = $1 ORDER BY u.created_at DESC`, p.TenantID)
	}
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]any{"error": "query failed"})
		return
	}
	defer rows.Close()
	items := []map[string]any{}
	for rows.Next() {
		var id, email, name, status string
		var roles string
		var isPlatform bool
		var createdAt time.Time
		if p.IsPlatform {
			var tenants string
			if err := rows.Scan(&id, &email, &name, &isPlatform, &status, &createdAt, &roles, &tenants); err != nil {
				writeJSON(w, http.StatusInternalServerError, map[string]any{"error": "scan failed"})
				return
			}
			items = append(items, map[string]any{"id": id, "email": email, "name": name, "is_platform_admin": isPlatform, "status": status, "created_at": createdAt, "roles": roles, "tenants": tenants})
		} else {
			if err := rows.Scan(&id, &email, &name, &isPlatform, &status, &createdAt, &roles); err != nil {
				writeJSON(w, http.StatusInternalServerError, map[string]any{"error": "scan failed"})
				return
			}
			items = append(items, map[string]any{"id": id, "email": email, "name": name, "is_platform_admin": isPlatform, "status": status, "created_at": createdAt, "roles": roles})
		}
	}
	writeJSON(w, http.StatusOK, map[string]any{"data": items})
}

func (h Handler) ListFeatures(w http.ResponseWriter, r *http.Request) {
	p, _ := httpmw.Principal(r.Context())
	q := `SELECT tf.id::text, tf.feature_key, fc.name, fc.description, fc.category, tf.enabled, COALESCE(t.name,''), tf.created_at FROM tenant_features tf JOIN tenants t ON t.id = tf.tenant_id JOIN feature_catalog fc ON fc.identifier = tf.feature_key`
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
		var id, key, name, description, category, tenantName string
		var enabled bool
		var createdAt time.Time
		if err := rows.Scan(&id, &key, &name, &description, &category, &enabled, &tenantName, &createdAt); err != nil {
			writeJSON(w, http.StatusInternalServerError, map[string]any{"error": "scan failed"})
			return
		}
		items = append(items, map[string]any{"id": id, "identifier": key, "feature_key": key, "name": name, "description": description, "category": category, "enabled": enabled, "tenant_name": tenantName, "created_at": createdAt})
	}
	writeJSON(w, http.StatusOK, map[string]any{"data": items})
}

func (h Handler) ListChannels(w http.ResponseWriter, r *http.Request) {
	p, _ := httpmw.Principal(r.Context())
	q := `SELECT tc.id::text, tc.channel, tc.enabled, tc.direction, tc.rate_limit_per_second, tc.daily_quota, COALESCE(t.name,'') FROM tenant_channels tc JOIN tenants t ON t.id = tc.tenant_id JOIN platform_channels pc ON pc.channel=tc.channel AND pc.enabled=true`
	args := []any{}
	if !p.IsPlatform {
		q += ` WHERE tc.tenant_id = $1`
		args = append(args, p.TenantID)
	} else if tenantID := r.URL.Query().Get("tenant_id"); tenantID != "" {
		q += ` WHERE tc.tenant_id = $1`
		args = append(args, tenantID)
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

func (h Handler) ListQueueControls(w http.ResponseWriter, r *http.Request) {
	p, _ := httpmw.Principal(r.Context())
	tenantFilter := r.URL.Query().Get("tenant_id")
	_, _ = h.db.Exec(r.Context(), `
INSERT INTO tenant_queue_controls (tenant_id, channel, queue_name)
SELECT tc.tenant_id, tc.channel, 'tenant.' || regexp_replace(lower(t.slug), '[^a-z0-9]+', '-', 'g') || '.' || tc.channel
FROM tenant_channels tc
JOIN tenants t ON t.id = tc.tenant_id
ON CONFLICT (tenant_id, channel) DO NOTHING`)
	q := `
SELECT tqc.id::text, tqc.tenant_id::text, COALESCE(t.name,''), tqc.channel, tqc.queue_name, tqc.status, tqc.max_attempts, tqc.retry_delay_seconds, tqc.notes, tqc.updated_at
FROM tenant_queue_controls tqc
JOIN tenants t ON t.id = tqc.tenant_id`
	args := []any{}
	if p.IsPlatform {
		if tenantFilter != "" {
			q += ` WHERE tqc.tenant_id = $1`
			args = append(args, tenantFilter)
		}
	} else {
		q += ` WHERE tqc.tenant_id = $1`
		args = append(args, p.TenantID)
	}
	q += ` ORDER BY t.name, tqc.channel`
	rows, err := h.db.Query(r.Context(), q, args...)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]any{"error": "query failed"})
		return
	}
	defer rows.Close()
	items := []map[string]any{}
	for rows.Next() {
		var id, tenantID, tenantName, channel, queueName, status, notes string
		var maxAttempts, retryDelaySeconds int
		var updatedAt time.Time
		if err := rows.Scan(&id, &tenantID, &tenantName, &channel, &queueName, &status, &maxAttempts, &retryDelaySeconds, &notes, &updatedAt); err != nil {
			writeJSON(w, http.StatusInternalServerError, map[string]any{"error": "scan failed"})
			return
		}
		items = append(items, map[string]any{"id": id, "tenant_id": tenantID, "tenant_name": tenantName, "channel": channel, "queue_name": queueName, "status": status, "max_attempts": maxAttempts, "retry_delay_seconds": retryDelaySeconds, "notes": notes, "updated_at": updatedAt})
	}
	writeJSON(w, http.StatusOK, map[string]any{"data": items})
}

func (h Handler) UpdateQueueControl(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	var req struct {
		Status            *string `json:"status"`
		MaxAttempts       *int    `json:"max_attempts"`
		RetryDelaySeconds *int    `json:"retry_delay_seconds"`
		Notes             *string `json:"notes"`
	}
	if decode(w, r, &req) != nil {
		return
	}
	p, _ := httpmw.Principal(r.Context())
	var tenantID string
	if err := h.db.QueryRow(r.Context(), `SELECT tenant_id::text FROM tenant_queue_controls WHERE id = $1`, id).Scan(&tenantID); err != nil {
		writeJSON(w, http.StatusNotFound, map[string]any{"error": "queue control not found"})
		return
	}
	if !p.IsPlatform && tenantID != p.TenantID {
		writeJSON(w, http.StatusForbidden, map[string]any{"error": "forbidden"})
		return
	}
	q := `UPDATE tenant_queue_controls SET updated_at = now(), updated_by = $1`
	args := []any{nullIfEmpty(p.UserID)}
	argN := 2
	if req.Status != nil {
		if *req.Status != "active" && *req.Status != "paused" && *req.Status != "stopped" {
			writeJSON(w, http.StatusBadRequest, map[string]any{"error": "invalid status"})
			return
		}
		q += ", status = $" + itoa(argN)
		args = append(args, *req.Status)
		argN++
	}
	if req.MaxAttempts != nil {
		if *req.MaxAttempts < 1 || *req.MaxAttempts > 20 {
			writeJSON(w, http.StatusBadRequest, map[string]any{"error": "max_attempts must be between 1 and 20"})
			return
		}
		q += ", max_attempts = $" + itoa(argN)
		args = append(args, *req.MaxAttempts)
		argN++
	}
	if req.RetryDelaySeconds != nil {
		if *req.RetryDelaySeconds < 0 || *req.RetryDelaySeconds > 86400 {
			writeJSON(w, http.StatusBadRequest, map[string]any{"error": "retry_delay_seconds must be between 0 and 86400"})
			return
		}
		q += ", retry_delay_seconds = $" + itoa(argN)
		args = append(args, *req.RetryDelaySeconds)
		argN++
	}
	if req.Notes != nil {
		q += ", notes = $" + itoa(argN)
		args = append(args, *req.Notes)
		argN++
	}
	q += " WHERE id = $" + itoa(argN)
	args = append(args, id)
	if _, err := h.db.Exec(r.Context(), q, args...); err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]any{"error": "update failed"})
		return
	}
	_ = h.audit.Write(r.Context(), audit.Event{TenantID: tenantID, ActorUserID: p.UserID, ActorType: "tenant_user", Action: "queue_control.update", ResourceType: "tenant_queue_control", ResourceID: id})
	writeJSON(w, http.StatusOK, map[string]any{"message": "queue control updated"})
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
		Email           string `json:"email"`
		Name            string `json:"name"`
		Password        string `json:"password"`
		TenantID        string `json:"tenant_id"`
		IsPlatformAdmin bool   `json:"is_platform_admin"`
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
		req.IsPlatformAdmin = false
	}
	if req.IsPlatformAdmin && !p.IsPlatform {
		writeJSON(w, http.StatusForbidden, map[string]any{"error": "cannot create platform admin"})
		return
	}
	if !req.IsPlatformAdmin && tenantID == "" {
		writeJSON(w, http.StatusBadRequest, map[string]any{"error": "tenant_id is required for tenant users"})
		return
	}
	var userID string
	if err := h.db.QueryRow(r.Context(), `INSERT INTO users (email, name, password_hash, is_platform_admin, status) VALUES ($1,$2,$3,$4,'active') RETURNING id::text`, req.Email, req.Name, hash, req.IsPlatformAdmin).Scan(&userID); err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]any{"error": "create failed", "detail": err.Error()})
		return
	}
	if tenantID != "" {
		h.db.Exec(r.Context(), `INSERT INTO tenant_users (tenant_id, user_id, status) VALUES ($1,$2,'active') ON CONFLICT DO NOTHING`, tenantID, userID)
	}
	_ = h.audit.Write(r.Context(), audit.Event{TenantID: tenantID, ActorUserID: p.UserID, ActorType: "tenant_user", Action: "user.create", ResourceType: "user", ResourceID: userID, After: map[string]any{"email": req.Email, "name": req.Name, "is_platform_admin": req.IsPlatformAdmin}})
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
		q += ", name = $" + itoa(argN)
		args = append(args, req.Name)
		argN++
	}
	if req.Email != "" {
		q += ", email = $" + itoa(argN)
		args = append(args, req.Email)
		argN++
	}
	if req.Status != "" {
		q += ", status = $" + itoa(argN)
		args = append(args, req.Status)
		argN++
	}
	q += " WHERE id = $" + itoa(argN)
	args = append(args, id)
	argN++
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
		Enabled            *bool  `json:"enabled"`
		Direction          string `json:"direction"`
		RateLimitPerSecond *int   `json:"rate_limit_per_second"`
		DailyQuota         *int   `json:"daily_quota"`
		Priority           *int   `json:"priority"`
	}
	if decode(w, r, &req) != nil {
		return
	}
	p, _ := httpmw.Principal(r.Context())
	q := `UPDATE tenant_channels SET updated_at = now()`
	args := []any{}
	argN := 1
	if req.Enabled != nil {
		q += ", enabled = $" + itoa(argN)
		args = append(args, *req.Enabled)
		argN++
	}
	if req.Direction != "" {
		q += ", direction = $" + itoa(argN)
		args = append(args, req.Direction)
		argN++
	}
	if req.RateLimitPerSecond != nil {
		q += ", rate_limit_per_second = $" + itoa(argN)
		args = append(args, *req.RateLimitPerSecond)
		argN++
	}
	if req.DailyQuota != nil {
		q += ", daily_quota = $" + itoa(argN)
		args = append(args, *req.DailyQuota)
		argN++
	}
	if req.Priority != nil {
		q += ", priority = $" + itoa(argN)
		args = append(args, *req.Priority)
		argN++
	}
	q += " WHERE id = $" + itoa(argN)
	args = append(args, id)
	argN++
	if !p.IsPlatform {
		q += " AND tenant_id = $" + itoa(argN)
		args = append(args, p.TenantID)
		argN++
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
	encrypted, err := encryptedProviderConfigJSON(configRaw)
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
		q += ", provider = $" + itoa(argN)
		args = append(args, req.Provider)
		argN++
	}
	if req.IsDefault != nil {
		q += ", is_default = $" + itoa(argN)
		args = append(args, *req.IsDefault)
		argN++
	}
	if req.Status != "" {
		q += ", status = $" + itoa(argN)
		args = append(args, req.Status)
		argN++
	}
	if req.ConfigJSON != "" {
		encrypted, err := encryptedProviderConfigJSON(req.ConfigJSON)
		if err != nil {
			writeJSON(w, http.StatusInternalServerError, map[string]any{"error": "encryption failed"})
			return
		}
		q += ", config_json = $" + itoa(argN) + "::jsonb"
		args = append(args, encrypted)
		argN++
	}
	q += " WHERE id = $" + itoa(argN)
	args = append(args, id)
	argN++
	if !p.IsPlatform {
		q += " AND tenant_id = $" + itoa(argN)
		args = append(args, p.TenantID)
		argN++
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
	decrypted, err := decryptProviderConfigJSON(configRaw)
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
	q += ` ORDER BY created_at DESC`
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

type tenantProvisioningRequest struct {
	Name     string         `json:"name"`
	Slug     string         `json:"slug"`
	Settings map[string]any `json:"settings"`
	Features []string       `json:"features"`
	Channels []struct {
		Channel    string `json:"channel"`
		Enabled    bool   `json:"enabled"`
		Direction  string `json:"direction"`
		RateLimit  int    `json:"rate_limit_per_second"`
		DailyQuota int    `json:"daily_quota"`
	} `json:"channels"`
	Providers []struct {
		Channel   string `json:"channel"`
		Provider  string `json:"provider"`
		IsDefault bool   `json:"is_default"`
	} `json:"providers"`
	Templates []struct {
		TemplateKey string `json:"template_key"`
		Channel     string `json:"channel"`
		Subject     string `json:"subject"`
		Body        string `json:"body"`
	} `json:"templates"`
}

func (h Handler) applyTenantProvisioning(ctx context.Context, tenantID string, req tenantProvisioningRequest) error {
	if req.Settings != nil {
		raw, _ := json.Marshal(req.Settings)
		if _, err := h.db.Exec(ctx, `UPDATE tenants SET config_json=$1::jsonb,updated_at=now() WHERE id=$2`, string(raw), tenantID); err != nil {
			return err
		}
	}
	if req.Features != nil {
		if _, err := h.db.Exec(ctx, `INSERT INTO tenant_features(tenant_id,feature_key,enabled) SELECT $1,identifier,identifier=ANY($2::text[]) FROM feature_catalog WHERE status='active' ON CONFLICT(tenant_id,feature_key) DO UPDATE SET enabled=EXCLUDED.enabled,updated_at=now()`, tenantID, req.Features); err != nil {
			return err
		}
	}
	for _, channel := range req.Channels {
		direction := channel.Direction
		if direction == "" {
			direction = "one_way"
		}
		rate := channel.RateLimit
		if rate < 1 {
			rate = 10
		}
		quota := channel.DailyQuota
		if quota < 1 {
			quota = 10000
		}
		if _, err := h.db.Exec(ctx, `INSERT INTO tenant_channels(tenant_id,channel,enabled,direction,rate_limit_per_second,daily_quota) VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT(tenant_id,channel) DO UPDATE SET enabled=EXCLUDED.enabled,direction=EXCLUDED.direction,rate_limit_per_second=EXCLUDED.rate_limit_per_second,daily_quota=EXCLUDED.daily_quota,updated_at=now()`, tenantID, channel.Channel, channel.Enabled, direction, rate, quota); err != nil {
			return err
		}
	}
	if req.Providers != nil {
		if _, err := h.db.Exec(ctx, `DELETE FROM tenant_provider_configs WHERE tenant_id=$1`, tenantID); err != nil {
			return err
		}
		for _, provider := range req.Providers {
			encrypted, err := security.Encrypt(`{}`)
			if err != nil {
				return err
			}
			if _, err = h.db.Exec(ctx, `INSERT INTO tenant_provider_configs(tenant_id,channel,provider,config_json,is_default,status) VALUES($1,$2,$3,$4::jsonb,$5,'active')`, tenantID, provider.Channel, provider.Provider, encrypted, provider.IsDefault); err != nil {
				return err
			}
		}
	}
	if req.Templates != nil {
		if _, err := h.db.Exec(ctx, `DELETE FROM notification_templates WHERE tenant_id=$1`, tenantID); err != nil {
			return err
		}
	}
	for _, template := range req.Templates {
		if template.TemplateKey == "" || template.Channel == "" || template.Body == "" {
			continue
		}
		if _, err := h.db.Exec(ctx, `INSERT INTO notification_templates(tenant_id,template_key,channel,subject,body,status) VALUES($1,$2,$3,$4,$5,'active') ON CONFLICT(tenant_id,template_key,channel,locale) DO UPDATE SET subject=EXCLUDED.subject,body=EXCLUDED.body,status='active',updated_at=now()`, tenantID, template.TemplateKey, template.Channel, nullIfEmpty(template.Subject), template.Body); err != nil {
			return err
		}
	}
	return nil
}

func (h Handler) CreateTenant(w http.ResponseWriter, r *http.Request) {
	p, _ := httpmw.Principal(r.Context())
	if !p.IsPlatform {
		writeJSON(w, http.StatusForbidden, map[string]any{"error": "platform admin only"})
		return
	}
	// name and slug are required before provisioning.
	var req tenantProvisioningRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]any{"error": "invalid json"})
		return
	}
	if req.Name == "" || req.Slug == "" {
		writeJSON(w, http.StatusBadRequest, map[string]any{"error": "name and slug are required"})
		return
	}
	var id string
	err := h.db.QueryRow(r.Context(), `INSERT INTO tenants (name, slug) VALUES ($1, $2) RETURNING id::text`, req.Name, req.Slug).Scan(&id)
	if err != nil {
		if strings.Contains(err.Error(), "unique") || strings.Contains(err.Error(), "duplicate") {
			writeJSON(w, http.StatusConflict, map[string]any{"error": "slug already exists"})
			return
		}
		writeJSON(w, http.StatusInternalServerError, map[string]any{"error": "insert failed"})
		return
	}
	if err = h.applyTenantProvisioning(r.Context(), id, req); err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]any{"error": "tenant created but provisioning failed", "detail": err.Error()})
		return
	}
	_ = h.audit.Write(r.Context(), audit.Event{ActorUserID: p.UserID, ActorType: "user", Action: "tenants.create", ResourceType: "tenant", ResourceID: id})
	writeJSON(w, http.StatusCreated, map[string]any{"data": map[string]any{"id": id, "name": req.Name, "slug": req.Slug, "status": "active"}})
}

func (h Handler) GetTenant(w http.ResponseWriter, r *http.Request) {
	p, _ := httpmw.Principal(r.Context())
	tenantID := r.PathValue("id")
	if !p.IsPlatform && p.TenantID != tenantID {
		writeJSON(w, http.StatusForbidden, map[string]any{"error": "access denied"})
		return
	}
	var id, name, slug, status string
	var createdAt, updatedAt time.Time
	err := h.db.QueryRow(r.Context(), `SELECT id::text, name, slug, status, created_at, updated_at FROM tenants WHERE id = $1`, tenantID).Scan(&id, &name, &slug, &status, &createdAt, &updatedAt)
	if err != nil {
		if err == pgx.ErrNoRows {
			writeJSON(w, http.StatusNotFound, map[string]any{"error": "tenant not found"})
			return
		}
		writeJSON(w, http.StatusInternalServerError, map[string]any{"error": "query failed"})
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"data": map[string]any{"id": id, "name": name, "slug": slug, "status": status, "created_at": createdAt, "updated_at": updatedAt}})
}

func (h Handler) UpdateTenant(w http.ResponseWriter, r *http.Request) {
	p, _ := httpmw.Principal(r.Context())
	if !p.IsPlatform {
		writeJSON(w, http.StatusForbidden, map[string]any{"error": "platform admin only"})
		return
	}
	tenantID := r.PathValue("id")
	var req tenantProvisioningRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]any{"error": "invalid json"})
		return
	}
	sets := []string{}
	args := []any{}
	argN := 1
	if req.Name != "" {
		sets = append(sets, "name = $"+itoa(argN))
		args = append(args, req.Name)
		argN++
	}
	if req.Slug != "" {
		sets = append(sets, "slug = $"+itoa(argN))
		args = append(args, req.Slug)
		argN++
	}
	var err error
	if len(sets) > 0 {
		sets = append(sets, "updated_at = now()")
		args = append(args, tenantID)
		q := `UPDATE tenants SET ` + strings.Join(sets, ", ") + ` WHERE id = $` + itoa(argN)
		_, err = h.db.Exec(r.Context(), q, args...)
	}
	if err != nil {
		if strings.Contains(err.Error(), "unique") || strings.Contains(err.Error(), "duplicate") {
			writeJSON(w, http.StatusConflict, map[string]any{"error": "slug already exists"})
			return
		}
		writeJSON(w, http.StatusInternalServerError, map[string]any{"error": "update failed"})
		return
	}
	if err = h.applyTenantProvisioning(r.Context(), tenantID, req); err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]any{"error": "configuration update failed", "detail": err.Error()})
		return
	}
	_ = h.audit.Write(r.Context(), audit.Event{ActorUserID: p.UserID, ActorType: "user", Action: "tenants.update", ResourceType: "tenant", ResourceID: tenantID})
	writeJSON(w, http.StatusOK, map[string]any{"message": "tenant updated"})
}

func (h Handler) UpdateTenantStatus(w http.ResponseWriter, r *http.Request) {
	p, _ := httpmw.Principal(r.Context())
	if !p.IsPlatform {
		writeJSON(w, http.StatusForbidden, map[string]any{"error": "platform admin only"})
		return
	}
	tenantID := r.PathValue("id")
	var req struct {
		Status string `json:"status"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]any{"error": "invalid json"})
		return
	}
	if req.Status != "active" && req.Status != "disabled" && req.Status != "suspended" {
		writeJSON(w, http.StatusBadRequest, map[string]any{"error": "status must be active, disabled, or suspended"})
		return
	}
	_, err := h.db.Exec(r.Context(), `UPDATE tenants SET status = $1, updated_at = now() WHERE id = $2`, req.Status, tenantID)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]any{"error": "update failed"})
		return
	}
	_ = h.audit.Write(r.Context(), audit.Event{ActorUserID: p.UserID, ActorType: "user", Action: "tenants.status", ResourceType: "tenant", ResourceID: tenantID})
	writeJSON(w, http.StatusOK, map[string]any{"message": "status updated"})
}

func (h Handler) GetTenantOverview(w http.ResponseWriter, r *http.Request) {
	p, _ := httpmw.Principal(r.Context())
	tenantID := r.PathValue("id")
	if !p.IsPlatform && p.TenantID != tenantID {
		writeJSON(w, http.StatusForbidden, map[string]any{"error": "access denied"})
		return
	}

	var id, name, slug, status string
	var createdAt, updatedAt time.Time
	err := h.db.QueryRow(r.Context(), `SELECT id::text, name, slug, status, created_at, updated_at FROM tenants WHERE id = $1`, tenantID).Scan(&id, &name, &slug, &status, &createdAt, &updatedAt)
	if err != nil {
		if err == pgx.ErrNoRows {
			writeJSON(w, http.StatusNotFound, map[string]any{"error": "tenant not found"})
			return
		}
		writeJSON(w, http.StatusInternalServerError, map[string]any{"error": "tenant query failed"})
		return
	}

	features := []map[string]any{}
	fRows, fErr := h.db.Query(r.Context(), `SELECT tf.id::text, tf.feature_key, fc.name, fc.description, fc.category, tf.enabled, tf.created_at FROM tenant_features tf JOIN feature_catalog fc ON fc.identifier = tf.feature_key WHERE tf.tenant_id = $1 ORDER BY fc.category, fc.name`, tenantID)
	if fErr == nil {
		defer fRows.Close()
		for fRows.Next() {
			var fid, fkey, fname, fdescription, fcategory string
			var fenabled bool
			var fcreatedAt time.Time
			if fRows.Scan(&fid, &fkey, &fname, &fdescription, &fcategory, &fenabled, &fcreatedAt) == nil {
				features = append(features, map[string]any{"id": fid, "identifier": fkey, "feature_key": fkey, "name": fname, "description": fdescription, "category": fcategory, "enabled": fenabled, "created_at": fcreatedAt})
			}
		}
	}

	channels := []map[string]any{}
	cRows, cErr := h.db.Query(r.Context(), `SELECT id::text, channel, enabled, direction, rate_limit_per_second, daily_quota, created_at FROM tenant_channels WHERE tenant_id = $1 ORDER BY channel`, tenantID)
	if cErr == nil {
		defer cRows.Close()
		for cRows.Next() {
			var cid, ch, dir string
			var cenabled bool
			var rl, dq int
			var ccreatedAt time.Time
			if cRows.Scan(&cid, &ch, &cenabled, &dir, &rl, &dq, &ccreatedAt) == nil {
				channels = append(channels, map[string]any{"id": cid, "channel": ch, "enabled": cenabled, "direction": dir, "rate_limit_per_second": rl, "daily_quota": dq, "created_at": ccreatedAt})
			}
		}
	}

	providers := []map[string]any{}
	pRows, pErr := h.db.Query(r.Context(), `SELECT id::text, channel, provider, is_default, status, created_at FROM tenant_provider_configs WHERE tenant_id = $1 ORDER BY channel, provider`, tenantID)
	if pErr == nil {
		defer pRows.Close()
		for pRows.Next() {
			var pid, pch, prov, pstatus string
			var pdefault bool
			var pcreatedAt time.Time
			if pRows.Scan(&pid, &pch, &prov, &pdefault, &pstatus, &pcreatedAt) == nil {
				providers = append(providers, map[string]any{"id": pid, "channel": pch, "provider": prov, "is_default": pdefault, "status": pstatus, "created_at": pcreatedAt})
			}
		}
	}

	var usersCount, contactsCount, templatesCount, campaignsCount, apiKeysCount int
	h.db.QueryRow(r.Context(), `SELECT COUNT(*) FROM tenant_users WHERE tenant_id = $1`, tenantID).Scan(&usersCount)
	h.db.QueryRow(r.Context(), `SELECT COUNT(*) FROM contacts WHERE tenant_id = $1`, tenantID).Scan(&contactsCount)
	h.db.QueryRow(r.Context(), `SELECT COUNT(*) FROM notification_templates WHERE tenant_id = $1`, tenantID).Scan(&templatesCount)
	h.db.QueryRow(r.Context(), `SELECT COUNT(*) FROM campaigns WHERE tenant_id = $1`, tenantID).Scan(&campaignsCount)
	h.db.QueryRow(r.Context(), `SELECT COUNT(*) FROM tenant_api_keys WHERE tenant_id = $1`, tenantID).Scan(&apiKeysCount)

	writeJSON(w, http.StatusOK, map[string]any{"data": map[string]any{
		"tenant":    map[string]any{"id": id, "name": name, "slug": slug, "status": status, "created_at": createdAt, "updated_at": updatedAt},
		"features":  features,
		"channels":  channels,
		"providers": providers,
		"counts": map[string]any{
			"users":     usersCount,
			"contacts":  contactsCount,
			"templates": templatesCount,
			"campaigns": campaignsCount,
			"api_keys":  apiKeysCount,
		},
	}})
}

func (h Handler) GetTenantSettings(w http.ResponseWriter, r *http.Request) {
	p, _ := httpmw.Principal(r.Context())
	tenantID := r.PathValue("id")
	if !p.IsPlatform && p.TenantID != tenantID {
		writeJSON(w, http.StatusForbidden, map[string]any{"error": "access denied"})
		return
	}
	var name, slug, status, configJSON string
	err := h.db.QueryRow(r.Context(), `SELECT name, slug, status, COALESCE(config_json::text, '{}') FROM tenants WHERE id = $1`, tenantID).Scan(&name, &slug, &status, &configJSON)
	if err != nil {
		if err == pgx.ErrNoRows {
			writeJSON(w, http.StatusNotFound, map[string]any{"error": "tenant not found"})
			return
		}
		writeJSON(w, http.StatusInternalServerError, map[string]any{"error": "query failed"})
		return
	}
	var cfg map[string]any
	json.Unmarshal([]byte(configJSON), &cfg)
	if cfg == nil {
		cfg = map[string]any{}
	}
	writeJSON(w, http.StatusOK, map[string]any{"data": map[string]any{
		"tenant_id": tenantID, "name": name, "slug": slug, "status": status,
		"timezone":       cfg["timezone"],
		"country":        cfg["country"],
		"default_sender": cfg["default_sender"],
		"default_sms":    cfg["default_sms"],
		"branding_logo":  cfg["branding_logo"],
		"metadata":       cfg["metadata"],
	}})
}

func (h Handler) UpdateTenantSettings(w http.ResponseWriter, r *http.Request) {
	p, _ := httpmw.Principal(r.Context())
	tenantID := r.PathValue("id")
	if !p.IsPlatform && p.TenantID != tenantID {
		writeJSON(w, http.StatusForbidden, map[string]any{"error": "access denied"})
		return
	}
	var req struct {
		Timezone     *string         `json:"timezone"`
		Country      *string         `json:"country"`
		DefaultFrom  *string         `json:"default_sender"`
		DefaultSMS   *string         `json:"default_sms"`
		BrandingLogo *string         `json:"branding_logo"`
		Metadata     json.RawMessage `json:"metadata"`
	}
	if decode(w, r, &req) != nil {
		return
	}
	if tenantID == "" {
		writeJSON(w, http.StatusBadRequest, map[string]any{"error": "tenant_id required"})
		return
	}
	var existingRaw string
	h.db.QueryRow(r.Context(), `SELECT COALESCE(config_json::text, '{}') FROM tenants WHERE id = $1`, tenantID).Scan(&existingRaw)
	existing := map[string]any{}
	json.Unmarshal([]byte(existingRaw), &existing)
	if req.Timezone != nil {
		existing["timezone"] = *req.Timezone
	}
	if req.Country != nil {
		existing["country"] = *req.Country
	}
	if req.DefaultFrom != nil {
		existing["default_sender"] = *req.DefaultFrom
	}
	if req.DefaultSMS != nil {
		existing["default_sms"] = *req.DefaultSMS
	}
	if req.BrandingLogo != nil {
		existing["branding_logo"] = *req.BrandingLogo
	}
	if len(req.Metadata) > 0 {
		var meta map[string]any
		if json.Unmarshal(req.Metadata, &meta) == nil {
			existing["metadata"] = meta
		}
	}
	updated, _ := json.Marshal(existing)
	_, err := h.db.Exec(r.Context(), `UPDATE tenants SET config_json = $1::jsonb, updated_at = now() WHERE id = $2`, string(updated), tenantID)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]any{"error": "update failed"})
		return
	}
	_ = h.audit.Write(r.Context(), audit.Event{TenantID: tenantID, ActorUserID: p.UserID, ActorType: "user", Action: "tenant.settings.update", ResourceType: "tenant", ResourceID: tenantID})
	writeJSON(w, http.StatusOK, map[string]any{"message": "settings updated"})
}

func (h Handler) ListFeatureCatalog(w http.ResponseWriter, r *http.Request) {
	type CatalogItem struct {
		Identifier  string `json:"identifier"`
		FeatureKey  string `json:"feature_key"`
		Name        string `json:"name"`
		Description string `json:"description"`
		Category    string `json:"category"`
		Status      string `json:"status"`
		Enabled     bool   `json:"enabled"`
		TenantCount int    `json:"tenant_count"`
	}
	rows, err := h.db.Query(r.Context(), `
		SELECT fc.identifier, fc.identifier, fc.name, fc.description, fc.category, fc.status,
			fc.status = 'active' AS enabled,
			COUNT(tf.id) FILTER (WHERE tf.enabled) AS tenant_count
		FROM feature_catalog fc
		LEFT JOIN tenant_features tf ON tf.feature_key = fc.identifier
		GROUP BY fc.identifier, fc.name, fc.description, fc.category, fc.status
		ORDER BY fc.category, fc.name`)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]any{"error": "query failed"})
		return
	}
	defer rows.Close()
	var out []CatalogItem
	for rows.Next() {
		var item CatalogItem
		if err := rows.Scan(&item.Identifier, &item.FeatureKey, &item.Name, &item.Description, &item.Category, &item.Status, &item.Enabled, &item.TenantCount); err != nil {
			continue
		}
		out = append(out, item)
	}
	if out == nil {
		out = []CatalogItem{}
	}
	writeJSON(w, http.StatusOK, map[string]any{"data": out})
}

func (h Handler) UpdateFeatureCatalog(w http.ResponseWriter, r *http.Request) {
	p, _ := httpmw.Principal(r.Context())
	if !p.IsPlatform {
		writeJSON(w, http.StatusForbidden, map[string]any{"error": "platform admin required"})
		return
	}
	var req struct {
		Enabled *bool `json:"enabled"`
	}
	if decode(w, r, &req) != nil {
		return
	}
	if req.Enabled == nil {
		writeJSON(w, http.StatusBadRequest, map[string]any{"error": "enabled is required"})
		return
	}
	status := "disabled"
	if *req.Enabled {
		status = "active"
	}
	result, err := h.db.Exec(r.Context(), `UPDATE feature_catalog SET status=$1, updated_at=now() WHERE identifier=$2`, status, r.PathValue("identifier"))
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]any{"error": "update failed"})
		return
	}
	if result.RowsAffected() == 0 {
		writeJSON(w, http.StatusNotFound, map[string]any{"error": "feature not found"})
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"message": "feature catalog updated"})
}

func (h Handler) ListChannelCatalog(w http.ResponseWriter, r *http.Request) {
	type ChannelItem struct {
		Channel     string `json:"channel"`
		Description string `json:"description"`
		TenantCount int    `json:"tenant_count"`
		Enabled     bool   `json:"enabled"`
	}
	rows, err := h.db.Query(r.Context(), `
		SELECT pc.channel, pc.description,
			COALESCE((SELECT COUNT(*) FROM tenant_channels tc WHERE tc.channel = pc.channel), 0) AS tenant_count
			, pc.enabled
		FROM platform_channels pc ORDER BY pc.channel`)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]any{"error": "query failed"})
		return
	}
	defer rows.Close()
	var out []ChannelItem
	for rows.Next() {
		var item ChannelItem
		if err := rows.Scan(&item.Channel, &item.Description, &item.TenantCount, &item.Enabled); err != nil {
			continue
		}
		out = append(out, item)
	}
	if out == nil {
		out = []ChannelItem{}
	}
	writeJSON(w, http.StatusOK, map[string]any{"data": out})
}

func (h Handler) UpdatePlatformChannel(w http.ResponseWriter, r *http.Request) {
	p, _ := httpmw.Principal(r.Context())
	if !p.IsPlatform {
		writeJSON(w, http.StatusForbidden, map[string]any{"error": "platform admin required"})
		return
	}
	var req struct {
		Enabled *bool `json:"enabled"`
	}
	if decode(w, r, &req) != nil {
		return
	}
	if req.Enabled == nil {
		writeJSON(w, http.StatusBadRequest, map[string]any{"error": "enabled is required"})
		return
	}
	result, err := h.db.Exec(r.Context(), `UPDATE platform_channels SET enabled=$1, updated_at=now() WHERE channel=$2`, *req.Enabled, r.PathValue("channel"))
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]any{"error": "update failed"})
		return
	}
	if result.RowsAffected() == 0 {
		writeJSON(w, http.StatusNotFound, map[string]any{"error": "channel not found"})
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"message": "platform channel updated"})
}

func (h Handler) ListProviderTypes(w http.ResponseWriter, r *http.Request) {
	type ProviderTypeItem struct {
		Provider    string `json:"provider"`
		Channel     string `json:"channel"`
		Description string `json:"description"`
		Enabled     bool   `json:"enabled"`
		TenantCount int    `json:"tenant_count"`
	}
	rows, err := h.db.Query(r.Context(), `
		SELECT pp.provider, pp.channel, pp.description, pp.enabled,
			COALESCE((SELECT COUNT(*) FROM tenant_provider_configs tpc WHERE tpc.provider = pp.provider), 0) AS tenant_count
		FROM platform_providers pp
		ORDER BY pp.channel, pp.provider`)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]any{"error": "query failed"})
		return
	}
	defer rows.Close()
	var out []ProviderTypeItem
	for rows.Next() {
		var item ProviderTypeItem
		if err := rows.Scan(&item.Provider, &item.Channel, &item.Description, &item.Enabled, &item.TenantCount); err != nil {
			continue
		}
		out = append(out, item)
	}
	if out == nil {
		out = []ProviderTypeItem{}
	}
	writeJSON(w, http.StatusOK, map[string]any{"data": out})
}

func (h Handler) UpdateProviderType(w http.ResponseWriter, r *http.Request) {
	p, _ := httpmw.Principal(r.Context())
	if !p.IsPlatform {
		writeJSON(w, http.StatusForbidden, map[string]any{"error": "platform admin required"})
		return
	}
	var req struct {
		Enabled *bool `json:"enabled"`
	}
	if decode(w, r, &req) != nil {
		return
	}
	if req.Enabled == nil {
		writeJSON(w, http.StatusBadRequest, map[string]any{"error": "enabled is required"})
		return
	}
	result, err := h.db.Exec(r.Context(), `UPDATE platform_providers SET enabled=$1, updated_at=now() WHERE provider=$2`, *req.Enabled, r.PathValue("provider"))
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]any{"error": "update failed"})
		return
	}
	if result.RowsAffected() == 0 {
		writeJSON(w, http.StatusNotFound, map[string]any{"error": "provider type not found"})
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"message": "provider type updated"})
}

func (h Handler) notificationDeliveries(ctx context.Context, notificationID string) ([]map[string]any, []map[string]any, error) {
	rows, err := h.db.Query(ctx, `
SELECT id::text, channel, provider, recipient_json, status, scheduled_at, delivered_at, COALESCE(provider_message_id,''), response_json, created_at, updated_at
FROM notification_deliveries
WHERE notification_id = $1
ORDER BY created_at ASC`, notificationID)
	if err != nil {
		return nil, nil, err
	}
	defer rows.Close()
	deliveries := []map[string]any{}
	timeline := []map[string]any{}
	for rows.Next() {
		var id, channel, provider, status, providerMessageID string
		var recipientRaw, responseRaw []byte
		var scheduledAt, deliveredAt *time.Time
		var createdAt, updatedAt time.Time
		if err := rows.Scan(&id, &channel, &provider, &recipientRaw, &status, &scheduledAt, &deliveredAt, &providerMessageID, &responseRaw, &createdAt, &updatedAt); err != nil {
			return nil, nil, err
		}
		classification := failures.Normalize(status, providerMessageID, string(responseRaw))
		attempts, attemptTimeline, err := h.deliveryAttempts(ctx, id, channel, provider)
		if err != nil {
			return nil, nil, err
		}
		deliveries = append(deliveries, map[string]any{
			"id": id, "channel": channel, "provider": provider, "recipient": maskRecipientJSON(recipientRaw),
			"status": status, "scheduled_at": scheduledAt, "delivered_at": deliveredAt, "provider_message_id": providerMessageID,
			"response": json.RawMessage(security.RedactJSON(responseRaw)), "failure": classification, "attempts": attempts,
			"created_at": createdAt, "updated_at": updatedAt,
		})
		timeline = append(timeline, map[string]any{"type": "queued", "timestamp": createdAt, "channel": channel, "provider": provider, "source": "queue", "explanation": "Delivery was queued for worker processing."})
		timeline = append(timeline, attemptTimeline...)
		if deliveredAt != nil {
			timeline = append(timeline, map[string]any{"type": "delivered", "timestamp": deliveredAt, "channel": channel, "provider": provider, "source": "provider", "explanation": "Provider send completed successfully."})
		}
		if status == "dead" {
			timeline = append(timeline, map[string]any{"type": "moved_to_dead_letter", "timestamp": updatedAt, "channel": channel, "provider": provider, "source": "retry_worker", "failure": classification, "explanation": classification.Explanation})
		}
	}
	return deliveries, timeline, rows.Err()
}

func (h Handler) integrationGuideData(ctx context.Context, r *http.Request, tenantID string) (map[string]any, error) {
	var tenantName, tenantSlug, tenantStatus string
	if err := h.db.QueryRow(ctx, `SELECT name, slug, status FROM tenants WHERE id = $1`, tenantID).Scan(&tenantName, &tenantSlug, &tenantStatus); err != nil {
		return nil, err
	}

	channels := []map[string]any{}
	channelRows, err := h.db.Query(ctx, `SELECT channel, enabled, direction, rate_limit_per_second, daily_quota FROM tenant_channels WHERE tenant_id = $1 ORDER BY channel`, tenantID)
	if err != nil {
		return nil, err
	}
	defer channelRows.Close()
	totalRateLimit := 0
	totalDailyQuota := 0
	enabledChannels := 0
	for channelRows.Next() {
		var channel, direction string
		var enabled bool
		var rateLimit, dailyQuota int
		if err := channelRows.Scan(&channel, &enabled, &direction, &rateLimit, &dailyQuota); err != nil {
			return nil, err
		}
		if enabled {
			enabledChannels++
			totalRateLimit += rateLimit
			totalDailyQuota += dailyQuota
		}
		channels = append(channels, map[string]any{"channel": channel, "enabled": enabled, "direction": direction, "rate_limit_per_second": rateLimit, "daily_quota": dailyQuota})
	}

	credentials := []map[string]any{}
	keyRows, err := h.db.Query(ctx, `SELECT id::text, name, COALESCE(scopes_json::text,'[]'), status, COALESCE(last_used_at::text,''), COALESCE(expires_at::text,''), created_at::text FROM tenant_api_keys WHERE tenant_id = $1 ORDER BY created_at DESC`, tenantID)
	if err != nil {
		return nil, err
	}
	defer keyRows.Close()
	activeCredentials := 0
	lastAPIRequest := ""
	for keyRows.Next() {
		var id, name, scopes, status, lastUsed, expiresAt, createdAt string
		if err := keyRows.Scan(&id, &name, &scopes, &status, &lastUsed, &expiresAt, &createdAt); err != nil {
			return nil, err
		}
		if status == "active" {
			activeCredentials++
		}
		if lastAPIRequest == "" && lastUsed != "" {
			lastAPIRequest = lastUsed
		}
		credentials = append(credentials, map[string]any{"id": id, "name": name, "scopes": scopes, "status": status, "last_used_at": lastUsed, "expires_at": expiresAt, "created_at": createdAt})
	}

	var providerCount, activeProviderCount, templateCount, notificationCount, deliveredCount, failedCount int
	_ = h.db.QueryRow(ctx, `SELECT COUNT(*), COUNT(*) FILTER (WHERE status = 'active') FROM tenant_provider_configs WHERE tenant_id = $1`, tenantID).Scan(&providerCount, &activeProviderCount)
	_ = h.db.QueryRow(ctx, `SELECT COUNT(*) FROM notification_templates WHERE tenant_id = $1 AND status = 'active'`, tenantID).Scan(&templateCount)
	_ = h.db.QueryRow(ctx, `SELECT COUNT(*) FROM notifications WHERE tenant_id = $1`, tenantID).Scan(&notificationCount)
	_ = h.db.QueryRow(ctx, `SELECT COUNT(*) FROM notification_deliveries WHERE tenant_id = $1 AND status = 'sent'`, tenantID).Scan(&deliveredCount)
	_ = h.db.QueryRow(ctx, `SELECT COUNT(*) FROM notification_deliveries WHERE tenant_id = $1 AND status IN ('failed','dead','blocked')`, tenantID).Scan(&failedCount)

	lastQueued := ""
	lastDelivered := ""
	_ = h.db.QueryRow(ctx, `SELECT COALESCE(MAX(created_at)::text,'') FROM notifications WHERE tenant_id = $1`, tenantID).Scan(&lastQueued)
	_ = h.db.QueryRow(ctx, `SELECT COALESCE(MAX(delivered_at)::text,'') FROM notification_deliveries WHERE tenant_id = $1 AND delivered_at IS NOT NULL`, tenantID).Scan(&lastDelivered)

	recentErrors := []map[string]any{}
	errorRows, err := h.db.Query(ctx, `
SELECT n.public_id, d.channel, d.provider, d.status, COALESCE(d.provider_message_id,''), d.response_json, d.updated_at
FROM notification_deliveries d
JOIN notifications n ON n.id = d.notification_id
WHERE d.tenant_id = $1 AND d.status IN ('failed','dead','blocked')
ORDER BY d.updated_at DESC
LIMIT 5`, tenantID)
	if err == nil {
		defer errorRows.Close()
		for errorRows.Next() {
			var publicID, channel, provider, status, providerMessageID string
			var responseRaw []byte
			var updatedAt time.Time
			if errorRows.Scan(&publicID, &channel, &provider, &status, &providerMessageID, &responseRaw, &updatedAt) == nil {
				classification := failures.Normalize(status, providerMessageID, string(responseRaw))
				recentErrors = append(recentErrors, map[string]any{"notification_id": publicID, "channel": channel, "provider": provider, "status": status, "failure": classification, "updated_at": updatedAt})
			}
		}
	}

	checklist := []map[string]any{
		integrationStep("tenant_active", "Tenant activated", tenantStatus == "active", "Sending requires an active tenant.", "/settings"),
		integrationStep("credential_created", "API credential created", activeCredentials > 0, "Server-to-server requests require a tenant API key.", "/api-keys"),
		integrationStep("api_auth_tested", "API authentication tested", lastAPIRequest != "", "A successful authenticated API request proves the key and environment are correct.", "/api-keys"),
		integrationStep("channel_enabled", "Delivery channel enabled", enabledChannels > 0, "At least one enabled channel is required before sending.", "/channels"),
		integrationStep("provider_configured", "Provider configured", activeProviderCount > 0, "Active providers are required for delivery workers to send messages.", "/providers"),
		integrationStep("template_available", "Template available", templateCount > 0, "Templates keep payloads consistent across integration clients.", "/templates"),
		integrationStep("first_notification_queued", "First notification queued", notificationCount > 0, "Queued notifications confirm the submit API contract is working.", "/notifications"),
		integrationStep("first_notification_delivered", "First notification delivered", deliveredCount > 0, "Delivery confirms provider configuration and recipient data are valid.", "/notifications"),
	}
	completed := 0
	for _, step := range checklist {
		if done, ok := step["complete"].(bool); ok && done {
			completed++
		}
	}
	completion := 0
	if len(checklist) > 0 {
		completion = completed * 100 / len(checklist)
	}

	status := "setup_incomplete"
	recommended := "Create an API credential and send a test notification."
	if tenantStatus != "active" {
		status = "blocked"
		recommended = "Activate the tenant before attempting integration."
	} else if activeCredentials == 0 {
		recommended = "Create an API key in the credentials page."
	} else if enabledChannels == 0 {
		recommended = "Enable at least one delivery channel."
	} else if activeProviderCount == 0 {
		recommended = "Configure or enable a provider for an enabled channel."
	} else if failedCount > 0 && deliveredCount == 0 {
		status = "degraded"
		recommended = "Open Notification Logs and inspect the latest failed delivery."
	} else if completion >= 75 {
		status = "healthy"
		recommended = "Review production rate limits and secure credential rotation."
	}

	baseURL := publicBaseURL(r)
	return map[string]any{
		"tenant":         map[string]any{"id": tenantID, "name": tenantName, "slug": tenantSlug, "status": tenantStatus},
		"environment":    map[string]any{"name": "local", "api_base_url": baseURL + "/api/v1", "admin_base_url": baseURL + "/admin/api/v1", "api_version": "v1"},
		"authentication": map[string]any{"method": "tenant_api_key", "header": "Authorization: Bearer YOUR_API_KEY", "secret_display": "one_time_only"},
		"summary":        map[string]any{"status": status, "completion_percent": completion, "active_credentials": activeCredentials, "enabled_channels": enabledChannels, "active_providers": activeProviderCount, "active_templates": templateCount, "rate_limit_per_second": totalRateLimit, "daily_quota": totalDailyQuota, "last_successful_api_request": lastAPIRequest, "last_successful_notification": lastDelivered, "last_notification_queued": lastQueued, "webhook_status": "not_configured", "recommended_next_action": recommended},
		"checklist":      checklist,
		"channels":       channels,
		"credentials":    credentials,
		"recent_errors":  recentErrors,
		"docs": map[string]any{"tenant_facing_endpoints": []map[string]any{
			{"method": "POST", "path": "/api/v1/notifications", "scope": "notifications:create", "purpose": "Submit an instant or scheduled notification request."},
		}},
	}, nil
}

func integrationStep(id, label string, complete bool, description string, actionPath string) map[string]any {
	status := "pending"
	if complete {
		status = "complete"
	}
	return map[string]any{"id": id, "label": label, "status": status, "complete": complete, "description": description, "why_it_matters": description, "action_path": actionPath}
}

func publicBaseURL(r *http.Request) string {
	scheme := "http"
	if r.TLS != nil || strings.EqualFold(r.Header.Get("X-Forwarded-Proto"), "https") {
		scheme = "https"
	}
	host := r.Host
	if forwarded := r.Header.Get("X-Forwarded-Host"); forwarded != "" {
		host = forwarded
	}
	return scheme + "://" + host
}

func encryptedProviderConfigJSON(raw string) (string, error) {
	encrypted, err := security.Encrypt(raw)
	if err != nil {
		return "", err
	}
	encoded, err := json.Marshal(encrypted)
	if err != nil {
		return "", err
	}
	return string(encoded), nil
}

func decryptProviderConfigJSON(raw string) (string, error) {
	var encrypted string
	if err := json.Unmarshal([]byte(raw), &encrypted); err == nil {
		return security.Decrypt(encrypted)
	}
	return security.Decrypt(raw)
}

func (h Handler) deliveryAttempts(ctx context.Context, deliveryID, channel, provider string) ([]map[string]any, []map[string]any, error) {
	rows, err := h.db.Query(ctx, `
SELECT attempt_no, status, COALESCE(error,''), response_json, duration_ms, created_at
FROM delivery_attempts
WHERE delivery_id = $1
ORDER BY attempt_no ASC, created_at ASC`, deliveryID)
	if err != nil {
		return nil, nil, err
	}
	defer rows.Close()
	attempts := []map[string]any{}
	timeline := []map[string]any{}
	for rows.Next() {
		var attemptNo, durationMS int
		var status, errText string
		var responseRaw []byte
		var createdAt time.Time
		if err := rows.Scan(&attemptNo, &status, &errText, &responseRaw, &durationMS, &createdAt); err != nil {
			return nil, nil, err
		}
		classification := failures.Normalize(status, "", errText+" "+string(responseRaw))
		attempt := map[string]any{"attempt_no": attemptNo, "status": status, "error": errText, "response": json.RawMessage(security.RedactJSON(responseRaw)), "duration_ms": durationMS, "created_at": createdAt, "failure": classification}
		attempts = append(attempts, attempt)
		eventType := "provider_accepted"
		explanation := "Provider accepted the delivery request."
		if status != "sent" {
			eventType = "failed"
			explanation = classification.Explanation
		}
		timeline = append(timeline, map[string]any{"type": eventType, "timestamp": createdAt, "channel": channel, "provider": provider, "attempt_no": attemptNo, "duration_ms": durationMS, "source": "worker", "failure": classification, "explanation": explanation})
	}
	return attempts, timeline, rows.Err()
}

func maskRecipientJSON(raw []byte) map[string]any {
	var object map[string]any
	if err := json.Unmarshal(raw, &object); err != nil {
		return map[string]any{"redacted": true}
	}
	if target, ok := object["recipient"].(map[string]any); ok {
		object["recipient"] = maskRecipientMap(target)
		return object
	}
	return maskRecipientMap(object)
}

func maskRecipientMap(input map[string]any) map[string]any {
	out := security.RedactMap(input)
	if value, ok := out["email"].(string); ok && value != "" {
		out["email"] = security.RedactEmail(value)
	}
	if value, ok := out["phone"].(string); ok && value != "" {
		out["phone"] = security.RedactPhone(value)
	}
	for _, key := range []string{"fcm_token", "push_token", "device_token"} {
		if value, ok := out[key].(string); ok && value != "" {
			out[key] = security.MaskToken(value)
		}
	}
	return out
}

func pagination(r *http.Request) (int, int, int) {
	page, _ := strconv.Atoi(r.URL.Query().Get("page"))
	perPage, _ := strconv.Atoi(r.URL.Query().Get("per_page"))
	if page < 1 {
		page = 1
	}
	if perPage < 1 {
		perPage = 20
	}
	if perPage > 100 {
		perPage = 100
	}
	return page, perPage, (page - 1) * perPage
}

func paginationMeta(page, perPage, total int) map[string]any {
	totalPages := 0
	if total > 0 {
		totalPages = (total + perPage - 1) / perPage
	}
	return map[string]any{"page": page, "per_page": perPage, "total": total, "total_pages": totalPages}
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
