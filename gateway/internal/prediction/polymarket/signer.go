// signer.go — EIP-712 typed-data signer for Polymarket CLOB orders.
//
// EIP-712 domain (Polygon mainnet):
//
//	{
//	  name: "Polymarket CTF Exchange",
//	  version: "1",
//	  chainId: 137,
//	  verifyingContract: 0x4bFb41d5B3570DeFd03C39a9A4D8dE6Bd8B8982E
//	}
//
// Order type:
//
//	Order(
//	  uint256 salt,
//	  address maker,
//	  address signer,
//	  address taker,
//	  uint256 tokenId,
//	  uint256 makerAmount,
//	  uint256 takerAmount,
//	  uint256 expiration,
//	  uint256 nonce,
//	  uint256 feeRateBps,
//	  uint8   side,
//	  uint8   signatureType
//	)
//
// We compute the EIP-712 typed-data hash manually rather than via
// `apitypes.TypedData{}.HashStruct` so the implementation is auditable
// against the spec line-by-line, and so the golden vector test can
// pin every intermediate hash. The hash recipe (per EIP-712):
//
//	digest = keccak256(0x19 || 0x01 || domainSeparator || hashStruct(message))
//	domainSeparator = keccak256(EIP712Domain typehash || chainId || ...)
//
// Signing uses go-ethereum's `crypto.Sign`, which returns 65 bytes
// (r||s||v with v in {0,1}). Polymarket expects v ∈ {27,28} so we add
// 27 to match the canonical Ethereum encoding.
package polymarket

import (
	"crypto/ecdsa"
	"encoding/hex"
	"errors"
	"fmt"
	"math/big"
	"strings"

	"github.com/ethereum/go-ethereum/common"
	ethcrypto "github.com/ethereum/go-ethereum/crypto"
	"golang.org/x/crypto/sha3"
)

// Domain is the Polymarket CTF Exchange EIP-712 domain on Polygon mainnet.
// Override `VerifyingContract` via env if a forked deployment is used —
// see `POLYMARKET_CLOB_EXCHANGE_ADDRESS`.
type Domain struct {
	Name              string
	Version           string
	ChainID           int64
	VerifyingContract string
}

// DefaultDomain returns the Polygon mainnet domain.
func DefaultDomain() Domain {
	return Domain{
		Name:              "Polymarket CTF Exchange",
		Version:           "1",
		ChainID:           137,
		VerifyingContract: "0x4bFb41d5B3570DeFd03C39a9A4D8dE6Bd8B8982E",
	}
}

// OrderSide is the on-the-wire side enum. 0 = BUY (taker spends collateral
// and receives outcome shares), 1 = SELL.
type OrderSide uint8

// Side enum values.
const (
	OrderSideBuy  OrderSide = 0
	OrderSideSell OrderSide = 1
)

// SignatureType is the EIP-712 signature scheme; 0 = EOA (regular ECDSA).
// 1 / 2 are reserved for smart-contract wallets (EIP-1271 + Polymarket's
// proxy variants); we only support EOAs.
type SignatureType uint8

// SignatureType enum values.
const (
	SignatureTypeEOA SignatureType = 0
)

// Order is the canonical CLOB order tuple. Amounts are in raw units —
// USDC has 6 decimals so 1 USDC = 1_000_000. Outcome-token amount
// shares are also 6-decimal.
type Order struct {
	Salt          *big.Int
	Maker         string // 0x-prefixed
	Signer        string // 0x-prefixed
	Taker         string // 0x000... for any taker
	TokenID       *big.Int
	MakerAmount   *big.Int
	TakerAmount   *big.Int
	Expiration    *big.Int // unix seconds; 0 = no expiry
	Nonce         *big.Int
	FeeRateBps    *big.Int // basis points, e.g. 10 = 0.10%
	Side          OrderSide
	SignatureType SignatureType
}

// SignedOrder bundles an Order with its 65-byte EIP-712 signature
// (canonical r||s||v with v ∈ {27,28}).
type SignedOrder struct {
	Order     Order
	Signature []byte
	OrderHash []byte // keccak256 of the EIP-712 digest
}

// Errors surfaced by the signer.
var (
	// ErrInvalidAddress is returned when an address field isn't a 20-byte hex.
	ErrInvalidAddress = errors.New("polymarket: invalid address")
	// ErrSigningFailed wraps any error returned by ethcrypto.Sign.
	ErrSigningFailed = errors.New("polymarket: signing failed")
)

// EIP712 type strings (canonical, no whitespace).
const (
	domainTypeString = "EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)"
	orderTypeString  = "Order(uint256 salt,address maker,address signer,address taker,uint256 tokenId,uint256 makerAmount,uint256 takerAmount,uint256 expiration,uint256 nonce,uint256 feeRateBps,uint8 side,uint8 signatureType)"
)

// keccak256 returns the legacy Keccak-256 hash (NOT SHA3-256).
func keccak256(parts ...[]byte) []byte {
	h := sha3.NewLegacyKeccak256()
	for _, p := range parts {
		h.Write(p)
	}
	return h.Sum(nil)
}

