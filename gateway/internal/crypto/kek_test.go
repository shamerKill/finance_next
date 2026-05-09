package crypto

import (
	"errors"
	"testing"
)

// TestEnvKEKProvider_RoundTrip verifies the env provider preserves the
// encrypt/decrypt contract for the byte-array API.
func TestEnvKEKProvider_RoundTrip(t *testing.T) {
	svc, err := New("00112233445566778899aabbccddeeff00112233445566778899aabbccddeeff")
	if err != nil {
		t.Fatal(err)
	}
	p := NewEnvKEKProvider(svc)
	plaintext := []byte("hello world")
	ct, err := p.Encrypt(plaintext)
	if err != nil {
		t.Fatal(err)
	}
	got, err := p.Decrypt(ct)
	if err != nil {
		t.Fatal(err)
	}
	if string(got) != "hello world" {
		t.Errorf("round-trip mismatch: got %q", got)
	}
	if p.Name() != "env" {
		t.Errorf("provider name %q, want env", p.Name())
	}
}

// TestEnvelopeService_PreservesFormatAcrossProvider asserts that swapping
// providers preserves the wire format (iv.tag.ct triplet of base64).
func TestEnvelopeService_PreservesFormatAcrossProvider(t *testing.T) {
	svc, err := New("00112233445566778899aabbccddeeff00112233445566778899aabbccddeeff")
	if err != nil {
		t.Fatal(err)
	}
	// Both constructors produce equivalent services for the env path.
	envFromLegacy := NewEnvelope(svc)
	envFromProvider := NewEnvelopeWithProvider(NewEnvKEKProvider(svc))

	dek1, payload1, err := envFromLegacy.EncryptForAccount("api-secret-1")
	if err != nil {
		t.Fatal(err)
	}
	// Both ciphertexts should follow the iv.tag.ct shape.
	for _, ct := range []string{dek1, payload1} {
		if !looksLikeTriplet(ct) {
			t.Errorf("ciphertext does not match iv.tag.ct format: %q", ct)
		}
	}
	// The provider-based envelope must be able to decrypt payloads
	// produced by the legacy one (same key, same wire format).
	got, err := envFromProvider.DecryptForAccount(dek1, payload1)
	if err != nil {
		t.Fatalf("decrypt across providers failed: %v", err)
	}
	if got != "api-secret-1" {
		t.Errorf("got %q, want api-secret-1", got)
	}
}

// TestKMSStubs_ReturnNotConfigured ensures the AWS / GCP stubs surface
// a clear error rather than silently dropping ciphertext.
func TestKMSStubs_ReturnNotConfigured(t *testing.T) {
	for _, p := range []KEKProvider{
		NewAWSKMSKEKProvider("alias/test", "us-east-1"),
		NewGCPKMSKEKProvider("projects/p/locations/l/keyRings/r/cryptoKeys/k"),
	} {
		if _, err := p.Encrypt([]byte("hi")); !errors.Is(err, ErrKEKNotConfigured) {
			t.Errorf("%s.Encrypt expected ErrKEKNotConfigured, got %v", p.Name(), err)
		}
		if _, err := p.Decrypt("a.b.c"); !errors.Is(err, ErrKEKNotConfigured) {
			t.Errorf("%s.Decrypt expected ErrKEKNotConfigured, got %v", p.Name(), err)
		}
	}
}

func looksLikeTriplet(s string) bool {
	dots := 0
	for _, r := range s {
		if r == '.' {
			dots++
		}
	}
	return dots == 2
}
