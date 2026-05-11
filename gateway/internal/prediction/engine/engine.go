// Package engine — Phase 9 prediction-market order engine.
//
// Architecture mirrors the Phase 4 perp engine but is wired to its own
// Redis stream (`command.prediction.submit`), its own Mongo collection
// (`prediction_orders`), and its own risk gate (`maxNotionalUsd` /
// `maxOpenMarkets` / `maxSlippageBps`). Shared with the perp engine:
//
//   * `system_state` (Phase 7 kill switch) — checked BEFORE per-strategy risk
//   * `portfolio_limits.maxOpenNotionalUsd` — cross-vertical USD cap
//   * mainnet `TokenStore` (Phase 4) — same singleton; one operator
//     confirm opens both perp + prediction mainnet
//
// Risk gate order (matches the Phase 4 + Phase 7 contract):
//   1. Kill switch       → ErrTradingHalted
//   2. Strategy live + risk caps present → ErrLiveDisabled / ErrRiskMissing
//   3. Per-market notional cap → ErrRiskNotional
//   4. Open-markets count → ErrRiskOpenMarkets
//   5. Slippage cap (vs. mid at submit) → ErrSlippageExceeded
//   6. Daily loss cap → ErrRiskDailyLoss
//   7. Portfolio cross-strategy notional cap → ErrPortfolioNotional
//   8. Mainnet 3-gate → polymarket.ErrMainnetGateDenied (or ErrEnvDisabled)
//
// On reject the engine writes a synthetic `event.prediction_order.rejected`
// event onto the shared `events` Redis stream so the WS hub can fan
// out to the strategy detail page.
package engine

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"log/slog"
	"math/big"
	"strings"
	"sync"
	"time"

	"github.com/finance_next/gateway/internal/crypto"
	"github.com/finance_next/gateway/internal/domain"
	"github.com/finance_next/gateway/internal/prediction/polymarket"
	mongostore "github.com/finance_next/gateway/internal/store/mongo"
	walletpkg "github.com/finance_next/gateway/internal/wallet/polygon"
	"github.com/redis/go-redis/v9"
)

// Stream + group constants (parallel to the Phase 4 perp engine).
const (
	// CommandSubmitStream is the Redis stream the engine consumes.
	CommandSubmitStream = "command.prediction.submit"
	// EventsStream is shared with the perp engine — WS hub demuxes by
	// payload `type` prefix.
	EventsStream = "events"
	// ConsumerGroup is the Redis consumer-group used by all gateway
	// replicas of the prediction engine.
	ConsumerGroup = "gateway-prediction-engine"
)

// Common errors. Aligned with the perp engine names where the meaning
// is identical so the UI can pattern-match.
var (
	ErrLiveDisabled         = errors.New("prediction engine: strategy live trading disabled")
	ErrRiskMissing          = errors.New("prediction engine: strategy risk caps missing or invalid")
	ErrRiskNotional         = errors.New("prediction engine: order notional exceeds maxNotionalUsd cap")
	ErrRiskOpenMarkets      = errors.New("prediction engine: open markets count exceeds maxOpenMarkets cap")
	ErrSlippageExceeded     = errors.New("prediction engine: order price exceeds maxSlippageBps vs mid")
	ErrRiskDailyLoss        = errors.New("prediction engine: daily loss cap reached")
	ErrPortfolioNotional    = errors.New("prediction engine: portfolio open notional cap exceeded")
	ErrTradingHalted        = errors.New("prediction engine: trading halted globally")
	ErrWalletNotConfigured  = errors.New("prediction engine: strategy has no live.walletId configured")
	ErrInvalidOutcome       = errors.New("prediction engine: outcome must be YES or NO")
	ErrInvalidSubmission    = errors.New("prediction engine: invalid submission payload")
)

// SystemStateProvider mirrors orderengine.SystemStateProvider.
type SystemStateProvider interface {
	GetSystemState(ctx context.Context) (*domain.SystemState, error)
	GetPortfolioLimits(ctx context.Context, userID string) (*domain.PortfolioLimits, error)
}

// PortfolioOrderStats reports cross-strategy aggregates from the perp
// engine's order_log so the prediction cap is accurate across both
// verticals (Phase 7 portfolio limits are per-user, not per-vertical).
type PortfolioOrderStats interface {
	SumOpenNotionalForUser(ctx context.Context, userID string) (notional float64, count int, err error)
	SumRealisedPnlSinceForUser(ctx context.Context, userID string, since time.Time) (float64, error)
}

