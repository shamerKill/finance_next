package crypto

import (
	"strings"
	"testing"
)

func TestEnvelopeRoundTrip(t *testing.T) {
	master, err := New(goldenKeyHex)
	if err != nil {
		t.Fatalf("New: %v", err)
	}
	env := NewEnvelope(master)

	plain := "binance-api-key-1234567890ABCDEF"
	dekCT, payloadCT, err := env.EncryptForAccount(plain)
	if err != nil {
		t.Fatalf("EncryptForAccount: %v", err)
	}
	if dekCT == "" || payloadCT == "" {
		t.Fatal("expected non-empty ciphertexts")
	}
	if dekCT == payloadCT {
		t.Fatal("dek and payload ciphertexts should differ")
	}
	// 3-segment iv.tag.ct format on both
	if strings.Count(dekCT, ".") != 2 {
		t.Fatalf("dek ciphertext format: %q", dekCT)
	}
	if strings.Count(payloadCT, ".") != 2 {
		t.Fatalf("payload ciphertext format: %q", payloadCT)
	}

	got, err := env.DecryptForAccount(dekCT, payloadCT)
	if err != nil {
		t.Fatalf("DecryptForAccount: %v", err)
	}
	if got != plain {
		t.Fatalf("plaintext mismatch: got %q want %q", got, plain)
	}
}

func TestEnvelopeFreshDEKEachCall(t *testing.T) {
	master, err := New(goldenKeyHex)
	if err != nil {
		t.Fatalf("New: %v", err)
	}
	env := NewEnvelope(master)

	dek1, _, err := env.EncryptForAccount("a")
	if err != nil {
		t.Fatalf("first: %v", err)
	}
	dek2, _, err := env.EncryptForAccount("a")
	if err != nil {
		t.Fatalf("second: %v", err)
	}
	if dek1 == dek2 {
		t.Fatal("expected fresh DEK per call but got identical ciphertexts")
	}
}

func TestEnvelopeWithDEKReuse(t *testing.T) {
	master, err := New(goldenKeyHex)
	if err != nil {
		t.Fatalf("New: %v", err)
	}
	env := NewEnvelope(master)

	dekCT, ct1, err := env.EncryptForAccount("api-key")
	if err != nil {
		t.Fatalf("EncryptForAccount: %v", err)
	}
	ct2, err := env.EncryptWithDEK(dekCT, "secret-key")
	if err != nil {
		t.Fatalf("EncryptWithDEK: %v", err)
	}
	pt1, err := env.DecryptForAccount(dekCT, ct1)
	if err != nil {
		t.Fatalf("decrypt 1: %v", err)
	}
	pt2, err := env.DecryptForAccount(dekCT, ct2)
	if err != nil {
		t.Fatalf("decrypt 2: %v", err)
	}
	if pt1 != "api-key" || pt2 != "secret-key" {
		t.Fatalf("plaintext mismatch: %q / %q", pt1, pt2)
	}
}

func TestEnvelopeTamperDetection(t *testing.T) {
	master, err := New(goldenKeyHex)
	if err != nil {
		t.Fatalf("New: %v", err)
	}
	env := NewEnvelope(master)

	dekCT, payloadCT, err := env.EncryptForAccount("sensitive")
	if err != nil {
		t.Fatalf("EncryptForAccount: %v", err)
	}

	// Mutate one byte of the payload ciphertext (last segment).
	mutated := flipOneByte(t, payloadCT)
	if _, err := env.DecryptForAccount(dekCT, mutated); err == nil {
		t.Fatal("expected GCM auth failure on payload tamper")
	}

	// Mutate one byte of the DEK ciphertext.
	mutatedDEK := flipOneByte(t, dekCT)
	if _, err := env.DecryptForAccount(mutatedDEK, payloadCT); err == nil {
		t.Fatal("expected GCM auth failure on DEK tamper")
	}
}

func TestEnvelopeRejectsMalformed(t *testing.T) {
	master, err := New(goldenKeyHex)
	if err != nil {
		t.Fatalf("New: %v", err)
	}
	env := NewEnvelope(master)
	if _, err := env.DecryptForAccount("not-a-cipher", "also-not"); err == nil {
		t.Fatal("expected error on malformed input")
	}
}

// flipOneByte mutates the final base64 segment of an iv.tag.ct triplet by
// flipping the last byte of the decoded ciphertext, then re-encoding. This
// guarantees we hit the AEAD auth tag rather than producing invalid base64.
func flipOneByte(t *testing.T, ct string) string {
	t.Helper()
	parts := strings.Split(ct, ".")
	if len(parts) != 3 {
		t.Fatalf("expected 3 parts: %q", ct)
	}
	// Flip a single character in the middle of the ct segment. Base64 chars
	// are ascii; toggling one bit produces a different (still valid) char,
	// which after b64 decode will be a different byte → AEAD auth fails.
	last := []byte(parts[2])
	if len(last) < 4 {
		t.Fatalf("ct too short to mutate: %q", parts[2])
	}
	if last[2] == 'A' {
		last[2] = 'B'
	} else {
		last[2] = 'A'
	}
	parts[2] = string(last)
	return strings.Join(parts, ".")
}
