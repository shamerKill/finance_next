package orderengine

import (
	"context"
	"errors"
	"testing"
	"time"

	"github.com/finance_next/gateway/internal/domain"
)

type fakeSystemRepo struct {
	state  *domain.SystemState
	limits *domain.PortfolioLimits
}

func (f *fakeSystemRepo) GetSystemState(_ context.Context) (*domain.SystemState, error) {
	if f.state == nil {
		return &domain.SystemState{ID: domain.SystemStateGlobalID}, nil
	}
	return f.state, nil
}

func (f *fakeSystemRepo) GetPortfolioLimits(_ context.Context, _ string) (*domain.PortfolioLimits, error) {
	if f.limits == nil {
		return &domain.PortfolioLimits{UserID: domain.DefaultUserID}, nil
	}
	return f.limits, nil
}

// TestKillSwitch_RejectsBeforeRiskGate verifies that when
// system_state.tradingHalted=true the engine returns ErrTradingHalted
// and does NOT load the strategy or call the per-strategy risk gate.
func TestKillSwitch_RejectsBeforeRiskGate(t *testing.T) {
	sys := &fakeSystemRepo{state: &domain.SystemState{
		ID:            domain.SystemStateGlobalID,
		TradingHalted: true,
	}}
	// Construct an engine with ONLY the system repo wired; OptionRepo is
	// nil — proving the kill switch fires before the engine touches it
	// (otherwise we'd panic with a nil-pointer deref).
	e := New(Deps{
		Workers:           1,
		ReconcileInterval: time.Second,
		SystemRepo:        sys,
	})
	// We can't call processCommand directly without a Redis client for
	// publishRejection's XADD, so we instead verify the order: replace
	// e.deps.Redis with a no-op publisher by inspecting the error.
	cmd := domain.SubmitOrderCommand{
		StrategyID: "s1",
		Symbol:     "BTCUSDT",
		Side:       domain.OrderSideBuy,
		Type:       domain.OrderTypeMarket,
		Qty:        0.001,
		MarkPrice:  50000,
	}
	// Replace publishRaw to avoid Redis dependency.
	e.deps.Redis = nil
	_, err := e.processCommandSkippingPublish(context.Background(), cmd)
	if !errors.Is(err, ErrTradingHalted) {
		t.Fatalf("expected ErrTradingHalted, got %v", err)
	}
}

func TestKillSwitch_PassesWhenNotHalted(t *testing.T) {
	sys := &fakeSystemRepo{state: &domain.SystemState{
		ID:            domain.SystemStateGlobalID,
		TradingHalted: false,
	}}
	e := New(Deps{
		Workers:           1,
		ReconcileInterval: time.Second,
		SystemRepo:        sys,
	})
	cmd := domain.SubmitOrderCommand{
		StrategyID: "s1", Symbol: "BTCUSDT",
		Side: domain.OrderSideBuy, Type: domain.OrderTypeMarket,
		Qty: 0.001, MarkPrice: 50000,
	}
	_, err := e.processCommandSkippingPublish(context.Background(), cmd)
	// We should fail past the kill switch (so NOT ErrTradingHalted) —
	// the next gate hits the nil OptionRepo.
	if errors.Is(err, ErrTradingHalted) {
		t.Fatalf("kill switch should have passed; got %v", err)
	}
}
