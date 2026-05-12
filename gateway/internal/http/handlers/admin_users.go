// admin_users.go — Node 1.A.2 admin-only "claim-legacy" migration.
//
// Endpoint: POST /api/v1/admin/users/claim-legacy
//
// Purpose: the Phase 0..8 codebase wrote `userId="default"` on every
// user-scoped document because there was no auth yet. Node 1.A.1
// introduced real users; Node 1.A.2 stamps the migration field on the
// three remaining collections (recommendation / optimization /
// backtest) AND adds this endpoint so the bootstrap admin can re-home
// every legacy "default" row to their own userId.
//
// Safety contract:
//   1. Caller must be authenticated (WithAuth already enforced on /api/v1).
//   2. Caller's role must be "admin".
//   3. There must be **exactly one** admin in the users collection at
//      call time. If multiple admins exist, the endpoint refuses with
//      403 — otherwise the data could end up assigned to whoever ran
//      the migration first, which is not what an operator would expect.
//   4. The migration is idempotent: re-running after success is a no-op
//      because there are no more `userId="default"` rows to rewrite.
//
// Implementation notes:
//   - We try a Mongo session+transaction so all 10 collections move
//     together. On a standalone Mongo deployment (no replica set) the
//     transaction call fails; we fall back to sequential UpdateMany so
//     dev environments without a replset still get the migration. The
//     fallback path is still idempotent — a partial failure leaves the
//     remaining `userId="default"` rows for the next run.
//   - We never touch system_state (single-doc global) or audit (already
//     has actor) or exchange_meta (global cache); those collections do
//     not have a userId field by design.
package handlers

import (
	"context"
	"errors"
	"net/http"

	"github.com/finance_next/gateway/internal/domain"
	gwmw "github.com/finance_next/gateway/internal/http/middleware"
	mongostore "github.com/finance_next/gateway/internal/store/mongo"
	"github.com/labstack/echo/v4"
	"go.mongodb.org/mongo-driver/v2/bson"
	"go.mongodb.org/mongo-driver/v2/mongo"
)

// LegacyUserIDLiteral is the string value the pre-Node-1.A.1 boot
// backfill stamped onto every user-scoped collection. We only rewrite
// rows that match this literal — never blindly UpdateMany without a
// filter.
const LegacyUserIDLiteral = "default"

// LegacyCollections is the ordered list of collections claim-legacy
// rewrites. Order is deterministic so the audit trail / log is stable
// across runs. New user-scoped collections must be added here when they
// are introduced.
var LegacyCollections = []string{
	mongostore.CollectionName,                   // options
	mongostore.AccountCollectionName,            // accounts
	mongostore.OrderCollectionName,              // order_log
	mongostore.WalletCollectionName,             // polygon_wallets
	mongostore.PredictionStrategyCollectionName, // prediction_strategies
	mongostore.PredictionOrderCollectionName,    // prediction_orders
	mongostore.RecommendationCollectionName,     // ai_recommendations
	mongostore.OptimizationRunsCollectionName,   // optimization_runs
	mongostore.BacktestCollectionName,           // backtest_results
	mongostore.PortfolioLimitsCollectionName,    // portfolio_limits
}

// ClaimLegacyUserProbe is the user-side dependency: count admins +
// resolve the caller. Implemented by [mongostore.UserRepo]; tests
// substitute a fake. Defining it here (rather than in the store
// package) keeps the production code free of test scaffolding.
type ClaimLegacyUserProbe interface {
	CountByRole(ctx context.Context, role string) (int64, error)
	FindByID(ctx context.Context, id string) (*domain.User, error)
}

// ClaimLegacyMigrator is the migration-side dependency: run an
// UpdateMany against every relevant collection. Implemented by an
// adapter over [*mongo.Database]; tests substitute a fake that records
// per-collection invocations.
//
// The interface intentionally does NOT expose sessions / transactions
// — fallback to sequential UpdateMany is the handler's concern and
// the migrator only sees one call per (collection, filter, update)
// tuple. This matches the way mongo-driver's standalone-vs-replset
// degradation works: a transactional path that fails at StartSession
// degrades cleanly to a serial path that the migrator can run.
type ClaimLegacyMigrator interface {
	UpdateMany(ctx context.Context, collection string, filter, update bson.M) (int64, error)
	// HasDocument returns true iff a document matching filter exists in
	// collection. Used by the portfolio_limits special case where a
	// pre-existing row for the new owner must short-circuit the
	// rename to a delete-of-legacy.
	HasDocument(ctx context.Context, collection string, filter bson.M) (bool, error)
	// DeleteMany removes documents matching filter. Used by the
	// portfolio_limits special case only.
	DeleteMany(ctx context.Context, collection string, filter bson.M) (int64, error)
	// StartTransaction tries to wrap the supplied closure in a Mongo
	// session+transaction. Returns (true, nil) when the closure ran
	// inside a tx and committed; (false, nil) when the underlying
	// deployment doesn't support transactions (standalone Mongo), in
	// which case the caller is expected to retry sequentially.
	// Real implementations consult the driver; the test fake just
	// runs the closure and reports transactional=false.
	StartTransaction(ctx context.Context, fn func(context.Context) error) (transactional bool, err error)
}

