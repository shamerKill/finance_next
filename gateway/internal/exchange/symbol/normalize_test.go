package symbol

import "testing"

// canonicalFixtures lists the canonical symbols the gateway exercises in
// production. Phase 5 tests only spot + USDT-linear perps; coin-margined
// inverse contracts return ErrUnsupportedSymbol from the converters.
var canonicalFixtures = []CanonicalSymbol{
	"BTC/USDT:USDT",
	"ETH/USDT:USDT",
	"SOL/USDT:USDT",
	"BTC/USDT",
	"ETH/USDT",
	"BNB/USDT",
	"DOGE/USDT:USDT",
	"BTC/USDC",
}

func TestRoundTrip_Binance(t *testing.T) {
	for _, c := range canonicalFixtures {
		s, err := ToBinance(c)
		if err != nil {
			t.Errorf("ToBinance(%q): %v", c, err)
			continue
		}
		// Round-trip via FromBinance — for spot fixtures the FromBinance
		// path returns the perp interpretation (binance's wire shape is
		// identical), so we tolerate both shapes.
		got := FromBinance(s)
		if got != c && !equalIgnoringSettle(got, c) {
			t.Errorf("FromBinance(ToBinance(%q))=%q", c, got)
		}
	}
}

func TestRoundTrip_OKX(t *testing.T) {
	for _, c := range canonicalFixtures {
		s, err := ToOKX(c)
		if err != nil {
			t.Errorf("ToOKX(%q): %v", c, err)
			continue
		}
		got := FromOKX(s)
		if got != c {
			t.Errorf("FromOKX(ToOKX(%q))=%q want %q", c, got, c)
		}
	}
}

func TestRoundTrip_Bybit(t *testing.T) {
	for _, c := range canonicalFixtures {
		s, err := ToBybit(c)
		if err != nil {
			t.Errorf("ToBybit(%q): %v", c, err)
			continue
		}
		got := FromBybit(s)
		if got != c && !equalIgnoringSettle(got, c) {
			t.Errorf("FromBybit(ToBybit(%q))=%q", c, got)
		}
	}
}

// TestExplicitMappings nails down the wire shapes the verifier should
// be able to read off the source.
func TestExplicitMappings(t *testing.T) {
	cases := []struct {
		canonical                CanonicalSymbol
		binance, okx, bybit      string
	}{
		{"BTC/USDT:USDT", "BTCUSDT", "BTC-USDT-SWAP", "BTCUSDT"},
		{"ETH/USDT:USDT", "ETHUSDT", "ETH-USDT-SWAP", "ETHUSDT"},
		{"BTC/USDT", "BTCUSDT", "BTC-USDT", "BTCUSDT"},
	}
	for _, c := range cases {
		if got, _ := ToBinance(c.canonical); got != c.binance {
			t.Errorf("ToBinance(%q)=%q want %q", c.canonical, got, c.binance)
		}
		if got, _ := ToOKX(c.canonical); got != c.okx {
			t.Errorf("ToOKX(%q)=%q want %q", c.canonical, got, c.okx)
		}
		if got, _ := ToBybit(c.canonical); got != c.bybit {
			t.Errorf("ToBybit(%q)=%q want %q", c.canonical, got, c.bybit)
		}
	}
}

func TestParse(t *testing.T) {
	b, q, s, err := Parse("BTC/USDT:USDT")
	if err != nil || b != "BTC" || q != "USDT" || s != "USDT" {
		t.Errorf("Parse(perp): %s/%s:%s err=%v", b, q, s, err)
	}
	b, q, s, err = Parse("BTC/USDT")
	if err != nil || b != "BTC" || q != "USDT" || s != "" {
		t.Errorf("Parse(spot): %s/%s settle=%q err=%v", b, q, s, err)
	}
	if _, _, _, err := Parse("BTCUSDT"); err == nil {
		t.Error("Parse: expected error on missing slash")
	}
	if _, _, _, err := Parse("BTC/"); err == nil {
		t.Error("Parse: expected error on empty quote")
	}
}

// TestUnsupportedInverse covers coin-margined contracts (settle != quote).
func TestUnsupportedInverse(t *testing.T) {
	if _, err := ToBinance("BTC/USD:BTC"); err == nil {
		t.Error("expected ErrUnsupportedSymbol for inverse on Binance")
	}
	if _, err := ToOKX("BTC/USD:BTC"); err == nil {
		t.Error("expected ErrUnsupportedSymbol for inverse on OKX")
	}
}

// equalIgnoringSettle handles the case where the FromX path can't
// disambiguate spot vs perp without context. "BTC/USDT" and
// "BTC/USDT:USDT" are considered equivalent for the purposes of the
// round-trip property test on Binance/Bybit (both exchanges share the
// same wire shape between spot + USDT-perp).
func equalIgnoringSettle(a, b CanonicalSymbol) bool {
	if a == b {
		return true
	}
	if a.IsSpot() && b.IsPerpetual() {
		return CanonicalSymbol(string(a)+":"+string(a)[len(string(a))-4:]) == b
	}
	if b.IsSpot() && a.IsPerpetual() {
		return CanonicalSymbol(string(b)+":"+string(b)[len(string(b))-4:]) == a
	}
	return false
}
