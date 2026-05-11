// reconcile.go — 30s reconcile loop for the prediction engine.
//
// Sweeps every wallet that has open prediction_orders, lists open
// orders on the CLOB, and resolves any local-but-not-remote rows by
// marking them `unknown` (the state machine defers final disposition
// to the next CLOB round-trip — Phase 9.1 will fetch by id).
package engine

import (
	"context"
	"time"

	mongostore "github.com/finance_next/gateway/internal/store/mongo"
	"github.com/finance_next/gateway/internal/domain"
)

func (e *Engine) runReconcileLoop(ctx context.Context) {
	t := time.NewTicker(e.deps.ReconcileInterval)
	defer t.Stop()
	for {
		select {
		case <-ctx.Done():
			return
		case <-t.C:
			e.reconcileOnce(ctx)
		}
	}
}

func (e *Engine) reconcileOnce(ctx context.Context) {
	// We don't enumerate wallets here — instead we reconcile each
	// strategy that's seen a recent submission. The straightforward
	// pass: list open orders for every wallet that's appeared in any
	// strategy's live config. For Phase 9 we walk strategies and
	// dedupe by wallet.
	// R2: empty userID returns strategies across every tenant — the
	// reconcile loop has no HTTP context and must enumerate the world.
	strats, err := e.deps.StrategyRepo.FindAll(ctx, "")
	if err != nil {
		e.log.Warn("prediction reconcile: list strategies", "err", err)
		return
	}
	seen := map[string]bool{}
	for _, s := range strats {
		if !s.LiveEnabled() || s.Live.WalletID == "" {
			continue
		}
		if seen[s.Live.WalletID] {
			continue
		}
		seen[s.Live.WalletID] = true
		e.reconcileWallet(ctx, s.Live.WalletID)
	}
}

func (e *Engine) reconcileWallet(ctx context.Context, walletID string) {
	local, err := e.deps.OrderRepo.ListOpenForWallet(ctx, walletID)
	if err != nil {
		e.log.Warn("prediction reconcile: list local open", "err", err, "walletId", walletID)
		return
	}
	if len(local) == 0 {
		return
	}
	// Fetch open orders for *every* market this wallet touched. The
	// CLOB requires a market filter in many deployments — fall back
	// to no-filter if it accepts that.
	remote, err := e.deps.CLOB.OpenOrders(ctx, "")
	if err != nil {
		e.log.Warn("prediction reconcile: CLOB open orders", "err", err)
		return
	}
	remoteByID := map[string]bool{}
	for _, r := range remote {
		remoteByID[r.OrderID] = true
	}
	for _, l := range local {
		if l.ExchangeOrderID == "" {
			// Order never got an exchange id — likely failed before submit
			// got persisted. Mark unknown so an operator can investigate.
			_, _ = e.deps.OrderRepo.UpdateStatus(ctx, l.ClientOrderID, mongostore.PredictionFillUpdate{
				Status: domain.PredictionOrderUnknown,
			})
			continue
		}
		if !remoteByID[l.ExchangeOrderID] {
			// Local says open but exchange has no record; flip to unknown.
			_, _ = e.deps.OrderRepo.UpdateStatus(ctx, l.ClientOrderID, mongostore.PredictionFillUpdate{
				Status: domain.PredictionOrderUnknown,
			})
		}
	}
}
