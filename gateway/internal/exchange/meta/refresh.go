// Package meta hosts the cross-exchange "exchange info" refresh job.
//
// The job is run once at gateway startup; it consults the
// [mongostore.ExchangeMetaRepo.IsStale] check first and only dials the
// upstream endpoints if the collection is empty or older than 24h. The
// public endpoints used here are unauthenticated (no API key required)
// — they are the catalog of tradable instruments, not account data.
//
// Endpoints:
//
//	binance USDM   GET /fapi/v1/exchangeInfo
//	okx            GET /api/v5/public/instruments?instType=SWAP
//	bybit linear   GET /v5/market/instruments-info?category=linear
//
// All three return JSON arrays of instrument descriptors; we extract
// the columns the gateway needs (precision + minNotional + a default
// fee tier) and upsert via the meta repo.
package meta

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"log/slog"
	"net/http"
	"strconv"
	"time"

	"github.com/finance_next/gateway/internal/domain"
	"github.com/finance_next/gateway/internal/exchange/symbol"
	mongostore "github.com/finance_next/gateway/internal/store/mongo"
)

// Default fee assumptions when the upstream catalog doesn't expose a
// fee tier (binance + bybit don't on the public endpoint). These are
// the **publicly documented** taker/maker rates for retail accounts as
// of 2026-05; operators with VIP tiers should override the row by hand.
const (
	defaultTakerFee = 0.0005
	defaultMakerFee = 0.0002
)

// Refresher orchestrates the startup refresh. Each exchange method is
// independent so a partial failure (e.g. okx down) doesn't abort the
// other two. Errors are logged but never bubble up — startup is
// best-effort.
type Refresher struct {
	repo *mongostore.ExchangeMetaRepo
	log  *slog.Logger
	http *http.Client

	// Hosts are overridable so tests can point at httptest.
	BinanceFuturesHost string
	OKXHost            string
	BybitHost          string
}

// New builds a Refresher with default upstream hosts.
func New(repo *mongostore.ExchangeMetaRepo, log *slog.Logger) *Refresher {
	if log == nil {
		log = slog.Default()
	}
	return &Refresher{
		repo:               repo,
		log:                log,
		http:               &http.Client{Timeout: 20 * time.Second},
		BinanceFuturesHost: "https://fapi.binance.com",
		OKXHost:            "https://www.okx.com",
		BybitHost:          "https://api.bybit.com",
	}
}

// RefreshIfStale runs the refresh job only when the collection is
// empty or older than 24h. Returns nil + records counted on success;
// errors are logged but not returned upstream so gateway boot continues
// even if one venue misbehaves.
func (r *Refresher) RefreshIfStale(ctx context.Context) {
	stale, err := r.repo.IsStale(ctx)
	if err != nil {
		r.log.Warn("exchange_meta: stale check failed", "err", err)
		return
	}
	if !stale {
		r.log.Info("exchange_meta: cache fresh, skipping refresh")
		return
	}
	r.log.Info("exchange_meta: refreshing from upstream catalogs")
	r.refreshBinance(ctx)
	r.refreshOKX(ctx)
	r.refreshBybit(ctx)
}

func (r *Refresher) refreshBinance(ctx context.Context) {
	type binanceFilter struct {
		FilterType  string `json:"filterType"`
		MinNotional string `json:"notional"`
	}
	type binanceSymbol struct {
		Symbol            string          `json:"symbol"`
		BaseAsset         string          `json:"baseAsset"`
		QuoteAsset        string          `json:"quoteAsset"`
		Status            string          `json:"status"`
		ContractType      string          `json:"contractType"`
		PricePrecision    int             `json:"pricePrecision"`
		QuantityPrecision int             `json:"quantityPrecision"`
		Filters           []binanceFilter `json:"filters"`
	}
	type binanceInfo struct {
		Symbols []binanceSymbol `json:"symbols"`
	}
	var info binanceInfo
	if err := r.fetchJSON(ctx, r.BinanceFuturesHost+"/fapi/v1/exchangeInfo", &info); err != nil {
		r.log.Warn("exchange_meta: binance fetch failed", "err", err)
		return
	}
	count := 0
	for _, s := range info.Symbols {
		if s.Status != "TRADING" || s.ContractType != "PERPETUAL" || s.QuoteAsset != "USDT" {
			continue
		}
		canonical := string(symbol.FromBinance(s.Symbol))
		var minNotional float64
		for _, f := range s.Filters {
			if f.FilterType == "MIN_NOTIONAL" {
				minNotional, _ = strconv.ParseFloat(f.MinNotional, 64)
				break
			}
		}
		if err := r.repo.Upsert(ctx, &domain.ExchangeMeta{
			Exchange:        domain.ExchangeBinance,
			CanonicalSymbol: canonical,
			NativeSymbol:    s.Symbol,
			BaseAsset:       s.BaseAsset,
			QuoteAsset:      s.QuoteAsset,
			ContractType:    "linear-perp",
			PricePrecision:  s.PricePrecision,
			QtyPrecision:    s.QuantityPrecision,
			MinNotionalUsd:  minNotional,
			TakerFeeRate:    defaultTakerFee,
			MakerFeeRate:    defaultMakerFee,
		}); err != nil {
			r.log.Warn("exchange_meta: binance upsert failed", "symbol", s.Symbol, "err", err)
			continue
		}
		count++
	}
	r.log.Info("exchange_meta: binance refresh complete", "rows", count)
}

