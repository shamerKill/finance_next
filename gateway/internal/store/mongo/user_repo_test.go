// user_repo_test.go — offline guard tests for UserRepo. Live Mongo round-
// trip is covered by the docker-compose integration sweep; here we lock
// in the cheap pre-condition checks (Insert rejects empty email / id).
package mongo

import (
	"context"
	"strings"
	"testing"

	"github.com/finance_next/gateway/internal/domain"
)

func TestUserRepo_InsertRejectsEmptyEmail(t *testing.T) {
	r := &UserRepo{}
	err := r.Insert(context.Background(), &domain.User{ID: "abc", Email: ""})
	if err == nil {
		t.Fatal("expected error for empty email, got nil")
	}
	if !strings.Contains(err.Error(), "email") {
		t.Errorf("unexpected error message: %v", err)
	}
}

func TestUserRepo_InsertRejectsEmptyID(t *testing.T) {
	r := &UserRepo{}
	err := r.Insert(context.Background(), &domain.User{ID: "", Email: "a@b.c"})
	if err == nil {
		t.Fatal("expected error for empty id, got nil")
	}
	if !strings.Contains(err.Error(), "id") {
		t.Errorf("unexpected error message: %v", err)
	}
}