// CLOBClient is the slim interface the engine consumes. Implemented by
// *polymarket.Client; tests inject a fake.
type CLOBClient interface {
	FetchBook(ctx context.Context, tokenID string) (*polymarket.Book, error)
	SubmitOrder(ctx context.Context, owner string, signed *polymarket.SignedOrder, orderType string) (*polymarket.SubmitResult, error)
	OpenOrders(ctx context.Context, marketID string) ([]polymarket.OpenOrder, error)
	CancelOrder(ctx context.Context, orderID string) error
}

// Deps bundles every dependency. Wired in cmd/gateway/main.go.
type Deps struct {
	Redis              *redis.Client
	StrategyRepo       *mongostore.PredictionStrategyRepo
	OrderRepo          *mongostore.PredictionOrderRepo
	WalletRepo         *mongostore.WalletRepo
	Envelope           *crypto.EnvelopeService
	CLOB               CLOBClient
	Gate               polymarket.Gate
	SystemRepo         SystemStateProvider
	PortfolioStats     PortfolioOrderStats
	Workers            int
	ReconcileInterval  time.Duration
	Log                *slog.Logger
	// EIP712Domain lets ops override the verifyingContract / chainId for
	// forked deployments. Defaults to polymarket.DefaultDomain().
	EIP712Domain *polymarket.Domain
}

// Engine is the running pipeline.
type Engine struct {
	deps Deps
	log  *slog.Logger
	dom  polymarket.Domain

	instanceID string

	nonceMu sync.Mutex
	nonce   uint64
}

// New constructs an Engine.
func New(d Deps) *Engine {
	if d.Workers <= 0 {
		d.Workers = 4
	}
	if d.ReconcileInterval <= 0 {
		d.ReconcileInterval = 30 * time.Second
	}
	if d.Log == nil {
		d.Log = slog.Default()
	}
	if d.Gate == nil {
		d.Gate = polymarket.AlwaysDenyGate
	}
	dom := polymarket.DefaultDomain()
	if d.EIP712Domain != nil {
		dom = *d.EIP712Domain
	}
	id := time.Now().UTC().Format("20060102T150405")
	return &Engine{
		deps:       d,
		log:        d.Log,
		dom:        dom,
		instanceID: "pred-" + id,
	}
}

// Submit pushes a command onto the Redis stream and returns the entry id.
func (e *Engine) Submit(ctx context.Context, cmd domain.SubmitPredictionOrderCommand) (string, error) {
	if cmd.StrategyID == "" || cmd.MarketID == "" || cmd.TokenID == "" {
		return "", ErrInvalidSubmission
	}
	if !cmd.Outcome.IsValid() {
		return "", ErrInvalidOutcome
	}
	if !cmd.Side.IsValid() {
		return "", fmt.Errorf("%w: side must be BUY or SELL", ErrInvalidSubmission)
	}
	if cmd.Size <= 0 {
		return "", fmt.Errorf("%w: size must be > 0", ErrInvalidSubmission)
	}
	if cmd.Price <= 0 || cmd.Price >= 1 {
		return "", fmt.Errorf("%w: price must be in (0, 1)", ErrInvalidSubmission)
	}
	bs, err := json.Marshal(cmd)
	if err != nil {
		return "", err
	}
	id, err := e.deps.Redis.XAdd(ctx, &redis.XAddArgs{
		Stream: CommandSubmitStream,
		Values: map[string]any{"data": string(bs)},
	}).Result()
	if err != nil {
		return "", err
	}
	return id, nil
}

// Start spins up worker goroutines + the reconcile loop. Blocks until
// ctx is cancelled.
func (e *Engine) Start(ctx context.Context) error {
	if e.deps.Redis == nil {
		return errors.New("prediction engine: redis client required")
	}
	if e.deps.OrderRepo == nil || e.deps.StrategyRepo == nil || e.deps.WalletRepo == nil {
		return errors.New("prediction engine: repos required")
	}
	if e.deps.CLOB == nil {
		return errors.New("prediction engine: CLOB client required")
	}

	if err := e.deps.Redis.XGroupCreateMkStream(ctx, CommandSubmitStream, ConsumerGroup, "$").Err(); err != nil {
		if !strings.Contains(err.Error(), "BUSYGROUP") {
			e.log.Warn("prediction xgroup create failed", "err", err)
		}
	}

	var wg sync.WaitGroup
	for i := 0; i < e.deps.Workers; i++ {
		wg.Add(1)
		consumer := fmt.Sprintf("%s-w%d", e.instanceID, i)
		go func(consumer string) {
			defer wg.Done()
			e.runWorker(ctx, consumer)
		}(consumer)
	}

	wg.Add(1)
	go func() {
		defer wg.Done()
		e.runReconcileLoop(ctx)
	}()

	wg.Wait()
	return ctx.Err()
}

