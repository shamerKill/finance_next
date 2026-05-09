// orders.go — Phase 4 USDM-futures order placement adapter.
//
// CRITICAL SECURITY CONTRACT
// ==========================
// This adapter defaults to Binance *testnet* endpoints. The mainnet code
// path is unreachable unless ALL THREE of:
//
//  1. The constructor is called with [domain.LiveModeMainnet], AND
//  2. The process env var `MAINNET_TRADING_ENABLED=true`, AND
//  3. The provided [MainnetGate] reports a confirmed token in memory.
//
// If any of these is missing, every order method returns
// [ErrMainnetGateDenied] and the underlying go-binance client is *never*
// dialed against the production host. The order engine layer also
// short-circuits before reaching here, so this is a defence-in-depth check
// — the verifier should be able to flip on each of the three switches in
// isolation and confirm that two-of-three never lets traffic through.
//
// The go-binance library exposes a global `binance.UseTestnet bool` that
// flips both spot and futures base URLs at construction time. We don't
// touch that global — instead we override `BaseURL` on the per-client
// instance so two adapters in the same process can target different
// networks (tests + sanity). The testnet endpoint constants below are
// the ones documented at https://binance-docs.github.io/apidocs/.
package binance

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"strconv"
	"strings"
	"time"

	gobinance "github.com/adshao/go-binance/v2"
	"github.com/adshao/go-binance/v2/futures"

	"github.com/finance_next/gateway/internal/domain"
)

// Public testnet endpoints (the *only* production-style hosts this adapter
// will dial unless the mainnet gate explicitly opens).
const (
	TestnetSpotREST    = "https://testnet.binance.vision"
	TestnetFuturesREST = "https://testnet.binancefuture.com"
	MainnetSpotREST    = "https://api.binance.com"
	MainnetFuturesREST = "https://fapi.binance.com"
)

// MainnetGate decides whether mainnet calls are permitted. The default
// implementation returned by [DefaultMainnetGate] reads
// `MAINNET_TRADING_ENABLED` once at construction and consults the
// supplied confirm-token store (see gateway/internal/orderengine).
type MainnetGate interface {
	// MainnetAllowed reports whether mainnet trading is currently enabled.
	// Implementations must return false unless BOTH the env var is set AND
	// a valid in-memory confirm token has been registered.
	MainnetAllowed() bool
}

// MainnetGateFunc adapts a plain function into a MainnetGate.
type MainnetGateFunc func() bool

// MainnetAllowed implements [MainnetGate].
func (f MainnetGateFunc) MainnetAllowed() bool { return f() }

// AlwaysDenyGate is the safe default when no gate has been wired. It is
// what the order engine uses if the operator forgot to plumb a real one
// — fail closed.
var AlwaysDenyGate MainnetGate = MainnetGateFunc(func() bool { return false })

// ErrMainnetGateDenied is returned when an order would target mainnet but
// the gate refuses (env unset or no confirm token).
var ErrMainnetGateDenied = errors.New("binance: mainnet trading not enabled (env + confirm token required)")

// ErrUnsupportedSide is returned when an OrderRequest carries a side we
// don't know how to send.
var ErrUnsupportedSide = errors.New("binance: unsupported order side")

// OrderClient places, cancels, and inspects USDM-futures orders. It is
// intentionally a sibling of the read-only [Client] in client.go — kept
// separate so the read-only dashboard path can keep its tighter
// permission contract.
type OrderClient struct {
	mode    domain.LiveMode
	gate    MainnetGate
	futures *futures.Client
	// network identifies which set of base URLs we're pinned to. Tests
	// override this via SetFuturesEndpoint.
	network string
}

// NewOrderClient constructs a new order client.
//
// `gate` is consulted lazily on every call (PlaceOrder/Cancel/etc.) so a
// confirm-token expiry mid-session immediately closes the gate. Pass
// [AlwaysDenyGate] when mode is [domain.LiveModeTestnet] for a
// belt-and-braces guarantee — the constructor still pins the BaseURL to
// the testnet endpoint regardless of gate state.
func NewOrderClient(mode domain.LiveMode, gate MainnetGate, apiKey, secretKey string) *OrderClient {
	if !mode.IsValid() {
		mode = domain.LiveModeTestnet
	}
	if gate == nil {
		gate = AlwaysDenyGate
	}
	c := &OrderClient{
		mode:    mode,
		gate:    gate,
		futures: futures.NewClient(apiKey, secretKey),
	}
	switch mode {
	case domain.LiveModeMainnet:
		c.futures.BaseURL = MainnetFuturesREST
		c.network = "mainnet"
	default:
		// Testnet (default). Pin the URL even though go-binance defaults
		// to mainnet — the adapter is unconditionally testnet-pointing
		// in this branch.
		c.futures.BaseURL = TestnetFuturesREST
		c.network = "testnet"
	}
	return c
}

