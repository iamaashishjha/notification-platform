package notifications

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"strings"
	"time"

	"notification-core-api/internal/channels"
	"notification-core-api/internal/config"
	"notification-core-api/internal/features"
	"notification-core-api/internal/queue"
	"notification-core-api/internal/ratelimit"
	"notification-core-api/internal/tenant"

	"github.com/jackc/pgx/v5/pgxpool"
	"go.uber.org/zap"
)

type Request struct {
	Event          string         `json:"event"`
	Channels       []string       `json:"channels"`
	Template       string         `json:"template"`
	Target         Target         `json:"target"`
	Data           map[string]any `json:"data"`
	Priority       int            `json:"priority"`
	Schedule       Schedule       `json:"schedule"`
	IdempotencyKey string         `json:"idempotency_key"`
}

type Target struct {
	Type      string         `json:"type"`
	Recipient map[string]any `json:"recipient"`
	ID        string         `json:"id"`
}

type Schedule struct {
	Type   string `json:"type"`
	SendAt string `json:"send_at"`
}

type Accepted struct {
	Status         string `json:"status"`
	NotificationID string `json:"notification_id"`
	Message        string `json:"message"`
}

type Service struct {
	db        *pgxpool.Pool
	queue     *queue.Client
	tenant    tenant.Service
	features  features.Service
	channels  channels.Service
	ratelimit ratelimit.Service
	log       *zap.Logger
}

func NewService(db *pgxpool.Pool, q *queue.Client, log *zap.Logger, cfg config.Config) Service {
	rl := ratelimit.NewService(cfg.RedisAddr)
	rl.SetDB(db)
	return Service{
		db:        db,
		queue:     q,
		tenant:    tenant.NewService(db),
		features:  features.NewService(db),
		channels:  channels.NewService(db),
		ratelimit: rl,
		log:       log,
	}
}

func (s Service) Send(ctx context.Context, tenantID string, req Request, actor string) (Accepted, error) {
	_ = actor
	if tenantID == "" {
		return Accepted{}, errors.New("tenant_id required")
	}
	if len(req.Channels) == 0 {
		return Accepted{}, errors.New("at least one channel is required")
	}
	if req.Schedule.Type == "" {
		req.Schedule.Type = "instant"
	}
	if err := s.tenant.EnsureActive(ctx, tenantID); err != nil {
		return Accepted{}, err
	}
	for _, channel := range req.Channels {
		if ok, err := s.features.Enabled(ctx, tenantID, "channel."+channel); err != nil || !ok {
			return Accepted{}, fmt.Errorf("feature disabled: channel.%s", channel)
		}
		if err := s.channels.ValidateSend(ctx, tenantID, channel, "one_way"); err != nil {
			return Accepted{}, fmt.Errorf("%s: %w", channel, err)
		}
		allowed, err := s.ratelimit.Allow(ctx, tenantID, channel)
		if err != nil || !allowed {
			return Accepted{}, fmt.Errorf("%s: rate limit exceeded", channel)
		}
	}

	jobPayload := map[string]any{}
	for key, value := range req.Data {
		jobPayload[key] = value
	}
	for key, value := range req.Target.Recipient {
		jobPayload[key] = value
	}
	body, err := json.Marshal(req)
	if err != nil {
		return Accepted{}, err
	}
	publicID := fmt.Sprintf("ntf_%d", time.Now().UnixNano())
	scheduledAt, status, err := scheduleState(req.Schedule)
	if err != nil {
		return Accepted{}, err
	}

	tx, err := s.db.Begin(ctx)
	if err != nil {
		return Accepted{}, err
	}
	defer tx.Rollback(ctx)

	const insertNotification = `
INSERT INTO notifications (tenant_id, public_id, event_key, template_key, target_type, target_json, data_json, channels, priority, schedule_type, scheduled_at, status, idempotency_key)
VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
RETURNING id::text`
	targetJSON, _ := json.Marshal(req.Target)
	channelsJSON, _ := json.Marshal(req.Channels)
	var notificationID string
	if err := tx.QueryRow(ctx, insertNotification, tenantID, publicID, req.Event, req.Template, req.Target.Type, targetJSON, body, channelsJSON, req.Priority, req.Schedule.Type, scheduledAt, status, nullIfEmpty(req.IdempotencyKey)).Scan(&notificationID); err != nil {
		return Accepted{}, err
	}

	if status == "scheduled" {
		const insertJob = `INSERT INTO scheduled_jobs (tenant_id, notification_id, job_type, due_at, status, payload_json) VALUES ($1,$2,'notification',$3,'pending',$4)`
		if _, err := tx.Exec(ctx, insertJob, tenantID, notificationID, scheduledAt, body); err != nil {
			return Accepted{}, err
		}
	} else {
		for _, channel := range req.Channels {
			const insertDelivery = `
INSERT INTO notification_deliveries (tenant_id, notification_id, channel, provider, recipient_json, status, scheduled_at)
VALUES ($1,$2,$3,'mock',$4,'queued',now())
RETURNING id::text`
			var deliveryID string
			if err := tx.QueryRow(ctx, insertDelivery, tenantID, notificationID, channel, targetJSON).Scan(&deliveryID); err != nil {
				return Accepted{}, err
			}
			control, err := queue.EnsureControl(ctx, s.db, tenantID, channel)
			if err != nil {
				return Accepted{}, err
			}
			if err := s.queue.Publish(ctx, channelQueue(channel), queue.Job{TenantID: tenantID, NotificationID: notificationID, DeliveryID: deliveryID, Channel: channel, QueueName: control.QueueName, Payload: jobPayload}); err != nil {
				return Accepted{}, err
			}
		}
	}

	if err := tx.Commit(ctx); err != nil {
		return Accepted{}, err
	}

	s.log.Info("notification accepted", zap.String("tenant_id", tenantID), zap.String("notification_id", notificationID), zap.Strings("channels", req.Channels), zap.String("status", status))
	return Accepted{Status: "accepted", NotificationID: publicID, Message: "Notification queued"}, nil
}

