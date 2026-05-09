package bybit

import (
	"context"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/finance_next/gateway/internal/domain"
	"github.com/finance_next/gateway/internal/exchange"
)

var allowAll = MainnetGateFunc(func() bool { return true })

// TestSign_Length verifies HMAC-SHA256 hex output length (64).
func TestSign_Length(t *testing.T) {
	got := sign("secret", "1700000000000", "key", "5000", "")
	if len(got) != 64 {
		t.Errorf("expected 64-char hex sig, got %d", len(got))
	}
}

// TestProbePermissions_NoWithdraw — read+trade key.
func TestProbePermissions_NoWithdraw(t *testing.T) {
	mux := http.NewServeMux()
	mux.HandleFunc("/v5/user/query-api", func(w http.ResponseWriter, r *http.Request) {
		_, _ = w.Write([]byte(`{"retCode":0,"retMsg":"OK","result":{"id":"1","permissions":{"ContractTrade":["Order"],"Spot":["SpotTrade"],"Wallet":[]}}}`))
	})
	srv := httptest.NewServer(mux)
	defer srv.Close()
	r := NewReadOnly("k", "s")
	r.SetBaseURL(srv.URL)
	perms, err := r.ProbePermissions(context.Background())
	if err != nil {
		t.Fatalf("ProbePermissions: %v", err)
	}
	if perms.CanWithdraw {
		t.Errorf("unexpected canWithdraw=true")
	}
	if !perms.CanTrade {
		t.Errorf("expected canTrade=true")
	}
}

// TestProbePermissions_WithdrawFlag — Wallet contains a Withdraw entry.
func TestProbePermissions_WithdrawFlag(t *testing.T) {
	mux := http.NewServeMux()
	mux.HandleFunc("/v5/user/query-api", func(w http.ResponseWriter, r *http.Request) {
		_, _ = w.Write([]byte(`{"retCode":0,"retMsg":"OK","result":{"id":"1","permissions":{"ContractTrade":["Order"],"Wallet":["AccountTransfer","WithdrawApply"]}}}`))
	})
	srv := httptest.NewServer(mux)
	defer srv.Close()
	r := NewReadOnly("k", "s")
	r.SetBaseURL(srv.URL)
	perms, err := r.ProbePermissions(context.Background())
	if err != nil {
		t.Fatalf("ProbePermissions: %v", err)
	}
	if !perms.CanWithdraw {
		t.Errorf("expected canWithdraw=true (Wallet has WithdrawApply)")
	}
}

// TestProbePermissions_FailClosed — network failure → canWithdraw=true.
func TestProbePermissions_FailClosed(t *testing.T) {
	mux := http.NewServeMux()
	mux.HandleFunc("/v5/user/query-api", func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(500)
		_, _ = w.Write([]byte(`{"retCode":10001,"retMsg":"down","result":{}}`))
	})
	srv := httptest.NewServer(mux)
	defer srv.Close()
	r := NewReadOnly("k", "s")
	r.SetBaseURL(srv.URL)
	perms, err := r.ProbePermissions(context.Background())
	if err == nil {
		t.Fatal("expected error from failing probe")
	}
	if !perms.CanWithdraw {
		t.Errorf("fail-closed: expected canWithdraw=true on probe failure")
	}
}

// TestProbePermissions_EmptyPermissions also fails closed.
func TestProbePermissions_EmptyPermissions(t *testing.T) {
	mux := http.NewServeMux()
	mux.HandleFunc("/v5/user/query-api", func(w http.ResponseWriter, r *http.Request) {
		_, _ = w.Write([]byte(`{"retCode":0,"retMsg":"OK","result":{"id":"1","permissions":{}}}`))
	})
	srv := httptest.NewServer(mux)
	defer srv.Close()
	r := NewReadOnly("k", "s")
	r.SetBaseURL(srv.URL)
	perms, err := r.ProbePermissions(context.Background())
	if err == nil {
		t.Fatal("expected error on empty permissions")
	}
	if !perms.CanWithdraw {
		t.Errorf("expected canWithdraw=true (fail-closed)")
	}
}

