package failures

import "testing"

func TestNormalizeProviderAuthenticationFailure(t *testing.T) {
	got := Normalize("failed", "401", "unauthorized credentials")
	if got.Code != "PROVIDER_AUTHENTICATION_FAILURE" || got.Retryable {
		t.Fatalf("unexpected classification: %+v", got)
	}
}

func TestNormalizeRateLimited(t *testing.T) {
	got := Normalize("failed", "429", "rate limit exceeded")
	if got.Code != "RATE_LIMITED" || !got.Retryable {
		t.Fatalf("unexpected classification: %+v", got)
	}
}

func TestNormalizeDeadLetter(t *testing.T) {
	got := Normalize("dead", "", "")
	if got.Code != "QUEUE_PROCESSING_FAILURE" || got.Retryable {
		t.Fatalf("unexpected classification: %+v", got)
	}
}
