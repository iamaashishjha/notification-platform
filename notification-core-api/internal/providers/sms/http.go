package sms

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"

	"notification-core-api/internal/providers"

	"go.uber.org/zap"
)

type HTTPConfig struct {
	URL         string
	Method      string
	Headers     map[string]string
	PhoneKey    string
	MessageKey  string
	BodyPattern string
	Token       string
	TokenHeader string
	SuccessCodes []int
	Timeout     time.Duration
}

type HTTPProvider struct {
	cfg HTTPConfig
	cl  *http.Client
	log *zap.Logger
}

func NewHTTP(cfg HTTPConfig, log *zap.Logger) HTTPProvider {
	if cfg.Timeout == 0 {
		cfg.Timeout = 30 * time.Second
	}
	if cfg.Method == "" {
		cfg.Method = "POST"
	}
	if cfg.PhoneKey == "" {
		cfg.PhoneKey = "phone"
	}
	if cfg.MessageKey == "" {
		cfg.MessageKey = "message"
	}
	if len(cfg.SuccessCodes) == 0 {
		cfg.SuccessCodes = []int{200, 201, 202}
	}
	if cfg.Headers == nil {
		cfg.Headers = make(map[string]string)
	}
	if _, ok := cfg.Headers["Content-Type"]; !ok {
		cfg.Headers["Content-Type"] = "application/json"
	}
	return HTTPProvider{cfg: cfg, cl: &http.Client{Timeout: cfg.Timeout}, log: log}
}

func (p HTTPProvider) Send(ctx context.Context, msg providers.Message) (*providers.Result, error) {
	start := time.Now()

	phone := msg.To
	message := msg.Body
	if message == "" {
		if body, ok := msg.Data["body"].(string); ok && body != "" {
			message = body
		}
	}

	bodyMap := map[string]any{}
	if strings.Contains(p.cfg.BodyPattern, "{{phone}}") || strings.Contains(p.cfg.BodyPattern, "{{message}}") {
		pattern := strings.ReplaceAll(p.cfg.BodyPattern, "{{phone}}", phone)
		pattern = strings.ReplaceAll(pattern, "{{message}}", message)

		var rawPayload map[string]any
		if err := json.Unmarshal([]byte(pattern), &rawPayload); err == nil {
			bodyMap = rawPayload
		}
	} else {
		bodyMap[p.cfg.PhoneKey] = phone
		bodyMap[p.cfg.MessageKey] = message
	}

	bodyBytes, _ := json.Marshal(bodyMap)
	req, err := http.NewRequestWithContext(ctx, p.cfg.Method, p.cfg.URL, bytes.NewReader(bodyBytes))
	if err != nil {
		return nil, err
	}
	for k, v := range p.cfg.Headers {
		req.Header.Set(k, v)
	}
	if p.cfg.Token != "" {
		headerName := p.cfg.TokenHeader
		if headerName == "" {
			headerName = "Authorization"
		}
		if strings.HasPrefix(strings.ToLower(headerName), "bearer") || strings.HasPrefix(strings.ToLower(headerName), "token") {
			req.Header.Set(headerName, p.cfg.Token)
		} else {
			req.Header.Set(headerName, "Bearer "+p.cfg.Token)
		}
	}

	resp, err := p.cl.Do(req)
	if err != nil {
		p.log.Error("http sms request failed", zap.Error(err), zap.String("phone", phone))
		return nil, err
	}
	defer resp.Body.Close()
	respBody, _ := io.ReadAll(resp.Body)

	success := false
	for _, code := range p.cfg.SuccessCodes {
		if resp.StatusCode == code {
			success = true
			break
		}
	}
	if !success {
		err := fmt.Errorf("http sms unexpected status: %d", resp.StatusCode)
		p.log.Error("http sms failed", zap.Int("status", resp.StatusCode), zap.String("body", string(respBody)))
		return nil, err
	}

	p.log.Info("http sms sent",
		zap.String("phone", phone),
		zap.Int64("duration_ms", time.Since(start).Milliseconds()),
	)
	return &providers.Result{
		ProviderMessageID: fmt.Sprintf("httpsms_%d", time.Now().UnixNano()),
		Status:            "sent",
		Raw:               map[string]any{"provider": "http_sms", "status": resp.StatusCode},
	}, nil
}
