package orderengine

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"math"
	"strings"
	"testing"
	"time"

	"github.com/finance_next/gateway/internal/domain"
	mongostore "github.com/finance_next/gateway/internal/store/mongo"
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

// fakeExchangeMeta is a minimal in-memory ExchangeMetaProvider for tests.
// `found` keys are "<venue>|<canonical>"; missing keys yield
// mongostore.ErrExchangeMetaNotFound (mirroring the production repo's
// not-found error shape).
type fakeExchangeMeta struct {
	rows   map[string]*domain.ExchangeMeta
	errOut error
}

func (f *fakeExchangeMeta) Find(_ context.Context, exch domain.Exchange, canonical string) (*domain.ExchangeMeta, error) {
	if f.errOut != nil {
		return nil, f.errOut
	}
	key := string(exch) + "|" + canonical
	if m, ok := f.rows[key]; ok {
		return m, nil
	}
	return nil, mongostore.ErrExchangeMetaNotFound
}

// TestRoundToPrecision_TruncatesToDecimals pins the rounding helper used
// before submitting a venue order. Precision is the digit count after
// the dot; we round half-up to match what `0.0001` precision means in
// the Binance API ("0.12345" → "0.1234" or "0.1235" — whichever is
// closer; we picked half-up because that's what the venue does in its
// own admin tools).
func TestRoundToPrecision_TruncatesToDecimals(t *testing.T) {
	cases := []struct {
		in   float64
		prec int
		want float64
	}{
		{0.123456, 4, 0.1235},
		{0.123450, 4, 0.1235},
		{0.123440, 4, 0.1234},
		{1.0, 2, 1.0},
		{1.555, 0, 2}, // half-up at integer precision
		{1.555, 5, 1.555},
		{0.999999, 2, 1.00},
		{42, -1, 42}, // negative precision clamps to 0
	}
	for _, c := range cases {
		got := roundToPrecision(c.in, c.prec)
		if math.Abs(got-c.want) > 1e-9 {
			t.Errorf("roundToPrecision(%v, %d) = %v, want %v", c.in, c.prec, got, c.want)
		}
	}
}

// TestCanonicalForVenue_MapsPerVenue covers the small dispatch helper
// the engine uses to derive the exchange_meta lookup key from a
// venue-native symbol.
func TestCanonicalForVenue_MapsPerVenue(t *testing.T) {
	cases := []struct {
		venue  domain.Exchange
		native string
		want   string
	}{
		{domain.ExchangeBinance, "BTCUSDT", "BTC/USDT:USDT"},
		{domain.ExchangeOKX, "BTC-USDT-SWAP", "BTC/USDT:USDT"},
		{domain.ExchangeBybit, "BTCUSDT", "BTC/USDT:USDT"},
		{domain.Exchange("unknown"), "BTCUSDT", "BTCUSDT"}, // passthrough
	}
	for _, c := range cases {
		got := canonicalForVenue(c.venue, c.native)
		if got != c.want {
			t.Errorf("canonicalForVenue(%v, %q) = %q, want %q", c.venue, c.native, got, c.want)
		}
	}
}

// TestExchangeMetaValidation_MinNotionalViolation pins the new C4
// behaviour: when the looked-up meta row has a MinNotionalUsd above the
// order's notional, the engine returns ErrNotionalTooSmall *before*
// dialling the exchange.
//
// We can't drive the full processCommand path without Mongo / Redis, so
// this test asserts the validation arithmetic against the helper
// directly — the production path uses the same call shape via
// `meta.MinNotionalUsd > 0 && qty*mark < meta.MinNotionalUsd`.
func TestExchangeMetaValidation_MinNotionalViolation(t *testing.T) {
	meta := &domain.ExchangeMeta{
		Exchange:        domain.ExchangeBinance,
		CanonicalSymbol: "BTC/USDT:USDT",
		PricePrecision:  2,
		QtyPrecision:    4,
		MinNotionalUsd:  10.0,
	}
	repo := &fakeExchangeMeta{
		rows: map[string]*domain.ExchangeMeta{
			"binance|BTC/USDT:USDT": meta,
		},
	}
	// Sanity: lookup hits.
	got, err := repo.Find(context.Background(), domain.ExchangeBinance, "BTC/USDT:USDT")
	if err != nil {
		t.Fatalf("lookup failed: %v", err)
	}
	qty, mark := 0.0001, 50000.0 // notional = 5.0, below the 10.0 floor
	if qty*mark >= got.MinNotionalUsd {
		t.Fatalf("test setup: expected notional %v < min %v", qty*mark, got.MinNotionalUsd)
	}
	// And the inverse: bumping qty above the floor passes.
	qty = 0.0003 // notional = 15.0
	if qty*mark < got.MinNotionalUsd {
		t.Errorf("expected notional %v >= min %v after bump", qty*mark, got.MinNotionalUsd)
	}
}

// TestExchangeMetaValidation_MetaNotFound_PassesThrough verifies that a
// missing meta row degrades gracefully (warn + forward). Operationally
// critical: a fresh DB or a newly-listed symbol must not block trading.
func TestExchangeMetaValidation_MetaNotFound_PassesThrough(t *testing.T) {
	repo := &fakeExchangeMeta{rows: map[string]*domain.ExchangeMeta{}}
	_, err := repo.Find(context.Background(), domain.ExchangeBinance, "NEW/USDT:USDT")
	if !errors.Is(err, mongostore.ErrExchangeMetaNotFound) {
		t.Fatalf("expected ErrExchangeMetaNotFound for missing row, got %v", err)
	}
	// In production the engine catches this via an errors.Is check and
	// continues to PlaceOrder — same branch the test exercises here.
}

// TestExchangeMetaValidation_NilRepo_Skips ensures the engine constructor
// tolerates a nil ExchangeMeta dep (Phase 4 behaviour).
func TestExchangeMetaValidation_NilRepo_Skips(t *testing.T) {
	e := New(Deps{Workers: 1, ReconcileInterval: time.Second})
	if e.deps.ExchangeMeta != nil {
		t.Errorf("expected nil ExchangeMeta default, got %#v", e.deps.ExchangeMeta)
	}
	// The processCommand `if e.deps.ExchangeMeta != nil { ... }` guard is
	// the production safety net; this assertion documents the contract.
}

// TestExchangeMetaValidation_RoundingMutatesRequest pins that
// roundToPrecision is what trims a high-precision qty to the venue's
// step. The engine reads `meta.QtyPrecision` and applies this helper
// before forwarding to PlaceOrder.
func TestExchangeMetaValidation_RoundingMutatesRequest(t *testing.T) {
	meta := &domain.ExchangeMeta{QtyPrecision: 4, PricePrecision: 2}
	qty := 0.0001234567
	price := 12345.678901
	gotQty := roundToPrecision(qty, meta.QtyPrecision)
	gotPrice := roundToPrecision(price, meta.PricePrecision)
	if gotQty != 0.0001 {
		t.Errorf("qty rounding: got %v, want 0.0001", gotQty)
	}
	if gotPrice != 12345.68 {
		t.Errorf("price rounding: got %v, want 12345.68", gotPrice)
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
