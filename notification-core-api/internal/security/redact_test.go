package security

import "testing"

func TestRedactionMasksSensitiveValues(t *testing.T) {
	if got := RedactEmail("user@example.com"); got != "u***@example.com" {
		t.Fatalf("unexpected email redaction: %s", got)
	}
	if got := RedactPhone("9841234567"); got != "984****567" {
		t.Fatalf("unexpected phone redaction: %s", got)
	}
	if got := MaskToken("abcd1234efgh5678"); got != "abcd********5678" {
		t.Fatalf("unexpected token redaction: %s", got)
	}
	redacted := RedactMap(map[string]any{"api_key": "secret", "safe": "value"})
	if redacted["api_key"] != "[REDACTED]" || redacted["safe"] != "value" {
		t.Fatalf("unexpected map redaction: %#v", redacted)
	}
}
