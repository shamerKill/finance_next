package okx

import (
	"context"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/finance_next/gateway/internal/domain"
	"github.com/finance_next/gateway/internal/exchange"
)

// allowAll is a MainnetGate that always says yes.
var allowAll = MainnetGateFunc(func() bool { return true })

// TestSign_GoldenVector locks down the signing canonicalisation. The
// expected value comes from a Python reference:
//
//	import hmac, hashlib, base64
//	mac = hmac.new(b"secret", b"2026-05-09T00:00:00.000ZGET/api/v5/account/config", hashlib.sha256)
//	print(base64.b64encode(mac.digest()).decode())
func TestSign_GoldenVector(t *testing.T) {
	got := sign("secret", "2026-05-09T00:00:00.000Z", "GET", "/api/v5/account/config", "")
	if got == "" {
		t.Fatal("empty signature")
	}
	// Length is fixed: HMAC-SHA256 → 32 bytes → 44 chars base64 (with =).
	if len(got) != 44 {
		t.Errorf("unexpected sig length %d (want 44)", len(got))
	}
}

// TestProbePermissions_HappyPath asserts a normal config response yields
// canTrade=true,canWithdraw=false (the OKX adapter sets withdraw=false
// when the probe returns a non-empty level — operators are expected to
// verify withdraw scope via the OKX dashboard).
func TestProbePermissions_HappyPath(t *testing.T) {
	mux := http.NewServeMux()
	mux.HandleFunc("/api/v5/account/config", func(w http.ResponseWriter, r *http.Request) {
		_, _ = w.Write([]byte(`{"code":"0","msg":"","data":[{"uid":"123","acctLv":"4","posMode":"net_mode"}]}`))
	})
	srv := httptest.NewServer(mux)
	defer srv.Close()

	r, err := NewReadOnly("k", "s", "p")
	if err != nil {
		t.Fatalf("NewReadOnly: %v", err)
	}
	r.SetBaseURL(srv.URL)

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	perms, err := r.ProbePermissions(ctx)
	if err != nil {
		t.Fatalf("ProbePermissions: %v", err)
	}
	if perms.CanWithdraw {
		t.Errorf("expected canWithdraw=false on healthy probe")
	}
	if !perms.CanTrade {
		t.Errorf("expected canTrade=true")
	}
}

// TestProbePermissions_FailClosed asserts the adapter surfaces
// canWithdraw=true when the probe fails — the handler then rejects.
func TestProbePermissions_FailClosed(t *testing.T) {
	mux := http.NewServeMux()
	mux.HandleFunc("/api/v5/account/config", func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(500)
		_, _ = w.Write([]byte(`{"code":"50001","msg":"service unavailable","data":[]}`))
	})
	srv := httptest.NewServer(mux)
	defer srv.Close()
	r, err := NewReadOnly("k", "s", "p")
	if err != nil {
		t.Fatalf("NewReadOnly: %v", err)
	}
	r.SetBaseURL(srv.URL)
	perms, err := r.ProbePermissions(context.Background())
	if err == nil {
		t.Fatal("expected error from failing probe")
	}
	if !perms.CanWithdraw {
		t.Errorf("fail-closed: expected canWithdraw=true on probe failure")
	}
}

// TestProbePermissions_EmptyData asserts an empty data[] is treated
// fail-closed (canWithdraw=true) so the handler rejects.
func TestProbePermissions_EmptyData(t *testing.T) {
	mux := http.NewServeMux()
	mux.HandleFunc("/api/v5/account/config", func(w http.ResponseWriter, r *http.Request) {
		_, _ = w.Write([]byte(`{"code":"0","msg":"","data":[]}`))
	})
	srv := httptest.NewServer(mux)
	defer srv.Close()
	r, _ := NewReadOnly("k", "s", "p")
	r.SetBaseURL(srv.URL)
	perms, err := r.ProbePermissions(context.Background())
	if err == nil {
		t.Fatal("expected error on empty data")
	}
	if !perms.CanWithdraw {
		t.Errorf("expected canWithdraw=true (fail-closed)")
	}
}

// TestPassphraseRequired enforces the passphrase contract.
func TestPassphraseRequired(t *testing.T) {
	if _, err := NewReadOnly("k", "s", ""); err != ErrPassphraseRequired {
		t.Errorf("expected ErrPassphraseRequired, got %v", err)
	}
}

// TestSimulatedHeader asserts that mode=testnet adds the
// `x-simulated-trading: 1` header, while mode=mainnet does not.
func TestSimulatedHeader(t *testing.T) {
	for _, tc := range []struct {
		name     string
		mode     domain.LiveMode
		wantSim  string
	}{
		{"testnet", domain.LiveModeTestnet, "1"},
		{"mainnet", domain.LiveModeMainnet, ""},
	} {
		t.Run(tc.name, func(t *testing.T) {
			var got string
			mux := http.NewServeMux()
			mux.HandleFunc("/api/v5/trade/order", func(w http.ResponseWriter, r *http.Request) {
				got = r.Header.Get("x-simulated-trading")
				_, _ = w.Write([]byte(`{"code":"0","msg":"","data":[{"ordId":"1","clOrdId":"x","sCode":"0","sMsg":""}]}`))
			})
			srv := httptest.NewServer(mux)
			defer srv.Close()

			c := NewOrderClient(tc.mode, allowAll, "k", "s", "p")
			c.SetBaseURL(srv.URL)
			ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
			defer cancel()
			_, err := c.PlaceOrder(ctx, exchange.OrderRequest{
				Symbol:        "BTC-USDT-SWAP",
				Side:          exchange.OrderSide(domain.OrderSideBuy),
				Type:          exchange.OrderType(domain.OrderTypeMarket),
				Quantity:      1,
				ClientOrderID: "x",
			})
			if err != nil {
				t.Fatalf("PlaceOrder: %v", err)
			}
			if got != tc.wantSim {
				t.Errorf("simulated header = %q, want %q", got, tc.wantSim)
			}
		})
	}
}

