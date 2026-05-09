// Package binance implements exchange.ReadOnlyClient for Binance.
//
// It wraps go-binance/v2 (spot + futures sub-clients). Phase 1 only exposes
// read paths — order placement is reserved for phase 4 in a sibling file.
//
// Tests in this package use httptest.NewServer + Client.SetApiEndpoint to
// avoid hitting the live API; live integration tests are skipped unless the
// BINANCE_API_KEY env var is set (see client_test.go).
package binance

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/url"
	"sync"
	"time"

	gobinance "github.com/adshao/go-binance/v2"
	"github.com/adshao/go-binance/v2/futures"
	"github.com/coder/websocket"

	"github.com/finance_next/gateway/internal/exchange"
)

// Client is the per-account Binance read-only adapter.
//
// We keep both spot and USDM-futures clients so the dashboard can show a
// unified view across wallets; phase 1 calls them in parallel.
type Client struct {
	spot    *gobinance.Client
	futures *futures.Client

	// wsHost is the websocket origin used for user-data streams. Override in
	// tests to point at httptest.NewServer.
	wsHost string
}

// NewClient builds a Client with default Binance API endpoints.
func NewClient(apiKey, secretKey string) *Client {
	return &Client{
		spot:    gobinance.NewClient(apiKey, secretKey),
		futures: futures.NewClient(apiKey, secretKey),
		wsHost:  "wss://stream.binance.com:9443",
	}
}

// SetSpotEndpoint overrides the spot REST base URL. Used by tests.
func (c *Client) SetSpotEndpoint(u string) { c.spot.BaseURL = u }

// SetFuturesEndpoint overrides the futures REST base URL. Used by tests.
func (c *Client) SetFuturesEndpoint(u string) { c.futures.BaseURL = u }

// SetWSHost overrides the user-data WS origin (e.g. ws://127.0.0.1:port). Used
// by tests.
func (c *Client) SetWSHost(host string) { c.wsHost = host }

// ProbePermissions calls GET /api/v3/account and maps the canTrade /
// canDeposit / canWithdraw fields onto our normalised shape.
//
// The handler layer is responsible for *rejecting* canWithdraw=true — this
// adapter only reports the truth.
func (c *Client) ProbePermissions(ctx context.Context) (exchange.Permissions, error) {
	acct, err := c.spot.NewGetAccountService().Do(ctx)
	if err != nil {
		return exchange.Permissions{}, fmt.Errorf("binance: probe permissions: %w", err)
	}
	return exchange.Permissions{
		CanTrade:    acct.CanTrade,
		CanDeposit:  acct.CanDeposit,
		CanWithdraw: acct.CanWithdraw,
	}, nil
}

// GetBalances returns the spot wallet balances. USDM-futures wallet balances
// require a separate /fapi/v2/balance call which we deliberately skip in phase
// 1 to keep the surface area small; phase 4 will extend this when execution
// goes live (see TODO).
//
// TODO(phase 4): add futures USDM wallet via futures.NewGetBalanceService.
func (c *Client) GetBalances(ctx context.Context) ([]exchange.Balance, error) {
	acct, err := c.spot.NewGetAccountService().OmitZeroBalances(true).Do(ctx)
	if err != nil {
		return nil, fmt.Errorf("binance: spot balances: %w", err)
	}
	out := make([]exchange.Balance, 0, len(acct.Balances))
	for _, b := range acct.Balances {
		out = append(out, exchange.Balance{
			Asset:  b.Asset,
			Free:   b.Free,
			Locked: b.Locked,
			Wallet: "spot",
		})
	}
	return out, nil
}

// GetPositions hits /fapi/v2/positionRisk and filters to non-zero positions.
func (c *Client) GetPositions(ctx context.Context) ([]exchange.Position, error) {
	risks, err := c.futures.NewGetPositionRiskService().Do(ctx)
	if err != nil {
		return nil, fmt.Errorf("binance: position risk: %w", err)
	}
	out := make([]exchange.Position, 0, len(risks))
	for _, r := range risks {
		if r.PositionAmt == "" || r.PositionAmt == "0" || r.PositionAmt == "0.000" {
			continue
		}
		// Best-effort: skip rows that parse to literal zero. The string "0.0"
		// also passes the cheap comparison above; parseNonZero handles trailing
		// zeros without pulling in big.Float.
		if !parseNonZero(r.PositionAmt) {
			continue
		}
		out = append(out, exchange.Position{
			Symbol:           r.Symbol,
			PositionSide:     r.PositionSide,
			PositionAmt:      r.PositionAmt,
			EntryPrice:       r.EntryPrice,
			MarkPrice:        r.MarkPrice,
			UnrealizedProfit: r.UnRealizedProfit,
			Leverage:         r.Leverage,
			LiquidationPrice: r.LiquidationPrice,
			MarginType:       r.MarginType,
		})
	}
	return out, nil
}