func (e *Engine) runWorker(ctx context.Context, consumer string) {
	for {
		select {
		case <-ctx.Done():
			return
		default:
		}
		streams, err := e.deps.Redis.XReadGroup(ctx, &redis.XReadGroupArgs{
			Group:    ConsumerGroup,
			Consumer: consumer,
			Streams:  []string{CommandSubmitStream, ">"},
			Count:    8,
			Block:    2 * time.Second,
		}).Result()
		if err != nil {
			if ctx.Err() != nil {
				return
			}
			if err == redis.Nil {
				continue
			}
			e.log.Warn("prediction xreadgroup failed", "err", err, "consumer", consumer)
			time.Sleep(500 * time.Millisecond)
			continue
		}
		for _, st := range streams {
			for _, msg := range st.Messages {
				e.processMessage(ctx, msg)
				_ = e.deps.Redis.XAck(ctx, CommandSubmitStream, ConsumerGroup, msg.ID).Err()
			}
		}
	}
}

func (e *Engine) processMessage(ctx context.Context, msg redis.XMessage) {
	rawAny, ok := msg.Values["data"]
	if !ok {
		return
	}
	raw, ok := rawAny.(string)
	if !ok {
		return
	}
	var cmd domain.SubmitPredictionOrderCommand
	if err := json.Unmarshal([]byte(raw), &cmd); err != nil {
		e.log.Warn("prediction: unmarshal command", "err", err, "id", msg.ID)
		return
	}
	if _, err := e.ProcessCommand(ctx, cmd); err != nil {
		e.log.Warn("prediction: process command", "err", err, "id", msg.ID, "strategyId", cmd.StrategyID)
	}
}