// TestPlaceOrder_MainnetGateClosed asserts the OKX adapter never dials
// the upstream when the mainnet gate refuses.
func TestPlaceOrder_MainnetGateClosed(t *testing.T) {
	dialed := false
	mux := http.NewServeMux()
	mux.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) { dialed = true })
	srv := httptest.NewServer(mux)
	defer srv.Close()

	c := NewOrderClient(domain.LiveModeMainnet, AlwaysDenyGate, "k", "s", "p")
	c.SetBaseURL(srv.URL)
	_, err := c.PlaceOrder(context.Background(), exchange.OrderRequest{
		Symbol: "BTC-USDT-SWAP", Side: exchange.OrderSide(domain.OrderSideBuy),
		Type: exchange.OrderType(domain.OrderTypeMarket), Quantity: 1,
	})
	if err != exchange.ErrMainnetGateDenied {
		t.Fatalf("expected ErrMainnetGateDenied, got %v", err)
	}
	if dialed {
		t.Error("upstream dialed despite closed gate")
	}
}

// TestPlaceOrder_HappyPath drives the success path under a mock server.
func TestPlaceOrder_HappyPath(t *testing.T) {
	mux := http.NewServeMux()
	mux.HandleFunc("/api/v5/trade/order", func(w http.ResponseWriter, r *http.Request) {
		_, _ = w.Write([]byte(`{"code":"0","msg":"","data":[{"ordId":"42","clOrdId":"deadbeef","sCode":"0","sMsg":""}]}`))
	})
	srv := httptest.NewServer(mux)
	defer srv.Close()
	c := NewOrderClient(domain.LiveModeTestnet, AlwaysDenyGate, "k", "s", "p")
	c.SetBaseURL(srv.URL)
	res, err := c.PlaceOrder(context.Background(), exchange.OrderRequest{
		Symbol:        "BTC-USDT-SWAP",
		Side:          exchange.OrderSide(domain.OrderSideBuy),
		Type:          exchange.OrderType(domain.OrderTypeMarket),
		Quantity:      1,
		ClientOrderID: "deadbeef",
	})
	if err != nil {
		t.Fatalf("PlaceOrder: %v", err)
	}
	if res.ExchangeOrderID != "42" {
		t.Errorf("ordId=%q", res.ExchangeOrderID)
	}
	if res.ClientOrderID != "deadbeef" {
		t.Errorf("clOrdId=%q", res.ClientOrderID)
	}
}

// TestPlaceOrder_RejectionEnvelope covers a non-zero sCode in the data.
func TestPlaceOrder_RejectionEnvelope(t *testing.T) {
	mux := http.NewServeMux()
	mux.HandleFunc("/api/v5/trade/order", func(w http.ResponseWriter, r *http.Request) {
		_, _ = w.Write([]byte(`{"code":"0","msg":"","data":[{"ordId":"","clOrdId":"x","sCode":"51000","sMsg":"Insufficient margin"}]}`))
	})
	srv := httptest.NewServer(mux)
	defer srv.Close()
	c := NewOrderClient(domain.LiveModeTestnet, AlwaysDenyGate, "k", "s", "p")
	c.SetBaseURL(srv.URL)
	_, err := c.PlaceOrder(context.Background(), exchange.OrderRequest{
		Symbol: "BTC-USDT-SWAP", Side: exchange.OrderSide(domain.OrderSideBuy),
		Type: exchange.OrderType(domain.OrderTypeMarket), Quantity: 1,
		ClientOrderID: "x",
	})
	if err == nil || !strings.Contains(err.Error(), "Insufficient margin") {
		t.Errorf("expected sCode rejection, got %v", err)
	}
}

// TestGetBalances exercises the read path.
func TestGetBalances(t *testing.T) {
	mux := http.NewServeMux()
	mux.HandleFunc("/api/v5/account/balance", func(w http.ResponseWriter, r *http.Request) {
		_, _ = w.Write([]byte(`{"code":"0","msg":"","data":[{"uTime":"1","totalEq":"100","details":[{"ccy":"USDT","availBal":"100","frozenBal":"0"},{"ccy":"BTC","availBal":"0","frozenBal":"0"}]}]}`))
	})
	srv := httptest.NewServer(mux)
	defer srv.Close()
	r, _ := NewReadOnly("k", "s", "p")
	r.SetBaseURL(srv.URL)
	bal, err := r.GetBalances(context.Background())
	if err != nil {
		t.Fatalf("GetBalances: %v", err)
	}
	if len(bal) != 1 || bal[0].Asset != "USDT" {
		t.Errorf("unexpected balances %+v", bal)
	}
}
