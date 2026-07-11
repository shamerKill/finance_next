package mongo

import (
	"context"
	"strings"
	"testing"
)

func TestAIGoalRun_FindAllForUser_RejectsEmptyUserID(t *testing.T) {
	r := &AIGoalRunRepo{}
	_, err := r.FindAllForUser(context.Background(), "", 20)
	if err == nil {
		t.Fatal("expected error for empty userID, got nil")
	}
	if !strings.Contains(err.Error(), "userID required") {
		t.Fatalf("unexpected error message: %v", err)
	}
}

func TestAIGoalRun_FindByIDForUser_RejectsEmptyInputs(t *testing.T) {
	r := &AIGoalRunRepo{}
	_, err := r.FindByIDForUser(context.Background(), "", "goal_1")
	if err == nil || !strings.Contains(err.Error(), "userID required") {
		t.Fatalf("expected userID required error, got %v", err)
	}

	_, err = r.FindByIDForUser(context.Background(), "user-1", "")
	if err == nil || !strings.Contains(err.Error(), "id required") {
		t.Fatalf("expected id required error, got %v", err)
	}
}

func TestAIGoalRun_Create_RejectsMissingIdentity(t *testing.T) {
	r := &AIGoalRunRepo{}
	err := r.Create(context.Background(), &AIGoalRunDoc{ID: "goal_1"})
	if err == nil || !strings.Contains(err.Error(), "userID required") {
		t.Fatalf("expected userID required error, got %v", err)
	}

	err = r.Create(context.Background(), &AIGoalRunDoc{UserID: "user-1"})
	if err == nil || !strings.Contains(err.Error(), "id required") {
		t.Fatalf("expected id required error, got %v", err)
	}
}

func TestAIGoalRun_UpsertActionForUser_RejectsMissingInputs(t *testing.T) {
	r := &AIGoalRunRepo{}
	action := AIGoalRunAction{ID: "backtest", Status: "done"}

	_, err := r.UpsertActionForUser(context.Background(), "", "goal_1", action)
	if err == nil || !strings.Contains(err.Error(), "userID required") {
		t.Fatalf("expected userID required error, got %v", err)
	}

	_, err = r.UpsertActionForUser(context.Background(), "user-1", "", action)
	if err == nil || !strings.Contains(err.Error(), "id required") {
		t.Fatalf("expected id required error, got %v", err)
	}

	_, err = r.UpsertActionForUser(context.Background(), "user-1", "goal_1", AIGoalRunAction{})
	if err == nil || !strings.Contains(err.Error(), "action id required") {
		t.Fatalf("expected action id required error, got %v", err)
	}
}