// ProcessCommand is the single-message fast path. Public-ish so the
// admin manual-submit endpoint can call synchronously.
//
// Returns the persisted [domain.PredictionOrderLog]; nil + error means
// the command was rejected before any CLOB call.
func (e *Engine) ProcessCommand(ctx context.Context, cmd domain.SubmitPredictionOrderCommand) (*domain.PredictionOrderLog, error) {
	// 1. Kill switch.
	if e.deps.SystemRepo != nil {
		state, err := e.deps.SystemRepo.GetSystemState(ctx)
		if err != nil {
			e.publishRejection(ctx, cmd, fmt.Errorf("system state lookup: %w", err))
			return nil, fmt.Errorf("system state lookup: %w", err)
		}
		if state.TradingHalted {
			e.publishRejection(ctx, cmd, ErrTradingHalted)
			return nil, ErrTradingHalted
		}
	}

	strat, err := e.deps.StrategyRepo.FindByID(ctx, cmd.StrategyID)
	if err != nil {
		return nil, fmt.Errorf("load strategy: %w", err)
	}
	if !strat.LiveEnabled() {
		e.publishRejection(ctx, cmd, ErrLiveDisabled)
		return nil, ErrLiveDisabled
	}
	if strat.Live.WalletID == "" {
		e.publishRejection(ctx, cmd, ErrWalletNotConfigured)
		return nil, ErrWalletNotConfigured
	}
	if strat.Risk == nil ||
		strat.Risk.MaxNotionalUsd <= 0 ||
		strat.Risk.MaxOpenMarkets <= 0 ||
		strat.Risk.MaxSlippageBps <= 0 ||
		strat.Risk.DailyLossCapUsd <= 0 {
		e.publishRejection(ctx, cmd, ErrRiskMissing)
		return nil, ErrRiskMissing
	}

	// 2. Per-market notional cap. Notional = price * size (USDC).
	notional := cmd.Price * cmd.Size
	if notional > strat.Risk.MaxNotionalUsd {
		e.publishRejection(ctx, cmd, fmt.Errorf("%w: notional=%.2f cap=%.2f", ErrRiskNotional, notional, strat.Risk.MaxNotionalUsd))
		return nil, ErrRiskNotional
	}

	// 3. Open-markets count cap.
	openCount, err := e.deps.OrderRepo.CountOpenForStrategy(ctx, cmd.StrategyID)
	if err != nil {
		e.publishRejection(ctx, cmd, fmt.Errorf("open count lookup: %w", err))
		return nil, fmt.Errorf("open count lookup: %w", err)
	}
	if openCount+1 > strat.Risk.MaxOpenMarkets {
		e.publishRejection(ctx, cmd, fmt.Errorf("%w: projected=%d cap=%d", ErrRiskOpenMarkets, openCount+1, strat.Risk.MaxOpenMarkets))
		return nil, ErrRiskOpenMarkets
	}

	// 4. Slippage cap vs. mid.
	mid := cmd.MidPrice
	if mid == 0 && e.deps.CLOB != nil {
		// Best-effort fetch — failures fall through with mid=0 and we
		// skip the slippage check (engine already rejected on
		// missing risk caps so this is a fail-open IFF the CLOB is
		// down). To stay safe we treat any fetch error as a hard
		// fail.
		book, berr := e.deps.CLOB.FetchBook(ctx, cmd.TokenID)
		if berr != nil {
			e.publishRejection(ctx, cmd, fmt.Errorf("book fetch: %w", berr))
			return nil, fmt.Errorf("book fetch: %w", berr)
		}
		mid = book.Mid()
	}
	bps := 0
	if mid > 0 {
		// Slippage is the absolute deviation from mid in basis points.
		dev := cmd.Price - mid
		if dev < 0 {
			dev = -dev
		}
		bps = int(dev / mid * 10_000)
		if bps > strat.Risk.MaxSlippageBps {
			e.publishRejection(ctx, cmd, fmt.Errorf("%w: slippage=%dbps cap=%dbps mid=%.4f price=%.4f",
				ErrSlippageExceeded, bps, strat.Risk.MaxSlippageBps, mid, cmd.Price))
			return nil, ErrSlippageExceeded
		}
	}

	// 5. Daily loss cap.
	since := startOfUTCDay(time.Now())
	pnl, err := e.deps.OrderRepo.SumRealisedPnlSince(ctx, cmd.StrategyID, since)
	if err != nil {
		e.publishRejection(ctx, cmd, fmt.Errorf("pnl lookup: %w", err))
		return nil, fmt.Errorf("pnl lookup: %w", err)
	}
	if pnl <= -strat.Risk.DailyLossCapUsd {
		e.publishRejection(ctx, cmd, ErrRiskDailyLoss)
		return nil, ErrRiskDailyLoss
	}

	// 6. Portfolio cross-strategy cap (Phase 7).
	if e.deps.SystemRepo != nil && e.deps.PortfolioStats != nil {
		userID := domain.DefaultUserID
		if strat.UserID != "" {
			userID = strat.UserID
		}
		limits, lerr := e.deps.SystemRepo.GetPortfolioLimits(ctx, userID)
		if lerr != nil {
			e.publishRejection(ctx, cmd, fmt.Errorf("portfolio limits lookup: %w", lerr))
			return nil, fmt.Errorf("portfolio limits lookup: %w", lerr)
		}
		if limits.MaxOpenNotionalUsd > 0 {
			openNotional, _, perr := e.deps.PortfolioStats.SumOpenNotionalForUser(ctx, userID)
			if perr != nil {
				e.publishRejection(ctx, cmd, fmt.Errorf("portfolio open lookup: %w", perr))
				return nil, fmt.Errorf("portfolio open lookup: %w", perr)
			}
			projected := openNotional + notional
			if projected > limits.MaxOpenNotionalUsd {
				e.publishRejection(ctx, cmd, fmt.Errorf("%w: projected=%.2f cap=%.2f", ErrPortfolioNotional, projected, limits.MaxOpenNotionalUsd))
				return nil, ErrPortfolioNotional
			}
		}
	}

	// 7. Mainnet 3-gate.
	if err := polymarket.CheckGate(e.deps.Gate, strat.Live.Mode); err != nil {
		e.publishRejection(ctx, cmd, err)
		return nil, err
	}

	// ---- Build clientOrderId + insert pending row ------------------
	clientOID := e.deriveClientOrderID(cmd)
	// R2: stamp the order with the owning user so the cross-strategy
	// portfolio aggregations actually have a filter to match.
	orderUserID := strat.UserID
	if orderUserID == "" {
		orderUserID = domain.DefaultUserID
	}
	pending := &domain.PredictionOrderLog{
		ClientOrderID: clientOID,
		UserID:        orderUserID,
		StrategyID:    cmd.StrategyID,
		WalletID:      strat.Live.WalletID,
		MarketID:      cmd.MarketID,
		TokenID:       cmd.TokenID,
		Outcome:       cmd.Outcome,
		Side:          cmd.Side,
		Price:         cmd.Price,
		Size:          cmd.Size,
		MidAtSubmit:   mid,
		SlippageBps:   bps,
		Status:        domain.PredictionOrderNew,
	}
	inserted, err := e.deps.OrderRepo.Insert(ctx, pending)
	if errors.Is(err, mongostore.ErrPredictionOrderDuplicate) {
		existing, ferr := e.deps.OrderRepo.FindByClientOrderID(ctx, clientOID)
		if ferr != nil {
			return nil, fmt.Errorf("dup found but lookup failed: %w", ferr)
		}
		e.log.Info("prediction: idempotent hit, skipping CLOB call",
			"clientOrderId", clientOID, "strategyId", cmd.StrategyID)
		return existing, nil
	}
	if err != nil {
		return nil, fmt.Errorf("prediction_orders insert: %w", err)
	}

	// ---- Decrypt wallet & sign + submit ----------------------------
	addr, privKeyHex, err := e.decryptWallet(ctx, strat.Live.WalletID)
	if err != nil {
		_ = e.markRejected(ctx, clientOID, err)
		return nil, err
	}
	signed, err := e.signOrder(addr, privKeyHex, cmd)
	if err != nil {
		_ = e.markRejected(ctx, clientOID, err)
		return nil, err
	}
	res, err := e.deps.CLOB.SubmitOrder(ctx, addr, signed, "GTC")
	if err != nil {
		_ = e.markRejected(ctx, clientOID, err)
		return nil, err
	}
	updated, err := e.deps.OrderRepo.UpdateStatus(ctx, clientOID, mongostore.PredictionFillUpdate{
		Status:          domain.PredictionOrderStatus(strings.ToLower(res.Status)),
		ExchangeOrderID: res.OrderID,
	})
	if err != nil {
		e.log.Error("prediction: post-submit update_status failed", "err", err, "clientOrderId", clientOID)
	}
	e.publishOrderEvent(ctx, "event.prediction_order.filled", inserted, res)
	return updated, nil
}

