package security

import "testing"

func init() {
	SetEncryptionKey("test-encryption-key-32-bytes-long!!")
}

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

func TestHashSecret(t *testing.T) {
	h1 := HashSecret("hello")
	h2 := HashSecret("hello")
	h3 := HashSecret("world")
	if h1 != h2 {
		t.Fatal("hash should be deterministic")
	}
	if h1 == h3 {
		t.Fatal("different inputs should produce different hashes")
	}
	if len(h1) != 64 {
		t.Fatal("sha256 hex should be 64 chars")
	}
}

func TestRandomToken(t *testing.T) {
	tok, err := RandomToken("test", 16)
	if err != nil {
		t.Fatal(err)
	}
	if len(tok) < 20 {
		t.Fatal("token should have prefix + base64")
	}
	if tok[:5] != "test_" {
		t.Fatal("token should have prefix")
	}
	if _, err := RandomToken("", 8); err == nil {
		t.Fatal("should reject <16 random bytes")
	}
}

func TestEncryptDecryptRoundtrip(t *testing.T) {
	cases := []string{"my-secret-value", "", `{"api_key":"secret","password":"hunter2"}`, "short"}
	for _, original := range cases {
		encrypted, err := Encrypt(original)
		if err != nil {
			t.Fatalf("encrypt failed for %q: %v", original, err)
		}
		if original != "" && encrypted == original {
			t.Fatal("encrypted should differ from original")
		}
		if original == "" && encrypted != "" {
			t.Fatal("empty should stay empty")
		}
		decrypted, err := Decrypt(encrypted)
		if err != nil {
			t.Fatalf("decrypt failed for %q: %v", original, err)
		}
		if decrypted != original {
			t.Fatalf("roundtrip failed: %q != %q", decrypted, original)
		}
	}
}

func TestDecryptNonEncryptedPassesThrough(t *testing.T) {
	plain, err := Decrypt("not-encrypted")
	if err != nil {
		t.Fatal(err)
	}
	if plain != "not-encrypted" {
		t.Fatal("non-encrypted strings should pass through")
	}
}

func TestDecryptInvalidCiphertext(t *testing.T) {
	plain, err := Decrypt("enc:v1:invalid-base64!!!")
	if err != nil {
		t.Fatal("invalid base64 should not return error")
	}
	if plain != "" {
		t.Fatal("invalid base64 should return empty string")
	}
}

func TestEncryptDecryptPlaceholderAlias(t *testing.T) {
	original := "my-secret-value"
	encrypted := EncryptPlaceholder(original)
	if encrypted == original {
		t.Fatal("encrypted should differ from original")
	}
	decrypted := DecryptPlaceholder(encrypted)
	if decrypted != original {
		t.Fatalf("roundtrip failed: %s != %s", decrypted, original)
	}
}

func TestEncryptDeterministicNonce(t *testing.T) {
	v1, _ := Encrypt("hello")
	v2, _ := Encrypt("hello")
	if v1 == v2 {
		t.Fatal("each encryption should produce a different ciphertext due to random nonce")
	}
	d1, _ := Decrypt(v1)
	d2, _ := Decrypt(v2)
	if d1 != "hello" || d2 != "hello" {
		t.Fatal("decryption should succeed despite different ciphertexts")
	}
}

func TestRedactJSON(t *testing.T) {
	raw := []byte(`{"api_key":"super-secret","nested":{"token":"hidden"},"safe":"visible"}`)
	out := RedactJSON(raw)
	expected := `{"api_key":"[REDACTED]","nested":{"token":"[REDACTED]"},"safe":"visible"}`
	if string(out) != expected {
		t.Fatalf("unexpected redacted json: %s", string(out))
	}
	if string(RedactJSON(nil)) != `{}` {
		t.Fatal("nil should return empty object")
	}
	if string(RedactJSON([]byte(`not-json`))) != `{"redacted":true}` {
		t.Fatal("invalid json should return redacted marker")
	}
}

func TestRedactEmailEdgeCases(t *testing.T) {
	if got := RedactEmail("ab@b.co"); got != "a***@b.co" {
		t.Fatalf("short email: %s", got)
	}
	if got := RedactEmail("x@"); got != "[REDACTED_EMAIL]" {
		t.Fatalf("malformed email: %s", got)
	}
	if got := RedactEmail(""); got != "[REDACTED_EMAIL]" {
		t.Fatalf("empty email: %s", got)
	}
}

func TestRedactPhoneEdgeCases(t *testing.T) {
	if got := RedactPhone("1234"); got != "[REDACTED_PHONE]" {
		t.Fatalf("short phone: %s", got)
	}
	if got := RedactPhone(""); got != "[REDACTED_PHONE]" {
		t.Fatalf("empty phone: %s", got)
	}
}
