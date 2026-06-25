package queue

import (
	"context"
	"encoding/json"
	"time"

	amqp "github.com/rabbitmq/amqp091-go"
)

const (
	RouterQueue    = "notification.router"
	SchedulerQueue = "notification.scheduler"
	EmailQueue     = "notification.email"
	SMSQueue       = "notification.sms"
	FCMQueue       = "notification.fcm"
	WebSocketQueue = "notification.websocket"
	RetryQueue     = "notification.retry"
	DeadQueue      = "notification.dead"
)

var AllQueues = []string{RouterQueue, SchedulerQueue, EmailQueue, SMSQueue, FCMQueue, WebSocketQueue, RetryQueue, DeadQueue}

type Client struct {
	conn *amqp.Connection
	ch   *amqp.Channel
}

type Job struct {
	NotificationID string         `json:"notification_id"`
	DeliveryID     string         `json:"delivery_id,omitempty"`
	TenantID       string         `json:"tenant_id"`
	Channel        string         `json:"channel,omitempty"`
	Payload        map[string]any `json:"payload,omitempty"`
	Attempt        int            `json:"attempt,omitempty"`
}

func Connect(url string) (*Client, error) {
	conn, err := amqp.Dial(url)
	if err != nil {
		return nil, err
	}
	ch, err := conn.Channel()
	if err != nil {
		_ = conn.Close()
		return nil, err
	}
	client := &Client{conn: conn, ch: ch}
	return client, client.Declare()
}

func (c *Client) Declare() error {
	for _, name := range AllQueues {
		if _, err := c.ch.QueueDeclare(name, true, false, false, false, nil); err != nil {
			return err
		}
	}
	return nil
}

func (c *Client) Publish(ctx context.Context, queueName string, job Job) error {
	body, err := json.Marshal(job)
	if err != nil {
		return err
	}
	return c.ch.PublishWithContext(ctx, "", queueName, false, false, amqp.Publishing{
		ContentType:  "application/json",
		DeliveryMode: amqp.Persistent,
		Timestamp:    time.Now().UTC(),
		Body:         body,
	})
}

func (c *Client) Consume(queueName string) (<-chan amqp.Delivery, error) {
	return c.ch.Consume(queueName, "", false, false, false, false, nil)
}

func (c *Client) Close() {
	if c.ch != nil {
		_ = c.ch.Close()
	}
	if c.conn != nil {
		_ = c.conn.Close()
	}
}