// padLeft32 pads b to 32 bytes left (big-endian alignment used by ABI).
func padLeft32(b []byte) []byte {
	if len(b) >= 32 {
		return b[len(b)-32:]
	}
	out := make([]byte, 32)
	copy(out[32-len(b):], b)
	return out
}

// addressTo32 normalises a hex address into a 32-byte big-endian word.
func addressTo32(addr string) ([]byte, error) {
	if !common.IsHexAddress(addr) {
		return nil, fmt.Errorf("%w: %q", ErrInvalidAddress, addr)
	}
	a := common.HexToAddress(addr)
	return padLeft32(a.Bytes()), nil
}

// uint256To32 encodes a non-negative big.Int as a 32-byte big-endian word.
func uint256To32(n *big.Int) []byte {
	if n == nil {
		return make([]byte, 32)
	}
	return padLeft32(n.Bytes())
}

// uint8To32 encodes a uint8 as a 32-byte big-endian word.
func uint8To32(n uint8) []byte {
	out := make([]byte, 32)
	out[31] = n
	return out
}

// DomainSeparator computes keccak256(domainTypeHash || nameHash || versionHash || chainId || verifyingContract).
func (d Domain) DomainSeparator() ([]byte, error) {
	verAddr32, err := addressTo32(d.VerifyingContract)
	if err != nil {
		return nil, err
	}
	return keccak256(
		keccak256([]byte(domainTypeString)),
		keccak256([]byte(d.Name)),
		keccak256([]byte(d.Version)),
		uint256To32(big.NewInt(d.ChainID)),
		verAddr32,
	), nil
}

// HashStruct computes keccak256(orderTypeHash || encodeData(order)).
//
// encodeData per EIP-712: each field encoded as a 32-byte word.
// Addresses are right-padded into 32 bytes; uintN are big-endian.
func (o Order) HashStruct() ([]byte, error) {
	maker32, err := addressTo32(o.Maker)
	if err != nil {
		return nil, fmt.Errorf("maker: %w", err)
	}
	signer32, err := addressTo32(o.Signer)
	if err != nil {
		return nil, fmt.Errorf("signer: %w", err)
	}
	taker := o.Taker
	if taker == "" {
		taker = "0x0000000000000000000000000000000000000000"
	}
	taker32, err := addressTo32(taker)
	if err != nil {
		return nil, fmt.Errorf("taker: %w", err)
	}
	return keccak256(
		keccak256([]byte(orderTypeString)),
		uint256To32(o.Salt),
		maker32,
		signer32,
		taker32,
		uint256To32(o.TokenID),
		uint256To32(o.MakerAmount),
		uint256To32(o.TakerAmount),
		uint256To32(o.Expiration),
		uint256To32(o.Nonce),
		uint256To32(o.FeeRateBps),
		uint8To32(uint8(o.Side)),
		uint8To32(uint8(o.SignatureType)),
	), nil
}

// Digest is the final EIP-712 digest: keccak256(0x19 || 0x01 || domainSep || hashStruct).
func (o Order) Digest(d Domain) ([]byte, error) {
	domSep, err := d.DomainSeparator()
	if err != nil {
		return nil, err
	}
	hs, err := o.HashStruct()
	if err != nil {
		return nil, err
	}
	return keccak256([]byte{0x19, 0x01}, domSep, hs), nil
}

// Sign produces the 65-byte canonical signature (r||s||v, v in {27,28}).
func (o Order) Sign(d Domain, pk *ecdsa.PrivateKey) (*SignedOrder, error) {
	digest, err := o.Digest(d)
	if err != nil {
		return nil, err
	}
	sig, err := ethcrypto.Sign(digest, pk)
	if err != nil {
		return nil, fmt.Errorf("%w: %v", ErrSigningFailed, err)
	}
	// go-ethereum returns v in {0,1}; canonical EIP-155-pre format wants
	// v in {27,28}.
	if len(sig) != 65 {
		return nil, fmt.Errorf("%w: signature length %d", ErrSigningFailed, len(sig))
	}
	if sig[64] < 27 {
		sig[64] += 27
	}
	return &SignedOrder{
		Order:     o,
		Signature: sig,
		OrderHash: digest,
	}, nil
}

// SignatureHex returns the 0x-prefixed hex encoding of the signature.
func (s *SignedOrder) SignatureHex() string {
	return "0x" + hex.EncodeToString(s.Signature)
}

// OrderHashHex returns the 0x-prefixed hex encoding of the EIP-712 digest.
func (s *SignedOrder) OrderHashHex() string {
	return "0x" + hex.EncodeToString(s.OrderHash)
}

// recoverAddressForTest is exposed only for tests — reverses the
// signature back to the signing address. Verifies sign() round-trips.
func recoverAddressForTest(digest, sig []byte) (string, error) {
	if len(sig) != 65 {
		return "", fmt.Errorf("recover: bad sig len %d", len(sig))
	}
	// go-ethereum recovery wants v in {0,1}.
	rsv := make([]byte, 65)
	copy(rsv, sig)
	if rsv[64] >= 27 {
		rsv[64] -= 27
	}
	pub, err := ethcrypto.SigToPub(digest, rsv)
	if err != nil {
		return "", err
	}
	return strings.ToLower(ethcrypto.PubkeyToAddress(*pub).Hex()), nil
}
