#!/usr/bin/env bash
set -Eeuo pipefail

API_URL="${API_URL:-http://localhost:8080}"
ADMIN_URL="${ADMIN_URL:-http://localhost:3000}"
API_KEY="${LOCAL_TENANT_API_KEY:-demo_tenant_api_key_local}"
TMP_DIR="$(mktemp -d)"
trap 'rm -rf "$TMP_DIR"' EXIT
PASSED=0
FAILED=0

pass() { printf '\033[1;32mPASS\033[0m %s\n' "$1"; PASSED=$((PASSED + 1)); }
fail() { printf '\033[1;31mFAIL\033[0m %s\n' "$1"; FAILED=$((FAILED + 1)); }

request() {
  local method="$1" url="$2" output="$3"; shift 3
  curl -sS --connect-timeout 3 --max-time 15 -o "$output" -w '%{http_code}' -X "$method" "$url" "$@" 2>"$TMP_DIR/curl.err" || printf '000'
}

json_value() {
  local file="$1" key="$2"
  if command -v jq >/dev/null 2>&1; then
    jq -r ".$key // empty" "$file"
  else
    sed -n "s/.*\"$key\"[[:space:]]*:[[:space:]]*\"\([^\"]*\)\".*/\1/p" "$file" | head -n 1
  fi
}

printf 'Local notification-platform smoke tests\nAPI: %s\n\n' "$API_URL"

code="$(request GET "$API_URL/healthz" "$TMP_DIR/health.json")"
[[ "$code" == 200 ]] && pass "API health endpoint" || fail "API health endpoint (HTTP $code)"

code="$(request GET "$API_URL/readyz" "$TMP_DIR/ready.json")"
[[ "$code" == 200 ]] && pass "API readiness endpoint and PostgreSQL" || fail "API readiness endpoint (HTTP $code)"

code="$(request POST "$API_URL/admin/api/v1/auth/login" "$TMP_DIR/login.json" -H 'Content-Type: application/json' --data-binary '{"email":"admin@example.com","password":"password"}')"
TOKEN="$(json_value "$TMP_DIR/login.json" access_token)"
[[ "$code" == 200 && -n "$TOKEN" ]] && pass "Platform admin login" || fail "Platform admin login (HTTP $code)"

SEND_BODY='{"event":"local.smoke","channels":["email"],"template":"welcome","target":{"type":"single","recipient":{"email":"smoke@example.com"}},"data":{"customer_name":"Smoke Test"},"priority":5,"schedule":{"type":"instant"}}'
code="$(request POST "$API_URL/api/v1/notifications" "$TMP_DIR/send.json" -H "Authorization: Bearer $API_KEY" -H 'Content-Type: application/json' --data-binary "$SEND_BODY")"
NOTIFICATION_ID="$(json_value "$TMP_DIR/send.json" notification_id)"
if [[ "$code" == 202 && -n "$NOTIFICATION_ID" ]]; then
  pass "Tenant API-key notification accepted"
  pass "Notification published to RabbitMQ channel queue"
else
  fail "Tenant API-key notification send (HTTP $code)"
  fail "Queue publish could not be confirmed"
fi

if [[ -n "$TOKEN" && -n "$NOTIFICATION_ID" ]]; then
  delivered=false
  for _ in {1..10}; do
    code="$(request GET "$API_URL/admin/api/v1/notifications" "$TMP_DIR/logs.json" -H "Authorization: Bearer $TOKEN")"
    if [[ "$code" == 200 ]] && grep -q "$NOTIFICATION_ID" "$TMP_DIR/logs.json" && grep -q '"delivery_status":"sent"' "$TMP_DIR/logs.json"; then
      delivered=true
      break
    fi
    sleep 1
  done
  if [[ "$delivered" == true ]]; then
    pass "Mock worker processed delivery and delivery log reports sent"
  else
    fail "Notification log not visible; make sure API and workers are running"
  fi
else
  fail "Notification log check skipped because send/login failed"
fi

code="$(request GET "$ADMIN_URL" "$TMP_DIR/admin.html")"
[[ "$code" =~ ^(200|304)$ ]] && pass "Admin UI reachable" || fail "Admin UI reachable (HTTP $code; optional in backend-only mode)"

printf '\nResult: %d passed, %d failed\n' "$PASSED" "$FAILED"
((FAILED == 0))