func (e *Engine) markRejected(ctx context.Context, clientOID string, cause error) error {
	rawEvent := json.RawMessage(`{"reason":"` + jsonEscape(cause.Error()) + `"}`)
	_, err := e.deps.OrderRepo.UpdateStatus(ctx, clientOID, mongostore.PredictionFillUpdate{
		Status:   domain.PredictionOrderRejected,
		RawEvent: rawEvent,
	})
	if err != nil {
		e.log.Warn("prediction: markRejected update failed", "err", err, "clientOrderId", clientOID)
	}
	payload := map[string]any{
		"clientOrderId": clientOID,
		"status":        string(domain.PredictionOrderRejected),
		"error":         cause.Error(),
		"ts":            time.Now().UTC().Format(time.RFC3339),
	}
	e.publishRaw(ctx, "event.prediction_order.rejected", payload)
	return err
}

func (e *Engine) publishRejection(ctx context.Context, cmd domain.SubmitPredictionOrderCommand, cause error) {
	payload := map[string]any{
		"strategyId": cmd.StrategyID,
		"marketId":   cmd.MarketID,
		"tokenId":    cmd.TokenID,
		"status":     string(domain.PredictionOrderRejected),
		"error":      cause.Error(),
		"ts":         time.Now().UTC().Format(time.RFC3339),
	}
	e.publishRaw(ctx, "event.prediction_order.rejected", payload)
}

func (e *Engine) publishOrderEvent(ctx context.Context, eventType string, log *domain.PredictionOrderLog, res *polymarket.SubmitResult) {
	payload := map[string]any{
		"strategyId":      log.StrategyID,
		"clientOrderId":   log.ClientOrderID,
		"exchangeOrderId": res.OrderID,
		"marketId":        log.MarketID,
		"tokenId":         log.TokenID,
		"outcome":         string(log.Outcome),
		"side":            string(log.Side),
		"status":          res.Status,
		"price":           log.Price,
		"size":            log.Size,
		"ts":              time.Now().UTC().Format(time.RFC3339),
	}
	e.publishRaw(ctx, eventType, payload)
}

