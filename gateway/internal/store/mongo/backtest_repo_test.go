// backtest_repo_test.go — Node 1.A.2 offline guards for the per-user
// lookup additions. Live Mongo round-trip is covered by the
// docker-compose integration sweep; here we lock in the empty-userID
// rejection so a misuse can't silently scan across tenants.
package mongo

import (
	"context"
	"strings"
	"testing"
)

func TestBacktest_FindByIDForUser_RejectsEmptyUserID(t *testing.T) {
	r := &BacktestRepo{}
	_, err := r.FindByIDForUser(context.Background(), "", "run-1")
	if err == nil {
		t.Fatal("expected error for empty userID, got nil")
	}
	if !strings.Contains(err.Error(), "userID required") {
		t.Errorf("unexpected error message: %v", err)
	}
}

func TestBacktest_FindAllForUser_RejectsEmptyUserID(t *testing.T) {
	r := &BacktestRepo{}
	_, err := r.FindAllForUser(context.Background(), "", "", 10)
	if err == nil {
		t.Fatal("expected error for empty userID, got nil")
	}
	if !strings.Contains(err.Error(), "userID required") {
		t.Errorf("unexpected error message: %v", err)
	}
}
