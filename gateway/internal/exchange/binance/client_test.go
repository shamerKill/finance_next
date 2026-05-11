package binance

import (
	"context"
	"net/http"
	"net/http/httptest"
	"os"
	"strings"
	"testing"
	"time"
)

// withMockBinance spins up an httptest.Server that mocks the spot and futures
// REST endpoints we touch. Returns a client wired to point at it.
func withMockBinance(t *testing.T) (*Client, *httptest.Server) {
	t.Helper()
	mux := http.NewServeMux()
	mux.HandleFunc("/api/v3/account", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{
			"makerCommission": 10,
			"takerCommission": 10,
			"buyerCommission": 0,
			"sellerCommission": 0,
			"canTrade": true,
			"canWithdraw": false,
			"canDeposit": true,
			"updateTime": 1700000000000,
			"accountType": "SPOT",
			"balances": [
				{"asset":"BTC","free":"0.5","locked":"0"},
				{"asset":"USDT","free":"1000","locked":"0"}
			],
			"permissions": ["SPOT"]
		}`))
	})
	// /sapi/v1/account/apiRestrictions is the real source of truth for
	// per-API-key permissions; ProbePermissions hits this endpoint.
	mux.HandleFunc("/sapi/v1/account/apiRestrictions", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{
			"ipRestrict": false,
			"createTime": 1700000000000,
			"enableWithdrawals": false,
			"enableInternalTransfer": false,
			"permitsUniversalTransfer": false,
			"enableVanillaOptions": false,
			"enableReading": true,
			"enableFutures": false,
			"enableMargin": false,
			"enableSpotAndMarginTrading": true,
			"tradingAuthorityExpirationTime": 0
		}`))
	})
	mux.HandleFunc("/fapi/v2/positionRisk", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`[
			{"symbol":"BTCUSDT","positionSide":"BOTH","positionAmt":"0.010","entryPrice":"50000","markPrice":"51000","unRealizedProfit":"10","leverage":"10","liquidationPrice":"45000","marginType":"isolated","breakEvenPrice":"50050","isAutoAddMargin":"false","isolatedMargin":"50","maxNotionalValue":"10000","notional":"510","isolatedWallet":"50"},
			{"symbol":"ETHUSDT","positionSide":"BOTH","positionAmt":"0","entryPrice":"0","markPrice":"3000","unRealizedProfit":"0","leverage":"10","liquidationPrice":"0","marginType":"isolated","breakEvenPrice":"0","isAutoAddMargin":"false","isolatedMargin":"0","maxNotionalValue":"10000","notional":"0","isolatedWallet":"0"}
		]`))
	})
	srv := httptest.NewServer(mux)
	c := NewClient("test-key", "test-secret")
	c.SetSpotEndpoint(srv.URL)
	c.SetFuturesEndpoint(srv.URL)
	return c, srv
}

func TestProbePermissions(t *testing.T) {
	c, srv := withMockBinance(t)
	defer srv.Close()
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	perms, err := c.ProbePermissions(ctx)
	if err != nil {
		t.Fatalf("ProbePermissions: %v", err)
	}
	if !perms.CanTrade {
		t.Errorf("expected canTrade=true (EnableSpotAndMarginTrading=true)")
	}
	if perms.CanWithdraw {
		t.Errorf("expected canWithdraw=false (EnableWithdrawals=false)")
	}
	if perms.CanDeposit {
		// apiRestrictions doesn't expose deposit; we hardcode false.
		t.Errorf("expected canDeposit=false (not surfaced by apiRestrictions)")
	}
}

func TestGetBalances(t *testing.T) {
	c, srv := withMockBinance(t)
	defer srv.Close()
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	bals, err := c.GetBalances(ctx)
	if err != nil {
		t.Fatalf("GetBalances: %v", err)
	}
	if len(bals) != 2 {
		t.Fatalf("expected 2 balances, got %d", len(bals))
	}
	for _, b := range bals {
		if b.Wallet != "spot" {
			t.Errorf("expected wallet=spot, got %q", b.Wallet)
		}
	}
}

func TestGetPositions_FiltersZero(t *testing.T) {
	c, srv := withMockBinance(t)
	defer srv.Close()
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	pos, err := c.GetPositions(ctx)
	if err != nil {
		t.Fatalf("GetPositions: %v", err)
	}
	if len(pos) != 1 {
		t.Fatalf("expected 1 non-zero position, got %d", len(pos))
	}
	if pos[0].Symbol != "BTCUSDT" {
		t.Errorf("expected BTCUSDT, got %q", pos[0].Symbol)
	}
}

func TestParseNonZero(t *testing.T) {
	cases := map[string]bool{
		"0":      false,
		"0.0":    false,
		"0.000":  false,
		"0.001":  true,
		"-0.5":   true,
		"":       false,
		"123":    true,
		"-1.0":   true,
	}
	for in, want := range cases {
		if got := parseNonZero(in); got != want {
			t.Errorf("parseNonZero(%q) = %v, want %v", in, got, want)
		}
	}
}

// TestLiveProbe is a smoke test against the real Binance API. Skipped unless
// BINANCE_API_KEY/BINANCE_SECRET_KEY are set in the environment.
func TestLiveProbe(t *testing.T) {
	apiKey := strings.TrimSpace(os.Getenv("BINANCE_API_KEY"))
	secretKey := strings.TrimSpace(os.Getenv("BINANCE_SECRET_KEY"))
	if apiKey == "" || secretKey == "" {
		t.Skip("BINANCE_API_KEY / BINANCE_SECRET_KEY not set; skipping live probe")
	}
	c := NewClient(apiKey, secretKey)
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	if _, err := c.ProbePermissions(ctx); err != nil {
		t.Fatalf("live ProbePermissions: %v", err)
	}
}
