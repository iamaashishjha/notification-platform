package fcm

import (
	"notification-core-api/internal/providers"
	"notification-core-api/internal/providers/mock"

	"go.uber.org/zap"
)

func NewMock(log *zap.Logger) mock.Provider { return mock.New("fcm", log) }

func NewReal(cfg map[string]any, log *zap.Logger) (providers.Provider, error) {
	saPath, _ := cfg["service_account_path"].(string)
	saJSON, _ := cfg["service_account_json"].(string)
	if saPath != "" {
		p, err := NewFCMV1(saPath, log)
		if err != nil {
			return nil, err
		}
		return &p, nil
	}
	if saJSON != "" {
		p, err := NewFCMV1FromJSON(saJSON, log)
		if err != nil {
			return nil, err
		}
		return &p, nil
	}
	return nil, nil
}
