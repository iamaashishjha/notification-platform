package websocket

import (
	"encoding/json"
	"time"

	"github.com/gorilla/websocket"
	"go.uber.org/zap"
)

const (
	writeWait      = 10 * time.Second
	pongWait       = 60 * time.Second
	pingPeriod     = (pongWait * 9) / 10
	maxMessageSize = 4096
)

type Client struct {
	hub      *Hub
	conn     *websocket.Conn
	send     chan []byte
	TenantID string
	UserID   string
	ContactID string
	ExternalUserID string
	log      *zap.Logger
}

type Message struct {
	Type    string          `json:"type"`
	Payload json.RawMessage `json:"payload,omitempty"`
	ID      string          `json:"id,omitempty"`
}

type Delivery struct {
	NotificationID string         `json:"notification_id"`
	Title          string         `json:"title"`
	Body           string         `json:"body"`
	Data           map[string]any `json:"data,omitempty"`
	Channel        string         `json:"channel"`
}

func NewClient(hub *Hub, conn *websocket.Conn, tenantID, userID, contactID, externalUserID string, log *zap.Logger) *Client {
	return &Client{
		hub:            hub,
		conn:           conn,
		send:           make(chan []byte, 64),
		TenantID:       tenantID,
		UserID:         userID,
		ContactID:      contactID,
		ExternalUserID: externalUserID,
		log:            log,
	}
}

func (c *Client) ReadPump() {
	defer func() {
		c.hub.Unregister <- c
		_ = c.conn.Close()
	}()
	c.conn.SetReadLimit(maxMessageSize)
	_ = c.conn.SetReadDeadline(time.Now().Add(pongWait))
	c.conn.SetPongHandler(func(string) error {
		_ = c.conn.SetReadDeadline(time.Now().Add(pongWait))
		return nil
	})
	for {
		_, msg, err := c.conn.ReadMessage()
		if err != nil {
			if websocket.IsUnexpectedCloseError(err, websocket.CloseGoingAway, websocket.CloseNormalClosure) {
				c.log.Warn("ws read error", zap.Error(err), zap.String("tenant_id", c.TenantID))
			}
			break
		}
		var parsed Message
		if err := json.Unmarshal(msg, &parsed); err != nil {
			continue
		}
		switch parsed.Type {
		case "ack":
			if parsed.ID != "" {
				c.hub.ackFn(c.TenantID, parsed.ID)
			}
		case "pong":
		default:
			c.log.Debug("ws unknown message type", zap.String("type", parsed.Type))
		}
	}
}

func (c *Client) WritePump() {
	ticker := time.NewTicker(pingPeriod)
	defer func() {
		ticker.Stop()
		_ = c.conn.Close()
	}()
	for {
		select {
		case msg, ok := <-c.send:
			if !ok {
				_ = c.conn.WriteMessage(websocket.CloseMessage, []byte{})
				return
			}
			_ = c.conn.SetWriteDeadline(time.Now().Add(writeWait))
			if err := c.conn.WriteMessage(websocket.TextMessage, msg); err != nil {
				return
			}
		case <-ticker.C:
			_ = c.conn.SetWriteDeadline(time.Now().Add(writeWait))
			if err := c.conn.WriteMessage(websocket.PingMessage, nil); err != nil {
				return
			}
		}
	}
}

func (c *Client) SendDelivery(d Delivery) {
	payload, _ := json.Marshal(map[string]any{
		"type": "notification",
		"payload": d,
	})
	select {
	case c.send <- payload:
	default:
		c.log.Warn("ws client send buffer full, dropping delivery", zap.String("tenant_id", c.TenantID))
	}
}