func (e *Engine) publishRaw(ctx context.Context, eventType string, payload map[string]any) {
	if e.deps.Redis == nil {
		return
	}
	payload["type"] = eventType
	bs, err := json.Marshal(payload)
	if err != nil {
		e.log.Warn("prediction: marshal event", "err", err)
		return
	}
	if _, err := e.deps.Redis.XAdd(ctx, &redis.XAddArgs{
		Stream: EventsStream,
		Values: map[string]any{"data": string(bs)},
	}).Result(); err != nil {
		e.log.Warn("prediction: publish event", "err", err, "type", eventType)
	}
}

// deriveClientOrderID returns sha256("polymarket:" + strategyId + ":" +
// marketId + ":" + outcome + ":" + bar_ts), first 32 hex chars.
//
// `bar_ts` is the producer-supplied IdempotencyKey (Python runtime sets
// it from the source bar timestamp). When absent we fall back to a
// per-engine atomic nonce so accidental double-submission still gets
// distinct ids.
func (e *Engine) deriveClientOrderID(cmd domain.SubmitPredictionOrderCommand) string {
	seq := cmd.IdempotencyKey
	if seq == "" {
		e.nonceMu.Lock()
		e.nonce++
		seq = fmt.Sprintf("%d:%d", e.nonce, time.Now().UnixNano())
		e.nonceMu.Unlock()
	}
	h := sha256.New()
	h.Write([]byte("polymarket:"))
	h.Write([]byte(cmd.StrategyID))
	h.Write([]byte(":"))
	h.Write([]byte(cmd.MarketID))
	h.Write([]byte(":"))
	h.Write([]byte(cmd.Outcome))
	h.Write([]byte(":"))
	h.Write([]byte(seq))
	return hex.EncodeToString(h.Sum(nil))[:32]
}

func (e *Engine) decryptWallet(ctx context.Context, walletID string) (address, privateKeyHex string, err error) {
	w, err := e.deps.WalletRepo.FindByID(ctx, walletID)
	if err != nil {
		return "", "", fmt.Errorf("load wallet: %w", err)
	}
	pkHex, err := e.deps.Envelope.DecryptForAccount(w.DEKCiphertext, w.PrivateKeyCiphertext)
	if err != nil {
		return "", "", fmt.Errorf("decrypt private key: %w", err)
	}
	addr, err := walletpkg.ValidateAndDerive(pkHex, w.Address)
	if err != nil {
		return "", "", err
	}
	return addr, pkHex, nil
}

func (e *Engine) signOrder(address, privKeyHex string, cmd domain.SubmitPredictionOrderCommand) (*polymarket.SignedOrder, error) {
	pk, err := walletpkg.PrivateKeyFromHex(privKeyHex)
	if err != nil {
		return nil, err
	}
	side := polymarket.OrderSideBuy
	if cmd.Side == domain.OrderSideSell {
		side = polymarket.OrderSideSell
	}
	tokenIDInt, ok := new(big.Int).SetString(cmd.TokenID, 10)
	if !ok {
		return nil, fmt.Errorf("invalid tokenId %q", cmd.TokenID)
	}
	makerAtomic := walletpkg.USDCToAtomic(cmd.Price * cmd.Size)
	takerAtomic := walletpkg.USDCToAtomic(cmd.Size) // outcome shares: 6-decimal
	order := polymarket.Order{
		Salt:          new(big.Int).SetInt64(time.Now().UnixNano()),
		Maker:         address,
		Signer:        address,
		Taker:         "0x0000000000000000000000000000000000000000",
		TokenID:       tokenIDInt,
		MakerAmount:   new(big.Int).SetUint64(makerAtomic),
		TakerAmount:   new(big.Int).SetUint64(takerAtomic),
		Expiration:    new(big.Int).SetInt64(0),
		Nonce:         new(big.Int).SetInt64(0),
		FeeRateBps:    new(big.Int).SetInt64(0),
		Side:          side,
		SignatureType: polymarket.SignatureTypeEOA,
	}
	return order.Sign(e.dom, pk)
}

func startOfUTCDay(t time.Time) time.Time {
	t = t.UTC()
	return time.Date(t.Year(), t.Month(), t.Day(), 0, 0, 0, 0, time.UTC)
}

func jsonEscape(s string) string {
	r := strings.NewReplacer(`\`, `\\`, `"`, `\"`, "\n", `\n`, "\r", `\r`, "\t", `\t`)
	return r.Replace(s)
}
