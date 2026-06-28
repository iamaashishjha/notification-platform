package retry

import (
	"context"
	"encoding/json"
	"fmt"
	"math"
	"time"

	"notification-core-api/internal/config"
	"notification-core-api/internal/queue"

	"github.com/jackc/pgx/v5/pgxpool"
	"go.uber.org/zap"
)

type Service struct {
	db    *pgxpool.Pool
	q     *queue.Client
	log   *zap.Logger
	cfg   config.Config
}

func NewService(db *pgxpool.Pool, q *queue.Client, log *zap.Logger, cfg config.Config) Service {
	return Service{db: db, q: q, log: log, cfg: cfg}
}

func backoffDuration(attempt int) time.Duration {
	return time.Duration(math.Pow(2, float64(attempt-1))) * time.Minute
}

func (s Service) RetryDeadLetters(ctx context.Context) error {
	deliveries, err := s.q.Consume(queue.DeadQueue)
	if err != nil {
		return err
	}
	s.log.Info("dead-letter worker consuming")
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
			if _, err := s.db.Exec(ctx, `UPDATE notification_deliveries SET status = 'dead', response_json = jsonb_set(COALESCE(response_json,'{}'), '{dead_letter}', '"max_retries_exceeded"'), updated_at = now() WHERE id = $1`, job.DeliveryID); err != nil {
				s.log.Error("dead-letter record failed", zap.Error(err), zap.String("delivery_id", job.DeliveryID))
			}
			s.log.Warn("delivery moved to dead letter", zap.String("delivery_id", job.DeliveryID), zap.String("channel", job.Channel), zap.Int("max_attempts", s.cfg.MaxDeliveryTries))
			_ = msg.Ack(false)
		}
	}
}

func (s Service) RetryLoop(ctx context.Context) error {
	deliveries, err := s.q.Consume(queue.RetryQueue)
	if err != nil {
		return err
	}
	s.log.Info("retry worker consuming", zap.Int("max_attempts", s.cfg.MaxDeliveryTries))
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
			if job.Attempt >= s.cfg.MaxDeliveryTries {
				if err := s.q.Publish(ctx, queue.DeadQueue, job); err != nil {
					s.log.Error("dead-letter publish failed", zap.Error(err), zap.String("delivery_id", job.DeliveryID))
					_ = msg.Nack(false, false)
					continue
				}
				_ = msg.Ack(false)
				continue
			}
			wait := backoffDuration(job.Attempt)
			s.log.Info("retry scheduling",
				zap.String("delivery_id", job.DeliveryID),
				zap.Int("attempt", job.Attempt),
				zap.Duration("wait", wait),
			)
			time.Sleep(wait)
			queueName := channelQueue(job.Channel)
			job.Attempt++
			if err := s.q.Publish(ctx, queueName, job); err != nil {
				s.log.Error("retry publish failed", zap.Error(err), zap.String("delivery_id", job.DeliveryID), zap.String("queue", queueName))
				_ = msg.Nack(false, false)
				continue
			}
			_, _ = s.db.Exec(ctx, `UPDATE notification_deliveries SET response_json = jsonb_set(COALESCE(response_json,'{}'), '{retry_count}', $1::jsonb) WHERE id = $2`, fmt.Sprintf(`%d`, job.Attempt), job.DeliveryID)
			_ = msg.Ack(false)
		}
	}
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
