package security

import (
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"errors"
	"strings"
)

var secretKeys = []string{"secret", "token", "password", "api_key", "apikey", "authorization", "private_key"}

func HashSecret(raw string) string {
	sum := sha256.Sum256([]byte(raw))
	return hex.EncodeToString(sum[:])
}

func RandomToken(prefix string, bytesLen int) (string, error) {
	if bytesLen < 16 {
		return "", errors.New("token must use at least 16 random bytes")
	}
	buf := make([]byte, bytesLen)
	if _, err := rand.Read(buf); err != nil {
		return "", err
	}
	token := base64.RawURLEncoding.EncodeToString(buf)
	if prefix == "" {
		return token, nil
	}
	return prefix + "_" + token, nil
}

func RedactMap(input map[string]any) map[string]any {
	out := make(map[string]any, len(input))
	for key, value := range input {
		lower := strings.ToLower(key)
		if containsSecretKey(lower) {
			out[key] = "[REDACTED]"
			continue
		}
		if nested, ok := value.(map[string]any); ok {
			out[key] = RedactMap(nested)
			continue
		}
		out[key] = value
	}
	return out
}

func RedactJSON(raw []byte) []byte {
	if len(raw) == 0 {
		return []byte(`{}`)
	}
	var object map[string]any
	if err := json.Unmarshal(raw, &object); err != nil {
		return []byte(`{"redacted":true}`)
	}
	out, err := json.Marshal(RedactMap(object))
	if err != nil {
		return []byte(`{"redacted":true}`)
	}
	return out
}

func RedactEmail(email string) string {
	parts := strings.Split(email, "@")
	if len(parts) != 2 || len(parts[0]) < 2 {
		return "[REDACTED_EMAIL]"
	}
	return parts[0][:1] + "***@" + parts[1]
}

func RedactPhone(phone string) string {
	if len(phone) < 5 {
		return "[REDACTED_PHONE]"
	}
	if len(phone) <= 6 {
		return phone[:2] + "***" + phone[len(phone)-1:]
	}
	return phone[:3] + "****" + phone[len(phone)-3:]
}

func MaskToken(token string) string {
	if len(token) <= 8 {
		return "[REDACTED_TOKEN]"
	}
	return token[:4] + strings.Repeat("*", len(token)-8) + token[len(token)-4:]
}

func EncryptPlaceholder(plain string) string {
	if plain == "" {
		return ""
	}
	return "enc:v1:local-placeholder:" + base64.RawURLEncoding.EncodeToString([]byte(plain))
}

func DecryptPlaceholder(ciphertext string) string {
	const prefix = "enc:v1:local-placeholder:"
	if !strings.HasPrefix(ciphertext, prefix) {
		return ciphertext
	}
	raw, err := base64.RawURLEncoding.DecodeString(strings.TrimPrefix(ciphertext, prefix))
	if err != nil {
		return ""
	}
	return string(raw)
}

func containsSecretKey(key string) bool {
	for _, secret := range secretKeys {
		if strings.Contains(key, secret) {
			return true
		}
	}
	return false
}
