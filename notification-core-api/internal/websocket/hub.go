package websocket

import (
	"context"
	"encoding/json"
	"sync"
	"sync/atomic"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
	"go.uber.org/zap"
)

type Hub struct {
	mu       sync.RWMutex
	clients  map[*Client]bool
	byTenant map[string]map[*Client]bool
	register chan *Client
	Unregister chan *Client
	db       *pgxpool.Pool
	log      *zap.Logger
	ackFn    func(tenantID, deliveryID string)

	WSMessagesSent   atomic.Int64
	WSMessagesAcked  atomic.Int64
	WSDisconnects    atomic.Int64
	WSReconnectSyncs atomic.Int64
}

func NewHub(db *pgxpool.Pool, log *zap.Logger) *Hub {
	h := &Hub{
		clients:    make(map[*Client]bool),
		byTenant:   make(map[string]map[*Client]bool),
		register:   make(chan *Client),
		Unregister: make(chan *Client),
		db:         db,
		log:        log,
	}
	h.ackFn = func(tenantID, deliveryID string) {
		h.WSMessagesAcked.Add(1)
	}
	return h
}

func (h *Hub) Run(ctx context.Context) {
	for {
		select {
		case <-ctx.Done():
			return
		case client := <-h.register:
			h.mu.Lock()
			h.clients[client] = true
			if h.byTenant[client.TenantID] == nil {
				h.byTenant[client.TenantID] = make(map[*Client]bool)
			}
			h.byTenant[client.TenantID][client] = true
			h.mu.Unlock()
			h.log.Info("ws client connected",
				zap.String("tenant_id", client.TenantID),
				zap.String("user_id", client.UserID),
				zap.Int("total", len(h.clients)),
			)

		case client := <-h.Unregister:
			h.mu.Lock()
			if _, ok := h.clients[client]; ok {
				delete(h.clients, client)
				if clients, ok := h.byTenant[client.TenantID]; ok {
					delete(clients, client)
					if len(clients) == 0 {
						delete(h.byTenant, client.TenantID)
					}
				}
				close(client.send)
				h.WSDisconnects.Add(1)
			}
			h.mu.Unlock()
			h.log.Info("ws client disconnected",
				zap.String("tenant_id", client.TenantID),
				zap.Int("total", len(h.clients)),
			)
		}
	}
}

func (h *Hub) BroadcastToTenant(tenantID string, delivery Delivery) {
	h.mu.RLock()
	defer h.mu.RUnlock()
	if clients, ok := h.byTenant[tenantID]; ok {
		for client := range clients {
			client.SendDelivery(delivery)
			h.WSMessagesSent.Add(1)
		}
	}
}

func (h *Hub) BroadcastToUser(tenantID, externalUserID string, delivery Delivery) {
	h.mu.RLock()
	defer h.mu.RUnlock()
	if clients, ok := h.byTenant[tenantID]; ok {
		for client := range clients {
			if client.ExternalUserID == externalUserID {
				client.SendDelivery(delivery)
				h.WSMessagesSent.Add(1)
			}
		}
	}
}

func (h *Hub) ActiveConnections() int {
	h.mu.RLock()
	defer h.mu.RUnlock()
	return len(h.clients)
}

func (h *Hub) ActiveByTenant(tenantID string) int {
	h.mu.RLock()
	defer h.mu.RUnlock()
	return len(h.byTenant[tenantID])
}

func (h *Hub) RecordSession(ctx context.Context, tenantID, userID, contactID, externalUserID, connectionID string) error {
	_, err := h.db.Exec(ctx, `INSERT INTO websocket_sessions (tenant_id, user_id, contact_id, external_user_id, connection_id, last_seen_at) VALUES ($1,$2,$3,$4,$5,now()) ON CONFLICT DO NOTHING`, tenantID, nullIfEmpty(userID), nullIfEmpty(contactID), nullIfEmpty(externalUserID), connectionID)
	return err
}

func (h *Hub) CloseSession(ctx context.Context, connectionID string) {
	_, _ = h.db.Exec(ctx, `UPDATE websocket_sessions SET status = 'closed', updated_at = now() WHERE connection_id = $1`, connectionID)
}

func (h *Hub) SyncUnread(ctx context.Context, client *Client) {
	defer h.WSReconnectSyncs.Add(1)
	rows, err := h.db.Query(ctx, `SELECT id::text, title, body, data_json, created_at FROM in_app_notifications WHERE tenant_id = $1 AND status = 'unread' AND (contact_id::text = $2 OR (external_user_id = $3 AND $3 != '')) ORDER BY created_at DESC LIMIT 50`, client.TenantID, client.ContactID, client.ExternalUserID)
	if err != nil {
		return
	}
	defer rows.Close()
	for rows.Next() {
		var id, title, body string
		var data []byte
		var createdAt time.Time
		if err := rows.Scan(&id, &title, &body, &data, &createdAt); err != nil {
			continue
		}
		var dataMap map[string]any
		_ = json.Unmarshal(data, &dataMap)
		client.SendDelivery(Delivery{
			NotificationID: id,
			Title:          title,
			Body:           body,
			Data:           dataMap,
			Channel:        "in_app",
		})
	}
}

func (h *Hub) GetWSStats() (sent, acked, disconnects, syncs int64) {
	return h.WSMessagesSent.Load(), h.WSMessagesAcked.Load(), h.WSDisconnects.Load(), h.WSReconnectSyncs.Load()
}

func nullIfEmpty(s string) any {
	if s == "" {
		return nil
	}
	return s
}
