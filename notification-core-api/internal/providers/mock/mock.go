package mock

import (
	"context"
	"fmt"
	"time"

	"notification-core-api/internal/providers"
	"notification-core-api/internal/security"

	"go.uber.org/zap"
)

type Provider struct {
	channel string
	log     *zap.Logger
}

func New(channel string, log *zap.Logger) Provider {
	return Provider{channel: channel, log: log}
}

func (p Provider) Send(ctx context.Context, msg providers.Message) (*providers.Result, error) {
	start := time.Now()
	to := msg.To
	if msg.Channel == "email" {
		to = security.RedactEmail(to)
	}
	if msg.Channel == "sms" {
		to = security.RedactPhone(to)
	}
	p.log.Info("mock provider sent",
		zap.String("tenant_id", msg.TenantID),
		zap.String("notification_id", msg.NotificationID),
		zap.String("delivery_id", msg.DeliveryID),
		zap.String("channel", p.channel),
		zap.String("to", to),
		zap.Int64("duration_ms", time.Since(start).Milliseconds()),
	)
	return &providers.Result{
		ProviderMessageID: fmt.Sprintf("mock_%s_%d", p.channel, time.Now().UnixNano()),
		Status:            "sent",
		Raw:               map[string]any{"provider": "mock", "simulated": true},
	}, nil
}
