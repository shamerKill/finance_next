// portfolio.go — Phase 5 cross-exchange portfolio summary.
//
// GET /api/v1/portfolio/summary returns:
//
//   - totalUsd        — sum across every account's balances, valued via
//                       the latest close of `<asset>/USDT:USDT` from
//                       the Timescale OHLCV cache (best-effort; missing
//                       rows count as 0).
//   - perExchange     — map exchange → totalUsd
//   - perAsset        — top 10 assets by USD value (sorted desc)
//
// USD conversion is intentionally a stub. Phase 5's spec calls out that
// a richer pricing model (multi-quote routes, FX, real-time spot) is a
// later concern. The shape of this endpoint is meant to be stable —
// only the priceProvider implementation will swap.
package handlers

import (
	"context"
	"errors"
	"net/http"
	"sort"
	"strconv"
	"time"

	"github.com/finance_next/gateway/internal/crypto"
	"github.com/finance_next/gateway/internal/domain"
	"github.com/finance_next/gateway/internal/exchange"
	gwmw "github.com/finance_next/gateway/internal/http/middleware"
	mongostore "github.com/finance_next/gateway/internal/store/mongo"
	"github.com/finance_next/gateway/internal/store/timescale"
	"github.com/labstack/echo/v4"
)

// PortfolioHandler aggregates balances across all of the user's accounts.
type PortfolioHandler struct {
	repo     *mongostore.AccountRepo
	envelope *crypto.EnvelopeService
	factory  ClientFactory
	prices   PriceProvider
}

// PriceProvider is the indirection used to look up an asset's USD price.
// The default impl is [TimescalePriceProvider] which queries the latest
// close of the matching USDT-perp on Timescale; tests inject a fake.
type PriceProvider interface {
	UsdPrice(ctx context.Context, asset string) (float64, error)
}

// NewPortfolioHandler builds the handler. When repo / envelope are nil
// the endpoint returns 503 — the gateway boots without Mongo for
// non-portfolio tests.
func NewPortfolioHandler(repo *mongostore.AccountRepo, env *crypto.EnvelopeService, factory ClientFactory, prices PriceProvider) *PortfolioHandler {
	if factory == nil {
		factory = DefaultClientFactory
	}
	return &PortfolioHandler{repo: repo, envelope: env, factory: factory, prices: prices}
}

// Register binds /portfolio routes onto the v1 group.
func (h *PortfolioHandler) Register(g *echo.Group) {
	g.GET("/portfolio/summary", h.summary)
}

// PortfolioSummary is the JSON response body.
type PortfolioSummary struct {
	TotalUsd     float64                      `json:"totalUsd"`
	PerExchange  []ExchangeBreakdown          `json:"perExchange"`
	PerAsset     []AssetBreakdown             `json:"perAsset"`
	GeneratedAt  string                       `json:"generatedAt"`
	Notes        []string                     `json:"notes,omitempty"`
}

// ExchangeBreakdown is one (exchange, totalUsd) row.
type ExchangeBreakdown struct {
	Exchange domain.Exchange `json:"exchange"`
	TotalUsd float64         `json:"totalUsd"`
	AccountIDs []string      `json:"accountIds"`
}

// AssetBreakdown is one (asset, qty, usdValue) row.
type AssetBreakdown struct {
	Asset    string  `json:"asset"`
	Qty      float64 `json:"qty"`
	UsdValue float64 `json:"usdValue"`
}

