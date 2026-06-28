package security

import (
	"crypto/aes"
	"crypto/cipher"
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"errors"
	"strings"
	"sync"
)

var (
	encKey     []byte
	encKeyOnce sync.Once
)

func SetEncryptionKey(key string) {
	encKeyOnce.Do(func() {
		h := sha256.Sum256([]byte(key))
		encKey = h[:]
	})
}

func Encrypt(plain string) (string, error) {
	if plain == "" {
		return "", nil
	}
	block, err := aes.NewCipher(encKey)
	if err != nil {
		return "", err
	}
	aesGCM, err := cipher.NewGCM(block)
	if err != nil {
		return "", err
	}
	nonce := make([]byte, aesGCM.NonceSize())
	if _, err := rand.Read(nonce); err != nil {
		return "", err
	}
	ciphertext := aesGCM.Seal(nonce, nonce, []byte(plain), nil)
	return "enc:v1:" + base64.RawURLEncoding.EncodeToString(ciphertext), nil
}

func Decrypt(ciphertext string) (string, error) {
	if ciphertext == "" {
		return "", nil
	}
	if !strings.HasPrefix(ciphertext, "enc:v1:") {
		return ciphertext, nil
	}
	block, err := aes.NewCipher(encKey)
	if err != nil {
		return "", err
	}
	aesGCM, err := cipher.NewGCM(block)
	if err != nil {
		return "", err
	}
	raw, err := base64.RawURLEncoding.DecodeString(strings.TrimPrefix(ciphertext, "enc:v1:"))
	if err != nil {
		return "", nil
	}
	nonceSize := aesGCM.NonceSize()
	if len(raw) < nonceSize {
		return "", errors.New("ciphertext too short")
	}
	nonce, rawCipher := raw[:nonceSize], raw[nonceSize:]
	plain, err := aesGCM.Open(nil, nonce, rawCipher, nil)
	if err != nil {
		return "", err
	}
	return string(plain), nil
}

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
	s, err := Encrypt(plain)
	if err != nil {
		return ""
	}
	return s
}

func DecryptPlaceholder(ciphertext string) string {
	s, err := Decrypt(ciphertext)
	if err != nil {
		return ""
	}
	return s
}

func containsSecretKey(key string) bool {
	for _, secret := range secretKeys {
		if strings.Contains(key, secret) {
			return true
		}
	}
	return false
}
