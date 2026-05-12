// invitation_repo_test.go — offline guard tests for InvitationRepo.
package mongo

import (
	"context"
	"strings"
	"testing"

	"github.com/finance_next/gateway/internal/domain"
)

func TestInvitationRepo_InsertRejectsEmptyToken(t *testing.T) {
	r := &InvitationRepo{}
	err := r.Insert(context.Background(), &domain.Invitation{Token: ""})
	if err == nil {
		t.Fatal("expected error for empty token, got nil")
	}
	if !strings.Contains(err.Error(), "token") {
		t.Errorf("unexpected error message: %v", err)
	}
}
