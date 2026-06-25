package providers

import "context"

type Message struct {
	TenantID       string
	NotificationID string
	DeliveryID     string
	Channel        string
	To             string
	Subject        string
	Body           string
	Data           map[string]any
}

type Result struct {
	ProviderMessageID string
	Status            string
	Raw               map[string]any
}

type Provider interface {
	Send(ctx context.Context, msg Message) (*Result, error)
}
