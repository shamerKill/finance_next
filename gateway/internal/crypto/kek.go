// kek.go — Phase 7 pluggable Key Encryption Key (KEK) provider.
//
// Phase 1 hard-coded the master AES-256-GCM key behind [Service]. The
// envelope encryption layer wrapped DEKs with that single in-process key.
// Phase 7 introduces a [KEKProvider] interface so the master key can be
// swapped to AWS KMS / GCP KMS / a hardware HSM without touching call
// sites or the wire format.
//
// Compatibility guarantees:
//
//   - The default [EnvKEKProvider] produces *byte-identical* output to
//     the legacy [Service.Encrypt]/[Service.Decrypt] for the same input
//     IV. Phase 0's golden vector test still passes.
//   - The wire format (`base64(iv).base64(tag).base64(ciphertext)`) is
//     unchanged across providers. KMS providers return the same shape.
//   - DEK ciphertexts written by [EnvKEKProvider] can be decrypted by a
//     future KMS provider via re-encryption tooling, but the in-flight
//     value is opaque to the caller.
//
// To swap providers in production, set `KEK_PROVIDER=aws-kms` (or
// `gcp-kms`) along with the corresponding configuration env vars. The
// stub implementations in this package return a clear "not configured"
// error at runtime so misconfiguration fails loudly.
package crypto

import "errors"

// KEKProvider is the abstraction over the master key. Encrypt + Decrypt
// operate on the same `iv.tag.ct` wire format used elsewhere in this
// package; provider implementations must preserve that contract.
type KEKProvider interface {
	// Encrypt seals plaintext under the master key, returning the
	// `iv.tag.ct` triplet.
	Encrypt(plaintext []byte) (string, error)
	// Decrypt unseals an `iv.tag.ct` triplet previously produced by
	// Encrypt under this provider (or a key-compatible provider).
	Decrypt(ciphertext string) ([]byte, error)
	// Name returns a stable identifier for logging / metrics.
	Name() string
}

// ErrKEKNotConfigured is returned by stub providers (AWS / GCP) when
// the operator has not yet supplied the necessary credentials.
var ErrKEKNotConfigured = errors.New("crypto: KEK provider not configured")

// EnvKEKProvider wraps the legacy env-driven AES-256-GCM [Service] so
// the existing single-process key pathway implements [KEKProvider].
//
// This is the default in production and the only provider exercised by
// tests; the AWS / GCP variants are stubs that demonstrate the call
// shape but never make a real network call.
type EnvKEKProvider struct {
	svc *Service
}

// NewEnvKEKProvider wraps the existing Service so it satisfies KEKProvider.
func NewEnvKEKProvider(svc *Service) *EnvKEKProvider {
	return &EnvKEKProvider{svc: svc}
}

// Encrypt delegates to the underlying Service. Phase 0 golden vector
// covers byte equality with NestJS.
func (e *EnvKEKProvider) Encrypt(plaintext []byte) (string, error) {
	return e.svc.Encrypt(string(plaintext))
}

// Decrypt delegates to the underlying Service.
func (e *EnvKEKProvider) Decrypt(ciphertext string) ([]byte, error) {
	pt, err := e.svc.Decrypt(ciphertext)
	if err != nil {
		return nil, err
	}
	return []byte(pt), nil
}

// Name returns "env".
func (e *EnvKEKProvider) Name() string { return "env" }

// AWSKMSKEKProvider is a stub for AWS KMS. The actual SDK call would
// look like:
//
//	out, err := kmsClient.Encrypt(ctx, &kms.EncryptInput{
//	    KeyId:     aws.String(p.keyID),
//	    Plaintext: plaintext,
//	})
//	// out.CiphertextBlob is opaque KMS material; we still
//	// wrap it in our `iv.tag.ct` shape for storage homogeneity.
//
// We keep it as a stub so the AWS SDK isn't a default dependency.
// Build with `-tags awskms` to compile a real implementation when one
// is added.
type AWSKMSKEKProvider struct {
	keyID  string
	region string
}

// NewAWSKMSKEKProvider returns a stub that errors at runtime. KeyID may
// be an ARN or alias.
func NewAWSKMSKEKProvider(keyID, region string) *AWSKMSKEKProvider {
	return &AWSKMSKEKProvider{keyID: keyID, region: region}
}

// Encrypt always returns ErrKEKNotConfigured for the stub.
func (p *AWSKMSKEKProvider) Encrypt(_ []byte) (string, error) {
	return "", ErrKEKNotConfigured
}

// Decrypt always returns ErrKEKNotConfigured for the stub.
func (p *AWSKMSKEKProvider) Decrypt(_ string) ([]byte, error) {
	return nil, ErrKEKNotConfigured
}

// Name returns "aws-kms".
func (p *AWSKMSKEKProvider) Name() string { return "aws-kms" }

// GCPKMSKEKProvider is a stub for GCP KMS. The real call shape:
//
//	resp, err := kmsClient.Encrypt(ctx, &kmspb.EncryptRequest{
//	    Name:      p.keyName,
//	    Plaintext: plaintext,
//	})
//	// resp.Ciphertext is opaque KMS material.
type GCPKMSKEKProvider struct {
	keyName string // projects/X/locations/Y/keyRings/Z/cryptoKeys/W
}

// NewGCPKMSKEKProvider returns a stub that errors at runtime.
func NewGCPKMSKEKProvider(keyName string) *GCPKMSKEKProvider {
	return &GCPKMSKEKProvider{keyName: keyName}
}

// Encrypt always returns ErrKEKNotConfigured for the stub.
func (p *GCPKMSKEKProvider) Encrypt(_ []byte) (string, error) {
	return "", ErrKEKNotConfigured
}

// Decrypt always returns ErrKEKNotConfigured for the stub.
func (p *GCPKMSKEKProvider) Decrypt(_ string) ([]byte, error) {
	return nil, ErrKEKNotConfigured
}

// Name returns "gcp-kms".
func (p *GCPKMSKEKProvider) Name() string { return "gcp-kms" }
