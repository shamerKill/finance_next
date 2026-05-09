// orders.go — Phase 5 Bybit order-placement adapter.
//
// CRITICAL SECURITY CONTRACT (mirrored from binance/orders.go and okx/orders.go)
// =============================================================================
// All order methods return [exchange.ErrMainnetGateDenied] unless the
// usual three switches align: live mode mainnet + env enabled + token
// confirmed. The order engine wires the SAME [orderengine.TokenStore]
// across all three exchanges — opening it opens it for every venue.
//
// On testnet (LiveModeTestnet) the underlying [Client] is repointed at
// the public Bybit testnet host (`api-testnet.bybit.com`); demo keys
// are issued separately on the Bybit testnet dashboard.
package bybit

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
// binance.MainnetGate / okx.MainnetGate.
type MainnetGate interface {
	MainnetAllowed() bool
}

// MainnetGateFunc adapts a plain function into a MainnetGate.
type MainnetGateFunc func() bool

// MainnetAllowed implements [MainnetGate].
func (f MainnetGateFunc) MainnetAllowed() bool { return f() }

// AlwaysDenyGate is the safe default — fail closed.
var AlwaysDenyGate MainnetGate = MainnetGateFunc(func() bool { return false })

// OrderClient places, cancels, and inspects Bybit linear-perp orders.
type OrderClient struct {
	mode    domain.LiveMode
	gate    MainnetGate
	c       *Client
	network string
}

// NewOrderClient constructs a Bybit order client. mode=testnet pins the
// host to api-testnet.bybit.com; mode=mainnet pins to api.bybit.com but
// the gate must allow before any call escapes the process.
func NewOrderClient(mode domain.LiveMode, gate MainnetGate, apiKey, secretKey string) *OrderClient {
	if !mode.IsValid() {
		mode = domain.LiveModeTestnet
	}
	if gate == nil {
		gate = AlwaysDenyGate
	}
	c := NewClient(apiKey, secretKey)
	oc := &OrderClient{mode: mode, gate: gate, c: c}
	switch mode {
	case domain.LiveModeMainnet:
		c.SetBaseURL(MainnetREST)
		oc.network = "mainnet"
	default:
		c.SetBaseURL(TestnetREST)
		oc.network = "testnet"
	}
	return oc
}

// SetBaseURL forwards to the transport for httptest mocking.
func (c *OrderClient) SetBaseURL(u string) { c.c.SetBaseURL(u) }

// Mode returns the network the adapter is pinned to.
func (c *OrderClient) Mode() domain.LiveMode { return c.mode }

// guard enforces the mainnet-gate contract.
func (c *OrderClient) guard() error {
	if c.mode == domain.LiveModeMainnet && !c.gate.MainnetAllowed() {
		return exchange.ErrMainnetGateDenied
	}
	return nil
}

// PlaceOrder posts /v5/order/create with category=linear.
func (c *OrderClient) PlaceOrder(ctx context.Context, req exchange.OrderRequest) (*exchange.OrderResult, error) {
	if err := c.guard(); err != nil {
		return nil, err
	}
	dSide := domain.OrderSide(req.Side)
	dType := domain.OrderType(req.Type)
	if !dSide.IsValid() {
		return nil, fmt.Errorf("bybit: unsupported side %q", req.Side)
	}
	if !dType.IsValid() {
		return nil, fmt.Errorf("bybit: unsupported type %q", req.Type)
	}
	if req.Quantity <= 0 {
		return nil, errors.New("bybit: quantity must be > 0")
	}
	if len(req.ClientOrderID) > 36 {
		return nil, fmt.Errorf("bybit: orderLinkId must be <=36 chars (got %d)", len(req.ClientOrderID))
	}
	body := map[string]any{
		"category":  "linear",
		"symbol":    req.Symbol,
		"side":      capitalise(strings.ToLower(string(req.Side))), // "Buy"/"Sell"
		"orderType": orderTypeToBybit(dType),
		"qty":       strconv.FormatFloat(req.Quantity, 'f', -1, 64),
	}
	if req.ClientOrderID != "" {
		body["orderLinkId"] = req.ClientOrderID
	}
	if dType == domain.OrderTypeLimit {
		if req.Price <= 0 {
			return nil, errors.New("bybit: LIMIT requires price > 0")
		}
		body["price"] = strconv.FormatFloat(req.Price, 'f', -1, 64)
		body["timeInForce"] = "GTC"
	}
	if req.ReduceOnly {
		body["reduceOnly"] = true
	}
	var resp createOrderResp
	raw, err := c.c.signedDo(ctx, "POST", "/v5/order/create", body, &resp)
	if err != nil {
		return nil, err
	}
	return &exchange.OrderResult{
		ExchangeOrderID: resp.OrderID,
		ClientOrderID:   resp.OrderLinkID,
		Status:          exchange.OrderStatus(domain.OrderStatusNew),
		ExecutedQty:     0,
		AvgFillPrice:    0,
		TransactTime:    time.Now().UTC(),
		Raw:             json.RawMessage(raw),
	}, nil
}

