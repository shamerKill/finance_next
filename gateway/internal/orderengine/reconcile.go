// reconcile.go — periodic order_log ↔ exchange diff loop.
//
// Goals:
//
//  1. For every account with locally-open orders, fetch the exchange's
//     view of open orders and converge state.
//  2. Local-but-not-remote → mark `unknown` then GetOrder() to learn the
//     terminal state. Common cases: filled / cancelled in the gap
//     between submit and the next sweep.
//  3. Remote-but-not-local → log a warning; with idempotency this is
//     pathological but possible (manual placement on the same account).
//
// Clock skew defence: we never trust local Now() for fill timestamps.
// Binance's `transactTime` (`updateTime` in their schema) is authoritative.
package orderengine

import (
	"context"
	"encoding/json"
	"errors"
	"time"

	"github.com/finance_next/gateway/internal/domain"
	mongostore "github.com/finance_next/gateway/internal/store/mongo"
)

// runReconcileLoop ticks every ReconcileInterval until ctx is cancelled.
func (e *Engine) runReconcileLoop(ctx context.Context) {
	t := time.NewTicker(e.deps.ReconcileInterval)
	defer t.Stop()
	for {
		select {
		case <-ctx.Done():
			return
		case <-t.C:
			if err := e.ReconcileOnce(ctx); err != nil {
				e.log.Warn("orderengine reconcile failed", "err", err)
			}
		}
	}
}

// ReconcileOnce performs a single reconcile pass. Public so tests can
// drive it deterministically without spinning the loop goroutine.
func (e *Engine) ReconcileOnce(ctx context.Context) error {
	// Walk distinct accountIds that currently have open orders. We
	// approximate by asking Mongo for all locally-open rows then
	// grouping in memory — the cardinality is bounded by the number of
	// active strategies × open-order rate, which is fine for Phase 4.
	openByAccount, err := e.collectOpenByAccount(ctx)
	if err != nil {
		return err
	}
	if len(openByAccount) == 0 {
		return nil
	}
	for accountID, locals := range openByAccount {
		if err := e.reconcileAccount(ctx, accountID, locals); err != nil {
			e.log.Warn("orderengine reconcileAccount failed", "accountId", accountID, "err", err)
			// Don't bail the whole pass on one account failure.
			continue
		}
	}
	return nil
}

// collectOpenByAccount loads every open order across all accounts and
// indexes by accountId. We could push this to a Mongo distinct() if it
// becomes hot.
func (e *Engine) collectOpenByAccount(ctx context.Context) (map[string][]domain.OrderLog, error) {
	// We don't have an index path that returns distinct accountIds in
	// the current schema — collect via FindAccounts. As a pragmatic
	// shortcut, we list all accounts then sweep each. Phase 4 daily
	// volume is low; phase 7 can swap in an index-driven path.
	// R2: empty userID returns accounts across every tenant — the
	// reconcile loop has no HTTP context to derive a userId from, so
	// it must enumerate the world.
	accounts, err := e.deps.AccountRepo.FindAll(ctx, "")
	if err != nil {
		return nil, err
	}
	out := map[string][]domain.OrderLog{}
	for _, a := range accounts {
		rows, err := e.deps.OrderRepo.ListOpenForAccount(ctx, a.ID)
		if err != nil {
			return nil, err
		}
		if len(rows) > 0 {
			out[a.ID] = rows
		}
	}
	return out, nil
}

func (e *Engine) reconcileAccount(ctx context.Context, accountID string, locals []domain.OrderLog) error {
	if len(locals) == 0 {
		return nil
	}
	// Build adapter for this account. We need the strategy's mode but
	// reconcile only reads from the exchange — refusing on a closed
	// mainnet gate is the correct behaviour here: when the gate is
	// closed for writes we don't want to *read* mainnet either, since
	// reading still requires production credentials. So we resolve mode
	// per row and skip rows we can't observe.
	apiKey, secret, passphrase, venue, err := e.decryptAccount(ctx, accountID)
	if err != nil {
		return err
	}
	// Group locals by symbol so a single GetOpenOrders call per symbol
	// covers the whole batch. For mainnet rows, the gate may refuse —
	// in which case we mark them as unknown without further query.
	bySymbol := map[domain.LiveMode]map[string][]domain.OrderLog{
		domain.LiveModeTestnet: {},
		domain.LiveModeMainnet: {},
	}
	for _, l := range locals {
		mode := l.Mode
		if !mode.IsValid() {
			mode = domain.LiveModeTestnet
		}
		bySymbol[mode][l.Symbol] = append(bySymbol[mode][l.Symbol], l)
	}

	for mode, symbols := range bySymbol {
		if len(symbols) == 0 {
			continue
		}
		adapter, err := e.deps.Factory(ctx, venue, mode, apiKey, secret, passphrase)
		if err != nil {
			e.log.Warn("orderengine reconcile: build adapter failed", "mode", mode, "err", err)
			continue
		}
		for symbol, rows := range symbols {
			remotes, err := adapter.GetOpenOrders(ctx, symbol)
			if err != nil {
				e.log.Warn("orderengine reconcile: GetOpenOrders failed", "symbol", symbol, "mode", mode, "err", err)
				continue
			}
			remoteIdx := map[string]int{} // clientOrderId → index in remotes
			for i, r := range remotes {
				remoteIdx[r.ClientOrderID] = i
			}
			localIdx := map[string]struct{}{}
			for _, l := range rows {
				localIdx[l.ClientOrderID] = struct{}{}
				if _, ok := remoteIdx[l.ClientOrderID]; !ok {
					// Local-but-not-remote → terminated. Learn final state.
					e.reconcileMissingLocal(ctx, adapter, l)
				}
			}
			for _, r := range remotes {
				if _, ok := localIdx[r.ClientOrderID]; !ok {
					// Remote-but-not-local: orphan order. Idempotency
					// makes this rare; log loudly.
					e.log.Warn("orderengine reconcile: orphan exchange order",
						"clientOrderId", r.ClientOrderID, "exchangeOrderId", r.ExchangeOrderID,
						"symbol", r.Symbol, "status", r.Status, "mode", mode)
				}
			}
		}
	}
	return nil
}

