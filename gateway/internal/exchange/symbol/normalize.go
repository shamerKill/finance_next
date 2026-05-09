// Package symbol implements canonical symbol normalisation across the
// venues the gateway talks to (Binance, OKX, Bybit).
//
// The canonical form mirrors ccxt's "unified" market id:
//
//	spot:        BASE/QUOTE          e.g. "BTC/USDT"
//	usdt-perp:   BASE/QUOTE:SETTLE   e.g. "BTC/USDT:USDT"
//	coin-perp:   BASE/USD:BASE       e.g. "BTC/USD:BTC"
//
// The order engine, exchange_meta collection, market endpoints, and
// portfolio aggregation all use the canonical form internally so a
// strategy referring to "BTC/USDT:USDT" works identically against any
// of the three exchanges. Adapters convert at the upstream boundary
// using [ToBinance] / [ToOKX] / [ToBybit].
//
// Idempotence
// -----------
// The conversions are idempotent in the sense that
//
//	FromX(ToX(c)) == c
//
// for every supported canonical c. The reverse is *not* generally true
// — some venue-native strings collapse to the same canonical (e.g.
// "BTC/USDT" and "BTC-USDT" both normalise to canonical "BTC/USDT").
// The property tests in normalize_test.go enumerate the spot + USDT-perp
// fixtures the gateway uses today.
package symbol

import (
	"errors"
	"fmt"
	"strings"
)

// CanonicalSymbol is the unified market id (e.g. "BTC/USDT:USDT").
type CanonicalSymbol string

// IsPerpetual reports whether c is a perpetual contract (has settle suffix).
func (c CanonicalSymbol) IsPerpetual() bool {
	return strings.Contains(string(c), ":")
}

// IsSpot reports whether c is a spot market (no settle suffix, exactly one slash).
func (c CanonicalSymbol) IsSpot() bool {
	s := string(c)
	return strings.Count(s, "/") == 1 && !strings.Contains(s, ":")
}

// Parse splits a canonical symbol into its components. Returns an error
// when the input doesn't match either the spot or perp shape.
func Parse(c CanonicalSymbol) (base, quote, settle string, err error) {
	s := string(c)
	slash := strings.IndexByte(s, '/')
	if slash <= 0 || slash == len(s)-1 {
		return "", "", "", fmt.Errorf("symbol: invalid canonical %q", s)
	}
	base = s[:slash]
	rest := s[slash+1:]
	if colon := strings.IndexByte(rest, ':'); colon >= 0 {
		quote = rest[:colon]
		settle = rest[colon+1:]
		if quote == "" || settle == "" {
			return "", "", "", fmt.Errorf("symbol: invalid canonical %q", s)
		}
		return base, quote, settle, nil
	}
	quote = rest
	if quote == "" {
		return "", "", "", fmt.Errorf("symbol: invalid canonical %q", s)
	}
	return base, quote, "", nil
}

// ErrUnsupportedSymbol is returned when an input cannot be expressed in
// a venue's native format (e.g. inverse contracts that the gateway does
// not yet support).
var ErrUnsupportedSymbol = errors.New("symbol: unsupported canonical form for venue")

// ToBinance returns the venue-native form for Binance.
//
//	BTC/USDT          -> "BTCUSDT"  (spot)
//	BTC/USDT:USDT     -> "BTCUSDT"  (USDM-perp; same string — venue
//	                                 disambiguates by endpoint)
func ToBinance(c CanonicalSymbol) (string, error) {
	base, quote, settle, err := Parse(c)
	if err != nil {
		return "", err
	}
	if settle != "" && settle != quote {
		// Coin-margined perps (e.g. BTC/USD:BTC) — gateway doesn't ship
		// adapters for these yet.
		return "", ErrUnsupportedSymbol
	}
	return strings.ToUpper(base + quote), nil
}

// ToOKX returns the venue-native form for OKX.
//
//	BTC/USDT          -> "BTC-USDT"        (spot)
//	BTC/USDT:USDT     -> "BTC-USDT-SWAP"   (perpetual swap)
func ToOKX(c CanonicalSymbol) (string, error) {
	base, quote, settle, err := Parse(c)
	if err != nil {
		return "", err
	}
	if settle == "" {
		return strings.ToUpper(base + "-" + quote), nil
	}
	if settle != quote {
		return "", ErrUnsupportedSymbol
	}
	return strings.ToUpper(base + "-" + quote + "-SWAP"), nil
}

// ToBybit returns the venue-native form for Bybit. Bybit linear perps and
// spot markets share the same wire format ("BTCUSDT") — callers
// disambiguate via the `category` query parameter.
func ToBybit(c CanonicalSymbol) (string, error) {
	base, quote, settle, err := Parse(c)
	if err != nil {
		return "", err
	}
	if settle != "" && settle != quote {
		return "", ErrUnsupportedSymbol
	}
	return strings.ToUpper(base + quote), nil
}

// FromBinance heuristically maps a Binance native symbol back to its
// canonical form. Without a markets-info table we can't *prove* the
// quote currency, so we use a small allow-list of common quotes ordered
// longest-first.
//
// The output is "BTC/USDT:USDT" for the perp (since binance's spot +
// perp wire shape is identical, callers that only see "BTCUSDT" without
// surrounding context get the perp interpretation; the engine + meta
// collection always know which side they're on by the calling endpoint).
func FromBinance(s string) CanonicalSymbol {
	base, quote, ok := splitByQuote(strings.ToUpper(s))
	if !ok {
		return CanonicalSymbol(s)
	}
	return CanonicalSymbol(base + "/" + quote + ":" + quote)
}

// FromOKX maps an OKX native symbol back to canonical. OKX uses dashes
// and an explicit "-SWAP" suffix so the conversion is unambiguous.
func FromOKX(s string) CanonicalSymbol {
	parts := strings.Split(strings.ToUpper(s), "-")
	switch len(parts) {
	case 2:
		return CanonicalSymbol(parts[0] + "/" + parts[1])
	case 3:
		// BTC-USDT-SWAP
		if parts[2] == "SWAP" {
			return CanonicalSymbol(parts[0] + "/" + parts[1] + ":" + parts[1])
		}
		// BTC-USDT-250628 (futures); not supported but pass through.
		return CanonicalSymbol(s)
	}
	return CanonicalSymbol(s)
}

// FromBybit mirrors FromBinance (same wire shape for linear perps).
func FromBybit(s string) CanonicalSymbol {
	base, quote, ok := splitByQuote(strings.ToUpper(s))
	if !ok {
		return CanonicalSymbol(s)
	}
	return CanonicalSymbol(base + "/" + quote + ":" + quote)
}

// quoteAllowList is the ordered set of recognised quote currencies for
// the heuristic split. Ordered longest-first so "BTCUSDT" doesn't match
// "BT" before "USDT". Add to this list when the gateway starts trading
// new quote markets — the order engine + portfolio aggregation rely on
// it for correct base/quote detection.
var quoteAllowList = []string{"USDT", "USDC", "BUSD", "FDUSD", "DAI", "TUSD", "BTC", "ETH", "BNB", "USD"}

// splitByQuote splits "BTCUSDT" → ("BTC", "USDT", true). Empty input or
// a string that doesn't end with one of [quoteAllowList] returns
// ("", "", false).
func splitByQuote(s string) (string, string, bool) {
	for _, q := range quoteAllowList {
		if len(s) > len(q) && strings.HasSuffix(s, q) {
			return s[:len(s)-len(q)], q, true
		}
	}
	return "", "", false
}
