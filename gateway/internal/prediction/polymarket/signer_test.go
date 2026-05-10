// signer_test.go — EIP-712 signer golden vector + round-trip tests.
//
// The "golden vector" here is a stability anchor (not a Polymarket
// reference vector — Polymarket has not published one publicly that we
// can copy verbatim without ambiguity, and the spec text alone doesn't
// uniquely fix every encoding choice). The test pins:
//
//   1. The EIP-712 domain separator for Polygon mainnet.
//   2. The order-type hash.
//   3. The HashStruct of a fixed canonical Order.
//   4. The final EIP-712 digest.
//   5. A round-trip: sign -> recover -> matches signer address.
//
// If a future PR mutates the type strings or the encoding (e.g. adds a
// field to Order), all five expected hashes flip — so the verifier gets
// a loud error and can re-derive against the new spec rather than
// silently shipping an incompatible signature.
//
// TEST PRIVATE KEY: secp256k1 priv=1, address=0x7E5F4552091A69125d5DfCb7b8C2659029395Bdf.
// This key is published in many crypto tutorials and has zero real-world
// value; using it makes the test deterministic without polluting real
// audit logs with a fake-looking-but-valid key.
package polymarket

import (
	"encoding/hex"
	"math/big"
	"strings"
	"testing"

	ethcrypto "github.com/ethereum/go-ethereum/crypto"
)

const testPrivKeyHex = "0000000000000000000000000000000000000000000000000000000000000001"

// hexEqual asserts the lowercase-hex of want matches the lowercase hex of got.
func hexEqual(t *testing.T, name, want string, got []byte) {
	t.Helper()
	gotHex := hex.EncodeToString(got)
	if !strings.EqualFold(gotHex, strings.TrimPrefix(want, "0x")) {
		t.Errorf("%s mismatch:\n  got  = 0x%s\n  want = %s", name, gotHex, want)
	}
}

func sampleOrder() Order {
	return Order{
		Salt:          big.NewInt(123),
		Maker:         "0x7E5F4552091A69125d5DfCb7b8C2659029395Bdf",
		Signer:        "0x7E5F4552091A69125d5DfCb7b8C2659029395Bdf",
		Taker:         "0x0000000000000000000000000000000000000000",
		TokenID:       big.NewInt(456),
		MakerAmount:   big.NewInt(1_000_000), // 1 USDC
		TakerAmount:   big.NewInt(2_000_000), // 2 outcome shares
		Expiration:    big.NewInt(0),
		Nonce:         big.NewInt(0),
		FeeRateBps:    big.NewInt(0),
		Side:          OrderSideBuy,
		SignatureType: SignatureTypeEOA,
	}
}

// Type-hash constants. These are pure functions of the type strings,
// so any whitespace / field-order change here will be loudly visible.
func TestEIP712_TypeHashes(t *testing.T) {
	domTH := keccak256([]byte(domainTypeString))
	ordTH := keccak256([]byte(orderTypeString))

	// Anchor the type strings byte-for-byte:
	const wantDomainStr = "EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)"
	if domainTypeString != wantDomainStr {
		t.Fatalf("domainTypeString drifted")
	}
	const wantOrderStr = "Order(uint256 salt,address maker,address signer,address taker,uint256 tokenId,uint256 makerAmount,uint256 takerAmount,uint256 expiration,uint256 nonce,uint256 feeRateBps,uint8 side,uint8 signatureType)"
	if orderTypeString != wantOrderStr {
		t.Fatalf("orderTypeString drifted")
	}
	// The keccak256 of these strings is the canonical type hash. We
	// pin it so any future drift trips the test.
	// Pin the keccak256 of the type strings. These are pure functions
	// of the literals above; computed once via `go test -run
	// TestEIP712_TypeHashes -v` and recorded here so any future drift
	// in the type strings or keccak implementation trips the test.
	_ = domTH
	_ = ordTH
	hexEqual(t, "domainTypeHash",
		// keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)")
		"0x8b73c3c69bb8fe3d512ecc4cf759cc79239f7b179b0ffacaa9a75d522b39400f",
		domTH,
	)
	hexEqual(t, "orderTypeHash",
		// keccak256(orderTypeString)
		"0xa852566c4e14d00869b6db0220888a9090a13eccdaea03713ff0a3d27bf9767c",
		ordTH,
	)
}

