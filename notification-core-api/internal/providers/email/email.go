package email

import (
	"notification-core-api/internal/providers/mock"

	"go.uber.org/zap"
)

func NewMock(log *zap.Logger) mock.Provider { return mock.New("email", log) }
