// orders.go — Phase 5 OKX order-placement adapter.
//
// CRITICAL SECURITY CONTRACT (mirrored from binance/orders.go)
// ============================================================
// This adapter shares the *same* mainnet-gate semantics as the binance
// adapter: every order method returns [exchange.ErrMainnetGateDenied]
// unless ALL THREE of:
//
//  1. NewOrderClient was called with [domain.LiveModeMainnet], AND
//  2. The process env var `MAINNET_TRADING_ENABLED=true`, AND
//  3. The provided MainnetGate reports a confirmed token in memory.
//
// The order engine wires the *same* TokenStore for all three exchanges
// (binance / okx / bybit) — there is exactly one mainnet gate per
// process. Opening it opens it for every venue.
//
// On testnet (LiveModeTestnet) the underlying [Client] is constructed
// with `simulated=true` and adds the `x-simulated-trading: 1` header to
// every request — OKX's demo-trading discriminator (see client.go
// godoc).
package okx

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"strconv"
	"strings"
	"time"

	"github.com/finance_next/gateway/internal/domain"
	"github.com/finance_next/gateway/internal/exchange"
)

// MainnetGate decides whether mainnet calls are permitted. Mirrors
// binance.MainnetGate — kept as a separate type so the adapter doesn't
// import the binance package.
type MainnetGate interface {
	MainnetAllowed() bool
}

// MainnetGateFunc adapts a plain function into a MainnetGate.
type MainnetGateFunc func() bool

// MainnetAllowed implements [MainnetGate].
func (f MainnetGateFunc) MainnetAllowed() bool { return f() }

// AlwaysDenyGate is the safe default — fail closed when no real gate is
// wired.
var AlwaysDenyGate MainnetGate = MainnetGateFunc(func() bool { return false })

// OrderClient places, cancels, and inspects OKX SWAP orders. The
// underlying [Client] is per-instance so two adapters can target
// different networks (live + demo) without sharing global state.
type OrderClient struct {
	mode domain.LiveMode
	gate MainnetGate
	c    *Client
}

// NewOrderClient constructs an OKX order client. When mode=testnet the
// adapter is wired to OKX's demo trading via the `x-simulated-trading`
// header (see client.go). The mainnet path requires a non-deny gate.
func NewOrderClient(mode domain.LiveMode, gate MainnetGate, apiKey, secretKey, passphrase string) *OrderClient {
	if !mode.IsValid() {
		mode = domain.LiveModeTestnet
	}
	if gate == nil {
		gate = AlwaysDenyGate
	}
	simulated := mode == domain.LiveModeTestnet
	return &OrderClient{
		mode: mode,
		gate: gate,
		c:    NewClient(apiKey, secretKey, passphrase, simulated),
	}
}

// SetBaseURL forwards to the transport for httptest mocking.
func (c *OrderClient) SetBaseURL(u string) { c.c.SetBaseURL(u) }

// Mode returns the network the adapter is pinned to.
func (c *OrderClient) Mode() domain.LiveMode { return c.mode }

// guard enforces the mainnet-gate contract — same shape as the binance
// adapter so tests can assert identical behaviour across venues.
func (c *OrderClient) guard() error {
	if c.mode == domain.LiveModeMainnet && !c.gate.MainnetAllowed() {
		return exchange.ErrMainnetGateDenied
	}
	return nil
}

// PlaceOrder posts /api/v5/trade/order. OKX requires `instId`, `tdMode`
// ("cross"), `side`, `ordType`, `sz`. We pass the gateway-supplied
// clientOrderId as `clOrdId` so OKX's idempotency interlocks line up
// with ours.
func (c *OrderClient) PlaceOrder(ctx context.Context, req exchange.OrderRequest) (*exchange.OrderResult, error) {
	if err := c.guard(); err != nil {
		return nil, err
	}
	dSide := domain.OrderSide(req.Side)
	dType := domain.OrderType(req.Type)
	if !dSide.IsValid() {
		return nil, fmt.Errorf("okx: unsupported side %q", req.Side)
	}
	if !dType.IsValid() {
		return nil, fmt.Errorf("okx: unsupported type %q", req.Type)
	}
	if req.Quantity <= 0 {
		return nil, errors.New("okx: quantity must be > 0")
	}
	if len(req.ClientOrderID) > 32 {
		// OKX clOrdId limit is 32 chars (less than binance's 36).
		return nil, fmt.Errorf("okx: clOrdId must be <=32 chars (got %d)", len(req.ClientOrderID))
	}

	body := map[string]any{
		"instId":  req.Symbol,
		"tdMode":  "cross",
		"side":    strings.ToLower(string(req.Side)),
		"ordType": orderTypeToOKX(dType),
		"sz":      strconv.FormatFloat(req.Quantity, 'f', -1, 64),
	}
	if req.ClientOrderID != "" {
		body["clOrdId"] = req.ClientOrderID
	}
	if dType == domain.OrderTypeLimit {
		if req.Price <= 0 {
			return nil, errors.New("okx: LIMIT requires price > 0")
		}
		body["px"] = strconv.FormatFloat(req.Price, 'f', -1, 64)
	}
	if req.ReduceOnly {
		body["reduceOnly"] = true
	}

	var resp []orderResp
	raw, err := c.c.signedDo(ctx, "POST", "/api/v5/trade/order", body, &resp)
	if err != nil {
		return nil, err
	}
	if len(resp) == 0 {
		return nil, errors.New("okx: empty order response")
	}
	r := resp[0]
	if r.SCode != "0" {
		return nil, fmt.Errorf("okx: order rejected sCode=%s sMsg=%s", r.SCode, r.SMsg)
	}
	return &exchange.OrderResult{
		ExchangeOrderID: r.OrdID,
		ClientOrderID:   r.ClOrdID,
		// OKX's order-create response doesn't include status/qty — we
		// mark new and let the reconcile loop pick up fills via
		// orders-pending.
		Status:       exchange.OrderStatus(domain.OrderStatusNew),
		ExecutedQty:  0,
		AvgFillPrice: 0,
		TransactTime: time.Now().UTC(),
		Raw:          json.RawMessage(raw),
	}, nil
}