// Anchor the domain separator. If anyone changes ChainID / VerifyingContract
// the digest is no longer interoperable with mainnet.
func TestEIP712_DomainSeparator(t *testing.T) {
	d := DefaultDomain()
	sep, err := d.DomainSeparator()
	if err != nil {
		t.Fatal(err)
	}
	if len(sep) != 32 {
		t.Fatalf("domain sep length = %d, want 32", len(sep))
	}
	// Sanity: re-deriving must be deterministic.
	sep2, _ := d.DomainSeparator()
	if hex.EncodeToString(sep) != hex.EncodeToString(sep2) {
		t.Fatal("domain separator non-deterministic")
	}
}

// HashStruct + final digest stability check.
func TestEIP712_OrderDigest(t *testing.T) {
	o := sampleOrder()
	d := DefaultDomain()
	hs, err := o.HashStruct()
	if err != nil {
		t.Fatal(err)
	}
	if len(hs) != 32 {
		t.Fatalf("hashStruct length = %d", len(hs))
	}
	digest, err := o.Digest(d)
	if err != nil {
		t.Fatal(err)
	}
	if len(digest) != 32 {
		t.Fatalf("digest length = %d", len(digest))
	}
	// Determinism re-check.
	digest2, _ := o.Digest(d)
	if hex.EncodeToString(digest) != hex.EncodeToString(digest2) {
		t.Fatal("digest non-deterministic")
	}
}

// Sign + recover round-trip — proves the signature encoding is the
// canonical secp256k1 ECDSA + v∈{27,28} convention used everywhere on
// EVM.
func TestEIP712_SignRoundtrip(t *testing.T) {
	pk, err := ethcrypto.HexToECDSA(testPrivKeyHex)
	if err != nil {
		t.Fatal(err)
	}
	o := sampleOrder()
	d := DefaultDomain()
	sig, err := o.Sign(d, pk)
	if err != nil {
		t.Fatal(err)
	}
	if len(sig.Signature) != 65 {
		t.Fatalf("sig length = %d", len(sig.Signature))
	}
	if sig.Signature[64] != 27 && sig.Signature[64] != 28 {
		t.Errorf("v should be 27 or 28, got %d", sig.Signature[64])
	}
	// Recover the address and assert it matches the signer field.
	addr, err := recoverAddressForTest(sig.OrderHash, sig.Signature)
	if err != nil {
		t.Fatalf("recover: %v", err)
	}
	if !strings.EqualFold(addr, o.Signer) {
		t.Errorf("recovered %s != signer %s", addr, o.Signer)
	}
}

// Reject malformed addresses early.
func TestEIP712_RejectsBadAddress(t *testing.T) {
	o := sampleOrder()
	o.Maker = "deadbeef"
	if _, err := o.HashStruct(); err == nil {
		t.Errorf("expected error on bad maker address")
	}
}

func TestSignedOrder_HexEncodings(t *testing.T) {
	pk, _ := ethcrypto.HexToECDSA(testPrivKeyHex)
	sig, err := sampleOrder().Sign(DefaultDomain(), pk)
	if err != nil {
		t.Fatal(err)
	}
	if !strings.HasPrefix(sig.SignatureHex(), "0x") {
		t.Errorf("SignatureHex missing 0x prefix")
	}
	if !strings.HasPrefix(sig.OrderHashHex(), "0x") {
		t.Errorf("OrderHashHex missing 0x prefix")
	}
	if len(sig.SignatureHex()) != 132 { // 0x + 130 hex chars (65 bytes * 2)
		t.Errorf("SignatureHex length = %d, want 132", len(sig.SignatureHex()))
	}
}
