// readonly.go — Bybit implementation of [exchange.ReadOnlyClient].
//
// Endpoints used:
//
//   - GET /v5/account/wallet-balance?accountType=UNIFIED  → balances
//   - GET /v5/position/list?category=linear               → positions
//   - GET /v5/user/query-api                              → permissions
//
// Permissions probe:
// Bybit returns a `permissions` object on /v5/user/query-api with sub-
// fields per scope (Spot, Derivatives, Wallet, etc). We treat the
// presence of a `Wallet` scope containing any "Withdraw…" permission
// (e.g. "ContractAccountTransfer", "WithdrawApply") as canWithdraw=true.
// Fail-closed: if the response can't be parsed or `permissions` is
// missing, we treat the key as `canWithdraw=true` so the handler rejects.
package bybit

import (
	"context"
	"errors"
	"fmt"
	"strings"

	"github.com/finance_next/gateway/internal/exchange"
)

// ReadOnlyClient adapts [Client] to [exchange.ReadOnlyClient].
type ReadOnlyClient struct {
	c *Client
}

// NewReadOnly builds a Bybit read-only adapter pinned to mainnet.
func NewReadOnly(apiKey, secretKey string) *ReadOnlyClient {
	return &ReadOnlyClient{c: NewClient(apiKey, secretKey)}
}

// SetBaseURL forwards to the transport for httptest mocking.
func (r *ReadOnlyClient) SetBaseURL(u string) { r.c.SetBaseURL(u) }

// ProbePermissions queries /v5/user/query-api and derives the gateway's
// normalised triplet. Fail-closed on any parse / network error so the
// handler rejects the credential rather than silently persisting an
// over-scoped key.
func (r *ReadOnlyClient) ProbePermissions(ctx context.Context) (exchange.Permissions, error) {
	var resp queryAPIResp
	if _, err := r.c.signedDo(ctx, "GET", "/v5/user/query-api", nil, &resp); err != nil {
		// Fail-closed.
		return exchange.Permissions{CanWithdraw: true}, fmt.Errorf("bybit: probe failed: %w", err)
	}
	canWithdraw := false
	canTrade := false
	for _, p := range resp.Permissions.Wallet {
		if strings.HasPrefix(strings.ToLower(p), "withdraw") {
			canWithdraw = true
		}
	}
	if len(resp.Permissions.ContractTrade) > 0 || len(resp.Permissions.Spot) > 0 || len(resp.Permissions.Derivatives) > 0 {
		canTrade = true
	}
	if !canTrade && !canWithdraw && len(resp.Permissions.Wallet) == 0 {
		// All scope arrays empty — probe succeeded but returned no scopes.
		// Treat as suspicious / fail-closed.
		return exchange.Permissions{CanWithdraw: true}, errors.New("bybit: probe returned empty permissions; refusing key")
	}
	return exchange.Permissions{
		CanTrade:    canTrade,
		CanDeposit:  true, // Bybit doesn't gate deposits per-key.
		CanWithdraw: canWithdraw,
	}, nil
}

// GetBalances returns the unified-account balance.
func (r *ReadOnlyClient) GetBalances(ctx context.Context) ([]exchange.Balance, error) {
	var resp walletBalanceResp
	if _, err := r.c.signedDo(ctx, "GET", "/v5/account/wallet-balance?accountType=UNIFIED", nil, &resp); err != nil {
		return nil, err
	}
	out := []exchange.Balance{}
	for _, list := range resp.List {
		for _, coin := range list.Coin {
			if coin.WalletBalance == "" || coin.WalletBalance == "0" {
				continue
			}
			out = append(out, exchange.Balance{
				Asset:  coin.Coin,
				Free:   coin.AvailableToWithdraw,
				Locked: coin.Locked,
				Wallet: "unified",
			})
		}
	}
	return out, nil
}

// GetPositions returns linear-perp open positions.
func (r *ReadOnlyClient) GetPositions(ctx context.Context) ([]exchange.Position, error) {
	var resp positionListResp
	if _, err := r.c.signedDo(ctx, "GET", "/v5/position/list?category=linear&settleCoin=USDT", nil, &resp); err != nil {
		return nil, err
	}
	out := make([]exchange.Position, 0, len(resp.List))
	for _, p := range resp.List {
		if p.Size == "" || p.Size == "0" {
			continue
		}
		out = append(out, exchange.Position{
			Symbol:           p.Symbol,
			PositionSide:     p.Side,
			PositionAmt:      p.Size,
			EntryPrice:       p.AvgPrice,
			MarkPrice:        p.MarkPrice,
			UnrealizedProfit: p.UnrealisedPnl,
			Leverage:         p.Leverage,
			LiquidationPrice: p.LiqPrice,
			MarginType:       p.TradeMode,
		})
	}
	return out, nil
}

// ErrUnsupportedStream — see okx.ErrUnsupportedStream for context.
var ErrUnsupportedStream = errors.New("bybit: user-data stream not implemented in phase 5")

// StreamUserData satisfies the interface but is not implemented.
func (r *ReadOnlyClient) StreamUserData(ctx context.Context) (exchange.UserDataStream, error) {
	return nil, ErrUnsupportedStream
}

// ---------------- wire types ----------------

type queryAPIResp struct {
	ID          string              `json:"id"`
	Permissions queryAPIPermissions `json:"permissions"`
}

type queryAPIPermissions struct {
	ContractTrade []string `json:"ContractTrade"`
	Spot          []string `json:"Spot"`
	Wallet        []string `json:"Wallet"`
	Options       []string `json:"Options"`
	Derivatives   []string `json:"Derivatives"`
	CopyTrading   []string `json:"CopyTrading"`
	BlockTrade    []string `json:"BlockTrade"`
	Exchange      []string `json:"Exchange"`
	NFT           []string `json:"NFT"`
	Affiliate     []string `json:"Affiliate"`
}

type walletBalanceResp struct {
	List []walletBalanceList `json:"list"`
}

type walletBalanceList struct {
	AccountType string             `json:"accountType"`
	Coin        []walletBalanceCoin `json:"coin"`
}

type walletBalanceCoin struct {
	Coin                string `json:"coin"`
	WalletBalance       string `json:"walletBalance"`
	AvailableToWithdraw string `json:"availableToWithdraw"`
	Locked              string `json:"locked"`
}

type positionListResp struct {
	Category string         `json:"category"`
	List     []positionItem `json:"list"`
}

type positionItem struct {
	Symbol        string `json:"symbol"`
	Side          string `json:"side"`
	Size          string `json:"size"`
	AvgPrice      string `json:"avgPrice"`
	MarkPrice     string `json:"markPrice"`
	UnrealisedPnl string `json:"unrealisedPnl"`
	Leverage      string `json:"leverage"`
	LiqPrice      string `json:"liqPrice"`
	TradeMode     string `json:"tradeMode"`
}
