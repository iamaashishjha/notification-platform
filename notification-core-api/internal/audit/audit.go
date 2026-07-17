package audit

import (
	"context"
	"encoding/json"

	"notification-core-api/internal/security"

	"github.com/jackc/pgx/v5/pgxpool"
)

type contextKey string

const sessionIDKey contextKey = "audit_session_id"

type Service struct {
	db *pgxpool.Pool
}

type Event struct {
	TenantID     string
	ActorUserID  string
	ActorType    string
	Action       string
	ResourceType string
	ResourceID   string
	Before       map[string]any
	After        map[string]any
	IPAddress    string
	UserAgent    string
	RequestID    string
	SessionID    string
}

func NewService(db *pgxpool.Pool) Service {
	return Service{db: db}
}

func (s Service) Write(ctx context.Context, event Event) error {
	before, _ := json.Marshal(security.RedactMap(event.Before))
	after, _ := json.Marshal(security.RedactMap(event.After))
	sessionID := event.SessionID
	if sessionID == "" {
		sessionID = SessionID(ctx)
	}
	const q = `
INSERT INTO audit_logs (tenant_id, actor_user_id, actor_type, action, resource_type, resource_id, before_json, after_json, ip_address, user_agent, request_id, session_id)
VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`
	_, err := s.db.Exec(ctx, q, nullIfEmpty(event.TenantID), nullIfEmpty(event.ActorUserID), event.ActorType, event.Action, event.ResourceType, nullIfEmpty(event.ResourceID), before, after, event.IPAddress, event.UserAgent, event.RequestID, nullIfEmpty(sessionID))
	return err
}

func (s Service) SecurityEvent(ctx context.Context, event Event, severity string) error {
	metadata, _ := json.Marshal(security.RedactMap(event.After))
	sessionID := event.SessionID
	if sessionID == "" {
		sessionID = SessionID(ctx)
	}
	const q = `
INSERT INTO security_events (tenant_id, actor_user_id, actor_type, event_type, severity, metadata_json, request_id, ip_address, user_agent, session_id)
VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`
	_, err := s.db.Exec(ctx, q, nullIfEmpty(event.TenantID), nullIfEmpty(event.ActorUserID), event.ActorType, event.Action, severity, metadata, event.RequestID, event.IPAddress, event.UserAgent, nullIfEmpty(sessionID))
	return err
}

func ContextWithSessionID(ctx context.Context, sessionID string) context.Context {
	if sessionID == "" {
		return ctx
	}
	return context.WithValue(ctx, sessionIDKey, sessionID)
}

func SessionID(ctx context.Context) string {
	value, _ := ctx.Value(sessionIDKey).(string)
	return value
}

func nullIfEmpty(value string) any {
	if value == "" {
		return nil
	}
	return value
}
