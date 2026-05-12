// admin_users_test.go — coverage for the Node 1.A.2 claim-legacy
// endpoint. Uses in-process fakes (no Mongo) so the test sweep stays
// offline.
package handlers

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync"
	"testing"

	"github.com/finance_next/gateway/internal/domain"
	gwmw "github.com/finance_next/gateway/internal/http/middleware"
	mongostore "github.com/finance_next/gateway/internal/store/mongo"
	"github.com/labstack/echo/v4"
	"go.mongodb.org/mongo-driver/v2/bson"
)

// ---- fakes ---------------------------------------------------------------

type fakeUserProbe struct {
	adminCount int64
	user       *domain.User
	findErr    error
}

func (f *fakeUserProbe) CountByRole(_ context.Context, role string) (int64, error) {
	if role == domain.UserRoleAdmin {
		return f.adminCount, nil
	}
	return 0, nil
}

func (f *fakeUserProbe) FindByID(_ context.Context, id string) (*domain.User, error) {
	if f.findErr != nil {
		return nil, f.findErr
	}
	if f.user != nil && f.user.ID == id {
		return f.user, nil
	}
	return nil, mongostore.ErrUserNotFound
}

// fakeMigrator records per-collection UpdateMany invocations and
// returns canned counts. Goroutine-safe via mutex even though the
// handler runs sequentially — the lock is a cheap guard against
// future test additions.
type fakeMigrator struct {
	mu               sync.Mutex
	updateCounts     map[string]int64 // collection -> rows to report as modified
	updateInvokeLog  []string
	deleteCounts     map[string]int64
	hasDocCollection map[string]bool // collection -> result for HasDocument
	transactional    bool            // value StartTransaction reports

	updateErr error
}

func (f *fakeMigrator) UpdateMany(_ context.Context, collection string, filter, _ bson.M) (int64, error) {
	f.mu.Lock()
	defer f.mu.Unlock()
	f.updateInvokeLog = append(f.updateInvokeLog, collection)
	if f.updateErr != nil {
		return 0, f.updateErr
	}
	// Only count rows when the filter matches the legacy literal — mirrors
	// the production query so an over-broad future filter is caught.
	if v, ok := filter["userId"]; !ok || v != LegacyUserIDLiteral {
		return 0, errors.New("unexpected filter shape: " + collection)
	}
	if f.updateCounts == nil {
		return 0, nil
	}
	return f.updateCounts[collection], nil
}

func (f *fakeMigrator) HasDocument(_ context.Context, collection string, _ bson.M) (bool, error) {
	f.mu.Lock()
	defer f.mu.Unlock()
	if f.hasDocCollection == nil {
		return false, nil
	}
	return f.hasDocCollection[collection], nil
}

func (f *fakeMigrator) DeleteMany(_ context.Context, collection string, _ bson.M) (int64, error) {
	f.mu.Lock()
	defer f.mu.Unlock()
	if f.deleteCounts == nil {
		return 0, nil
	}
	return f.deleteCounts[collection], nil
}

func (f *fakeMigrator) StartTransaction(ctx context.Context, fn func(context.Context) error) (bool, error) {
	if f.transactional {
		if err := fn(ctx); err != nil {
			return true, err
		}
		return true, nil
	}
	return false, nil
}

// echoForClaim builds an Echo router that pre-populates the context
// with the given userId + role before forwarding to the handler — the
// production WithAuth middleware does this from the cookie but we
// don't want to spin up a full JWT in unit tests.
func echoForClaim(t *testing.T, userID, role string, h *AdminUsersHandler) *echo.Echo {
	t.Helper()
	e := echo.New()
	e.Use(func(next echo.HandlerFunc) echo.HandlerFunc {
		return func(c echo.Context) error {
			if userID != "" {
				c.Set(gwmw.ContextKey, userID)
			}
			if role != "" {
				c.Set(gwmw.ContextRoleKey, role)
			}
			return next(c)
		}
	})
	g := e.Group("/api/v1")
	h.Register(g)
	return e
}

// ---- tests ---------------------------------------------------------------

func TestClaimLegacy_503WhenDepsNil(t *testing.T) {
	h := NewAdminUsersHandlerWithDeps(nil, nil)
	e := echoForClaim(t, "admin-1", domain.UserRoleAdmin, h)
	req := httptest.NewRequest(http.MethodPost, "/api/v1/admin/users/claim-legacy", nil)
	rec := httptest.NewRecorder()
	e.ServeHTTP(rec, req)
	if rec.Code != http.StatusServiceUnavailable {
		t.Fatalf("expected 503, got %d (body=%s)", rec.Code, rec.Body.String())
	}
}

func TestClaimLegacy_403WhenNotAdmin(t *testing.T) {
	h := NewAdminUsersHandlerWithDeps(&fakeUserProbe{}, &fakeMigrator{})
	e := echoForClaim(t, "user-1", domain.UserRoleMember, h)
	req := httptest.NewRequest(http.MethodPost, "/api/v1/admin/users/claim-legacy", nil)
	rec := httptest.NewRecorder()
	e.ServeHTTP(rec, req)
	if rec.Code != http.StatusForbidden {
		t.Fatalf("expected 403, got %d (body=%s)", rec.Code, rec.Body.String())
	}
	if !strings.Contains(rec.Body.String(), "admin only") {
		t.Errorf("expected admin-only message, got %s", rec.Body.String())
	}
}

