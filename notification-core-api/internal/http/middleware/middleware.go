package middleware

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"net/http"
	"slices"
	"strings"

	"notification-core-api/internal/auth"
	"notification-core-api/internal/security"

	"go.uber.org/zap"
)

type contextKey string

const (
	PrincipalKey contextKey = "principal"
	TenantKey    contextKey = "tenant_id"
	APIKeyKey    contextKey = "api_key"
	RequestIDKey contextKey = "request_id"
)

func CORS(origins []string) func(http.Handler) http.Handler {
	allowed := map[string]bool{}
	for _, origin := range origins {
		allowed[strings.TrimSpace(origin)] = true
	}
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			origin := r.Header.Get("Origin")
			if allowed[origin] || allowed["*"] {
				w.Header().Set("Access-Control-Allow-Origin", origin)
				w.Header().Set("Access-Control-Allow-Headers", "Authorization, Content-Type")
				w.Header().Set("Access-Control-Allow-Methods", "GET, POST, PUT, PATCH, DELETE, OPTIONS")
			}
			if r.Method == http.MethodOptions {
				w.WriteHeader(http.StatusNoContent)
				return
			}
			next.ServeHTTP(w, r)
		})
	}
}

func RequestLog(log *zap.Logger) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			requestID := r.Header.Get("X-Request-ID")
			if requestID == "" {
				requestID = newRequestID()
			}
			w.Header().Set("X-Request-ID", requestID)
			ctx := context.WithValue(r.Context(), RequestIDKey, requestID)
			log.Info("request received",
				zap.String("request_id", requestID),
				zap.String("method", r.Method),
				zap.String("path", r.URL.Path),
				zap.String("authorization", security.MaskToken(r.Header.Get("Authorization"))),
			)
			next.ServeHTTP(w, r.WithContext(ctx))
		})
	}
}

func JWT(svc auth.Service) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			token := bearer(r.Header.Get("Authorization"))
			p, err := svc.VerifyJWT(token)
			if err != nil {
				writeError(w, http.StatusUnauthorized, "unauthorized")
				return
			}
			ctx := context.WithValue(r.Context(), PrincipalKey, p)
			next.ServeHTTP(w, r.WithContext(ctx))
		})
	}
}

func APIKey(svc auth.Service) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			raw := bearer(r.Header.Get("Authorization"))
			principal, err := svc.VerifyAPIKey(r.Context(), raw)
			if err != nil {
				writeError(w, http.StatusUnauthorized, "unauthorized")
				return
			}
			ctx := context.WithValue(r.Context(), TenantKey, principal.TenantID)
			ctx = context.WithValue(ctx, APIKeyKey, principal)
			next.ServeHTTP(w, r.WithContext(ctx))
		})
	}
}

func RequirePermission(svc auth.Service, permission string) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			p, ok := Principal(r.Context())
			if !ok || !svc.HasPermission(r.Context(), p, permission) {
				writeError(w, http.StatusForbidden, "forbidden")
				return
			}
			next.ServeHTTP(w, r)
		})
	}
}

func RequireScope(scope string) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			principal, ok := APIKeyPrincipal(r.Context())
			if !ok || (!slices.Contains(principal.Scopes, "*") && !slices.Contains(principal.Scopes, scope)) {
				writeError(w, http.StatusForbidden, "forbidden")
				return
			}
			next.ServeHTTP(w, r)
		})
	}
}

func bearer(header string) string {
	return strings.TrimSpace(strings.TrimPrefix(header, "Bearer "))
}

func Principal(ctx context.Context) (auth.Principal, bool) {
	p, ok := ctx.Value(PrincipalKey).(auth.Principal)
	return p, ok
}

func APIKeyPrincipal(ctx context.Context) (auth.APIKeyPrincipal, bool) {
	p, ok := ctx.Value(APIKeyKey).(auth.APIKeyPrincipal)
	return p, ok
}

func TenantID(ctx context.Context) string {
	value, _ := ctx.Value(TenantKey).(string)
	return value
}

func RequestID(ctx context.Context) string {
	value, _ := ctx.Value(RequestIDKey).(string)
	return value
}

func newRequestID() string {
	buf := make([]byte, 16)
	if _, err := rand.Read(buf); err != nil {
		return "req_fallback"
	}
	return "req_" + hex.EncodeToString(buf)
}

func writeError(w http.ResponseWriter, status int, message string) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_, _ = w.Write([]byte(`{"error":"` + message + `"}`))
}
