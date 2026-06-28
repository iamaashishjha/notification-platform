package middleware

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"net/http"
	"runtime/debug"
	"slices"
	"strings"
	"time"

	"notification-core-api/internal/auth"
	"notification-core-api/internal/metrics"

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

func RequestLog(log *zap.Logger, metricsCollector ...*metrics.Collector) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			requestID := r.Header.Get("X-Request-ID")
			if requestID == "" {
				requestID = newRequestID()
			}
			w.Header().Set("X-Request-ID", requestID)
			ctx := context.WithValue(r.Context(), RequestIDKey, requestID)
			start := time.Now()

			remoteIP := r.RemoteAddr
			if idx := strings.LastIndex(remoteIP, ":"); idx > 0 {
				remoteIP = remoteIP[:idx]
			}
			userAgent := r.UserAgent()
			if len(userAgent) > 120 {
				userAgent = userAgent[:120]
			}

			sw := &statusWriter{ResponseWriter: w, status: http.StatusOK}
			next.ServeHTTP(sw, r.WithContext(ctx))

			duration := time.Since(start)
			var tenantID, actorID string
			if p, ok := Principal(ctx); ok {
				actorID = p.UserID
				tenantID = p.TenantID
			}
			if tid := TenantID(ctx); tid != "" {
				tenantID = tid
			}

			log.Info("request completed",
				zap.String("request_id", requestID),
				zap.String("method", r.Method),
				zap.String("path", r.URL.Path),
				zap.Int("status", sw.status),
				zap.Float64("duration_ms", float64(duration.Milliseconds())),
				zap.String("remote_ip", remoteIP),
				zap.String("user_agent", userAgent),
				zap.String("tenant_id", tenantID),
				zap.String("actor_id", actorID),
			)

			if len(metricsCollector) > 0 && metricsCollector[0] != nil {
				mc := metricsCollector[0]
				pathGroup := normalizePath(r.URL.Path)
				mc.RecordRequest(r.Method, pathGroup, sw.status, duration)
			}
		})
	}
}

func PanicRecovery(log *zap.Logger, metricsCollector ...*metrics.Collector) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			defer func() {
				if rec := recover(); rec != nil {
					requestID := RequestID(r.Context())
					log.Error("panic recovered",
						zap.String("request_id", requestID),
						zap.Any("panic", rec),
						zap.String("method", r.Method),
						zap.String("path", r.URL.Path),
						zap.ByteString("stack", debug.Stack()),
					)
					if len(metricsCollector) > 0 && metricsCollector[0] != nil {
						metricsCollector[0].IncPanic()
					}
					writeError(w, http.StatusInternalServerError, "internal server error")
				}
			}()
			next.ServeHTTP(w, r)
		})
	}
}

type statusWriter struct {
	http.ResponseWriter
	status int
}

func (sw *statusWriter) WriteHeader(code int) {
	sw.status = code
	sw.ResponseWriter.WriteHeader(code)
}

func normalizePath(path string) string {
	parts := strings.Split(strings.Trim(path, "/"), "/")
	for i, p := range parts {
		if isUUID(p) || isNumeric(p) {
			parts[i] = "{id}"
		}
	}
	return "/" + strings.Join(parts, "/")
}

func isUUID(s string) bool {
	if len(s) != 36 {
		return false
	}
	for _, c := range s {
		if !((c >= '0' && c <= '9') || (c >= 'a' && c <= 'f') || c == '-') {
			return false
		}
	}
	return true
}

func isNumeric(s string) bool {
	for _, c := range s {
		if c < '0' || c > '9' {
			return false
		}
	}
	return len(s) > 0
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

func Chain(svc auth.Service, permission string, next http.HandlerFunc) http.Handler {
	return JWT(svc)(RequirePermission(svc, permission)(http.HandlerFunc(next)))
}

func APIKeyScope(svc auth.Service, scope string) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return APIKey(svc)(RequireScope(scope)(next))
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
