// Package orderengine is the Phase 4 Binance live-execution layer.
//
// Architecture
// ============
//
//	Producer (signal runtime / admin endpoint)
//	   │  XADD command.order.submit
//	   ▼
//	Redis Stream `command.order.submit`
//	   │
//	   ▼
//	Engine worker pool (N goroutines, default 4)
//	   │  for each command:
//	   │   1. Load Option (strategy) → check live.enabled + live.mode
//	   │   2. Risk gate (notional cap, leverage cap, daily-loss cap)
//	   │   3. Compute clientOrderId = sha256(strategyId|seq|symbol|side|nonce)[:32]
//	   │   4. order_log.Insert (idempotency)
//	   │   5. Adapter.PlaceOrder (testnet by default; mainnet only if gate open)
//	   │   6. order_log.UpdateStatus + XADD event.order.{filled|rejected}
//	   ▼
//	Redis Stream `events` → WS strategy fan-out
//
// The engine is the gateway's *single* place to call Binance for writes;
// the WS hub never calls execution APIs. This keeps the rate-limit
// accounting and risk-gate enforcement co-located.
//
// Phase 7 will revisit when we split gateway into api/executor — for now
// the engine sits inside the gateway process so the dev loop is one
// binary. The Submit producer + Redis-stream consumer split is the
// seam we'll cut along.
package orderengine

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"log/slog"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/finance_next/gateway/internal/crypto"
	"github.com/finance_next/gateway/internal/domain"
	"github.com/finance_next/gateway/internal/exchange"
	"github.com/finance_next/gateway/internal/exchange/binance"
	"github.com/finance_next/gateway/internal/exchange/bybit"
	"github.com/finance_next/gateway/internal/exchange/okx"
	mongostore "github.com/finance_next/gateway/internal/store/mongo"
	"github.com/redis/go-redis/v9"
)

// Stream + consumer-group constants. Producers (Python runtime, admin
// HTTP endpoint) publish to CommandSubmitStream; the engine consumer
// group reads from it.
const (
	// CommandSubmitStream is the Redis Stream the engine consumes.
	CommandSubmitStream = "command.order.submit"
	// EventsStream is where the engine publishes order events for WS
	// fan-out + Python feedback loops.
	EventsStream = "events"
	// ConsumerGroup is the Redis consumer-group used by all gateway
	// replicas. The first XADD into the stream auto-creates it via
	// XGROUP CREATE … MKSTREAM at startup.
	ConsumerGroup = "gateway-engine"
)

// Common errors. The engine returns these to its caller (HTTP submit
// endpoint or runtime) so the UI can surface a precise reason.
var (
	// ErrLiveDisabled means the strategy's live.enabled is false. The
	// engine rejects without an exchange call.
	ErrLiveDisabled = errors.New("orderengine: strategy live trading disabled")
	// ErrRiskMissing fires when [domain.Option].Risk is nil or any of its
	// fields are zero/negative. We refuse to pick "sensible defaults" —
	// the spec says rejection is mandatory.
	ErrRiskMissing = errors.New("orderengine: strategy risk caps missing or invalid")
	// ErrRiskNotional means qty * mark_price > maxPositionUsd.
	ErrRiskNotional = errors.New("orderengine: order notional exceeds maxPositionUsd cap")
	// ErrRiskDailyLoss means today's realised PnL is below -dailyLossCapUsd.
	ErrRiskDailyLoss = errors.New("orderengine: daily loss cap reached, further submissions rejected")
	// ErrMissingMarkPrice fires for MARKET orders that lack a markPrice
	// hint in the command. We refuse rather than guess (no on-the-fly
	// price probe in the hot path).
	ErrMissingMarkPrice = errors.New("orderengine: MARKET order requires markPrice hint for risk gate")
	// ErrAccountNotConfigured means the strategy's live.accountId is empty.
	ErrAccountNotConfigured = errors.New("orderengine: strategy has no live.accountId configured")
)

// OrderClientFactory builds an exchange-specific order adapter for a
// given account + mode. Phase 5 introduces the venue parameter so the
// engine routes to the right adapter (binance / okx / bybit). The
// default factory wires the three production constructors. Tests inject
// a fake so they don't need a real exchange host.
type OrderClientFactory func(
	ctx context.Context,
	venue domain.Exchange,
	mode domain.LiveMode,
	apiKey, secretKey, passphrase string,
) (OrderAdapter, error)

