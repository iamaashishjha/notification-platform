package email

import (
	"context"
	"fmt"
	"net/smtp"
	"time"

	"notification-core-api/internal/providers"

	"go.uber.org/zap"
)

type SMTPConfig struct {
	Host     string
	Port     int
	Username string
	Password string
	From     string
}

type SMTPProvider struct {
	cfg SMTPConfig
	log *zap.Logger
}

func NewSMTP(cfg SMTPConfig, log *zap.Logger) SMTPProvider {
	return SMTPProvider{cfg: cfg, log: log}
}

func (p SMTPProvider) Send(ctx context.Context, msg providers.Message) (*providers.Result, error) {
	start := time.Now()
	auth := smtp.PlainAuth("", p.cfg.Username, p.cfg.Password, p.cfg.Host)
	to := []string{msg.To}
	subject := msg.Subject
	if subject == "" {
		subject = "Notification"
	}
	body := msg.Body
	if body == "" {
		body = msg.To
	}
	header := make(map[string]string)
	header["From"] = p.cfg.From
	header["To"] = msg.To
	header["Subject"] = subject
	header["MIME-Version"] = "1.0"
	header["Content-Type"] = "text/plain; charset=\"utf-8\""
	header["Date"] = time.Now().UTC().Format(time.RFC1123Z)
	var message string
	for k, v := range header {
		message += fmt.Sprintf("%s: %s\r\n", k, v)
	}
	message += "\r\n" + body
	addr := fmt.Sprintf("%s:%d", p.cfg.Host, p.cfg.Port)
	if err := smtp.SendMail(addr, auth, p.cfg.From, to, []byte(message)); err != nil {
		p.log.Error("smtp send failed", zap.Error(err), zap.String("to", msg.To))
		return nil, err
	}
	p.log.Info("smtp sent",
		zap.String("to", msg.To),
		zap.String("from", p.cfg.From),
		zap.Int64("duration_ms", time.Since(start).Milliseconds()),
	)
	return &providers.Result{
		ProviderMessageID: fmt.Sprintf("smtp_%d", time.Now().UnixNano()),
		Status:            "sent",
		Raw:               map[string]any{"provider": "smtp", "host": p.cfg.Host},
	}, nil
}
