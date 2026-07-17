package auth

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"slices"
	"time"

	"notification-core-api/internal/config"
	"notification-core-api/internal/security"

	"github.com/golang-jwt/jwt/v5"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"golang.org/x/crypto/bcrypt"
)

type Principal struct {
	UserID      string   `json:"user_id"`
	TenantID    string   `json:"tenant_id,omitempty"`
	Email       string   `json:"email"`
	IsPlatform  bool     `json:"is_platform_admin"`
	SessionID   string   `json:"session_id,omitempty"`
	Permissions []string `json:"permissions"`
}

type Service struct {
	db                *pgxpool.Pool
	jwtSecret         []byte
	accessTokenTTL    time.Duration
	refreshTokenTTL   time.Duration
	loginMaxFailures  int
	loginLockout      time.Duration
	webSocketTokenTTL time.Duration
}

type TokenPair struct {
	AccessToken  string `json:"access_token"`
	RefreshToken string `json:"refresh_token"`
}

type APIKeyPrincipal struct {
	TenantID string
	KeyID    string
	Scopes   []string
}

func NewService(db *pgxpool.Pool, cfg config.Config) Service {
	return Service{
		db:                db,
		jwtSecret:         []byte(cfg.JWTSecret),
		accessTokenTTL:    cfg.AccessTokenTTL,
		refreshTokenTTL:   cfg.RefreshTokenTTL,
		loginMaxFailures:  cfg.LoginMaxFailures,
		loginLockout:      cfg.LoginLockout,
		webSocketTokenTTL: cfg.WebSocketTokenTTL,
	}
}

func (s Service) Login(ctx context.Context, email, password, ipAddress, userAgent, requestID string) (TokenPair, Principal, error) {
	const q = `
SELECT u.id::text, COALESCE(tu.tenant_id::text, ''), u.email, u.password_hash, u.is_platform_admin, u.failed_login_count, u.locked_until
FROM users u
LEFT JOIN tenant_users tu ON tu.user_id = u.id AND tu.status = 'active'
WHERE u.email = $1 AND u.status = 'active'
ORDER BY tu.created_at ASC
LIMIT 1`
	var p Principal
	var hash string
	var failedCount int
	var lockedUntil sql.NullTime
	if err := s.db.QueryRow(ctx, q, email).Scan(&p.UserID, &p.TenantID, &p.Email, &hash, &p.IsPlatform, &failedCount, &lockedUntil); err != nil {
		_ = s.recordLoginAttempt(ctx, email, "", ipAddress, userAgent, false, "invalid_credentials", requestID)
		return TokenPair{}, p, errors.New("invalid credentials")
	}
	if lockedUntil.Valid && lockedUntil.Time.After(time.Now().UTC()) {
		_ = s.recordLoginAttempt(ctx, email, p.UserID, ipAddress, userAgent, false, "account_locked", requestID)
		return TokenPair{}, p, errors.New("account temporarily locked")
	}
	if bcrypt.CompareHashAndPassword([]byte(hash), []byte(password)) != nil {
		_ = s.recordFailedPassword(ctx, p.UserID)
		_ = s.recordLoginAttempt(ctx, email, p.UserID, ipAddress, userAgent, false, "invalid_credentials", requestID)
		return TokenPair{}, p, errors.New("invalid credentials")
	}
	perms, err := s.EffectivePermissions(ctx, p.UserID, p.TenantID)
	if err != nil {
		return TokenPair{}, p, err
	}
	p.Permissions = perms
	sessionID, err := security.RandomToken("sess", 24)
	if err != nil {
		return TokenPair{}, p, err
	}
	p.SessionID = sessionID
	refreshToken, err := s.createSession(ctx, p, ipAddress, userAgent)
	if err != nil {
		return TokenPair{}, p, err
	}
	accessToken, err := s.sign(p)
	if err != nil {
		return TokenPair{}, p, err
	}
	_, _ = s.db.Exec(ctx, `UPDATE users SET failed_login_count = 0, locked_until = NULL, updated_at = now() WHERE id = $1`, p.UserID)
	_ = s.recordLoginAttempt(ctx, email, p.UserID, ipAddress, userAgent, true, "", requestID)
	return TokenPair{AccessToken: accessToken, RefreshToken: refreshToken}, p, nil
}

