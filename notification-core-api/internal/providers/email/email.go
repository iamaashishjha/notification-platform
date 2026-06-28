package email

import (
	"notification-core-api/internal/providers"
	"notification-core-api/internal/providers/mock"

	"go.uber.org/zap"
)

func NewMock(log *zap.Logger) mock.Provider { return mock.New("email", log) }

func NewReal(cfg map[string]any, log *zap.Logger) (providers.Provider, error) {
	smtpCfg := SMTPConfig{
		Host:     stringVal(cfg, "host", ""),
		Port:     intVal(cfg, "port", 587),
		Username: stringVal(cfg, "username", ""),
		Password: stringVal(cfg, "password", ""),
		From:     stringVal(cfg, "from", ""),
	}
	if smtpCfg.Host == "" {
		return nil, nil
	}
	return NewSMTP(smtpCfg, log), nil
}

func stringVal(m map[string]any, key, def string) string {
	if v, ok := m[key].(string); ok && v != "" {
		return v
	}
	return def
}

func intVal(m map[string]any, key string, def int) int {
	if v, ok := m[key].(float64); ok {
		return int(v)
	}
	return def
}