func (r *Refresher) refreshOKX(ctx context.Context) {
	type okxInstrument struct {
		InstID    string `json:"instId"`
		InstType  string `json:"instType"`
		BaseCcy   string `json:"baseCcy"`
		QuoteCcy  string `json:"quoteCcy"`
		SettleCcy string `json:"settleCcy"`
		CtVal     string `json:"ctVal"`
		LotSz     string `json:"lotSz"`
		TickSz    string `json:"tickSz"`
		MinSz     string `json:"minSz"`
		State     string `json:"state"`
	}
	type okxResp struct {
		Code string          `json:"code"`
		Data []okxInstrument `json:"data"`
	}
	var resp okxResp
	if err := r.fetchJSON(ctx, r.OKXHost+"/api/v5/public/instruments?instType=SWAP", &resp); err != nil {
		r.log.Warn("exchange_meta: okx fetch failed", "err", err)
		return
	}
	count := 0
	for _, inst := range resp.Data {
		if inst.State != "live" || inst.SettleCcy != "USDT" {
			continue
		}
		// OKX SWAP instId looks like "BTC-USDT-SWAP"; baseCcy/quoteCcy are
		// empty for SWAP so derive from the FromOKX heuristic.
		canonical := string(symbol.FromOKX(inst.InstID))
		base, quote, _, err := symbol.Parse(symbol.CanonicalSymbol(canonical))
		if err != nil {
			continue
		}
		// MinSz is in contract units; for OKX-SWAP USDT-margined the
		// contract value is in CtVal currency (usually the base). We
		// approximate min-notional in USD as MinSz * CtVal — when CtVal
		// is unset the cap is permissive.
		minSz, _ := strconv.ParseFloat(inst.MinSz, 64)
		ctVal, _ := strconv.ParseFloat(inst.CtVal, 64)
		minNotional := minSz * ctVal
		if err := r.repo.Upsert(ctx, &domain.ExchangeMeta{
			Exchange:        domain.ExchangeOKX,
			CanonicalSymbol: canonical,
			NativeSymbol:    inst.InstID,
			BaseAsset:       base,
			QuoteAsset:      quote,
			ContractType:    "linear-perp",
			PricePrecision:  precisionFromTick(inst.TickSz),
			QtyPrecision:    precisionFromTick(inst.LotSz),
			MinNotionalUsd:  minNotional,
			TakerFeeRate:    defaultTakerFee,
			MakerFeeRate:    defaultMakerFee,
		}); err != nil {
			r.log.Warn("exchange_meta: okx upsert failed", "instId", inst.InstID, "err", err)
			continue
		}
		count++
	}
	r.log.Info("exchange_meta: okx refresh complete", "rows", count)
}

func (r *Refresher) refreshBybit(ctx context.Context) {
	type bybitInstrument struct {
		Symbol        string `json:"symbol"`
		BaseCoin      string `json:"baseCoin"`
		QuoteCoin     string `json:"quoteCoin"`
		Status        string `json:"status"`
		ContractType  string `json:"contractType"`
		PriceFilter   struct {
			TickSize string `json:"tickSize"`
		} `json:"priceFilter"`
		LotSizeFilter struct {
			QtyStep         string `json:"qtyStep"`
			MinNotionalValue string `json:"minNotionalValue"`
		} `json:"lotSizeFilter"`
	}
	type bybitResp struct {
		RetCode int `json:"retCode"`
		Result  struct {
			List []bybitInstrument `json:"list"`
		} `json:"result"`
	}
	var resp bybitResp
	if err := r.fetchJSON(ctx, r.BybitHost+"/v5/market/instruments-info?category=linear", &resp); err != nil {
		r.log.Warn("exchange_meta: bybit fetch failed", "err", err)
		return
	}
	count := 0
	for _, inst := range resp.Result.List {
		if inst.Status != "Trading" || inst.QuoteCoin != "USDT" || inst.ContractType != "LinearPerpetual" {
			continue
		}
		canonical := string(symbol.FromBybit(inst.Symbol))
		minNotional, _ := strconv.ParseFloat(inst.LotSizeFilter.MinNotionalValue, 64)
		if err := r.repo.Upsert(ctx, &domain.ExchangeMeta{
			Exchange:        domain.ExchangeBybit,
			CanonicalSymbol: canonical,
			NativeSymbol:    inst.Symbol,
			BaseAsset:       inst.BaseCoin,
			QuoteAsset:      inst.QuoteCoin,
			ContractType:    "linear-perp",
			PricePrecision:  precisionFromTick(inst.PriceFilter.TickSize),
			QtyPrecision:    precisionFromTick(inst.LotSizeFilter.QtyStep),
			MinNotionalUsd:  minNotional,
			TakerFeeRate:    defaultTakerFee,
			MakerFeeRate:    defaultMakerFee,
		}); err != nil {
			r.log.Warn("exchange_meta: bybit upsert failed", "symbol", inst.Symbol, "err", err)
			continue
		}
		count++
	}
	r.log.Info("exchange_meta: bybit refresh complete", "rows", count)
}

// fetchJSON does a GET + JSON-decode with the Refresher's http client.
func (r *Refresher) fetchJSON(ctx context.Context, url string, out any) error {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
	if err != nil {
		return err
	}
	resp, err := r.http.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	if resp.StatusCode >= 400 {
		body, _ := io.ReadAll(resp.Body)
		return fmt.Errorf("HTTP %d: %s", resp.StatusCode, string(body))
	}
	return json.NewDecoder(resp.Body).Decode(out)
}

// precisionFromTick counts the decimals after the dot in a tick-size
// string ("0.01" → 2, "1" → 0). Used to derive PricePrecision /
// QtyPrecision when the upstream exposes tick increments instead of a
// numeric precision.
func precisionFromTick(tick string) int {
	for i := 0; i < len(tick); i++ {
		if tick[i] == '.' {
			return len(tick) - i - 1
		}
	}
	return 0
}