func TestClaimLegacy_403WhenNoRoleAtAll(t *testing.T) {
	h := NewAdminUsersHandlerWithDeps(&fakeUserProbe{}, &fakeMigrator{})
	e := echoForClaim(t, "user-1", "", h) // role unset entirely
	req := httptest.NewRequest(http.MethodPost, "/api/v1/admin/users/claim-legacy", nil)
	rec := httptest.NewRecorder()
	e.ServeHTTP(rec, req)
	if rec.Code != http.StatusForbidden {
		t.Fatalf("expected 403, got %d", rec.Code)
	}
}

func TestClaimLegacy_403WhenMultipleAdmins(t *testing.T) {
	probe := &fakeUserProbe{adminCount: 2}
	h := NewAdminUsersHandlerWithDeps(probe, &fakeMigrator{})
	e := echoForClaim(t, "admin-1", domain.UserRoleAdmin, h)
	req := httptest.NewRequest(http.MethodPost, "/api/v1/admin/users/claim-legacy", nil)
	rec := httptest.NewRecorder()
	e.ServeHTTP(rec, req)
	if rec.Code != http.StatusForbidden {
		t.Fatalf("expected 403, got %d (body=%s)", rec.Code, rec.Body.String())
	}
	if !strings.Contains(rec.Body.String(), "single admin") {
		t.Errorf("expected single-admin error, got %s", rec.Body.String())
	}
}

func TestClaimLegacy_403WhenCallerIsDefault(t *testing.T) {
	probe := &fakeUserProbe{adminCount: 1, user: &domain.User{ID: domain.DefaultUserID, Role: domain.UserRoleAdmin}}
	h := NewAdminUsersHandlerWithDeps(probe, &fakeMigrator{})
	// Caller userId is the literal "default" — refuse so we don't no-op
	// the data set onto itself.
	e := echoForClaim(t, domain.DefaultUserID, domain.UserRoleAdmin, h)
	req := httptest.NewRequest(http.MethodPost, "/api/v1/admin/users/claim-legacy", nil)
	rec := httptest.NewRecorder()
	e.ServeHTTP(rec, req)
	if rec.Code != http.StatusForbidden {
		t.Fatalf("expected 403, got %d (body=%s)", rec.Code, rec.Body.String())
	}
}

// TestClaimLegacy_HappyPath_Sequential — single admin in the system,
// no transactional support; migration runs sequentially and returns
// per-collection counts.
func TestClaimLegacy_HappyPath_Sequential(t *testing.T) {
	probe := &fakeUserProbe{
		adminCount: 1,
		user:       &domain.User{ID: "admin-hex-1", Role: domain.UserRoleAdmin},
	}
	mig := &fakeMigrator{
		transactional: false,
		updateCounts: map[string]int64{
			mongostore.CollectionName:                   3,
			mongostore.AccountCollectionName:            1,
			mongostore.OrderCollectionName:              42,
			mongostore.WalletCollectionName:             0,
			mongostore.PredictionStrategyCollectionName: 0,
			mongostore.PredictionOrderCollectionName:    0,
			mongostore.RecommendationCollectionName:     7,
			mongostore.OptimizationRunsCollectionName:   2,
			mongostore.BacktestCollectionName:           5,
			mongostore.PortfolioLimitsCollectionName:    1,
		},
	}
	h := NewAdminUsersHandlerWithDeps(probe, mig)
	e := echoForClaim(t, "admin-hex-1", domain.UserRoleAdmin, h)
	req := httptest.NewRequest(http.MethodPost, "/api/v1/admin/users/claim-legacy", nil)
	rec := httptest.NewRecorder()
	e.ServeHTTP(rec, req)
	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d (body=%s)", rec.Code, rec.Body.String())
	}
	var resp ClaimLegacyResponse
	if err := json.Unmarshal(rec.Body.Bytes(), &resp); err != nil {
		t.Fatalf("unmarshal: %v", err)
	}
	if resp.NewOwnerID != "admin-hex-1" {
		t.Errorf("newOwnerId = %q, want admin-hex-1", resp.NewOwnerID)
	}
	if resp.Transactional {
		t.Errorf("expected transactional=false on standalone-Mongo fake")
	}
	if got := resp.UpdatedCounts[mongostore.OrderCollectionName]; got != 42 {
		t.Errorf("order_log count = %d, want 42", got)
	}
	if got := resp.UpdatedCounts[mongostore.RecommendationCollectionName]; got != 7 {
		t.Errorf("ai_recommendations count = %d, want 7", got)
	}
	if got := resp.UpdatedCounts[mongostore.OptimizationRunsCollectionName]; got != 2 {
		t.Errorf("optimization_runs count = %d, want 2", got)
	}
	if got := resp.UpdatedCounts[mongostore.BacktestCollectionName]; got != 5 {
		t.Errorf("backtest_results count = %d, want 5", got)
	}
	// Every legacy collection must appear in the response — even when
	// the migrator reported zero rows — so operators can verify the
	// full sweep ran.
	for _, name := range LegacyCollections {
		if _, ok := resp.UpdatedCounts[name]; !ok {
			t.Errorf("response missing collection %s", name)
		}
	}
}

