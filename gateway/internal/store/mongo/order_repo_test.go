// order_repo_test.go — non-Mongo unit tests for the OrderRepo guards.
//
// Most OrderRepo paths are covered by integration tests against the
// docker-compose Mongo. This file only houses the cheap, fast guards
// that fire BEFORE any collection access — so they can be exercised
// against a bare zero-value repo with no live database connection.
//
// R2 update: the previous "default"-only guard has been replaced with
// real `userId` filtering at the aggregation pipeline level. The cheap
// guard now only rejects the *empty* userID — every order belongs to
// some tenant, including the legacy "default" one. The actual filter
// behaviour is exercised by integration tests that spin up Mongo.
package mongo

import (
	"context"
	"strings"
	"testing"
	"time"
)

// TestSumOpenNotionalForUser_RejectsEmptyUserID confirms the cheap guard
// fires on the empty string before any Mongo round-trip happens.
func TestSumOpenNotionalForUser_RejectsEmptyUserID(t *testing.T) {
	r := &OrderRepo{} // nil col — guard runs first, never touches Mongo.

	_, _, err := r.SumOpenNotionalForUser(context.Background(), "")
	if err == nil {
		t.Fatal("expected error for empty userID, got nil")
	}
	if !strings.Contains(err.Error(), "userID required") {
		t.Errorf("unexpected error message: %v", err)
	}
}

// TestSumRealisedPnlSinceForUser_RejectsEmptyUserID mirrors the above.
func TestSumRealisedPnlSinceForUser_RejectsEmptyUserID(t *testing.T) {
	r := &OrderRepo{}

	_, err := r.SumRealisedPnlSinceForUser(context.Background(), "", time.Now())
	if err == nil {
		t.Fatal("expected error for empty userID, got nil")
	}
	if !strings.Contains(err.Error(), "userID required") {
		t.Errorf("unexpected error message: %v", err)
	}
}

// TestCountFilledSinceForUser_RejectsEmptyUserID guards the same cheap
// branch as the SumX*ForUser variants — every order belongs to a tenant,
// and accidentally calling with "" must never silently scan everyone's
// orders.
func TestCountFilledSinceForUser_RejectsEmptyUserID(t *testing.T) {
	r := &OrderRepo{}

	_, err := r.CountFilledSinceForUser(context.Background(), "", time.Now())
	if err == nil {
		t.Fatal("expected error for empty userID, got nil")
	}
	if !strings.Contains(err.Error(), "userID required") {
		t.Errorf("unexpected error message: %v", err)
	}
}

// TestListByStrategyAndUser_RejectsEmptyUserID mirrors the guard tests
// above. The /strategies/:id/performance handler relies on this filter
// to keep cross-tenant order data from leaking.
func TestListByStrategyAndUser_RejectsEmptyUserID(t *testing.T) {
	r := &OrderRepo{}

	_, err := r.ListByStrategyAndUser(context.Background(), "strat-1", "", 50)
	if err == nil {
		t.Fatal("expected error for empty userID, got nil")
	}
	if !strings.Contains(err.Error(), "userID required") {
		t.Errorf("unexpected error message: %v", err)
	}
}

// TestAggregateForStrategyAndUser_RejectsEmptyUserID covers the
// dashboard performance endpoint's KPI source.
func TestAggregateForStrategyAndUser_RejectsEmptyUserID(t *testing.T) {
	r := &OrderRepo{}

	_, err := r.AggregateForStrategyAndUser(context.Background(), "strat-1", "", time.Now())
	if err == nil {
		t.Fatal("expected error for empty userID, got nil")
	}
	if !strings.Contains(err.Error(), "userID required") {
		t.Errorf("unexpected error message: %v", err)
	}
}

// TestSumOpenNotionalForUser_NonEmptyUserID_PassesGuard documents that
// any non-empty userID passes the guard and proceeds to the aggregation
// (which panics here because col is nil — the test is structured around
// the panic to assert we got past the cheap guard).
func TestSumOpenNotionalForUser_NonEmptyUserID_PassesGuard(t *testing.T) {
	r := &OrderRepo{}
	defer func() {
		// Expected: nil pointer deref because col is nil. The point is
		// the guard didn't fire — we got past it.
		_ = recover()
	}()
	_, _, _ = r.SumOpenNotionalForUser(context.Background(), "user-42")
	// If we reach here without a panic the guard returned early — that
	// would be a regression from the empty-string check.
	t.Fatal("expected panic from nil collection after guard passed, but the call returned cleanly — guard may be too strict")
}
