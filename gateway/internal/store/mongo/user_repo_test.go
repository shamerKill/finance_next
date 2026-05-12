// user_repo_test.go — offline guard tests for UserRepo. Live Mongo round-
// trip is covered by the docker-compose integration sweep; here we lock
// in the cheap pre-condition checks (Insert rejects empty email / id).
package mongo

import (
	"context"
	"strings"
	"testing"

	"github.com/finance_next/gateway/internal/domain"
	"go.mongodb.org/mongo-driver/v2/bson"
	"go.mongodb.org/mongo-driver/v2/mongo/options"
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

// TestUserIndexModels_PartialAdminUnique locks in Fix 5: the third
// index model must be a unique partial filter on role=="admin". This
// is the structural guard against the first-admin race — both
// concurrent inserts try role=admin but only one can win.
func TestUserIndexModels_PartialAdminUnique(t *testing.T) {
	models := UserIndexModels()
	var foundAdmin bool
	for _, m := range models {
		if m.Options == nil {
			continue
		}
		// Resolve the builder into the underlying IndexOptions so we
		// can inspect the partial filter expression. mongo-driver v2
		// returns a builder whose Opts slice each apply a single
		// field; running them all gives us the assembled struct.
		opts := &options.IndexOptions{}
		for _, fn := range m.Options.Opts {
			if fn == nil {
				continue
			}
			_ = fn(opts)
		}
		if opts.Name == nil || *opts.Name != "uniq_admin_role" {
			continue
		}
		foundAdmin = true
		if opts.Unique == nil || !*opts.Unique {
			t.Error("uniq_admin_role must be unique=true")
		}
		if opts.PartialFilterExpression == nil {
			t.Fatal("uniq_admin_role missing partial filter expression")
		}
		// The filter is bson.M{"role":"admin"}; pull out the role
		// key directly and check the value rather than rely on
		// String() formatting (driver internals don't guarantee a
		// particular debug shape).
		m, ok := opts.PartialFilterExpression.(bson.M)
		if !ok {
			// Defensive: in case the driver re-typed it to the
			// underlying map[string]any.
			if mm, ok2 := opts.PartialFilterExpression.(map[string]any); ok2 {
				m = bson.M(mm)
				ok = true
			}
		}
		if !ok {
			t.Fatalf("partial filter expression has unexpected type %T", opts.PartialFilterExpression)
		}
		if v, _ := m["role"].(string); v != "admin" {
			t.Errorf("expected partial filter role=admin, got role=%v (full=%v)", m["role"], m)
		}
	}
	if !foundAdmin {
		t.Fatalf("expected an index named uniq_admin_role; got %d models", len(models))
	}
}