// OrderAdapter is the slimmed interface the engine consumes. It is an
// alias for [exchange.OrderClient] — kept as a separate name in this
// package so tests + the order engine can refer to "OrderAdapter" for
// readability. Every venue's order client (binance, okx, bybit)
// implements this.
type OrderAdapter = exchange.OrderClient

// Deps bundles every dependency Engine needs. Keep this as a single
// struct so wiring in cmd/gateway/main.go stays compact.
type Deps struct {
	Redis       *redis.Client
	OrderRepo   *mongostore.OrderRepo
	OptionRepo  *mongostore.OptionRepo
	AccountRepo *mongostore.AccountRepo
	Envelope    *crypto.EnvelopeService
	Gate        *TokenStore
	// Factory is optional — when nil, defaultOrderClientFactory is used
	// (which wraps binance.NewOrderClient). Tests inject a mock.
	Factory OrderClientFactory
	// Workers is the worker-pool size (default 4).
	Workers int
	// ReconcileInterval defaults to 30s.
	ReconcileInterval time.Duration
	Log               *slog.Logger
}

// Engine is the running order pipeline. Constructed via New(); started
// via Start(); shut down by cancelling the context passed to Start.
type Engine struct {
	deps Deps
	log  *slog.Logger

	// instanceID disambiguates this gateway replica's consumer name in
	// the Redis Stream consumer group.
	instanceID string

	// nonceMu guards the deterministic-but-unique nonce stream used to
	// salt clientOrderId derivation when the producer didn't supply an
	// idempotency key.
	nonceMu sync.Mutex
	nonce   uint64
}

// New constructs an Engine. Start the workers + reconcile loop with
// Start(ctx).
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
	if d.Factory == nil {
		d.Factory = defaultOrderClientFactory(d.Gate)
	}
	if d.Gate == nil {
		// Conservative fallback: closed gate; mainnet calls always denied.
		d.Gate = NewTokenStore(false, d.Log)
	}
	id := time.Now().UTC().Format("20060102T150405")
	return &Engine{
		deps:       d,
		log:        d.Log,
		instanceID: "gw-" + id,
	}
}

// Gate exposes the underlying TokenStore so the admin HTTP handlers can
// register/confirm tokens.
func (e *Engine) Gate() *TokenStore { return e.deps.Gate }

