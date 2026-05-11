// recommendation_repo_test.go — cheap-guard tests for the dashboard's
// repo additions. The actual Mongo aggregation paths are covered by
// integration tests against the compose-driven Mongo; here we just lock
// in the empty-userID guard so a misuse can't silently scan across
// tenants.
package mongo

import (
	"context"
	"strings"
	"testing"
	"time"
)

func TestCountByStatus_RejectsEmptyUserID(t *testing.T) {
	r := &RecommendationRepo{}
	_, err := r.CountByStatus(context.Background(), "", "pending_review")
	if err == nil {
		t.Fatal("expected error for empty userID, got nil")
	}
	if !strings.Contains(err.Error(), "userID required") {
		t.Errorf("unexpected error message: %v", err)
	}
}

func TestListByStatusForUser_RejectsEmptyUserID(t *testing.T) {
	r := &RecommendationRepo{}
	_, err := r.ListByStatusForUser(context.Background(), "", "pending_review", 3)
	if err == nil {
		t.Fatal("expected error for empty userID, got nil")
	}
	if !strings.Contains(err.Error(), "userID required") {
		t.Errorf("unexpected error message: %v", err)
	}
}

func TestSumSpentSinceForUser_RejectsEmptyUserID(t *testing.T) {
	r := &OptimizationRunRepo{}
	_, err := r.SumSpentSinceForUser(context.Background(), "", time.Now())
	if err == nil {
		t.Fatal("expected error for empty userID, got nil")
	}
	if !strings.Contains(err.Error(), "userID required") {
		t.Errorf("unexpected error message: %v", err)
	}
}

// TestUserIDFilter_DefaultIncludesLegacyDocs documents the contract
// recommendation/optimization quant writers depend on. Until the quant
// worker writes userId on every recommendation/optimization-run doc,
// the dashboard for the "default" tenant must include rows that lack
// the field. Non-default users must NOT inherit them — strict equality.
func TestUserIDFilter_DefaultIncludesLegacyDocs(t *testing.T) {
	defaultFilter := userIDFilter("default")
	if _, ok := defaultFilter["$or"]; !ok {
		t.Errorf("default tenant filter should be a $or covering legacy docs: %+v", defaultFilter)
	}
	otherFilter := userIDFilter("alice")
	if v, ok := otherFilter["userId"]; !ok || v != "alice" {
		t.Errorf("non-default tenant should be a strict equality filter: %+v", otherFilter)
	}
}
