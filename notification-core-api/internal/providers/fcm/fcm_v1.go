package fcm

import (
	"bytes"
	"context"
	"crypto"
	"crypto/rand"
	"crypto/rsa"
	"crypto/sha256"
	"crypto/x509"
	"encoding/base64"
	"encoding/json"
	"encoding/pem"
	"fmt"
	"io"
	"net/http"
	"os"
	"strings"
	"sync"
	"time"

	"notification-core-api/internal/providers"

	"go.uber.org/zap"
)

type ServiceAccount struct {
	Type                    string `json:"type"`
	ProjectID               string `json:"project_id"`
	PrivateKeyID            string `json:"private_key_id"`
	PrivateKey              string `json:"private_key"`
	ClientEmail             string `json:"client_email"`
	ClientID                string `json:"client_id"`
	AuthURI                string `json:"auth_uri"`
	TokenURI               string `json:"token_uri"`
	AuthProviderX509CertURL string `json:"auth_provider_x509_cert_url"`
	ClientX509CertURL      string `json:"client_x509_cert_url"`
}

type tokenResponse struct {
	AccessToken string `json:"access_token"`
	TokenType   string `json:"token_type"`
	ExpiresIn   int    `json:"expires_in"`
}

type fcmMessage struct {
	Message fcmPayload `json:"message"`
}

type fcmPayload struct {
	Token        string           `json:"token,omitempty"`
	Topic        string           `json:"topic,omitempty"`
	Notification *fcmNotification `json:"notification,omitempty"`
	Data         map[string]string `json:"data,omitempty"`
}

type fcmNotification struct {
	Title string `json:"title,omitempty"`
	Body  string `json:"body,omitempty"`
}

type FCMV1Provider struct {
	projectID    string
	sa           ServiceAccount
	token        string
	tokenExpires time.Time
	mu           sync.Mutex
	cl           *http.Client
	log          *zap.Logger
}

func NewFCMV1(saPath string, log *zap.Logger) (FCMV1Provider, error) {
	data, err := os.ReadFile(saPath)
	if err != nil {
		return FCMV1Provider{}, fmt.Errorf("read service account: %w", err)
	}
	return NewFCMV1FromJSON(string(data), log)
}

func NewFCMV1FromJSON(saJSON string, log *zap.Logger) (FCMV1Provider, error) {
	var sa ServiceAccount
	if err := json.Unmarshal([]byte(saJSON), &sa); err != nil {
		return FCMV1Provider{}, fmt.Errorf("parse service account: %w", err)
	}
	if sa.ProjectID == "" {
		return FCMV1Provider{}, fmt.Errorf("project_id required in service account")
	}
	return FCMV1Provider{
		projectID: sa.ProjectID,
		sa:        sa,
		cl:        &http.Client{Timeout: 30 * time.Second},
		log:       log,
	}, nil
}

