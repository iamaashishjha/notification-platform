package websocket

import (
	"context"
	"fmt"
	"time"

	"notification-core-api/internal/providers"
	"notification-core-api/internal/providers/mock"
	ws "notification-core-api/internal/websocket"

	"go.uber.org/zap"
)

func NewMock(log *zap.Logger) mock.Provider { return mock.New("websocket", log) }

type Provider struct {
	hub *ws.Hub
	log *zap.Logger
}

func NewReal(hub *ws.Hub, log *zap.Logger) Provider {
	return Provider{hub: hub, log: log}
}

func (p Provider) Send(ctx context.Context, msg providers.Message) (*providers.Result, error) {
	start := time.Now()
	delivery := ws.Delivery{
		NotificationID: msg.NotificationID,
		Title:          msg.Subject,
		Body:           msg.Body,
		Data:           msg.Data,
		Channel:        "websocket",
	}
	p.hub.BroadcastToTenant(msg.TenantID, delivery)
	p.log.Info("websocket provider sent",
		zap.String("tenant_id", msg.TenantID),
		zap.String("notification_id", msg.NotificationID),
		zap.Int64("duration_ms", time.Since(start).Milliseconds()),
	)
	return &providers.Result{
		ProviderMessageID: fmt.Sprintf("ws_%d", time.Now().UnixNano()),
		Status:            "sent",
		Raw:               map[string]any{"provider": "websocket", "broadcast": true},
	}, nil
}