// AdminUsersHandler wires /admin/users/claim-legacy.
//
// Deps:
//   - users: required for the single-admin precondition check.
//   - mig:   the migration-side adapter that runs UpdateMany. Built
//            from a *mongo.Database in production via mongoDBMigrator.
//
// Both deps may be nil; in that case the endpoint returns 503 with a
// configuration message rather than crashing. router.go threads both
// in from cmd/gateway/main.go.
type AdminUsersHandler struct {
	users ClaimLegacyUserProbe
	mig   ClaimLegacyMigrator
}

// NewAdminUsersHandler builds the handler over the production
// *mongo.Database. Pass nil for either dep to disable the endpoint
// (it returns 503).
func NewAdminUsersHandler(users *mongostore.UserRepo, db *mongo.Database) *AdminUsersHandler {
	var u ClaimLegacyUserProbe
	if users != nil {
		u = users
	}
	var m ClaimLegacyMigrator
	if db != nil {
		m = mongoDBMigrator{db: db}
	}
	return &AdminUsersHandler{users: u, mig: m}
}

// NewAdminUsersHandlerWithDeps is the test-facing constructor — accepts
// the interfaces directly. Production code uses NewAdminUsersHandler.
func NewAdminUsersHandlerWithDeps(users ClaimLegacyUserProbe, mig ClaimLegacyMigrator) *AdminUsersHandler {
	return &AdminUsersHandler{users: users, mig: mig}
}

// Register binds /admin/users/claim-legacy onto the v1 group. The route
// is mounted unconditionally — auth (admin role + single-admin invariant)
// is enforced inside the handler so the failure modes are visible at
// request time rather than silently 404 when a dep is missing.
func (h *AdminUsersHandler) Register(g *echo.Group) {
	g.POST("/admin/users/claim-legacy", h.claimLegacy)
}

// ClaimLegacyResponse is the JSON shape returned on success.
type ClaimLegacyResponse struct {
	// UpdatedCounts maps each collection name to the number of rows
	// rewritten on this call. Re-running after a successful migration
	// returns all-zeros (idempotent).
	UpdatedCounts map[string]int64 `json:"updatedCounts"`
	// NewOwnerID is the userId the migrated rows were re-homed to —
	// the single admin in the system at call time.
	NewOwnerID string `json:"newOwnerId"`
	// Transactional reports whether the migration ran inside a single
	// Mongo transaction (replica set / Atlas) or fell back to
	// sequential UpdateMany (standalone dev Mongo).
	Transactional bool `json:"transactional"`
}

func (h *AdminUsersHandler) claimLegacy(c echo.Context) error {
	if h.users == nil || h.mig == nil {
		return echo.NewHTTPError(http.StatusServiceUnavailable, "claim-legacy deps not configured")
	}

	// 1. Caller role check. WithAuth wrote userRole into the context;
	//    no role / wrong role → 403.
	role, _ := c.Get(gwmw.ContextRoleKey).(string)
	if role != domain.UserRoleAdmin {
		return echo.NewHTTPError(http.StatusForbidden, "admin only")
	}

	// 2. Single-admin invariant. We refuse if >1 admin exists — the
	//    operator should resolve that condition first (e.g. demote the
	//    other admin to member or run the migration from THAT admin's
	//    session). Refusing here keeps the destination user identity
	//    unambiguous.
	ctx := c.Request().Context()
	adminCount, err := h.users.CountByRole(ctx, domain.UserRoleAdmin)
	if err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, "count admins: "+err.Error())
	}
	if adminCount != 1 {
		return echo.NewHTTPError(
			http.StatusForbidden,
			"claim-legacy only allowed when single admin exists",
		)
	}

	// 3. Resolve the new owner id from the auth context. We trust the
	//    cookie-derived userId (set by WithAuth); X-User-Id alone is
	//    never sufficient (see middleware/auth.go).
	newOwnerID := gwmw.FromEcho(c)
	if newOwnerID == "" || newOwnerID == domain.DefaultUserID {
		// The "default" literal is the placeholder we're MIGRATING AWAY
		// from — refusing it here prevents an empty-cookie session
		// from no-op-ing the entire data set onto itself.
		return echo.NewHTTPError(http.StatusForbidden, "claim-legacy requires an authenticated non-default userId")
	}

	// 4. Sanity check: the caller's userId should be the one admin
	//    we just counted. Refuse otherwise — defends against a
	//    weirder racey state where the admin role moved between calls.
	caller, err := h.users.FindByID(ctx, newOwnerID)
	if err != nil {
		if errors.Is(err, mongostore.ErrUserNotFound) {
			return echo.NewHTTPError(http.StatusForbidden, "caller user not found")
		}
		return echo.NewHTTPError(http.StatusInternalServerError, "lookup caller: "+err.Error())
	}
	if caller.Role != domain.UserRoleAdmin {
		return echo.NewHTTPError(http.StatusForbidden, "caller is not admin")
	}

	updated := map[string]int64{}
	for _, name := range LegacyCollections {
		updated[name] = 0
	}

	// 5. Try transactional migration first. Standalone Mongo (no
	//    replset) rejects StartSession with an explicit error — the
	//    migrator surfaces that as transactional=false and the
	//    sequential fallback runs. Both paths are idempotent: any
	//    rows already migrated have userId != "default" and the
	//    filter skips them.
	runOnce := func(opCtx context.Context) error {
		for _, name := range LegacyCollections {
			n, err := h.rewriteOne(opCtx, name, newOwnerID)
			if err != nil {
				return err
			}
			updated[name] = n
		}
		return nil
	}

	transactional, txErr := h.mig.StartTransaction(ctx, runOnce)
	if txErr != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, "claim-legacy transaction: "+txErr.Error())
	}
	if !transactional {
		// Reset state so a partial transactional pass doesn't double-
		// count modifications; the sequential pass starts from zero.
		for k := range updated {
			updated[k] = 0
		}
		if err := runOnce(ctx); err != nil {
			return echo.NewHTTPError(http.StatusInternalServerError, "claim-legacy sequential: "+err.Error())
		}
	}

	return c.JSON(http.StatusOK, ClaimLegacyResponse{
		UpdatedCounts: updated,
		NewOwnerID:    newOwnerID,
		Transactional: transactional,
	})
}