// CancelOrder posts /v5/order/cancel by orderLinkId.
func (c *OrderClient) CancelOrder(ctx context.Context, symbol, clientOrderID string) error {
	if err := c.guard(); err != nil {
		return err
	}
	if symbol == "" || clientOrderID == "" {
		return errors.New("bybit: symbol + clientOrderId required")
	}
	body := map[string]any{
		"category":    "linear",
		"symbol":      symbol,
		"orderLinkId": clientOrderID,
	}
	if _, err := c.c.signedDo(ctx, "POST", "/v5/order/cancel", body, nil); err != nil {
		return err
	}
	return nil
}

// GetOpenOrders maps to /v5/order/realtime?category=linear.
func (c *OrderClient) GetOpenOrders(ctx context.Context, symbol string) ([]exchange.OpenOrder, error) {
	if err := c.guard(); err != nil {
		return nil, err
	}
	path := "/v5/order/realtime?category=linear"
	if symbol != "" {
		path += "&symbol=" + symbol
	}
	var resp realtimeOrdersResp
	if _, err := c.c.signedDo(ctx, "GET", path, nil, &resp); err != nil {
		return nil, err
	}
	out := make([]exchange.OpenOrder, 0, len(resp.List))
	for _, r := range resp.List {
		out = append(out, openOrderFromList(r))
	}
	return out, nil
}

// GetOrder maps to /v5/order/realtime with orderLinkId — returns the
// single matching row.
func (c *OrderClient) GetOrder(ctx context.Context, symbol, clientOrderID string) (*exchange.OpenOrder, error) {
	if err := c.guard(); err != nil {
		return nil, err
	}
	if symbol == "" || clientOrderID == "" {
		return nil, errors.New("bybit: symbol + clientOrderId required")
	}
	path := "/v5/order/realtime?category=linear&symbol=" + symbol + "&orderLinkId=" + clientOrderID
	var resp realtimeOrdersResp
	if _, err := c.c.signedDo(ctx, "GET", path, nil, &resp); err != nil {
		return nil, err
	}
	if len(resp.List) == 0 {
		return nil, errors.New("bybit: order not found")
	}
	o := openOrderFromList(resp.List[0])
	return &o, nil
}

// orderTypeToBybit maps domain order type to the Bybit "orderType" field.
func orderTypeToBybit(t domain.OrderType) string {
	switch t {
	case domain.OrderTypeMarket:
		return "Market"
	case domain.OrderTypeLimit:
		return "Limit"
	}
	return "Market"
}

// mapStatus converts Bybit's `orderStatus` to the gateway lifecycle.
// Bybit values: New, PartiallyFilled, Filled, Cancelled, Rejected,
// PartiallyFilledCanceled, Deactivated, Triggered.
func mapStatus(s string) exchange.OrderStatus {
	switch strings.ToLower(s) {
	case "new":
		return exchange.OrderStatus(domain.OrderStatusNew)
	case "partiallyfilled":
		return exchange.OrderStatus(domain.OrderStatusPartial)
	case "filled":
		return exchange.OrderStatus(domain.OrderStatusFilled)
	case "cancelled", "canceled", "partiallyfilledcanceled", "deactivated":
		return exchange.OrderStatus(domain.OrderStatusCanceled)
	case "rejected":
		return exchange.OrderStatus(domain.OrderStatusRejected)
	}
	return exchange.OrderStatus(domain.OrderStatusUnknown)
}

func capitalise(s string) string {
	if s == "" {
		return s
	}
	return strings.ToUpper(s[:1]) + s[1:]
}

func openOrderFromList(r realtimeOrderRow) exchange.OpenOrder {
	exec, _ := strconv.ParseFloat(r.CumExecQty, 64)
	avg, _ := strconv.ParseFloat(r.AvgPrice, 64)
	ts, _ := strconv.ParseInt(r.UpdatedTime, 10, 64)
	return exchange.OpenOrder{
		ClientOrderID:   r.OrderLinkID,
		ExchangeOrderID: r.OrderID,
		Symbol:          r.Symbol,
		Status:          mapStatus(r.OrderStatus),
		ExecutedQty:     exec,
		AvgFillPrice:    avg,
		UpdatedAt:       time.UnixMilli(ts).UTC(),
	}
}

// ---------------- wire types ----------------

type createOrderResp struct {
	OrderID     string `json:"orderId"`
	OrderLinkID string `json:"orderLinkId"`
}

type realtimeOrdersResp struct {
	Category string             `json:"category"`
	List     []realtimeOrderRow `json:"list"`
}

type realtimeOrderRow struct {
	Symbol      string `json:"symbol"`
	OrderID     string `json:"orderId"`
	OrderLinkID string `json:"orderLinkId"`
	OrderStatus string `json:"orderStatus"`
	CumExecQty  string `json:"cumExecQty"`
	AvgPrice    string `json:"avgPrice"`
	UpdatedTime string `json:"updatedTime"`
}