func (s Service) RouteDueScheduled(ctx context.Context) error {
	const q = `
SELECT sj.id::text, sj.tenant_id::text, sj.notification_id::text, n.channels, n.target_json, n.data_json
FROM scheduled_jobs sj
JOIN notifications n ON n.id = sj.notification_id
WHERE sj.status = 'pending' AND sj.due_at <= now()
ORDER BY sj.due_at ASC
LIMIT 100`
	rows, err := s.db.Query(ctx, q)
	if err != nil {
		return err
	}
	defer rows.Close()
	for rows.Next() {
		var jobID, tenantID, notificationID string
		var channelsRaw, targetRaw, dataRaw []byte
		if err := rows.Scan(&jobID, &tenantID, &notificationID, &channelsRaw, &targetRaw, &dataRaw); err != nil {
			return err
		}
		var channelList []string
		_ = json.Unmarshal(channelsRaw, &channelList)
		var target Target
		var req Request
		_ = json.Unmarshal(targetRaw, &target)
		_ = json.Unmarshal(dataRaw, &req)
		jobPayload := map[string]any{}
		for key, value := range req.Data {
			jobPayload[key] = value
		}
		for key, value := range target.Recipient {
			jobPayload[key] = value
		}
		for _, channel := range channelList {
			var deliveryID string
			if err := s.db.QueryRow(ctx, `INSERT INTO notification_deliveries (tenant_id, notification_id, channel, provider, status, scheduled_at) VALUES ($1,$2,$3,'mock','queued',now()) RETURNING id::text`, tenantID, notificationID, channel).Scan(&deliveryID); err != nil {
				return err
			}
			control, err := queue.EnsureControl(ctx, s.db, tenantID, channel)
			if err != nil {
				return err
			}
			if err := s.queue.Publish(ctx, channelQueue(channel), queue.Job{TenantID: tenantID, NotificationID: notificationID, DeliveryID: deliveryID, Channel: channel, QueueName: control.QueueName, Payload: jobPayload}); err != nil {
				return err
			}
		}
		if _, err := s.db.Exec(ctx, `UPDATE scheduled_jobs SET status = 'queued', updated_at = now() WHERE id = $1`, jobID); err != nil {
			return err
		}
	}
	return rows.Err()
}

func channelQueue(channel string) string {
	switch channel {
	case "email":
		return queue.EmailQueue
	case "sms":
		return queue.SMSQueue
	case "fcm":
		return queue.FCMQueue
	case "websocket":
		return queue.WebSocketQueue
	default:
		return queue.RouterQueue
	}
}

func scheduleState(s Schedule) (*time.Time, string, error) {
	if strings.EqualFold(s.Type, "scheduled") {
		t, err := time.Parse(time.RFC3339, s.SendAt)
		if err != nil {
			return nil, "", err
		}
		return &t, "scheduled", nil
	}
	return nil, "queued", nil
}

func nullIfEmpty(value string) any {
	if value == "" {
		return nil
	}
	return value
}