// rewriteOne is the per-collection UpdateMany filtering rows whose
// userId equals the legacy literal AND setting userId to the new
// owner. portfolio_limits is special-cased because its primary key
// IS userId — rewriting that field would collide with whatever row
// the admin already has. We handle that case below.
func (h *AdminUsersHandler) rewriteOne(ctx context.Context, name, newOwnerID string) (int64, error) {
	if name == mongostore.PortfolioLimitsCollectionName {
		// portfolio_limits uses userId as the unique key. Two rows
		// (one for "default", one for the new admin if they've already
		// configured limits) would collide on the partial uniq_user_id
		// index if we just $set. Resolution: if the admin already has
		// a portfolio_limits row, delete the legacy one to keep the
		// admin's existing settings authoritative; otherwise rename
		// the legacy row in place.
		exists, err := h.mig.HasDocument(ctx, name, bson.M{"userId": newOwnerID})
		if err != nil {
			return 0, err
		}
		if exists {
			return h.mig.DeleteMany(ctx, name, bson.M{"userId": LegacyUserIDLiteral})
		}
		// fall through to UpdateMany.
	}

	return h.mig.UpdateMany(ctx, name,
		bson.M{"userId": LegacyUserIDLiteral},
		bson.M{"$set": bson.M{"userId": newOwnerID}},
	)
}

// mongoDBMigrator adapts a *mongo.Database to ClaimLegacyMigrator.
type mongoDBMigrator struct {
	db *mongo.Database
}

func (m mongoDBMigrator) UpdateMany(ctx context.Context, collection string, filter, update bson.M) (int64, error) {
	res, err := m.db.Collection(collection).UpdateMany(ctx, filter, update)
	if err != nil {
		return 0, err
	}
	return res.ModifiedCount, nil
}

func (m mongoDBMigrator) HasDocument(ctx context.Context, collection string, filter bson.M) (bool, error) {
	var raw bson.M
	err := m.db.Collection(collection).FindOne(ctx, filter).Decode(&raw)
	if err == nil {
		return true, nil
	}
	if errors.Is(err, mongo.ErrNoDocuments) {
		return false, nil
	}
	return false, err
}

func (m mongoDBMigrator) DeleteMany(ctx context.Context, collection string, filter bson.M) (int64, error) {
	res, err := m.db.Collection(collection).DeleteMany(ctx, filter)
	if err != nil {
		return 0, err
	}
	return res.DeletedCount, nil
}

func (m mongoDBMigrator) StartTransaction(ctx context.Context, fn func(context.Context) error) (bool, error) {
	sess, err := m.db.Client().StartSession()
	if err != nil {
		return false, nil // not transactional; caller will retry sequentially
	}
	defer sess.EndSession(ctx)
	_, err = sess.WithTransaction(ctx, func(sctx context.Context) (any, error) {
		return nil, fn(sctx)
	})
	if err != nil {
		// Standalone Mongo surfaces transactions as "Transaction
		// numbers are only allowed on a replica set member or
		// mongos" — we can't reliably classify by string, so any
		// transaction error means "fall back to sequential" and the
		// caller starts the per-collection loop over.
		return false, nil
	}
	return true, nil
}