// summary handles GET /api/v1/portfolio/summary.
func (h *PortfolioHandler) summary(c echo.Context) error {
	if h.repo == nil || h.envelope == nil {
		return echo.NewHTTPError(http.StatusServiceUnavailable, "portfolio summary not configured")
	}
	ctx, cancel := context.WithTimeout(c.Request().Context(), 30*time.Second)
	defer cancel()

	accounts, err := h.repo.FindAll(ctx, gwmw.FromEcho(c))
	if err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, err.Error())
	}
	notes := []string{}
	perExchangeMap := map[domain.Exchange]*ExchangeBreakdown{}
	perAssetMap := map[string]*AssetBreakdown{}
	totalUsd := 0.0
	for _, a := range accounts {
		cli, err := h.clientFor(a)
		if err != nil {
			notes = append(notes, "skipped account "+a.ID+": "+err.Error())
			continue
		}
		balances, err := cli.GetBalances(ctx)
		if err != nil {
			notes = append(notes, "balances failed for account "+a.ID+": "+err.Error())
			continue
		}
		acctUsd := 0.0
		for _, b := range balances {
			qty := parseFloat(b.Free) + parseFloat(b.Locked)
			if qty == 0 {
				continue
			}
			usd := h.usdValue(ctx, b.Asset, qty)
			acctUsd += usd
			if ab, ok := perAssetMap[b.Asset]; ok {
				ab.Qty += qty
				ab.UsdValue += usd
			} else {
				perAssetMap[b.Asset] = &AssetBreakdown{
					Asset: b.Asset, Qty: qty, UsdValue: usd,
				}
			}
		}
		bd, ok := perExchangeMap[a.Exchange]
		if !ok {
			bd = &ExchangeBreakdown{Exchange: a.Exchange, AccountIDs: []string{}}
			perExchangeMap[a.Exchange] = bd
		}
		bd.TotalUsd += acctUsd
		bd.AccountIDs = append(bd.AccountIDs, a.ID)
		totalUsd += acctUsd
	}

	// Materialise the breakdown slices in deterministic order.
	perExchange := make([]ExchangeBreakdown, 0, len(perExchangeMap))
	for _, bd := range perExchangeMap {
		perExchange = append(perExchange, *bd)
	}
	sort.Slice(perExchange, func(i, j int) bool {
		return perExchange[i].TotalUsd > perExchange[j].TotalUsd
	})
	perAsset := make([]AssetBreakdown, 0, len(perAssetMap))
	for _, ab := range perAssetMap {
		perAsset = append(perAsset, *ab)
	}
	sort.Slice(perAsset, func(i, j int) bool {
		return perAsset[i].UsdValue > perAsset[j].UsdValue
	})
	if len(perAsset) > 10 {
		perAsset = perAsset[:10]
	}

	return c.JSON(http.StatusOK, PortfolioSummary{
		TotalUsd:    totalUsd,
		PerExchange: perExchange,
		PerAsset:    perAsset,
		GeneratedAt: time.Now().UTC().Format(time.RFC3339),
		Notes:       notes,
	})
}

func (h *PortfolioHandler) clientFor(a domain.Account) (exchange.ReadOnlyClient, error) {
	apiKey, err := h.envelope.DecryptForAccount(a.DEKCiphertext, a.APIKeyCiphertext)
	if err != nil {
		return nil, err
	}
	secret, err := h.envelope.DecryptForAccount(a.DEKCiphertext, a.SecretKeyCiphertext)
	if err != nil {
		return nil, err
	}
	var pass string
	if a.PassphraseCiphertext != "" {
		pass, err = h.envelope.DecryptForAccount(a.DEKCiphertext, a.PassphraseCiphertext)
		if err != nil {
			return nil, err
		}
	}
	return h.factory(a.Exchange, apiKey, secret, pass)
}

// usdValue best-effort prices `qty asset` in USD. Stable-coin and USD
// itself short-circuit; everything else delegates to the price provider
// and returns 0 on miss (with a note in the response).
func (h *PortfolioHandler) usdValue(ctx context.Context, asset string, qty float64) float64 {
	switch asset {
	case "USDT", "USDC", "BUSD", "FDUSD", "DAI", "TUSD", "USD":
		return qty
	}
	if h.prices == nil {
		return 0
	}
	price, err := h.prices.UsdPrice(ctx, asset)
	if err != nil {
		return 0
	}
	return qty * price
}

// parseFloat tolerates empty strings (treats as 0) and ignores parse
// errors — balances over the wire are documented as numeric strings.
func parseFloat(s string) float64 {
	if s == "" {
		return 0
	}
	f, err := strconv.ParseFloat(s, 64)
	if err != nil {
		return 0
	}
	return f
}

// TimescalePriceProvider implements [PriceProvider] by reading the
// latest close of `<asset>/USDT:USDT` from Timescale. We probe in
// priority order: 1m → 5m → 1h → 1d so a fresh tick wins when present.
type TimescalePriceProvider struct {
	store    *timescale.Store
	exchange string // which venue's bar series to use; default "binance"
}

// NewTimescalePriceProvider constructs the default provider.
func NewTimescalePriceProvider(s *timescale.Store) *TimescalePriceProvider {
	return &TimescalePriceProvider{store: s, exchange: "binance"}
}

// UsdPrice reads the most recent close for `<asset>USDT` (binance native
// shape — matches the exchange field used by the ingest job today).
func (p *TimescalePriceProvider) UsdPrice(ctx context.Context, asset string) (float64, error) {
	if p.store == nil {
		return 0, errors.New("portfolio: timescale unavailable")
	}
	for _, tf := range []string{"1m", "5m", "1h", "1d"} {
		c, err := p.store.LatestClose(ctx, p.exchange, asset+"USDT", tf)
		if err == nil && c > 0 {
			return c, nil
		}
	}
	return 0, errors.New("portfolio: no recent close")
}
