package binance

import (
	"context"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/finance_next/gateway/internal/domain"
)

// allowAll is a MainnetGate that always says yes — used to exercise the
// happy mainnet path under a mocked HTTP server. Pairs with
// `SetFuturesEndpoint(srv.URL)`. We don't use this against a real host.
var allowAll = MainnetGateFunc(func() bool { return true })

func newMockOrderServer(handler http.Handler) (*httptest.Server, *OrderClient) {
	srv := httptest.NewServer(handler)
	c := NewOrderClient(domain.LiveModeTestnet, AlwaysDenyGate, "k", "s")
	c.SetFuturesEndpoint(srv.URL)
	return srv, c
}

// TestNewOrderClient_PinsTestnetURL verifies the constructor pins the
// futures BaseURL to the testnet host when mode=testnet.
func TestNewOrderClient_PinsTestnetURL(t *testing.T) {
	c := NewOrderClient(domain.LiveModeTestnet, AlwaysDenyGate, "k", "s")
	if c.futures.BaseURL != TestnetFuturesREST {
		t.Errorf("expected testnet base URL %q, got %q", TestnetFuturesREST, c.futures.BaseURL)
	}
	if c.network != "testnet" {
		t.Errorf("expected network=testnet, got %q", c.network)
	}
}

// TestNewOrderClient_MainnetMode pins to mainnet host (but the gate still
// blocks calls — the URL is just for inspection).
func TestNewOrderClient_MainnetMode(t *testing.T) {
	c := NewOrderClient(domain.LiveModeMainnet, AlwaysDenyGate, "k", "s")
	if c.futures.BaseURL != MainnetFuturesREST {
		t.Errorf("expected mainnet base URL %q, got %q", MainnetFuturesREST, c.futures.BaseURL)
	}
}

// TestPlaceOrder_Testnet_HappyPath uses a mock futures server.
func TestPlaceOrder_Testnet_HappyPath(t *testing.T) {
	mux := http.NewServeMux()
	mux.HandleFunc("/fapi/v1/order", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		// Echo a typical RESULT-shape response. The mock doesn't care about
		// the signed query — go-binance is satisfied as long as we return
		// 200 + a parseable body.
		_, _ = w.Write([]byte(`{
			"clientOrderId":"abcdef0123456789abcdef0123456789",
			"orderId":1234567,
			"symbol":"BTCUSDT",
			"executedQty":"0.001",
			"avgPrice":"50000.5",
			"status":"FILLED",
			"updateTime":1700000000000
		}`))
	})
	srv, c := newMockOrderServer(mux)
	defer srv.Close()

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	res, err := c.PlaceOrder(ctx, OrderRequest{
		Symbol:        "BTCUSDT",
		Side:          domain.OrderSideBuy,
		Type:          domain.OrderTypeMarket,
		Quantity:      0.001,
		ClientOrderID: "abcdef0123456789abcdef0123456789",
	})
	if err != nil {
		t.Fatalf("PlaceOrder: %v", err)
	}
	if res.Status != domain.OrderStatusFilled {
		t.Errorf("expected status filled, got %q", res.Status)
	}
	if res.ExchangeOrderID != "1234567" {
		t.Errorf("expected exchangeOrderId=1234567, got %q", res.ExchangeOrderID)
	}
	if res.AvgFillPrice != 50000.5 {
		t.Errorf("expected avgFillPrice=50000.5, got %v", res.AvgFillPrice)
	}
}

// TestPlaceOrder_Rejected_InsufficientMargin maps a Binance rejection
// onto a Go error. Binance returns 400 + a JSON `{"code":-2019,"msg":...}`
// body for these.
func TestPlaceOrder_Rejected_InsufficientMargin(t *testing.T) {
	mux := http.NewServeMux()
	mux.HandleFunc("/fapi/v1/order", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusBadRequest)
		_, _ = w.Write([]byte(`{"code":-2019,"msg":"Margin is insufficient."}`))
	})
	srv, c := newMockOrderServer(mux)
	defer srv.Close()

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	_, err := c.PlaceOrder(ctx, OrderRequest{
		Symbol:   "BTCUSDT",
		Side:     domain.OrderSideBuy,
		Type:     domain.OrderTypeMarket,
		Quantity: 1000,
	})
	if err == nil {
		t.Fatal("expected error, got nil")
	}
	if !strings.Contains(err.Error(), "Margin is insufficient") && !strings.Contains(err.Error(), "-2019") {
		t.Errorf("expected margin-error message in %q", err.Error())
	}
}

