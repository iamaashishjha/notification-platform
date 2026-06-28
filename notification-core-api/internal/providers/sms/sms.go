package sms

import (
	"time"

	"notification-core-api/internal/providers"
	"notification-core-api/internal/providers/mock"

	"go.uber.org/zap"
)

func NewMock(log *zap.Logger) mock.Provider { return mock.New("sms", log) }

func NewReal(cfg map[string]any, log *zap.Logger) (providers.Provider, error) {
	httpCfg := HTTPConfig{
		URL:         stringVal(cfg, "url", ""),
		Method:      stringVal(cfg, "method", "POST"),
		Token:       stringVal(cfg, "token", ""),
		TokenHeader: stringVal(cfg, "token_header", "Authorization"),
		PhoneKey:    stringVal(cfg, "phone_key", "phone"),
		MessageKey:  stringVal(cfg, "message_key", "message"),
		BodyPattern: stringVal(cfg, "body_pattern", ""),
	}
	if timeout, ok := cfg["timeout_seconds"].(float64); ok && timeout > 0 {
		httpCfg.Timeout = time.Duration(timeout) * time.Second
	}
	if httpCfg.URL == "" {
		return nil, nil
	}
	return NewHTTP(httpCfg, log), nil
}

func stringVal(m map[string]any, key, def string) string {
	if v, ok := m[key].(string); ok && v != "" {
		return v
	}
	return def
}