// TestClaimLegacy_HappyPath_Transactional — replset Mongo path. The
// fake invokes the closure inside StartTransaction and reports
// transactional=true.
func TestClaimLegacy_HappyPath_Transactional(t *testing.T) {
	probe := &fakeUserProbe{
		adminCount: 1,
		user:       &domain.User{ID: "admin-hex-2", Role: domain.UserRoleAdmin},
	}
	mig := &fakeMigrator{
		transactional: true,
		updateCounts: map[string]int64{
			mongostore.CollectionName:        1,
			mongostore.OrderCollectionName:   2,
			mongostore.BacktestCollectionName: 3,
		},
	}
	h := NewAdminUsersHandlerWithDeps(probe, mig)
	e := echoForClaim(t, "admin-hex-2", domain.UserRoleAdmin, h)
	req := httptest.NewRequest(http.MethodPost, "/api/v1/admin/users/claim-legacy", nil)
	rec := httptest.NewRecorder()
	e.ServeHTTP(rec, req)
	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d (body=%s)", rec.Code, rec.Body.String())
	}
	var resp ClaimLegacyResponse
	_ = json.Unmarshal(rec.Body.Bytes(), &resp)
	if !resp.Transactional {
		t.Errorf("expected transactional=true on replset fake")
	}
}

// TestClaimLegacy_PortfolioLimits_DeletesOnConflict — when the admin
// already has a portfolio_limits row, the migrator's HasDocument
// returns true and the handler should call DeleteMany (instead of
// UpdateMany) to remove the legacy stub.
func TestClaimLegacy_PortfolioLimits_DeletesOnConflict(t *testing.T) {
	probe := &fakeUserProbe{
		adminCount: 1,
		user:       &domain.User{ID: "admin-hex-3", Role: domain.UserRoleAdmin},
	}
	mig := &fakeMigrator{
		transactional: false,
		hasDocCollection: map[string]bool{
			mongostore.PortfolioLimitsCollectionName: true,
		},
		deleteCounts: map[string]int64{
			mongostore.PortfolioLimitsCollectionName: 1,
		},
		updateCounts: map[string]int64{},
	}
	h := NewAdminUsersHandlerWithDeps(probe, mig)
	e := echoForClaim(t, "admin-hex-3", domain.UserRoleAdmin, h)
	req := httptest.NewRequest(http.MethodPost, "/api/v1/admin/users/claim-legacy", nil)
	rec := httptest.NewRecorder()
	e.ServeHTTP(rec, req)
	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d (body=%s)", rec.Code, rec.Body.String())
	}
	var resp ClaimLegacyResponse
	_ = json.Unmarshal(rec.Body.Bytes(), &resp)
	if got := resp.UpdatedCounts[mongostore.PortfolioLimitsCollectionName]; got != 1 {
		t.Errorf("portfolio_limits should report DeleteMany count=1, got %d", got)
	}
	// portfolio_limits must NOT show up in the UpdateMany invoke log
	// (the conflict branch routes through DeleteMany instead).
	for _, name := range mig.updateInvokeLog {
		if name == mongostore.PortfolioLimitsCollectionName {
			t.Errorf("portfolio_limits unexpectedly went through UpdateMany on conflict path")
		}
	}
}

// TestClaimLegacy_Idempotent — second invocation reports zero counts
// because the migrator (production-side) only matches rows whose
// userId equals the legacy literal. Our fake reports the canned
// counts on EVERY call; we verify the contract by reading the
// pattern an operator would see: response carries every collection
// in the response map.
func TestClaimLegacy_AllCollectionsInResponse(t *testing.T) {
	probe := &fakeUserProbe{
		adminCount: 1,
		user:       &domain.User{ID: "admin-hex-4", Role: domain.UserRoleAdmin},
	}
	mig := &fakeMigrator{transactional: false, updateCounts: map[string]int64{}}
	h := NewAdminUsersHandlerWithDeps(probe, mig)
	e := echoForClaim(t, "admin-hex-4", domain.UserRoleAdmin, h)
	req := httptest.NewRequest(http.MethodPost, "/api/v1/admin/users/claim-legacy", nil)
	rec := httptest.NewRecorder()
	e.ServeHTTP(rec, req)
	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", rec.Code)
	}
	var resp ClaimLegacyResponse
	_ = json.Unmarshal(rec.Body.Bytes(), &resp)
	if len(resp.UpdatedCounts) != len(LegacyCollections) {
		t.Errorf("response should list %d collections, got %d", len(LegacyCollections), len(resp.UpdatedCounts))
	}
}