func (s Service) VerifyJWT(tokenString string) (Principal, error) {
	claims := jwt.MapClaims{}
	token, err := jwt.ParseWithClaims(tokenString, claims, func(token *jwt.Token) (any, error) {
		return s.jwtSecret, nil
	})
	if err != nil || !token.Valid {
		return Principal{}, errors.New("invalid token")
	}
	p := Principal{
		UserID:     stringClaim(claims, "user_id"),
		TenantID:   stringClaim(claims, "tenant_id"),
		Email:      stringClaim(claims, "email"),
		IsPlatform: boolClaim(claims, "is_platform_admin"),
		SessionID:  stringClaim(claims, "session_id"),
	}
	if raw, ok := claims["permissions"].([]any); ok {
		for _, item := range raw {
			if value, ok := item.(string); ok {
				p.Permissions = append(p.Permissions, value)
			}
		}
	}
	return p, nil
}

func (s Service) VerifyAPIKey(ctx context.Context, rawKey string) (APIKeyPrincipal, error) {
	const q = `SELECT id::text, tenant_id::text, scopes_json FROM tenant_api_keys WHERE key_hash = $1 AND status = 'active' AND revoked_at IS NULL AND (expires_at IS NULL OR expires_at > now())`
	var principal APIKeyPrincipal
	var scopesRaw []byte
	if err := s.db.QueryRow(ctx, q, security.HashSecret(rawKey)).Scan(&principal.KeyID, &principal.TenantID, &scopesRaw); err != nil {
		return principal, errors.New("invalid api key")
	}
	principal.Scopes = parseStringJSON(scopesRaw)
	_, _ = s.db.Exec(ctx, `UPDATE tenant_api_keys SET last_used_at = now(), updated_at = now() WHERE id = $1`, principal.KeyID)
	return principal, nil
}

