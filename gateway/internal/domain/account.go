package domain

import "time"

// Exchange enumerates the venues the gateway can talk to. Phase 1 only wires up
// Binance; the type accepts the others so we can add adapters without churning
// stored data.
type Exchange string

const (
	ExchangeBinance Exchange = "binance"
	ExchangeOKX     Exchange = "okx"
	ExchangeBybit   Exchange = "bybit"
	ExchangeAShare  Exchange = "a_share"
)

// IsValid reports whether e is one of the recognised exchanges.
func (e Exchange) IsValid() bool {
	switch e {
	case ExchangeBinance, ExchangeOKX, ExchangeBybit, ExchangeAShare:
		return true
	}
	return false
}

// Permissions captures the read/trade/withdraw flags returned by a venue's
// account-info endpoint. We persist these on the Account so the UI can warn
// about over-scoped keys without re-probing every render.
type Permissions struct {
	CanTrade    bool `json:"canTrade"    bson:"canTrade"`
	CanDeposit  bool `json:"canDeposit"  bson:"canDeposit"`
	CanWithdraw bool `json:"canWithdraw" bson:"canWithdraw"`
}

// Account is the persisted exchange-credential record.
//
// All credential ciphertexts are envelope-encrypted: the per-account DEK lives
// in DEKCiphertext (sealed with the master KEK), and each individual credential
// is sealed with that DEK. JSON tags use "-" so credential ciphertexts are
// never serialised over HTTP.
//
// TODO(phase 7): replace UserID="default" with the authenticated user's id once
// JWT auth is in place.
type Account struct {
	ID             string      `json:"id"             bson:"_id,omitempty"`
	UserID         string      `json:"userId"         bson:"userId"`
	Exchange       Exchange    `json:"exchange"       bson:"exchange"`
	Label          string      `json:"label"          bson:"label"`
	Email          string      `json:"email"          bson:"email"`
	Permissions    Permissions `json:"permissions"    bson:"permissions"`
	LastSnapshotAt *time.Time  `json:"lastSnapshotAt,omitempty" bson:"lastSnapshotAt,omitempty"`
	CreatedAt      time.Time   `json:"createdAt"      bson:"createdAt"`
	UpdatedAt      time.Time   `json:"updatedAt"      bson:"updatedAt"`

	// Encrypted credential bundle. Never serialised.
	DEKCiphertext        string `json:"-" bson:"dekCiphertext"`
	APIKeyCiphertext     string `json:"-" bson:"apiKeyCiphertext"`
	SecretKeyCiphertext  string `json:"-" bson:"secretKeyCiphertext"`
	PassphraseCiphertext string `json:"-" bson:"passphraseCiphertext,omitempty"`
}

// CreateAccountInput is the validated request shape for POST /api/v1/accounts.
//
// `passphrase` is only required for OKX; the handler enforces this conditionally
// because validator/v10 doesn't support cross-field "required if" cleanly.
type CreateAccountInput struct {
	Exchange   Exchange `json:"exchange"             validate:"required"`
	Label      string   `json:"label"                validate:"required,min=3,max=32"`
	Email      string   `json:"email"                validate:"required,email"`
	APIKey     string   `json:"apiKey"               validate:"required"`
	SecretKey  string   `json:"secretKey"            validate:"required"`
	Passphrase string   `json:"passphrase,omitempty"`
}

// DefaultUserID is the placeholder owner id used until phase 7 introduces auth.
const DefaultUserID = "default"