// TestPlaceOrder_UnknownSymbol covers the "-1121 Invalid symbol" path.
func TestPlaceOrder_UnknownSymbol(t *testing.T) {
	mux := http.NewServeMux()
	mux.HandleFunc("/fapi/v1/order", func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusBadRequest)
		_, _ = w.Write([]byte(`{"code":-1121,"msg":"Invalid symbol."}`))
	})
	srv, c := newMockOrderServer(mux)
	defer srv.Close()

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	_, err := c.PlaceOrder(ctx, OrderRequest{
		Symbol: "DOESNOTEXIST", Side: domain.OrderSideBuy,
		Type: domain.OrderTypeMarket, Quantity: 1,
	})
	if err == nil {
		t.Fatal("expected error, got nil")
	}
}

// TestPlaceOrder_MainnetGateClosed asserts the mainnet path is closed when
// the gate refuses, *without* hitting the network at all.
func TestPlaceOrder_MainnetGateClosed(t *testing.T) {
	dialed := false
	mux := http.NewServeMux()
	mux.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
		dialed = true
	})
	srv := httptest.NewServer(mux)
	defer srv.Close()

	c := NewOrderClient(domain.LiveModeMainnet, AlwaysDenyGate, "k", "s")
	// Even after pointing the client at a local server, the gate must
	// short-circuit before any HTTP call.
	c.SetFuturesEndpoint(srv.URL)

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	_, err := c.PlaceOrder(ctx, OrderRequest{
		Symbol: "BTCUSDT", Side: domain.OrderSideBuy,
		Type: domain.OrderTypeMarket, Quantity: 0.001,
	})
	if err == nil {
		t.Fatal("expected ErrMainnetGateDenied, got nil")
	}
	if err != ErrMainnetGateDenied {
		t.Fatalf("expected ErrMainnetGateDenied, got %v", err)
	}
	if dialed {
		t.Error("upstream server was contacted despite gate being closed")
	}
}

// TestPlaceOrder_MainnetGateOpenAllowsCall uses an open gate + a mock
// httptest server to demonstrate the *only* path that lets a mainnet
// call through. The verifier should walk this test alongside
// TestPlaceOrder_MainnetGateClosed.
func TestPlaceOrder_MainnetGateOpenAllowsCall(t *testing.T) {
	mux := http.NewServeMux()
	mux.HandleFunc("/fapi/v1/order", func(w http.ResponseWriter, r *http.Request) {
		_, _ = w.Write([]byte(`{
			"clientOrderId":"x","orderId":1,"symbol":"BTCUSDT",
			"executedQty":"0","avgPrice":"0","status":"NEW","updateTime":1700000000000
		}`))
	})
	srv := httptest.NewServer(mux)
	defer srv.Close()
	c := NewOrderClient(domain.LiveModeMainnet, allowAll, "k", "s")
	c.SetFuturesEndpoint(srv.URL)

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	_, err := c.PlaceOrder(ctx, OrderRequest{
		Symbol: "BTCUSDT", Side: domain.OrderSideBuy,
		Type: domain.OrderTypeMarket, Quantity: 0.001,
		ClientOrderID: "x",
	})
	if err != nil {
		t.Fatalf("expected success when gate open, got %v", err)
	}
}

// TestPlaceOrder_LimitRequiresPrice verifies the input validation guards.
func TestPlaceOrder_LimitRequiresPrice(t *testing.T) {
	c := NewOrderClient(domain.LiveModeTestnet, AlwaysDenyGate, "k", "s")
	_, err := c.PlaceOrder(context.Background(), OrderRequest{
		Symbol: "BTCUSDT", Side: domain.OrderSideBuy,
		Type: domain.OrderTypeLimit, Quantity: 0.1,
	})
	if err == nil {
		t.Fatal("expected error for LIMIT without price")
	}
}