// SetFuturesEndpoint overrides the futures REST base URL. Used by tests
// to point at httptest.NewServer.
func (c *OrderClient) SetFuturesEndpoint(u string) { c.futures.BaseURL = u }

// Mode returns the network the adapter is pinned to.
func (c *OrderClient) Mode() domain.LiveMode { return c.mode }

// guard enforces the mainnet-gate contract. Call this at the top of every
// public method that talks to the exchange.
func (c *OrderClient) guard() error {
	if c.mode == domain.LiveModeMainnet && !c.gate.MainnetAllowed() {
		return ErrMainnetGateDenied
	}
	return nil
}

// OrderRequest is the network-agnostic input to PlaceOrder.
type OrderRequest struct {
	Symbol        string
	Side          domain.OrderSide
	Type          domain.OrderType
	Quantity      float64
	Price         float64 // ignored for MARKET
	ClientOrderID string  // <=36 chars; deterministic upstream
	// ReduceOnly, if true, sets the futures reduce-only flag — used by
	// the engine when placing exit orders.
	ReduceOnly bool
}

// OrderResult is the normalised PlaceOrder response. We include the raw
// response so the caller can stash it on the audit log verbatim.
type OrderResult struct {
	ExchangeOrderID string
	ClientOrderID   string
	Status          domain.OrderStatus
	ExecutedQty     float64
	AvgFillPrice    float64
	TransactTime    time.Time
	Raw             json.RawMessage
}

// PlaceOrder sends a futures-USDM order and waits for the ack response
// (NewOrderRespType=RESULT — Binance returns whatever fills happened
// synchronously).
func (c *OrderClient) PlaceOrder(ctx context.Context, req OrderRequest) (*OrderResult, error) {
	if err := c.guard(); err != nil {
		return nil, err
	}
	if !req.Side.IsValid() {
		return nil, ErrUnsupportedSide
	}
	if !req.Type.IsValid() {
		return nil, fmt.Errorf("binance: unsupported order type %q", req.Type)
	}
	if req.Quantity <= 0 {
		return nil, errors.New("binance: quantity must be > 0")
	}
	if len(req.ClientOrderID) > 36 {
		return nil, fmt.Errorf("binance: clientOrderId must be <=36 chars (got %d)", len(req.ClientOrderID))
	}

	svc := c.futures.NewCreateOrderService().
		Symbol(req.Symbol).
		Side(futuresSide(req.Side)).
		Type(futuresType(req.Type)).
		Quantity(strconv.FormatFloat(req.Quantity, 'f', -1, 64)).
		NewOrderResponseType(futures.NewOrderRespTypeRESULT)
	if req.ClientOrderID != "" {
		svc = svc.NewClientOrderID(req.ClientOrderID)
	}
	if req.ReduceOnly {
		svc = svc.ReduceOnly(true)
	}
	if req.Type == domain.OrderTypeLimit {
		if req.Price <= 0 {
			return nil, errors.New("binance: LIMIT order requires price > 0")
		}
		svc = svc.Price(strconv.FormatFloat(req.Price, 'f', -1, 64)).
			TimeInForce(futures.TimeInForceTypeGTC)
	}

	resp, err := svc.Do(ctx)
	if err != nil {
		return nil, err
	}
	raw, _ := json.Marshal(resp)
	exec, _ := strconv.ParseFloat(resp.ExecutedQuantity, 64)
	avg, _ := strconv.ParseFloat(resp.AvgPrice, 64)
	return &OrderResult{
		ExchangeOrderID: strconv.FormatInt(resp.OrderID, 10),
		ClientOrderID:   resp.ClientOrderID,
		Status:          mapStatus(string(resp.Status)),
		ExecutedQty:     exec,
		AvgFillPrice:    avg,
		// UpdateTime is in milliseconds since epoch.
		TransactTime: time.UnixMilli(resp.UpdateTime).UTC(),
		Raw:          raw,
	}, nil
}

// CancelOrder cancels by clientOrderId (preferred — the gateway's
// idempotency key is the only guaranteed-stable identifier).
func (c *OrderClient) CancelOrder(ctx context.Context, symbol, clientOrderID string) error {
	if err := c.guard(); err != nil {
		return err
	}
	if symbol == "" || clientOrderID == "" {
		return errors.New("binance: symbol + clientOrderId required for cancel")
	}
	_, err := c.futures.NewCancelOrderService().
		Symbol(symbol).
		OrigClientOrderID(clientOrderID).
		Do(ctx)
	return err
}

