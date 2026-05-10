package polygon

import (
	"context"
	"strings"
	"testing"
)

// TEST-ONLY private key. The leading byte differs from 0x00...01 only in
// the last byte to keep `go vet` happy on hex parsing; this key has no
// real-world value and is documented as test-only in the package
// comment.
const testPrivateKey = "0000000000000000000000000000000000000000000000000000000000000001"

func TestPrivateKeyFromHex_Round(t *testing.T) {
	pk, err := PrivateKeyFromHex(testPrivateKey)
	if err != nil {
		t.Fatalf("PrivateKeyFromHex(testPrivateKey): %v", err)
	}
	addr := AddressForPrivateKey(pk)
	// Address derived from secp256k1 priv=1 — well-known constant.
	want := "0x7E5F4552091A69125d5DfCb7b8C2659029395Bdf"
	if !strings.EqualFold(addr, want) {
		t.Fatalf("address mismatch: got %s want %s", addr, want)
	}
}

func TestPrivateKeyFromHex_Invalid(t *testing.T) {
	cases := []string{"", "12", "zzz", strings.Repeat("g", 64)}
	for _, c := range cases {
		if _, err := PrivateKeyFromHex(c); err == nil {
			t.Errorf("expected error for %q, got nil", c)
		}
	}
}

func TestValidateAndDerive_ExpectedMatch(t *testing.T) {
	addr, err := ValidateAndDerive(testPrivateKey, "0x7E5F4552091A69125d5DfCb7b8C2659029395Bdf")
	if err != nil {
		t.Fatalf("ValidateAndDerive: %v", err)
	}
	if !strings.HasPrefix(addr, "0x") {
		t.Fatalf("address missing 0x prefix: %s", addr)
	}
}

func TestValidateAndDerive_ExpectedMismatch(t *testing.T) {
	_, err := ValidateAndDerive(testPrivateKey, "0xdeadbeef0000000000000000000000000000dead")
	if err == nil {
		t.Fatal("expected mismatch error, got nil")
	}
}

func TestValidateApproveAmount(t *testing.T) {
	// Cap = 0 → always refuse.
	if err := ValidateApproveAmount(1, 0); err == nil {
		t.Errorf("zero cap should refuse")
	}
	// Within cap — ok.
	if err := ValidateApproveAmount(50, 100); err != nil {
		t.Errorf("within cap should pass: %v", err)
	}
	// Over cap — refuse.
	if err := ValidateApproveAmount(200, 100); err == nil {
		t.Errorf("over cap should refuse")
	}
	// Boundary at exactly cap — ok.
	if err := ValidateApproveAmount(100, 100); err != nil {
		t.Errorf("exact cap should pass: %v", err)
	}
}

func TestUSDCAtomicScaling(t *testing.T) {
	if got := USDCToAtomic(1.0); got != 1_000_000 {
		t.Errorf("USDCToAtomic(1) = %d, want 1_000_000", got)
	}
	if got := USDCToAtomic(0.000001); got != 1 {
		t.Errorf("USDCToAtomic(1e-6) = %d, want 1", got)
	}
	if got := AtomicToUSDC(1_000_000); got != 1.0 {
		t.Errorf("AtomicToUSDC(1e6) = %v, want 1.0", got)
	}
}

func TestNoopRPC_AlwaysErrors(t *testing.T) {
	r := NoopRPC{}
	if _, err := r.USDCBalanceOf(context.Background(), "0xabc"); err == nil {
		t.Errorf("expected ErrRPCNotConfigured for USDCBalanceOf")
	}
	if _, err := r.CTFBalances(context.Background(), "0xabc"); err == nil {
		t.Errorf("expected ErrRPCNotConfigured for CTFBalances")
	}
	if _, err := r.ApproveUSDC(context.Background(), "0x", 1); err == nil {
		t.Errorf("expected ErrRPCNotConfigured for ApproveUSDC")
	}
}

func TestMemoryRPC_RecordsApprove(t *testing.T) {
	r := &MemoryRPC{Balance: 1000, Allowance: 0}
	tx, err := r.ApproveUSDC(context.Background(), "0xpriv", 250)
	if err != nil {
		t.Fatalf("ApproveUSDC: %v", err)
	}
	if tx == "" {
		t.Errorf("expected non-empty tx hash")
	}
	if len(r.Approves) != 1 {
		t.Fatalf("expected 1 recorded approve, got %d", len(r.Approves))
	}
	if r.Approves[0].Amount != 250 {
		t.Errorf("recorded amount = %v, want 250", r.Approves[0].Amount)
	}
	if r.Allowance != 250 {
		t.Errorf("allowance not updated post-approve: %v", r.Allowance)
	}
}

func TestIsValidAddress(t *testing.T) {
	cases := map[string]bool{
		"0x7E5F4552091A69125d5DfCb7b8C2659029395Bdf": true,
		"7E5F4552091A69125d5DfCb7b8C2659029395Bdf":   true,
		"0xdead":                       false,
		"":                             false,
		"0xZZZZ552091A69125d5DfCb7b8C2659029395Bdf":  false,
	}
	for addr, want := range cases {
		if got := IsValidAddress(addr); got != want {
			t.Errorf("IsValidAddress(%q) = %v, want %v", addr, got, want)
		}
	}
}