// parseNonZero returns true iff s parses as a non-zero decimal. It does so
// without an external decimal library; we only need a presence check.
func parseNonZero(s string) bool {
	for _, ch := range s {
		if ch >= '1' && ch <= '9' {
			return true
		}
	}
	return false
}

// StreamUserData starts a fresh listenKey, opens the user-data WS, and
// schedules listenKey keepalive (every 30 minutes per Binance docs).
//
// The returned UserDataStream owns one goroutine for the WS read loop and one
// for keepalive; both exit when Close is called or the parent ctx is cancelled.
func (c *Client) StreamUserData(ctx context.Context) (exchange.UserDataStream, error) {
	listenKey, err := c.spot.NewStartUserStreamService().Do(ctx)
	if err != nil {
		return nil, fmt.Errorf("binance: start user stream: %w", err)
	}

	wsURL := c.wsHost + "/ws/" + url.PathEscape(listenKey)
	dialCtx, cancel := context.WithTimeout(ctx, 10*time.Second)
	defer cancel()
	conn, _, err := websocket.Dial(dialCtx, wsURL, &websocket.DialOptions{HTTPClient: http.DefaultClient})
	if err != nil {
		_ = c.spot.NewCloseUserStreamService().ListenKey(listenKey).Do(context.Background())
		return nil, fmt.Errorf("binance: dial user-data ws: %w", err)
	}

	s := &userDataStream{
		conn:      conn,
		client:    c,
		listenKey: listenKey,
		events:    make(chan exchange.UserDataEvent, 64),
		errs:      make(chan error, 1),
		done:      make(chan struct{}),
	}
	streamCtx, streamCancel := context.WithCancel(ctx)
	s.cancel = streamCancel

	go s.readLoop(streamCtx)
	go s.keepalive(streamCtx, 30*time.Minute)
	return s, nil
}

// userDataStream is the per-account upstream connection.
type userDataStream struct {
	conn      *websocket.Conn
	client    *Client
	listenKey string

	events chan exchange.UserDataEvent
	errs   chan error
	done   chan struct{}
	cancel context.CancelFunc

	closeOnce sync.Once
}

func (s *userDataStream) Events() <-chan exchange.UserDataEvent { return s.events }
func (s *userDataStream) Errs() <-chan error                    { return s.errs }

func (s *userDataStream) readLoop(ctx context.Context) {
	defer close(s.events)
	for {
		select {
		case <-ctx.Done():
			return
		case <-s.done:
			return
		default:
		}
		_, data, err := s.conn.Read(ctx)
		if err != nil {
			select {
			case s.errs <- err:
			default:
			}
			close(s.errs)
			return
		}
		// We forward bytes verbatim; structural validation happens browser-side.
		// JSON-decode briefly only to drop obviously malformed control frames.
		var probe map[string]any
		if err := json.Unmarshal(data, &probe); err != nil {
			continue
		}
		select {
		case s.events <- exchange.UserDataEvent{Payload: data}:
		case <-ctx.Done():
			return
		}
	}
}

func (s *userDataStream) keepalive(ctx context.Context, every time.Duration) {
	t := time.NewTicker(every)
	defer t.Stop()
	for {
		select {
		case <-ctx.Done():
			return
		case <-s.done:
			return
		case <-t.C:
			// Best-effort; failure here is logged at the hub layer.
			_ = s.client.spot.NewKeepaliveUserStreamService().ListenKey(s.listenKey).Do(ctx)
		}
	}
}

// Close tears down the WS, cancels readers, and best-effort closes the
// listenKey (so the next subscription gets a fresh one).
func (s *userDataStream) Close() error {
	var err error
	s.closeOnce.Do(func() {
		close(s.done)
		s.cancel()
		err = s.conn.Close(websocket.StatusNormalClosure, "client close")
		_ = s.client.spot.NewCloseUserStreamService().ListenKey(s.listenKey).Do(context.Background())
	})
	return err
}