func (s Service) EffectivePermissions(ctx context.Context, userID, tenantID string) ([]string, error) {
	const q = `
SELECT DISTINCT p.key
FROM permissions p
JOIN role_permissions rp ON rp.permission_id = p.id
JOIN user_roles ur ON ur.role_id = rp.role_id
WHERE ur.user_id = $1 AND (ur.tenant_id IS NULL OR ur.tenant_id::text = $2)
UNION
SELECT DISTINCT p.key
FROM permissions p
JOIN user_permissions up ON up.permission_id = p.id
WHERE up.user_id = $1 AND up.effect = 'allow' AND (up.tenant_id IS NULL OR up.tenant_id::text = $2)
EXCEPT
SELECT DISTINCT p.key
FROM permissions p
JOIN user_permissions up ON up.permission_id = p.id
WHERE up.user_id = $1 AND up.effect = 'deny' AND (up.tenant_id IS NULL OR up.tenant_id::text = $2)
ORDER BY key`
	rows, err := s.db.Query(ctx, q, userID, tenantID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	perms := []string{}
	for rows.Next() {
		var key string
		if err := rows.Scan(&key); err != nil {
			return nil, err
		}
		perms = append(perms, key)
	}
	return perms, rows.Err()
}

var granularToBroad = map[string]string{
	"users.view":               "users.manage",
	"users.create":             "users.manage",
	"users.update":             "users.manage",
	"users.delete":             "users.manage",
	"users.reset_password":     "users.manage",
	"users.assign_roles":       "users.manage",
	"users.assign_permissions": "users.manage",
	"features.view":            "features.manage",
	"features.update":          "features.manage",
	"channels.view":            "channels.manage",
	"channels.update":          "channels.manage",
	"providers.view":           "providers.manage",
	"providers.create":         "providers.manage",
	"providers.update":         "providers.manage",
	"providers.delete":         "providers.manage",
	"providers.test":           "providers.manage",
	"groups.view":              "groups.manage",
	"groups.create":            "groups.manage",
	"groups.update":            "groups.manage",
	"groups.delete":            "groups.manage",
	"groups.members.manage":    "groups.manage",
	"settings.view":            "settings.manage",
	"settings.update":          "settings.manage",
	"api_keys.view":            "api_keys.manage",
	"api_keys.create":          "api_keys.manage",
	"api_keys.revoke":          "api_keys.manage",
	"campaigns.view":           "campaigns.manage",
	"campaigns.create":         "campaigns.manage",
	"campaigns.update":         "campaigns.manage",
	"campaigns.approve":        "campaigns.manage",
	"campaigns.send":           "campaigns.manage",
	"campaigns.schedule":       "campaigns.manage",
	"campaigns.cancel":         "campaigns.manage",
	"templates.view":           "templates.manage",
	"templates.create":         "templates.manage",
	"templates.update":         "templates.manage",
	"templates.delete":         "templates.manage",
	"contacts.view":            "contacts.manage",
	"contacts.create":          "contacts.manage",
	"contacts.update":          "contacts.manage",
	"contacts.delete":          "contacts.manage",
	"notifications.view":       "notifications.manage",
	"notifications.create":     "notifications.manage",
	"notifications.send":       "notifications.manage",
	"notifications.bulk_send":  "notifications.manage",
	"notifications.retry":      "notifications.manage",
	"notifications.cancel":     "notifications.manage",
	"tenants.view":             "tenants.manage",
	"tenants.create":           "tenants.manage",
	"tenants.update":           "tenants.manage",
	"tenants.delete":           "tenants.manage",
}

func (s Service) HasPermission(ctx context.Context, p Principal, permission string) bool {
	if p.IsPlatform {
		return true
	}
	if slices.Contains(p.Permissions, permission) {
		return true
	}
	if broad, ok := granularToBroad[permission]; ok {
		return slices.Contains(p.Permissions, broad)
	}
	return false
}

func (s Service) InvalidatePermissionCache(ctx context.Context, userID, tenantID string) error {
	const q = `
INSERT INTO permission_cache_versions (tenant_id, user_id, version)
VALUES ($1,$2,2)
ON CONFLICT (user_id, COALESCE(tenant_id, '00000000-0000-0000-0000-000000000000'::uuid))
DO UPDATE SET version = permission_cache_versions.version + 1, updated_at = now()`
	_, err := s.db.Exec(ctx, q, nullIfEmpty(tenantID), userID)
	return err
}

func (s Service) Refresh(ctx context.Context, refreshToken, ipAddress, userAgent string) (TokenPair, Principal, error) {
	hash := security.HashSecret(refreshToken)
	const q = `
SELECT s.id::text, COALESCE(s.session_trace_id,''), u.id::text, COALESCE(s.tenant_id::text, ''), u.email, u.is_platform_admin
FROM auth_sessions s
JOIN users u ON u.id = s.user_id
WHERE s.refresh_token_hash = $1 AND s.status = 'active' AND s.expires_at > now() AND u.status = 'active'`
	var authSessionID string
	var p Principal
	if err := s.db.QueryRow(ctx, q, hash).Scan(&authSessionID, &p.SessionID, &p.UserID, &p.TenantID, &p.Email, &p.IsPlatform); err != nil {
		return TokenPair{}, p, errors.New("invalid refresh token")
	}
	perms, err := s.EffectivePermissions(ctx, p.UserID, p.TenantID)
	if err != nil {
		return TokenPair{}, p, err
	}
	p.Permissions = perms
	if _, err := s.db.Exec(ctx, `UPDATE auth_sessions SET status = 'rotated', revoked_at = now(), revoked_reason = 'refresh_rotation', updated_at = now() WHERE id = $1`, authSessionID); err != nil {
		return TokenPair{}, p, err
	}
	accessToken, err := s.sign(p)
	if err != nil {
		return TokenPair{}, p, err
	}
	nextRefresh, err := s.createSession(ctx, p, ipAddress, userAgent)
	if err != nil {
		return TokenPair{}, p, err
	}
	return TokenPair{AccessToken: accessToken, RefreshToken: nextRefresh}, p, nil
}

func (s Service) RevokeRefreshToken(ctx context.Context, refreshToken string) error {
	_, err := s.db.Exec(ctx, `UPDATE auth_sessions SET status = 'revoked', revoked_at = now(), revoked_reason = 'logout', updated_at = now() WHERE refresh_token_hash = $1`, security.HashSecret(refreshToken))
	return err
}

func (s Service) GenerateAPIKey(ctx context.Context, tenantID, name, createdBy string, scopes []string, expiresAt *time.Time) (string, string, error) {
	raw, err := security.RandomToken("ntk", 32)
	if err != nil {
		return "", "", err
	}
	const q = `INSERT INTO tenant_api_keys (tenant_id, name, key_hash, scopes_json, created_by, expires_at, status) VALUES ($1,$2,$3,$4,$5,$6,'active') RETURNING id::text`
	var id string
	if err := s.db.QueryRow(ctx, q, tenantID, name, security.HashSecret(raw), toJSON(scopes), nullIfEmpty(createdBy), expiresAt).Scan(&id); err != nil {
		return "", "", err
	}
	return id, raw, nil
}

func (s Service) CreateWebSocketToken(ctx context.Context, p Principal, externalUserID string) (string, error) {
	token, err := security.RandomToken("wst", 32)
	if err != nil {
		return "", err
	}
	nonce, err := security.RandomToken("", 16)
	if err != nil {
		return "", err
	}
	const q = `INSERT INTO websocket_connection_tokens (tenant_id, user_id, external_user_id, token_hash, nonce, expires_at) VALUES ($1,$2,$3,$4,$5,$6)`
	_, err = s.db.Exec(ctx, q, p.TenantID, p.UserID, nullIfEmpty(externalUserID), security.HashSecret(token), nonce, time.Now().UTC().Add(s.webSocketTokenTTL))
	return token, err
}

func (s Service) sign(p Principal) (string, error) {
	claims := jwt.MapClaims{
		"user_id":           p.UserID,
		"tenant_id":         p.TenantID,
		"email":             p.Email,
		"is_platform_admin": p.IsPlatform,
		"session_id":        p.SessionID,
		"permissions":       p.Permissions,
		"exp":               time.Now().Add(s.accessTokenTTL).Unix(),
		"iat":               time.Now().Unix(),
	}
	return jwt.NewWithClaims(jwt.SigningMethodHS256, claims).SignedString(s.jwtSecret)
}

func (s Service) createSession(ctx context.Context, p Principal, ipAddress, userAgent string) (string, error) {
	token, err := security.RandomToken("rft", 32)
	if err != nil {
		return "", err
	}
	sessionID := p.SessionID
	if sessionID == "" {
		var err error
		sessionID, err = security.RandomToken("sess", 24)
		if err != nil {
			return "", err
		}
	}
	const q = `INSERT INTO auth_sessions (user_id, tenant_id, refresh_token_hash, user_agent, ip_address, expires_at, session_trace_id) VALUES ($1,$2,$3,$4,$5,$6,$7)`
	_, err = s.db.Exec(ctx, q, p.UserID, nullIfEmpty(p.TenantID), security.HashSecret(token), userAgent, ipAddress, time.Now().UTC().Add(s.refreshTokenTTL), sessionID)
	if err != nil {
		return "", err
	}
	return token, nil
}

func (s Service) recordFailedPassword(ctx context.Context, userID string) error {
	lockAt := time.Now().UTC().Add(s.loginLockout)
	ct, err := s.db.Exec(ctx, `UPDATE users SET failed_login_count = failed_login_count + 1, locked_until = CASE WHEN failed_login_count + 1 >= $2 THEN $3 ELSE locked_until END, updated_at = now() WHERE id = $1`, userID, s.loginMaxFailures, lockAt)
	if err == nil && ct.RowsAffected() == 0 {
		return pgx.ErrNoRows
	}
	return err
}

func (s Service) recordLoginAttempt(ctx context.Context, email, userID, ipAddress, userAgent string, success bool, reason, requestID string) error {
	_, err := s.db.Exec(ctx, `INSERT INTO login_attempts (email, user_id, ip_address, user_agent, success, failure_reason, request_id) VALUES ($1,$2,$3,$4,$5,$6,$7)`, email, nullIfEmpty(userID), ipAddress, userAgent, success, nullIfEmpty(reason), requestID)
	return err
}

func parseStringJSON(raw []byte) []string {
	values := []string{}
	_ = json.Unmarshal(raw, &values)
	return values
}

func toJSON(values []string) []byte {
	raw, _ := json.Marshal(values)
	return raw
}

func nullIfEmpty(value string) any {
	if value == "" {
		return nil
	}
	return value
}

func stringClaim(claims jwt.MapClaims, key string) string {
	if value, ok := claims[key].(string); ok {
		return value
	}
	return ""
}

func boolClaim(claims jwt.MapClaims, key string) bool {
	if value, ok := claims[key].(bool); ok {
		return value
	}
	return false
}
