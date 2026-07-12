package middleware

import (
	"bytes"
	"context"
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"net/http"
	"runtime/debug"
	"slices"
	"sort"
	"strconv"
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
	return JWT(svc)(RequirePermission(svc, permission)(DataTableQuery(http.HandlerFunc(next))))
}

type bufferedResponse struct {
	header http.Header
	body   bytes.Buffer
	status int
}

func (w *bufferedResponse) Header() http.Header    { return w.header }
func (w *bufferedResponse) WriteHeader(status int) { w.status = status }
func (w *bufferedResponse) Write(body []byte) (int, error) {
	if w.status == 0 {
		w.status = http.StatusOK
	}
	return w.body.Write(body)
}

// DataTableQuery gives every JSON list endpoint a common query contract:
// q, filter_<field>, sort, order, page, and per_page.
func DataTableQuery(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		query := r.URL.Query()
		if r.Method != http.MethodGet || (query.Get("q") == "" && query.Get("sort") == "" && query.Get("page") == "" && query.Get("per_page") == "" && !hasFilter(query)) {
			next.ServeHTTP(w, r)
			return
		}
		buffer := &bufferedResponse{header: make(http.Header)}
		next.ServeHTTP(buffer, r)
		if buffer.status == 0 {
			buffer.status = http.StatusOK
		}
		for key, values := range buffer.header {
			w.Header()[key] = values
		}
		if buffer.status >= 300 {
			w.WriteHeader(buffer.status)
			_, _ = w.Write(buffer.body.Bytes())
			return
		}
		var payload map[string]any
		if json.Unmarshal(buffer.body.Bytes(), &payload) != nil {
			w.WriteHeader(buffer.status)
			_, _ = w.Write(buffer.body.Bytes())
			return
		}
		raw, ok := payload["data"].([]any)
		if !ok {
			w.WriteHeader(buffer.status)
			_, _ = w.Write(buffer.body.Bytes())
			return
		}
		q := strings.ToLower(strings.TrimSpace(query.Get("q")))
		filtered := make([]map[string]any, 0, len(raw))
		for _, entry := range raw {
			item, ok := entry.(map[string]any)
			if !ok {
				continue
			}
			encoded, _ := json.Marshal(item)
			if q != "" && !strings.Contains(strings.ToLower(string(encoded)), q) {
				continue
			}
			if !matchesFilters(item, query) {
				continue
			}
			filtered = append(filtered, item)
		}
		field := query.Get("sort")
		direction := strings.ToLower(query.Get("order"))
		if field != "" {
			sort.SliceStable(filtered, func(i, j int) bool {
				a, b := fmt.Sprint(filtered[i][field]), fmt.Sprint(filtered[j][field])
				less := strings.Compare(strings.ToLower(a), strings.ToLower(b)) < 0
				if direction == "desc" {
					return !less && a != b
				}
				return less
			})
		}
		page := positiveInt(query.Get("page"), 1)
		perPage := positiveInt(query.Get("per_page"), 25)
		if perPage > 100 {
			perPage = 100
		}
		total := len(filtered)
		start := (page - 1) * perPage
		if start > total {
			start = total
		}
		end := start + perPage
		if end > total {
			end = total
		}
		data := make([]any, 0, end-start)
		for _, item := range filtered[start:end] {
			data = append(data, item)
		}
		payload["data"] = data
		payload["meta"] = map[string]any{"page": page, "per_page": perPage, "total": total, "total_pages": max(1, (total+perPage-1)/perPage)}
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(buffer.status)
		_ = json.NewEncoder(w).Encode(payload)
	})
}
func hasFilter(values map[string][]string) bool {
	for key := range values {
		if strings.HasPrefix(key, "filter_") {
			return true
		}
	}
	return false
}
func matchesFilters(item map[string]any, values map[string][]string) bool {
	for key, list := range values {
		if !strings.HasPrefix(key, "filter_") || len(list) == 0 || list[0] == "" {
			continue
		}
		field := strings.TrimPrefix(key, "filter_")
		if !strings.EqualFold(fmt.Sprint(item[field]), list[0]) {
			return false
		}
	}
	return true
}
func positiveInt(value string, fallback int) int {
	parsed, err := strconv.Atoi(value)
	if err != nil || parsed < 1 {
		return fallback
	}
	return parsed
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
