package orderengine

import (
	"crypto/sha256"
	"encoding/hex"
	"strings"
	"testing"
	"time"

	"github.com/finance_next/gateway/internal/domain"
)

// Tests in this file exercise the pure / no-IO methods on Engine. Wiring
// against a real Mongo + Redis is covered indirectly via integration
// against docker compose (out-of-band for unit tests).

func TestDeriveClientOrderID_DeterministicWithIdempotencyKey(t *testing.T) {
	e := New(Deps{
		Workers:           1,
		ReconcileInterval: time.Second,
	})
	cmd := domain.SubmitOrderCommand{
		StrategyID:     "strat-1",
		Symbol:         "BTCUSDT",
		Side:           domain.OrderSideBuy,
		Type:           domain.OrderTypeMarket,
		Qty:            0.001,
		IdempotencyKey: "strat-1:entry:BTCUSDT:1700000000",
	}
	a := e.deriveClientOrderID(cmd)
	b := e.deriveClientOrderID(cmd)
	if a != b {
		t.Errorf("deterministic key differed: %q vs %q", a, b)
	}
	if len(a) != 32 {
		t.Errorf("expected 32-char id, got %q (len=%d)", a, len(a))
	}
	if len(a) > 36 {
		t.Errorf("Binance limit is 36 chars; got %d", len(a))
	}
	// Sanity: matches the documented sha256 prefix.
	h := sha256.New()
	h.Write([]byte(cmd.StrategyID + "|" + cmd.IdempotencyKey + "|" + cmd.Symbol + "|" + string(cmd.Side)))
	want := hex.EncodeToString(h.Sum(nil))[:32]
	if a != want {
		t.Errorf("derive mismatch: got %q, want %q", a, want)
	}
}

func TestDeriveClientOrderID_DifferentSidesDifferentIDs(t *testing.T) {
	e := New(Deps{Workers: 1, ReconcileInterval: time.Second})
	buy := e.deriveClientOrderID(domain.SubmitOrderCommand{
		StrategyID: "s", Symbol: "BTCUSDT", Side: domain.OrderSideBuy,
		Type: domain.OrderTypeMarket, Qty: 0.1, IdempotencyKey: "k",
	})
	sell := e.deriveClientOrderID(domain.SubmitOrderCommand{
		StrategyID: "s", Symbol: "BTCUSDT", Side: domain.OrderSideSell,
		Type: domain.OrderTypeMarket, Qty: 0.1, IdempotencyKey: "k",
	})
	if buy == sell {
		t.Errorf("expected distinct ids for buy vs sell, both = %q", buy)
	}
}

func TestStartOfUTCDay(t *testing.T) {
	loc, _ := time.LoadLocation("America/New_York")
	in := time.Date(2026, 5, 9, 23, 30, 0, 0, loc) // 03:30 UTC next day
	got := startOfUTCDay(in)
	want := time.Date(2026, 5, 10, 0, 0, 0, 0, time.UTC)
	if !got.Equal(want) {
		t.Errorf("startOfUTCDay(%v) = %v, want %v", in, got, want)
	}
}

func TestJSONEscape(t *testing.T) {
	cases := map[string]string{
		`hello`:       `hello`,
		`"quoted"`:    `\"quoted\"`,
		"line\nbreak": `line\nbreak`,
		`back\slash`:  `back\\slash`,
	}
	for in, want := range cases {
		if got := jsonEscape(in); got != want {
			t.Errorf("jsonEscape(%q) = %q, want %q", in, got, want)
		}
	}
}

func TestOrderEventSuffix(t *testing.T) {
	cases := map[domain.OrderStatus]string{
		domain.OrderStatusFilled:   "filled",
		domain.OrderStatusCanceled: "canceled",
		domain.OrderStatusRejected: "rejected",
		domain.OrderStatusNew:      "updated",
		domain.OrderStatusPartial:  "updated",
		domain.OrderStatusUnknown:  "updated",
	}
	for in, want := range cases {
		if got := orderEventSuffix(in); got != want {
			t.Errorf("orderEventSuffix(%q) = %q, want %q", in, got, want)
		}
	}
}

func TestEngineConstruction_DefaultsAreSensible(t *testing.T) {
	e := New(Deps{})
	if e.deps.Workers != 4 {
		t.Errorf("default workers should be 4, got %d", e.deps.Workers)
	}
	if e.deps.ReconcileInterval != 30*time.Second {
		t.Errorf("default reconcile interval should be 30s, got %v", e.deps.ReconcileInterval)
	}
	if e.deps.Gate == nil {
		t.Fatal("default gate should be a closed TokenStore, got nil")
	}
	if e.deps.Gate.Allowed() {
		t.Error("default gate should be closed (env disabled)")
	}
	// instanceID prefix sanity
	if !strings.HasPrefix(e.instanceID, "gw-") {
		t.Errorf("expected instance id prefix gw-, got %q", e.instanceID)
	}
}