func (p *FCMV1Provider) Send(ctx context.Context, msg providers.Message) (*providers.Result, error) {
	start := time.Now()
	token, err := p.getToken(ctx)
	if err != nil {
		return nil, fmt.Errorf("fcm auth: %w", err)
	}

	fcmToken := msg.To
	if fcmToken == "" {
		if t, ok := msg.Data["fcm_token"].(string); ok {
			fcmToken = t
		}
	}
	if fcmToken == "" {
		return nil, fmt.Errorf("fcm token required")
	}

	title := msg.Subject
	if title == "" {
		if t, ok := msg.Data["title"].(string); ok {
			title = t
		}
	}
	body := msg.Body
	if body == "" {
		if b, ok := msg.Data["body"].(string); ok {
			body = b
		}
	}

	dataMap := make(map[string]string)
	for k, v := range msg.Data {
		if str, ok := v.(string); ok {
			dataMap[k] = str
		}
	}

	payload := fcmMessage{
		Message: fcmPayload{
			Token: fcmToken,
			Data:  dataMap,
		},
	}
	if title != "" || body != "" {
		payload.Message.Notification = &fcmNotification{
			Title: title,
			Body:  body,
		}
	}

	bodyBytes, _ := json.Marshal(payload)
	url := fmt.Sprintf("https://fcm.googleapis.com/v1/projects/%s/messages:send", p.projectID)
	req, err := http.NewRequestWithContext(ctx, "POST", url, bytes.NewReader(bodyBytes))
	if err != nil {
		return nil, err
	}
	req.Header.Set("Authorization", "Bearer "+token)
	req.Header.Set("Content-Type", "application/json")

	resp, err := p.cl.Do(req)
	if err != nil {
		p.log.Error("fcm HTTP request failed", zap.Error(err))
		return nil, err
	}
	defer resp.Body.Close()
	respBody, _ := io.ReadAll(resp.Body)

	if resp.StatusCode != 200 {
		err := fmt.Errorf("fcm API error %d: %s", resp.StatusCode, string(respBody))
		p.log.Error("fcm send failed", zap.Int("status", resp.StatusCode), zap.String("response", string(respBody)))
		return nil, err
	}

	p.log.Info("fcm sent",
		zap.Int64("duration_ms", time.Since(start).Milliseconds()),
	)
	return &providers.Result{
		ProviderMessageID: fmt.Sprintf("fcm_%d", time.Now().UnixNano()),
		Status:            "sent",
		Raw:               map[string]any{"provider": "fcm_v1", "project_id": p.projectID},
	}, nil
}

func (p *FCMV1Provider) getToken(ctx context.Context) (string, error) {
	p.mu.Lock()
	defer p.mu.Unlock()
	if p.token != "" && time.Now().UTC().Before(p.tokenExpires) {
		return p.token, nil
	}
	jwt, err := p.createAssertion()
	if err != nil {
		return "", err
	}
	body := fmt.Sprintf("grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=%s", jwt)
	req, err := http.NewRequestWithContext(ctx, "POST", p.sa.TokenURI, strings.NewReader(body))
	if err != nil {
		return "", err
	}
	req.Header.Set("Content-Type", "application/x-www-form-urlencoded")
	resp, err := p.cl.Do(req)
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()
	var tr tokenResponse
	if err := json.NewDecoder(resp.Body).Decode(&tr); err != nil {
		return "", err
	}
	p.token = tr.AccessToken
	p.tokenExpires = time.Now().UTC().Add(time.Duration(tr.ExpiresIn-60) * time.Second)
	return p.token, nil
}

func (p *FCMV1Provider) createAssertion() (string, error) {
	block, _ := pem.Decode([]byte(p.sa.PrivateKey))
	if block == nil {
		return "", fmt.Errorf("no PEM block in private key")
	}
	key, err := x509.ParsePKCS8PrivateKey(block.Bytes)
	if err != nil {
		key2, err2 := x509.ParsePKCS1PrivateKey(block.Bytes)
		if err2 != nil {
			return "", fmt.Errorf("parse private key: %w (pkcs8: %v, pkcs1: %v)", err, err, err2)
		}
		key = key2
	}
	rsaKey, ok := key.(*rsa.PrivateKey)
	if !ok {
		return "", fmt.Errorf("not an RSA private key")
	}

	iat := time.Now().Unix()
	exp := iat + 3600
	header := fmt.Sprintf(`{"alg":"RS256","typ":"JWT","kid":"%s"}`, p.sa.PrivateKeyID)
	claims := fmt.Sprintf(`{"iss":"%s","scope":"https://www.googleapis.com/auth/firebase.messaging","aud":"%s","iat":%d,"exp":%d}`, p.sa.ClientEmail, p.sa.TokenURI, iat, exp)

	headerB64 := base64.RawURLEncoding.EncodeToString([]byte(header))
	claimsB64 := base64.RawURLEncoding.EncodeToString([]byte(claims))
	sigInput := headerB64 + "." + claimsB64

	hash := sha256.Sum256([]byte(sigInput))
	sig, err := rsa.SignPKCS1v15(rand.Reader, rsaKey, crypto.SHA256, hash[:])
	if err != nil {
		return "", err
	}
	sigB64 := base64.RawURLEncoding.EncodeToString(sig)
	return sigInput + "." + sigB64, nil
}
