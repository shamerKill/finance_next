// wallet.go — Phase 9 Polygon (EVM) wallet domain types.
//
// Wallets store an envelope-encrypted private key in the same way exchange
// API credentials are stored (per-wallet DEK sealed with the master KEK).
// The private key MUST never be serialised over HTTP — every cipher
// field uses `json:"-"` and the repo decoder honours the same omission.
//
// The on-chain identity is the EVM checksummed address (`0x...`); the
// USDC balance + allowance are cached on the document but always
// considered stale — handlers re-fetch via Polygon RPC on demand.
package domain

import "time"

// Wallet is the persisted Polygon wallet record. Address is the canonical
// 0x-prefixed lowercased hex (EIP-55 checksum encoding is up to the UI).
type Wallet struct {
	ID                   string    `json:"id"           bson:"_id,omitempty"`
	UserID               string    `json:"userId"       bson:"userId"`
	Label                string    `json:"label"        bson:"label"`
	Address              string    `json:"address"      bson:"address"`
	UsdcBalanceCached    float64   `json:"usdcBalanceCached"   bson:"usdcBalanceCached,omitempty"`
	UsdcAllowanceCached  float64   `json:"usdcAllowanceCached" bson:"usdcAllowanceCached,omitempty"`
	CachedAt             time.Time `json:"cachedAt,omitzero"   bson:"cachedAt,omitempty"`
	CreatedAt            time.Time `json:"createdAt"    bson:"createdAt"`
	UpdatedAt            time.Time `json:"updatedAt"    bson:"updatedAt"`

	// Encrypted credential bundle. Never serialised — `json:"-"` is the
	// hard contract; tests assert this.
	DEKCiphertext        string `json:"-" bson:"dekCiphertext"`
	PrivateKeyCiphertext string `json:"-" bson:"privateKeyCiphertext"`
}

// CreateWalletInput is the validated request shape for POST /api/v1/wallets.
//
// `privateKey` must be the 64-hex-char string (with or without 0x prefix).
// The handler validates that the derived address matches `expectedAddress`
// when present, otherwise the address derivation is the source of truth.
type CreateWalletInput struct {
	Label           string `json:"label"           validate:"required,min=3,max=64"`
	PrivateKey      string `json:"privateKey"      validate:"required"`
	ExpectedAddress string `json:"expectedAddress,omitempty"`
}

// ApproveInput is the body for POST /api/v1/wallets/:id/approve.
//
// `amountUsdc` is the explicit cap (in USDC, not raw atomic units). The
// handler refuses any value above `portfolio_limits.maxOpenNotionalUsd`,
// which itself is the only source of truth for the cap (Phase 7
// system_state collection). Infinite approve is impossible by design.
type ApproveInput struct {
	AmountUsdc float64 `json:"amountUsdc" validate:"required,gt=0"`
}