// reconcileMissingLocal learns terminal state for a local row that's no
// longer in the exchange's open list.
func (e *Engine) reconcileMissingLocal(ctx context.Context, adapter OrderAdapter, l domain.OrderLog) {
	// Step 1: mark as `unknown` so the UI reflects the in-flight transition.
	if _, err := e.deps.OrderRepo.UpdateStatus(ctx, l.ClientOrderID, mongostore.FillUpdate{
		Status: domain.OrderStatusUnknown,
	}); err != nil {
		e.log.Warn("orderengine reconcile: mark unknown failed", "clientOrderId", l.ClientOrderID, "err", err)
		return
	}
	// Step 2: query individual order to learn terminal state.
	got, err := adapter.GetOrder(ctx, l.Symbol, l.ClientOrderID)
	if err != nil {
		e.log.Warn("orderengine reconcile: GetOrder failed", "clientOrderId", l.ClientOrderID, "err", err)
		return
	}
	rawEvent := mustJSON(map[string]any{
		"reconcile":      true,
		"clientOrderId":  got.ClientOrderID,
		"exchangeOrderId": got.ExchangeOrderID,
		"status":         string(got.Status),
		"executedQty":    got.ExecutedQty,
		"avgPrice":       got.AvgFillPrice,
		// Use exchange's authoritative timestamp.
		"transactTime": got.UpdatedAt.UTC().Format(time.RFC3339Nano),
	})
	if _, err := e.deps.OrderRepo.UpdateStatus(ctx, l.ClientOrderID, mongostore.FillUpdate{
		Status:          domain.OrderStatus(got.Status),
		ExchangeOrderID: got.ExchangeOrderID,
		Filled:          got.ExecutedQty,
		AvgFillPrice:    got.AvgFillPrice,
		RawEvent:        rawEvent,
	}); err != nil {
		e.log.Warn("orderengine reconcile: terminal update failed", "clientOrderId", l.ClientOrderID, "err", err)
	}
	// Publish a synthetic event so the UI sees the state flip.
	e.publishRaw(ctx, "event.order."+orderEventSuffix(domain.OrderStatus(got.Status)), map[string]any{
		"strategyId":      l.StrategyID,
		"clientOrderId":   got.ClientOrderID,
		"exchangeOrderId": got.ExchangeOrderID,
		"symbol":          got.Symbol,
		"side":            string(l.Side),
		"status":          string(got.Status),
		"filled":          got.ExecutedQty,
		"avgFillPrice":    got.AvgFillPrice,
		"ts":              got.UpdatedAt.UTC().Format(time.RFC3339),
		"reconcile":       true,
	})
}

// orderEventSuffix maps a domain.OrderStatus to the redis-stream event
// type suffix (filled/rejected/...). Used to keep WS topic strings stable.
func orderEventSuffix(s domain.OrderStatus) string {
	switch s {
	case domain.OrderStatusFilled:
		return "filled"
	case domain.OrderStatusCanceled:
		return "canceled"
	case domain.OrderStatusRejected:
		return "rejected"
	}
	return "updated"
}

// mustJSON returns json.RawMessage(json.Marshal(v)) — caller asserts no
// marshal failure (only used for primitive maps here).
func mustJSON(v any) json.RawMessage {
	bs, err := json.Marshal(v)
	if err != nil {
		return json.RawMessage(`{}`)
	}
	return bs
}

// Sentinel: unused otherwise. Force the import path.
var _ = errors.New