// TestPlaceOrder_Mainnet_GateClosed — no upstream contact when gate
// refuses. Uses a custom mux to detect dial.
func TestPlaceOrder_Mainnet_GateClosed(t *testing.T) {
	dialed := false
	mux := http.NewServeMux()
	mux.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) { dialed = true })
	srv := httptest.NewServer(mux)
	defer srv.Close()

	c := NewOrderClient(domain.LiveModeMainnet, AlwaysDenyGate, "k", "s")
	c.SetBaseURL(srv.URL)
	_, err := c.PlaceOrder(context.Background(), exchange.OrderRequest{
		Symbol: "BTCUSDT", Side: exchange.OrderSide(domain.OrderSideBuy),
		Type: exchange.OrderType(domain.OrderTypeMarket), Quantity: 1,
	})
	if err != exchange.ErrMainnetGateDenied {
		t.Fatalf("expected ErrMainnetGateDenied, got %v", err)
	}
	if dialed {
		t.Error("dialed despite closed gate")
	}
}

// TestPlaceOrder_Testnet_HappyPath uses a mock server.
func TestPlaceOrder_Testnet_HappyPath(t *testing.T) {
	mux := http.NewServeMux()
	mux.HandleFunc("/v5/order/create", func(w http.ResponseWriter, r *http.Request) {
		_, _ = w.Write([]byte(`{"retCode":0,"retMsg":"OK","result":{"orderId":"42","orderLinkId":"deadbeef"}}`))
	})
	srv := httptest.NewServer(mux)
	defer srv.Close()
	c := NewOrderClient(domain.LiveModeTestnet, AlwaysDenyGate, "k", "s")
	c.SetBaseURL(srv.URL)
	res, err := c.PlaceOrder(context.Background(), exchange.OrderRequest{
		Symbol:        "BTCUSDT",
		Side:          exchange.OrderSide(domain.OrderSideBuy),
		Type:          exchange.OrderType(domain.OrderTypeMarket),
		Quantity:      1,
		ClientOrderID: "deadbeef",
	})
	if err != nil {
		t.Fatalf("PlaceOrder: %v", err)
	}
	if res.ExchangeOrderID != "42" {
		t.Errorf("orderId=%q", res.ExchangeOrderID)
	}
}

// TestPlaceOrder_RetCodeError covers the v5 envelope rejection path.
func TestPlaceOrder_RetCodeError(t *testing.T) {
	mux := http.NewServeMux()
	mux.HandleFunc("/v5/order/create", func(w http.ResponseWriter, r *http.Request) {
		_, _ = w.Write([]byte(`{"retCode":110007,"retMsg":"Insufficient balance","result":{}}`))
	})
	srv := httptest.NewServer(mux)
	defer srv.Close()
	c := NewOrderClient(domain.LiveModeTestnet, AlwaysDenyGate, "k", "s")
	c.SetBaseURL(srv.URL)
	_, err := c.PlaceOrder(context.Background(), exchange.OrderRequest{
		Symbol: "BTCUSDT", Side: exchange.OrderSide(domain.OrderSideBuy),
		Type: exchange.OrderType(domain.OrderTypeMarket), Quantity: 1,
		ClientOrderID: "x",
	})
	if err == nil || !strings.Contains(err.Error(), "Insufficient balance") {
		t.Errorf("expected retCode rejection, got %v", err)
	}
}

// TestNewOrderClient_PinsTestnet verifies testnet/mainnet host selection.
func TestNewOrderClient_PinsTestnet(t *testing.T) {
	c := NewOrderClient(domain.LiveModeTestnet, AlwaysDenyGate, "k", "s")
	if c.c.baseURL != TestnetREST {
		t.Errorf("expected %s, got %s", TestnetREST, c.c.baseURL)
	}
	if c.network != "testnet" {
		t.Errorf("expected network=testnet, got %s", c.network)
	}
	c2 := NewOrderClient(domain.LiveModeMainnet, allowAll, "k", "s")
	if c2.c.baseURL != MainnetREST {
		t.Errorf("expected %s, got %s", MainnetREST, c2.c.baseURL)
	}
}
