# Provider Adapters

## Architecture

All providers implement the `providers.Provider` interface:

```go
type Provider interface {
    Send(ctx context.Context, msg Message) (*Result, error)
}
```

Each channel package (email, sms, fcm, websocket) exports:
- `NewMock(log)` - Returns mock provider for local development
- `NewReal(cfg map[string]any, log)` - Returns real provider from config JSON

## SMTP Email

**Package**: `internal/providers/email/`

**Config** (stored in `tenant_provider_configs.config_json`):
```json
{
  "host": "smtp.example.com",
  "port": 587,
  "username": "user",
  "password": "secret",
  "from": "noreply@example.com"
}
```

**Implementation**: Uses `net/smtp.SendMail` with PLAIN auth. Supports TLS via port 587 (STARTTLS) or 465 (implicit TLS in future).

**Secrets**: Password stored in config_json. Encryption not yet implemented.

## Generic HTTP SMS

**Package**: `internal/providers/sms/`

**Config**:
```json
{
  "url": "https://api.sms-gateway.com/send",
  "method": "POST",
  "token": "api-token-here",
  "token_header": "Authorization",
  "phone_key": "phone",
  "message_key": "message",
  "body_pattern": "{\"phone\":\"{{phone}}\",\"text\":\"{{message}}\"}",
  "timeout_seconds": 30
}
```

**Body Pattern**: Template with `{{phone}}` and `{{message}}` placeholders for Sparrow/generic gateways. If empty, sends `{"phone":"...","message":"..."}`.

**Success Codes**: 200, 201, 202 by default. Configurable.

## FCM HTTP v1

**Package**: `internal/providers/fcm/`

**Config**:
```json
{
  "service_account_path": "/path/to/service-account.json"
}
```

or inline:
```json
{
  "service_account_json": "{...full service account JSON...}"
}
```

**Implementation**:
1. Reads Google service account JSON
2. Creates a JWT assertion signed with the service account's RSA private key (RS256)
3. Exchanges JWT for OAuth2 access token via `token_uri`
4. Sends message via `POST https://fcm.googleapis.com/v1/projects/{project_id}/messages:send`
5. Caches access token until 60s before expiry

**Message format**:
```json
{
  "message": {
    "token": "device-fcm-token",
    "notification": {"title": "...", "body": "..."},
    "data": {"key1": "value1"}
  }
}
```

## WebSocket (In-App)

**Package**: `internal/providers/websocket/`

**Real provider**: Requires the in-memory Hub from the API process. Not available in worker processes (workers use mock).

**Behavior**: Broadcasts to all connected clients for the target tenant via the hub.

## Provider Test Endpoint

`POST /admin/api/v1/providers/{id}/test`

Requires `providers.manage` permission. Sends a test message through the configured provider and returns the result. Audited.

## Adding a New Provider

1. Create adapter implementing `providers.Provider` in the appropriate channel package
2. Add `NewReal` constructor that parses config map
3. Wire provider selection in the handler's `TestProviderConfig` method
