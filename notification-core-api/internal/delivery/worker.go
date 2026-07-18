package delivery

import (
	"context"
	"encoding/json"
	"time"

	"notification-core-api/internal/providers"
	"notification-core-api/internal/queue"

	"github.com/jackc/pgx/v5/pgxpool"
	"go.uber.org/zap"
)

type Worker struct {
	db       *pgxpool.Pool
	queue    *queue.Client
	provider providers.Provider
	log      *zap.Logger
}

func NewWorker(db *pgxpool.Pool, q *queue.Client, p providers.Provider, log *zap.Logger) Worker {
	return Worker{db: db, queue: q, provider: p, log: log}
}

func (w Worker) Run(ctx context.Context, queueName string) error {
	deliveries, err := w.queue.Consume(queueName)
	if err != nil {
		return err
	}
	w.log.Info("worker consuming", zap.String("queue", queueName))
	for {
		select {
		case <-ctx.Done():
			return ctx.Err()
		case msg := <-deliveries:
			var job queue.Job
			if err := json.Unmarshal(msg.Body, &job); err != nil {
				_ = msg.Nack(false, false)
				continue
			}
			if action, err := w.applyQueueControl(ctx, job); err != nil {
				w.log.Error("queue control check failed", zap.Error(err), zap.String("delivery_id", job.DeliveryID), zap.String("queue_name", job.QueueName))
				_ = msg.Nack(false, true)
				continue
			} else if action == "paused" {
				time.Sleep(2 * time.Second)
				_ = msg.Nack(false, true)
				continue
			} else if action == "stopped" {
				_ = msg.Ack(false)
				continue
			}
			if err := w.handle(ctx, job); err != nil {
				w.log.Error("delivery failed", zap.Error(err), zap.String("delivery_id", job.DeliveryID), zap.String("channel", job.Channel))
				job.Attempt++
				if pubErr := w.queue.Publish(ctx, queue.RetryQueue, job); pubErr != nil {
					w.log.Error("retry publish failed", zap.Error(pubErr), zap.String("delivery_id", job.DeliveryID))
				}
				_ = msg.Ack(false)
				continue
			}
			_ = msg.Ack(false)
		}
	}
}

func (w Worker) applyQueueControl(ctx context.Context, job queue.Job) (string, error) {
	control, err := queue.GetControl(ctx, w.db, job.TenantID, job.Channel)
	if err != nil {
		return "", err
	}
	if control.Status == "paused" {
		_, _ = w.db.Exec(ctx, `UPDATE notification_deliveries SET status = 'queued', response_json = jsonb_set(response_json, '{queue_status}', '"paused"', true), updated_at = now() WHERE id = $1`, job.DeliveryID)
		return "paused", nil
	}
	if control.Status == "stopped" {
		_, err := w.db.Exec(ctx, `UPDATE notification_deliveries SET status = 'blocked', response_json = jsonb_set(response_json, '{queue_status}', '"stopped"', true), updated_at = now() WHERE id = $1`, job.DeliveryID)
		return "stopped", err
	}
	return "", nil
}

func (w Worker) handle(ctx context.Context, job queue.Job) error {
	start := time.Now()
	_, _ = w.db.Exec(ctx, `UPDATE notification_deliveries SET status = 'sending', updated_at = now() WHERE id = $1`, job.DeliveryID)
	result, err := w.provider.Send(ctx, providers.Message{
		TenantID:       job.TenantID,
		NotificationID: job.NotificationID,
		DeliveryID:     job.DeliveryID,
		Channel:        job.Channel,
		To:             recipientFor(job.Channel, job.Payload),
		Data:           job.Payload,
	})
	status := "sent"
	var providerMessageID any
	var response any = []byte(`{}`)
	if err != nil {
		status = "failed"
	} else {
		providerMessageID = result.ProviderMessageID
		response, _ = json.Marshal(result.Raw)
	}
	_, dbErr := w.db.Exec(ctx, `
UPDATE notification_deliveries
SET status = $2, provider_message_id = $3, response_json = $4, delivered_at = CASE WHEN $2 = 'sent' THEN now() ELSE NULL END, updated_at = now()
WHERE id = $1`, job.DeliveryID, status, providerMessageID, response)
	if dbErr != nil {
		return dbErr
	}
	_, dbErr = w.db.Exec(ctx, `INSERT INTO delivery_attempts (tenant_id, delivery_id, attempt_no, status, response_json, duration_ms) VALUES ($1,$2,1,$3,$4,$5)`, job.TenantID, job.DeliveryID, status, response, time.Since(start).Milliseconds())
	if err != nil {
		return err
	}
	return dbErr
}

func recipientFor(channel string, payload map[string]any) string {
	switch channel {
	case "email":
		if value, ok := payload["email"].(string); ok {
			return value
		}
	case "sms":
		if value, ok := payload["phone"].(string); ok {
			return value
		}
	case "fcm":
		if value, ok := payload["fcm_token"].(string); ok {
			return value
		}
	}
	return "mock-recipient"
}