// OpenOrder is the reconcile-loop view of an order — only the fields
// needed to diff against the local order_log.
type OpenOrder struct {
	ClientOrderID   string
	ExchangeOrderID string
	Symbol          string
	Status          domain.OrderStatus
	ExecutedQty     float64
	AvgFillPrice    float64
	UpdatedAt       time.Time
}

// GetOpenOrders returns all currently open futures orders for symbol. An
// empty symbol queries every symbol on the account (Binance allows both).
func (c *OrderClient) GetOpenOrders(ctx context.Context, symbol string) ([]OpenOrder, error) {
	if err := c.guard(); err != nil {
		return nil, err
	}
	svc := c.futures.NewListOpenOrdersService()
	if symbol != "" {
		svc = svc.Symbol(symbol)
	}
	out, err := svc.Do(ctx)
	if err != nil {
		return nil, err
	}
	res := make([]OpenOrder, 0, len(out))
	for _, o := range out {
		exec, _ := strconv.ParseFloat(o.ExecutedQuantity, 64)
		avg, _ := strconv.ParseFloat(o.AvgPrice, 64)
		res = append(res, OpenOrder{
			ClientOrderID:   o.ClientOrderID,
			ExchangeOrderID: strconv.FormatInt(o.OrderID, 10),
			Symbol:          o.Symbol,
			Status:          mapStatus(string(o.Status)),
			ExecutedQty:     exec,
			AvgFillPrice:    avg,
			UpdatedAt:       time.UnixMilli(o.UpdateTime).UTC(),
		})
	}
	return res, nil
}

// GetOrder fetches the canonical state for one order. Used by the
// reconcile loop when an open-order sweep doesn't surface a local order
// (the order may have terminated since the last sweep).
func (c *OrderClient) GetOrder(ctx context.Context, symbol, clientOrderID string) (*OpenOrder, error) {
	if err := c.guard(); err != nil {
		return nil, err
	}
	if symbol == "" || clientOrderID == "" {
		return nil, errors.New("binance: symbol + clientOrderId required")
	}
	o, err := c.futures.NewGetOrderService().
		Symbol(symbol).
		OrigClientOrderID(clientOrderID).
		Do(ctx)
	if err != nil {
		return nil, err
	}
	exec, _ := strconv.ParseFloat(o.ExecutedQuantity, 64)
	avg, _ := strconv.ParseFloat(o.AvgPrice, 64)
	return &OpenOrder{
		ClientOrderID:   o.ClientOrderID,
		ExchangeOrderID: strconv.FormatInt(o.OrderID, 10),
		Symbol:          o.Symbol,
		Status:          mapStatus(string(o.Status)),
		ExecutedQty:     exec,
		AvgFillPrice:    avg,
		UpdatedAt:       time.UnixMilli(o.UpdateTime).UTC(),
	}, nil
}

// futuresSide maps our domain side to the go-binance constant.
func futuresSide(s domain.OrderSide) futures.SideType {
	switch s {
	case domain.OrderSideBuy:
		return futures.SideTypeBuy
	case domain.OrderSideSell:
		return futures.SideTypeSell
	}
	return futures.SideTypeBuy
}

// futuresType maps our domain type to the go-binance constant.
func futuresType(t domain.OrderType) futures.OrderType {
	switch t {
	case domain.OrderTypeMarket:
		return futures.OrderTypeMarket
	case domain.OrderTypeLimit:
		return futures.OrderTypeLimit
	}
	return futures.OrderTypeMarket
}

// mapStatus converts Binance's stringly-typed status to our domain enum.
// Unknown statuses fall through to "unknown" — the reconcile loop will
// re-query.
func mapStatus(s string) domain.OrderStatus {
	switch strings.ToUpper(s) {
	case "NEW":
		return domain.OrderStatusNew
	case "PARTIALLY_FILLED":
		return domain.OrderStatusPartial
	case "FILLED":
		return domain.OrderStatusFilled
	case "CANCELED", "CANCELLED", "EXPIRED":
		return domain.OrderStatusCanceled
	case "REJECTED":
		return domain.OrderStatusRejected
	}
	return domain.OrderStatusUnknown
}

// SetUseTestnetGlobal flips the go-binance package-level testnet flag.
// Exposed only as an escape hatch — production code should not call this;
// per-instance BaseURL pinning is the supported configuration.
func SetUseTestnetGlobal(v bool) { gobinance.UseTestnet = v }
