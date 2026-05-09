// Package crypto — envelope encryption layer.
//
// EnvelopeService implements per-account envelope encryption: a fresh 32-byte
// data-encryption key (DEK) is generated for each call to EncryptForAccount,
// the plaintext is sealed with the DEK, and the DEK is sealed with the master
// key-encryption key (KEK = the existing ENCRYPTION_KEY).
//
// Wire format for both DEK ciphertext and payload ciphertext is the same
// `iv.tag.ciphertext` base64 triplet used by Service.Encrypt today, so a
// future swap to a real KMS for the KEK is a config change, not a wire change.
//
// Storage layout (MongoDB):
//   dekCiphertext      string  // KEK-encrypted DEK
//   apiKeyCiphertext   string  // DEK-encrypted credential
//   secretKeyCiphertext string // DEK-encrypted credential
//
// To rotate or migrate to KMS, only the KEK side moves; the DEKs stay put.
package crypto

import (
	"crypto/aes"
	"crypto/cipher"
	"crypto/rand"
	"encoding/base64"
	"errors"
	"fmt"
	"strings"
)

// EnvelopeService wraps a Service (master KEK) and adds DEK-based envelope
// encryption helpers. It does not replace Service; Option still uses Service
// directly for backwards compatibility.
type EnvelopeService struct {
	kek *Service
}

// NewEnvelope wraps an existing master Service.
func NewEnvelope(master *Service) *EnvelopeService {
	return &EnvelopeService{kek: master}
}

// EncryptForAccount generates a fresh 32-byte DEK, encrypts plaintext with the
// DEK, then encrypts the DEK with the master KEK. Returns (dekCT, payloadCT).
//
// Both outputs share the `iv.tag.ct` format. Rotating credentials (or rotating
// the KEK) only requires re-encrypting the DEK; the payload ciphertext is
// stable as long as the DEK is preserved.
func (e *EnvelopeService) EncryptForAccount(plaintext string) (dekCT string, payloadCT string, err error) {
	dek := make([]byte, 32)
	if _, err := rand.Read(dek); err != nil {
		return "", "", fmt.Errorf("generate DEK: %w", err)
	}

	payloadCT, err = aesGCMEncrypt(dek, plaintext)
	if err != nil {
		return "", "", fmt.Errorf("seal payload: %w", err)
	}

	// Wrap the raw DEK bytes (not as a string but as base64 to round-trip
	// through the Service.Encrypt API which is string-typed). DecryptForAccount
	// reverses this to recover the raw key.
	dekCT, err = e.kek.Encrypt(base64.StdEncoding.EncodeToString(dek))
	if err != nil {
		return "", "", fmt.Errorf("seal DEK: %w", err)
	}
	return dekCT, payloadCT, nil
}

// EncryptWithDEK reuses an existing DEK ciphertext to encrypt additional
// plaintext (e.g. multiple credentials for the same account). It returns the
// payload ciphertext only; the dekCT is the same one passed in.
func (e *EnvelopeService) EncryptWithDEK(dekCT string, plaintext string) (string, error) {
	dek, err := e.unwrapDEK(dekCT)
	if err != nil {
		return "", err
	}
	defer zeroize(dek)
	return aesGCMEncrypt(dek, plaintext)
}

// DecryptForAccount unwraps the DEK with the master KEK and then unseals the
// payload ciphertext.
func (e *EnvelopeService) DecryptForAccount(dekCT, payloadCT string) (string, error) {
	dek, err := e.unwrapDEK(dekCT)
	if err != nil {
		return "", err
	}
	defer zeroize(dek)
	return aesGCMDecrypt(dek, payloadCT)
}

func (e *EnvelopeService) unwrapDEK(dekCT string) ([]byte, error) {
	dekB64, err := e.kek.Decrypt(dekCT)
	if err != nil {
		return nil, fmt.Errorf("unwrap DEK: %w", err)
	}
	dek, err := base64.StdEncoding.DecodeString(dekB64)
	if err != nil {
		return nil, fmt.Errorf("decode DEK: %w", err)
	}
	if len(dek) != 32 {
		return nil, fmt.Errorf("DEK length %d, want 32", len(dek))
	}
	return dek, nil
}

// aesGCMEncrypt is the same algorithm as Service.Encrypt but parametrised by
// an arbitrary 32-byte key. It produces output in the `iv.tag.ct` format.
func aesGCMEncrypt(key []byte, plain string) (string, error) {
	iv := make([]byte, ivLength)
	if _, err := rand.Read(iv); err != nil {
		return "", err
	}
	block, err := aes.NewCipher(key)
	if err != nil {
		return "", err
	}
	aead, err := cipher.NewGCM(block)
	if err != nil {
		return "", err
	}
	sealed := aead.Seal(nil, iv, []byte(plain), nil)
	if len(sealed) < tagLength {
		return "", errors.New("sealed output too short")
	}
	ct := sealed[:len(sealed)-tagLength]
	tag := sealed[len(sealed)-tagLength:]
	enc := base64.StdEncoding
	return enc.EncodeToString(iv) + "." + enc.EncodeToString(tag) + "." + enc.EncodeToString(ct), nil
}

func aesGCMDecrypt(key []byte, payload string) (string, error) {
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
	block, err := aes.NewCipher(key)
	if err != nil {
		return "", err
	}
	aead, err := cipher.NewGCM(block)
	if err != nil {
		return "", err
	}
	pt, err := aead.Open(nil, iv, append(append([]byte{}, ct...), tag...), nil)
	if err != nil {
		return "", fmt.Errorf("gcm open: %w", err)
	}
	return string(pt), nil
}

func zeroize(b []byte) {
	for i := range b {
		b[i] = 0
	}
}
