// Package crypto provides AES-256-GCM encryption that is byte-compatible with
// the legacy NestJS implementation in server/src/common/crypto.service.ts.
//
// Format: base64(iv).base64(tag).base64(ciphertext)
//   - IV  : 12 bytes
//   - tag : 16 bytes (appended by Go's GCM AEAD; we split it back out)
//   - no AAD
package crypto

import (
	"crypto/aes"
	"crypto/cipher"
	"crypto/rand"
	"encoding/base64"
	"encoding/hex"
	"errors"
	"fmt"
	"strings"
)

const (
	ivLength  = 12
	tagLength = 16
)

// Service holds the symmetric key parsed from the ENCRYPTION_KEY env var.
type Service struct {
	key []byte
}

// New parses a 64-char hex string into a 32-byte key.
func New(hexKey string) (*Service, error) {
	if len(hexKey) != 64 {
		return nil, fmt.Errorf("ENCRYPTION_KEY must be 64-char hex (32 bytes), got %d chars", len(hexKey))
	}
	key, err := hex.DecodeString(hexKey)
	if err != nil {
		return nil, fmt.Errorf("ENCRYPTION_KEY hex decode: %w", err)
	}
	return &Service{key: key}, nil
}

// Encrypt produces a ciphertext payload using a fresh random IV.
func (s *Service) Encrypt(plain string) (string, error) {
	iv := make([]byte, ivLength)
	if _, err := rand.Read(iv); err != nil {
		return "", err
	}
	return s.encryptWithIV(iv, plain)
}

// encryptWithIV is exposed only for the golden-vector test; production callers
// must always use Encrypt to get a fresh random IV.
func (s *Service) encryptWithIV(iv []byte, plain string) (string, error) {
	if len(iv) != ivLength {
		return "", fmt.Errorf("iv must be %d bytes", ivLength)
	}
	block, err := aes.NewCipher(s.key)
	if err != nil {
		return "", err
	}
	aead, err := cipher.NewGCM(block)
	if err != nil {
		return "", err
	}
	// AEAD.Seal returns ciphertext||tag; split them to match the Node format.
	sealed := aead.Seal(nil, iv, []byte(plain), nil)
	if len(sealed) < tagLength {
		return "", errors.New("sealed output too short")
	}
	ct := sealed[:len(sealed)-tagLength]
	tag := sealed[len(sealed)-tagLength:]
	enc := base64.StdEncoding
	return enc.EncodeToString(iv) + "." + enc.EncodeToString(tag) + "." + enc.EncodeToString(ct), nil
}

// Decrypt parses the iv.tag.ct payload and returns the plaintext.
func (s *Service) Decrypt(payload string) (string, error) {
	parts := strings.Split(payload, ".")
	if len(parts) != 3 {
		return "", errors.New("malformed ciphertext")
	}
	iv, err := base64.StdEncoding.DecodeString(parts[0])
	if err != nil {
		return "", fmt.Errorf("decode iv: %w", err)
	}
	tag, err := base64.StdEncoding.DecodeString(parts[1])
	if err != nil {
		return "", fmt.Errorf("decode tag: %w", err)
	}
	ct, err := base64.StdEncoding.DecodeString(parts[2])
	if err != nil {
		return "", fmt.Errorf("decode ct: %w", err)
	}
	if len(iv) != ivLength {
		return "", fmt.Errorf("iv length %d, want %d", len(iv), ivLength)
	}
	if len(tag) != tagLength {
		return "", fmt.Errorf("tag length %d, want %d", len(tag), tagLength)
	}
	block, err := aes.NewCipher(s.key)
	if err != nil {
		return "", err
	}
	aead, err := cipher.NewGCM(block)
	if err != nil {
		return "", err
	}
	// Go's GCM expects ciphertext||tag concatenated.
	pt, err := aead.Open(nil, iv, append(append([]byte{}, ct...), tag...), nil)
	if err != nil {
		return "", fmt.Errorf("gcm open: %w", err)
	}
	return string(pt), nil
}