// Start spins up worker goroutines + the reconcile loop. Blocks until
// ctx is cancelled.
func (e *Engine) Start(ctx context.Context) error {
	if e.deps.Redis == nil {
		return errors.New("orderengine: redis client required")
	}
	if e.deps.OrderRepo == nil || e.deps.OptionRepo == nil || e.deps.AccountRepo == nil {
		return errors.New("orderengine: repos required")
	}
	if e.deps.Envelope == nil {
		return errors.New("orderengine: envelope crypto required")
	}

	// Best-effort consumer-group creation. Errors are ignored if the
	// group already exists (BUSYGROUP).
	if err := e.deps.Redis.XGroupCreateMkStream(ctx, CommandSubmitStream, ConsumerGroup, "$").Err(); err != nil {
		if !strings.Contains(err.Error(), "BUSYGROUP") {
			e.log.Warn("xgroup create failed", "err", err)
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

	// Reconcile loop runs once per ReconcileInterval.
	wg.Add(1)
	go func() {
		defer wg.Done()
		e.runReconcileLoop(ctx)
	}()

	wg.Wait()
	return ctx.Err()
}

// Submit pushes a command onto the Redis stream and returns the new
// stream-entry id. The HTTP submit endpoint and Python runtime both
// call this (the runtime calls XADD directly — same stream).
func (e *Engine) Submit(ctx context.Context, cmd domain.SubmitOrderCommand) (string, error) {
	if cmd.StrategyID == "" {
		return "", errors.New("submit: strategyId required")
	}
	if cmd.Symbol == "" {
		return "", errors.New("submit: symbol required")
	}
	if !cmd.Side.IsValid() || !cmd.Type.IsValid() {
		return "", errors.New("submit: side and type required")
	}
	if cmd.Qty <= 0 {
		return "", errors.New("submit: qty must be > 0")
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

// runWorker is one consumer goroutine. Loops on XREADGROUP until ctx
// cancellation; per message it calls processCommand and XACKs.
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
			e.log.Warn("orderengine xreadgroup failed", "err", err, "consumer", consumer)
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
		e.log.Warn("orderengine: msg missing data field", "id", msg.ID)
		return
	}
	raw, ok := rawAny.(string)
	if !ok {
		e.log.Warn("orderengine: msg data not string", "id", msg.ID)
		return
	}
	var cmd domain.SubmitOrderCommand
	if err := json.Unmarshal([]byte(raw), &cmd); err != nil {
		e.log.Warn("orderengine: unmarshal command", "err", err, "id", msg.ID)
		return
	}
	if _, err := e.processCommand(ctx, cmd); err != nil {
		e.log.Warn("orderengine: process command", "err", err, "id", msg.ID, "strategyId", cmd.StrategyID)
	}
}

// processCommand is the single-message fast-path. Public-ish so
// /strategies/:id/live/submit-order can call it synchronously when the
// admin asks (the spec says the endpoint calls Submit; we provide both).
//
// Return value is the resulting [domain.OrderLog]; nil + error indicates
// the command was rejected before any exchange call.
func (e *Engine) processCommand(ctx context.Context, cmd domain.SubmitOrderCommand) (*domain.OrderLog, error) {
	opt, err := e.deps.OptionRepo.FindByID(ctx, cmd.StrategyID)
	if err != nil {
		return nil, fmt.Errorf("load strategy: %w", err)
	}
	if !opt.LiveEnabled() {
		e.publishRejection(ctx, cmd, ErrLiveDisabled)
		return nil, ErrLiveDisabled
	}
	if opt.Live.AccountID == "" {
		e.publishRejection(ctx, cmd, ErrAccountNotConfigured)
		return nil, ErrAccountNotConfigured
	}
	if opt.Risk == nil || opt.Risk.MaxPositionUsd <= 0 || opt.Risk.MaxLeverage <= 0 || opt.Risk.DailyLossCapUsd <= 0 {
		e.publishRejection(ctx, cmd, ErrRiskMissing)
		return nil, ErrRiskMissing
	}

	// ---- Risk gate. NB: order matters — cheap checks first. ----------
	mark := cmd.MarkPrice
	if mark == 0 {
		mark = cmd.Price // limit price acceptable
	}
	if mark <= 0 {
		e.publishRejection(ctx, cmd, ErrMissingMarkPrice)
		return nil, ErrMissingMarkPrice
	}
	notional := cmd.Qty * mark
	if notional > opt.Risk.MaxPositionUsd {
		e.publishRejection(ctx, cmd, fmt.Errorf("%w: notional=%.2f cap=%.2f", ErrRiskNotional, notional, opt.Risk.MaxPositionUsd))
		return nil, ErrRiskNotional
	}
	// Daily loss cap: sum filled rows since UTC-midnight; reject if
	// realised PnL is already worse than -cap.
	since := startOfUTCDay(time.Now())
	pnl, err := e.deps.OrderRepo.SumRealisedPnlSince(ctx, cmd.StrategyID, since)
	if err != nil {
		// Storage failure → fail closed. Audit ops can re-enable manually.
		e.publishRejection(ctx, cmd, fmt.Errorf("pnl lookup: %w", err))
		return nil, fmt.Errorf("pnl lookup: %w", err)
	}
	if pnl <= -opt.Risk.DailyLossCapUsd {
		e.publishRejection(ctx, cmd, ErrRiskDailyLoss)
		return nil, ErrRiskDailyLoss
	}

	// ---- Build clientOrderId + insert pending row -------------------
	clientOID := e.deriveClientOrderID(cmd)
	pending := &domain.OrderLog{
		ClientOrderID: clientOID,
		StrategyID:    cmd.StrategyID,
		AccountID:     opt.Live.AccountID,
		Symbol:        cmd.Symbol,
		Side:          cmd.Side,
		Type:          cmd.Type,
		Qty:           cmd.Qty,
		Price:         cmd.Price,
		Status:        domain.OrderStatusNew,
		Mode:          opt.Live.Mode,
	}
	inserted, err := e.deps.OrderRepo.Insert(ctx, pending)
	if errors.Is(err, mongostore.ErrOrderDuplicate) {
		// Idempotency hit — return the canonical existing row, skip exchange.
		existing, ferr := e.deps.OrderRepo.FindByClientOrderID(ctx, clientOID)
		if ferr != nil {
			return nil, fmt.Errorf("dup found but lookup failed: %w", ferr)
		}
		e.log.Info("orderengine: idempotent hit, skipping exchange call",
			"clientOrderId", clientOID, "strategyId", cmd.StrategyID)
		return existing, nil
	}
	if err != nil {
		return nil, fmt.Errorf("order_log insert: %w", err)
	}

	// ---- Build adapter & submit -------------------------------------
	apiKey, secret, passphrase, venue, err := e.decryptAccount(ctx, opt.Live.AccountID)
	if err != nil {
		_ = e.markRejected(ctx, clientOID, err)
		return nil, err
	}
	adapter, err := e.deps.Factory(ctx, venue, opt.Live.Mode, apiKey, secret, passphrase)
	if err != nil {
		_ = e.markRejected(ctx, clientOID, err)
		return nil, err
	}
	res, err := adapter.PlaceOrder(ctx, exchange.OrderRequest{
		Symbol:        cmd.Symbol,
		Side:          exchange.OrderSide(cmd.Side),
		Type:          exchange.OrderType(cmd.Type),
		Quantity:      cmd.Qty,
		Price:         cmd.Price,
		ClientOrderID: clientOID,
	})
	if err != nil {
		_ = e.markRejected(ctx, clientOID, err)
		return nil, err
	}
	updated, err := e.deps.OrderRepo.UpdateStatus(ctx, clientOID, mongostore.FillUpdate{
		Status:          domain.OrderStatus(res.Status),
		ExchangeOrderID: res.ExchangeOrderID,
		Filled:          res.ExecutedQty,
		AvgFillPrice:    res.AvgFillPrice,
		RawEvent:        res.Raw,
	})
	if err != nil {
		// We placed the order successfully but couldn't update audit —
		// log loudly. Reconcile loop will fix it on next sweep.
		e.log.Error("orderengine: post-submit update_status failed", "err", err, "clientOrderId", clientOID)
	}
	e.publishOrderEvent(ctx, "event.order.filled", inserted, res)
	return updated, nil
}

// markRejected stamps the local row as `rejected`, attaches the error
// message to rawEvents, and publishes an event. Best-effort — failures
// here only land in the log.
func (e *Engine) markRejected(ctx context.Context, clientOID string, cause error) error {
	rawEvent := json.RawMessage(`{"reason":"` + jsonEscape(cause.Error()) + `"}`)
	_, err := e.deps.OrderRepo.UpdateStatus(ctx, clientOID, mongostore.FillUpdate{
		Status:   domain.OrderStatusRejected,
		RawEvent: rawEvent,
	})
	if err != nil {
		e.log.Warn("orderengine: markRejected update failed", "err", err, "clientOrderId", clientOID)
	}
	// Also publish an event for WS fan-out.
	payload := map[string]any{
		"strategyId":    "",
		"clientOrderId": clientOID,
		"status":        string(domain.OrderStatusRejected),
		"error":         cause.Error(),
		"ts":            time.Now().UTC().Format(time.RFC3339),
	}
	e.publishRaw(ctx, "event.order.rejected", payload)
	return err
}

// publishRejection emits a synthetic event when we reject *before* the
// row exists (e.g. live disabled, missing risk caps).
func (e *Engine) publishRejection(ctx context.Context, cmd domain.SubmitOrderCommand, cause error) {
	payload := map[string]any{
		"strategyId": cmd.StrategyID,
		"symbol":     cmd.Symbol,
		"status":     string(domain.OrderStatusRejected),
		"error":      cause.Error(),
		"ts":         time.Now().UTC().Format(time.RFC3339),
	}
	e.publishRaw(ctx, "event.order.rejected", payload)
}

// publishOrderEvent emits a filled/partial event with the result fields.
func (e *Engine) publishOrderEvent(ctx context.Context, eventType string, log *domain.OrderLog, res *exchange.OrderResult) {
	payload := map[string]any{
		"strategyId":      log.StrategyID,
		"clientOrderId":   log.ClientOrderID,
		"exchangeOrderId": res.ExchangeOrderID,
		"symbol":          log.Symbol,
		"side":            string(log.Side),
		"status":          string(res.Status),
		"filled":          res.ExecutedQty,
		"avgFillPrice":    res.AvgFillPrice,
		"ts":              time.Now().UTC().Format(time.RFC3339),
	}
	e.publishRaw(ctx, eventType, payload)
}

func (e *Engine) publishRaw(ctx context.Context, eventType string, payload map[string]any) {
	payload["type"] = eventType
	bs, err := json.Marshal(payload)
	if err != nil {
		e.log.Warn("orderengine: marshal event", "err", err)
		return
	}
	if _, err := e.deps.Redis.XAdd(ctx, &redis.XAddArgs{
		Stream: EventsStream,
		Values: map[string]any{"data": string(bs)},
	}).Result(); err != nil {
		e.log.Warn("orderengine: publish event", "err", err, "type", eventType)
	}
}

// deriveClientOrderID computes the deterministic idempotency key. Spec:
// sha256(strategyId|seq|symbol|side|nonce), first 32 hex chars.
//
// We use the producer-supplied IdempotencyKey as the "seq" component
// when present (Python runtime sets it from `<strategyId>:<kind>:<symbol>:<bar_ts>`
// so a re-run on the same bar collapses to the same hash). When absent,
// we substitute a per-engine atomic nonce — which yields a *new* id on
// every call, so duplicates only collapse via the producer's key.
func (e *Engine) deriveClientOrderID(cmd domain.SubmitOrderCommand) string {
	seq := cmd.IdempotencyKey
	if seq == "" {
		e.nonceMu.Lock()
		e.nonce++
		seq = strconv.FormatUint(e.nonce, 10) + ":" + strconv.FormatInt(time.Now().UnixNano(), 10)
		e.nonceMu.Unlock()
	}
	h := sha256.New()
	h.Write([]byte(cmd.StrategyID))
	h.Write([]byte("|"))
	h.Write([]byte(seq))
	h.Write([]byte("|"))
	h.Write([]byte(cmd.Symbol))
	h.Write([]byte("|"))
	h.Write([]byte(cmd.Side))
	digest := h.Sum(nil)
	// Binance allows up to 36 chars; the spec asks for 32 hex chars.
	return hex.EncodeToString(digest)[:32]
}

func (e *Engine) decryptAccount(ctx context.Context, accountID string) (apiKey, secret, passphrase string, venue domain.Exchange, err error) {
	a, err := e.deps.AccountRepo.FindByID(ctx, accountID)
	if err != nil {
		return "", "", "", "", fmt.Errorf("load account: %w", err)
	}
	apiKey, err = e.deps.Envelope.DecryptForAccount(a.DEKCiphertext, a.APIKeyCiphertext)
	if err != nil {
		return "", "", "", "", fmt.Errorf("decrypt apiKey: %w", err)
	}
	secret, err = e.deps.Envelope.DecryptForAccount(a.DEKCiphertext, a.SecretKeyCiphertext)
	if err != nil {
		return "", "", "", "", fmt.Errorf("decrypt secretKey: %w", err)
	}
	if a.PassphraseCiphertext != "" {
		passphrase, err = e.deps.Envelope.DecryptForAccount(a.DEKCiphertext, a.PassphraseCiphertext)
		if err != nil {
			return "", "", "", "", fmt.Errorf("decrypt passphrase: %w", err)
		}
	}
	venue = a.Exchange
	if !venue.IsValid() {
		return "", "", "", "", fmt.Errorf("account %s has unrecognised exchange %q", accountID, a.Exchange)
	}
	return apiKey, secret, passphrase, venue, nil
}

// defaultOrderClientFactory builds the venue-specific adapter wired to
// the same TokenStore. Phase 5 added the venue parameter so OKX + Bybit
// share the *same* mainnet gate as Binance — there is exactly one
// TokenStore per process; opening it opens it for all three.
func defaultOrderClientFactory(gate *TokenStore) OrderClientFactory {
	return func(ctx context.Context, venue domain.Exchange, mode domain.LiveMode, apiKey, secretKey, passphrase string) (OrderAdapter, error) {
		var allowed func() bool = func() bool { return false }
		if gate != nil {
			allowed = gate.Allowed
		}
		switch venue {
		case domain.ExchangeBinance:
			bgate := binance.MainnetGateFunc(allowed)
			return binance.NewOrderClient(mode, bgate, apiKey, secretKey), nil
		case domain.ExchangeOKX:
			ogate := okx.MainnetGateFunc(allowed)
			return okx.NewOrderClient(mode, ogate, apiKey, secretKey, passphrase), nil
		case domain.ExchangeBybit:
			bgate := bybit.MainnetGateFunc(allowed)
			return bybit.NewOrderClient(mode, bgate, apiKey, secretKey), nil
		default:
			return nil, fmt.Errorf("orderengine: venue %q has no order adapter wired", venue)
		}
	}
}

// startOfUTCDay returns t truncated to UTC midnight.
func startOfUTCDay(t time.Time) time.Time {
	t = t.UTC()
	return time.Date(t.Year(), t.Month(), t.Day(), 0, 0, 0, 0, time.UTC)
}

// jsonEscape escapes the minimum necessary chars for embedding in a
// JSON string literal. We use it to build a tiny ad-hoc rejection
// payload without involving the marshaler.
func jsonEscape(s string) string {
	r := strings.NewReplacer(`\`, `\\`, `"`, `\"`, "\n", `\n`, "\r", `\r`, "\t", `\t`)
	return r.Replace(s)
}