// CancelOrder posts /api/v5/trade/cancel-order with instId+clOrdId.
func (c *OrderClient) CancelOrder(ctx context.Context, symbol, clientOrderID string) error {
	if err := c.guard(); err != nil {
		return err
	}
	if symbol == "" || clientOrderID == "" {
		return errors.New("okx: symbol + clientOrderId required")
	}
	body := map[string]any{
		"instId":  symbol,
		"clOrdId": clientOrderID,
	}
	var resp []orderResp
	if _, err := c.c.signedDo(ctx, "POST", "/api/v5/trade/cancel-order", body, &resp); err != nil {
		return err
	}
	if len(resp) > 0 && resp[0].SCode != "0" {
		return fmt.Errorf("okx: cancel sCode=%s sMsg=%s", resp[0].SCode, resp[0].SMsg)
	}
	return nil
}

// GetOpenOrders maps to /api/v5/trade/orders-pending. OKX scopes by
// instId on the query string.
func (c *OrderClient) GetOpenOrders(ctx context.Context, symbol string) ([]exchange.OpenOrder, error) {
	if err := c.guard(); err != nil {
		return nil, err
	}
	path := "/api/v5/trade/orders-pending?instType=SWAP"
	if symbol != "" {
		path += "&instId=" + symbol
	}
	var resp []ordersPendingRow
	if _, err := c.c.signedDo(ctx, "GET", path, nil, &resp); err != nil {
		return nil, err
	}
	out := make([]exchange.OpenOrder, 0, len(resp))
	for _, r := range resp {
		out = append(out, openOrderFromPending(r))
	}
	return out, nil
}

// GetOrder maps to /api/v5/trade/order with instId+clOrdId.
func (c *OrderClient) GetOrder(ctx context.Context, symbol, clientOrderID string) (*exchange.OpenOrder, error) {
	if err := c.guard(); err != nil {
		return nil, err
	}
	if symbol == "" || clientOrderID == "" {
		return nil, errors.New("okx: symbol + clientOrderId required")
	}
	path := "/api/v5/trade/order?instId=" + symbol + "&clOrdId=" + clientOrderID
	var resp []ordersPendingRow
	if _, err := c.c.signedDo(ctx, "GET", path, nil, &resp); err != nil {
		return nil, err
	}
	if len(resp) == 0 {
		return nil, errors.New("okx: order not found")
	}
	o := openOrderFromPending(resp[0])
	return &o, nil
}

// orderTypeToOKX converts a domain order type to OKX's `ordType`.
func orderTypeToOKX(t domain.OrderType) string {
	switch t {
	case domain.OrderTypeMarket:
		return "market"
	case domain.OrderTypeLimit:
		return "limit"
	}
	return "market"
}

// mapStatus maps OKX state strings to the gateway's lifecycle. OKX
// reports `live`, `partially_filled`, `filled`, `canceled`.
func mapStatus(s string) exchange.OrderStatus {
	switch strings.ToLower(s) {
	case "live":
		return exchange.OrderStatus(domain.OrderStatusNew)
	case "partially_filled":
		return exchange.OrderStatus(domain.OrderStatusPartial)
	case "filled":
		return exchange.OrderStatus(domain.OrderStatusFilled)
	case "canceled", "cancelled":
		return exchange.OrderStatus(domain.OrderStatusCanceled)
	}
	return exchange.OrderStatus(domain.OrderStatusUnknown)
}

func openOrderFromPending(r ordersPendingRow) exchange.OpenOrder {
	exec, _ := strconv.ParseFloat(r.AccFillSz, 64)
	avg, _ := strconv.ParseFloat(r.AvgPx, 64)
	ts, _ := strconv.ParseInt(r.UTime, 10, 64)
	return exchange.OpenOrder{
		ClientOrderID:   r.ClOrdID,
		ExchangeOrderID: r.OrdID,
		Symbol:          r.InstID,
		Status:          mapStatus(r.State),
		ExecutedQty:     exec,
		AvgFillPrice:    avg,
		UpdatedAt:       time.UnixMilli(ts).UTC(),
	}
}

// ---------------- wire types ----------------

type orderResp struct {
	OrdID   string `json:"ordId"`
	ClOrdID string `json:"clOrdId"`
	SCode   string `json:"sCode"`
	SMsg    string `json:"sMsg"`
}

type ordersPendingRow struct {
	InstID    string `json:"instId"`
	OrdID     string `json:"ordId"`
	ClOrdID   string `json:"clOrdId"`
	State     string `json:"state"`
	AccFillSz string `json:"accFillSz"`
	AvgPx     string `json:"avgPx"`
	UTime     string `json:"uTime"`
}
