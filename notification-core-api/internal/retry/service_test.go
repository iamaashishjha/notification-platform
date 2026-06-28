package retry

import (
	"math"
	"testing"
	"time"
)

func TestBackoffDuration(t *testing.T) {
	tests := []struct {
		attempt  int
		expected time.Duration
	}{
		{1, 1 * time.Minute},
		{2, 2 * time.Minute},
		{3, 4 * time.Minute},
		{4, 8 * time.Minute},
		{5, 16 * time.Minute},
	}
	for _, tt := range tests {
		got := backoffDuration(tt.attempt)
		if got != tt.expected {
			t.Errorf("backoffDuration(%d) = %v, want %v", tt.attempt, got, tt.expected)
		}
	}
}

func TestBackoffDurationFormula(t *testing.T) {
	for i := 1; i <= 10; i++ {
		got := backoffDuration(i)
		expected := time.Duration(math.Pow(2, float64(i-1))) * time.Minute
		if got != expected {
			t.Errorf("backoffDuration(%d) = %v, want %v", i, got, expected)
		}
	}
}