// TestPlaceOrder_ClientOrderIDLength enforces the Binance 36-char cap.
func TestPlaceOrder_ClientOrderIDLength(t *testing.T) {
	c := NewOrderClient(domain.LiveModeTestnet, AlwaysDenyGate, "k", "s")
	_, err := c.PlaceOrder(context.Background(), OrderRequest{
		Symbol: "BTCUSDT", Side: domain.OrderSideBuy,
		Type: domain.OrderTypeMarket, Quantity: 0.1,
		ClientOrderID: strings.Repeat("a", 64),
	})
	if err == nil {
		t.Fatal("expected error for >36-char clientOrderId")
	}
}

// TestCancelOrder_Testnet exercises the cancel path with a mock server.
func TestCancelOrder_Testnet(t *testing.T) {
	mux := http.NewServeMux()
	mux.HandleFunc("/fapi/v1/order", func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodDelete {
			t.Errorf("expected DELETE, got %s", r.Method)
		}
		_, _ = w.Write([]byte(`{
			"clientOrderId":"x","orderId":1,"symbol":"BTCUSDT",
			"status":"CANCELED","updateTime":1700000000000,
			"cumQty":"0","cumQuote":"0","executedQty":"0","origQty":"0.001",
			"price":"0","reduceOnly":false,"side":"BUY","stopPrice":"0",
			"timeInForce":"GTC","type":"MARKET","workingType":"CONTRACT_PRICE",
			"activatePrice":"0","priceRate":"0","origType":"MARKET",
			"positionSide":"BOTH","priceProtect":false,"selfTradePreventionMode":"NONE"
		}`))
	})
	srv, c := newMockOrderServer(mux)
	defer srv.Close()

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	if err := c.CancelOrder(ctx, "BTCUSDT", "x"); err != nil {
		t.Fatalf("CancelOrder: %v", err)
	}
}

// TestGetOpenOrders_Testnet exercises the reconcile-loop read path.
func TestGetOpenOrders_Testnet(t *testing.T) {
	mux := http.NewServeMux()
	mux.HandleFunc("/fapi/v1/openOrders", func(w http.ResponseWriter, r *http.Request) {
		_, _ = w.Write([]byte(`[
			{"symbol":"BTCUSDT","clientOrderId":"a","orderId":1,
			 "executedQty":"0","avgPrice":"0","status":"NEW","updateTime":1700000000000,
			 "price":"0","reduceOnly":false,"origQty":"0.001","side":"BUY","stopPrice":"0",
			 "timeInForce":"GTC","type":"LIMIT","origType":"LIMIT","positionSide":"BOTH",
			 "workingType":"CONTRACT_PRICE","activatePrice":"0","priceRate":"0",
			 "priceProtect":false,"closePosition":false,"selfTradePreventionMode":"NONE",
			 "priceMatch":"NONE","goodTillDate":0,"cumQty":"0","cumQuote":"0","time":1700000000000}
		]`))
	})
	srv, c := newMockOrderServer(mux)
	defer srv.Close()

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	out, err := c.GetOpenOrders(ctx, "BTCUSDT")
	if err != nil {
		t.Fatalf("GetOpenOrders: %v", err)
	}
	if len(out) != 1 || out[0].ClientOrderID != "a" {
		t.Errorf("unexpected open orders: %#v", out)
	}
}

// TestMapStatus covers the ordering-of-cases — important because Binance
// occasionally introduces new statuses that we should funnel to "unknown".
func TestMapStatus(t *testing.T) {
	cases := map[string]domain.OrderStatus{
		"NEW":              domain.OrderStatusNew,
		"PARTIALLY_FILLED": domain.OrderStatusPartial,
		"FILLED":           domain.OrderStatusFilled,
		"CANCELED":         domain.OrderStatusCanceled,
		"EXPIRED":          domain.OrderStatusCanceled,
		"REJECTED":         domain.OrderStatusRejected,
		"BRANDNEW":         domain.OrderStatusUnknown,
	}
	for in, want := range cases {
		if got := mapStatus(in); got != want {
			t.Errorf("mapStatus(%q) = %q, want %q", in, got, want)
		}
	}
}
