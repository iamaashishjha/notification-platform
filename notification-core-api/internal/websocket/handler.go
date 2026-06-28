package websocket

import (
	"encoding/json"
	"net/http"
	"strings"
	"time"

	"context"

	"notification-core-api/internal/auth"
	"notification-core-api/internal/security"

	"github.com/gorilla/websocket"
	"github.com/jackc/pgx/v5/pgxpool"
	"go.uber.org/zap"
)

type WSHandler struct {
	hub  *Hub
	db   *pgxpool.Pool
	auth auth.Service
	log  *zap.Logger
}

var upgrader = websocket.Upgrader{
	ReadBufferSize:  1024,
	WriteBufferSize: 1024,
	CheckOrigin: func(r *http.Request) bool {
		return true
	},
}

func NewWSHandler(hub *Hub, db *pgxpool.Pool, authSvc auth.Service, log *zap.Logger) WSHandler {
	return WSHandler{hub: hub, db: db, auth: authSvc, log: log}
}

func (h WSHandler) ServeWS(w http.ResponseWriter, r *http.Request) {
	token := r.URL.Query().Get("token")
	if token == "" {
		authHeader := r.Header.Get("Authorization")
		if strings.HasPrefix(authHeader, "Bearer ") {
			token = strings.TrimPrefix(authHeader, "Bearer ")
		}
	}
	if token == "" {
		http.Error(w, "token required", http.StatusUnauthorized)
		return
	}

	principal, tenantID, userID, contactID, externalUserID, err := h.validateToken(r.Context(), token)
	if err != nil {
		h.log.Warn("ws token validation failed", zap.Error(err))
		http.Error(w, "invalid token", http.StatusUnauthorized)
		return
	}

	conn, err := upgrader.Upgrade(w, r, nil)
	if err != nil {
		h.log.Error("ws upgrade failed", zap.Error(err))
		return
	}

	randPart, _ := security.RandomToken("", 8)
	connectionID := "ws_" + time.Now().UTC().Format("20060102150405") + "_" + randPart

	client := NewClient(h.hub, conn, tenantID, userID, contactID, externalUserID, h.log)
	client.hub.ackFn = func(tid, deliveryID string) {
		_, _ = h.db.Exec(r.Context(), `UPDATE in_app_notifications SET status = 'read', updated_at = now() WHERE id = $1 AND tenant_id = $2 AND status = 'unread'`, deliveryID, tid)
	}

	_ = h.hub.RecordSession(r.Context(), tenantID, userID, contactID, externalUserID, connectionID)

	h.hub.register <- client

	go client.WritePump()
	go client.ReadPump()

	h.hub.SyncUnread(r.Context(), client)

	h.log.Info("ws connection established",
		zap.String("tenant_id", tenantID),
		zap.String("user_id", userID),
		zap.String("principal_type", principal),
		zap.String("connection_id", connectionID),
	)
}

func (h WSHandler) validateToken(ctx context.Context, token string) (principal, tenantID, userID, contactID, externalUserID string, err error) {
	const q = `SELECT wct.tenant_id::text, COALESCE(wct.user_id::text,''), COALESCE(wct.contact_id::text,''), COALESCE(wct.external_user_id,'') FROM websocket_connection_tokens wct WHERE wct.token_hash = $1 AND wct.status = 'active' AND wct.expires_at > now()`
	tokenHash := security.HashSecret(token)
	if err := h.db.QueryRow(ctx, q, tokenHash).Scan(&tenantID, &userID, &contactID, &externalUserID); err == nil {
		_, _ = h.db.Exec(ctx, `UPDATE websocket_connection_tokens SET status = 'used', used_at = now() WHERE token_hash = $1`, tokenHash)
		return "ws_token", tenantID, userID, contactID, externalUserID, nil
	}

	p, jwtErr := h.auth.VerifyJWT(token)
	if jwtErr == nil {
		return "jwt", p.TenantID, p.UserID, "", "", nil
	}

	return "", "", "", "", "", http.ErrAbortHandler
}

func writeJSON(w http.ResponseWriter, status int, body any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(body)
}
