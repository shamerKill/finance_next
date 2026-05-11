// system_repo.go — Phase 7 system_state + portfolio_limits collections.
//
// Both collections hold tiny documents (one global, one per user). They
// are looked up on every order-engine submission, so we keep the queries
// hot-path-friendly: simple primary-key lookups, no aggregations.
package mongo

import (
	"context"
	"errors"
	"time"

	"github.com/finance_next/gateway/internal/domain"
	"go.mongodb.org/mongo-driver/v2/bson"
	"go.mongodb.org/mongo-driver/v2/mongo"
	"go.mongodb.org/mongo-driver/v2/mongo/options"
)

// SystemStateCollectionName is the Mongo collection for the global kill
// switch + future system flags.
const SystemStateCollectionName = "system_state"

// PortfolioLimitsCollectionName is the Mongo collection for per-user
// cross-strategy risk caps.
const PortfolioLimitsCollectionName = "portfolio_limits"

// SystemRepo wraps both system_state and portfolio_limits under a single
// type since they are always wired together in main.
type SystemRepo struct {
	state  *mongo.Collection
	limits *mongo.Collection
}

// NewSystemRepo binds the two collections.
func NewSystemRepo(db *mongo.Database) *SystemRepo {
	return &SystemRepo{
		state:  db.Collection(SystemStateCollectionName),
		limits: db.Collection(PortfolioLimitsCollectionName),
	}
}

// EnsureIndexes creates the unique userId index on portfolio_limits. The
// system_state collection's _id is already unique by construction
// (single document with _id="global").
func (r *SystemRepo) EnsureIndexes(ctx context.Context) error {
	_, err := r.limits.Indexes().CreateOne(ctx, mongo.IndexModel{
		Keys:    bson.D{{Key: "userId", Value: 1}},
		Options: options.Index().SetUnique(true).SetName("uniq_user_id"),
	})
	return err
}

// GetSystemState returns the global doc, or a zero-value SystemState
// (TradingHalted=false) when the doc has never been written.
func (r *SystemRepo) GetSystemState(ctx context.Context) (*domain.SystemState, error) {
	var s domain.SystemState
	err := r.state.FindOne(ctx, bson.M{"_id": domain.SystemStateGlobalID}).Decode(&s)
	if err != nil {
		if errors.Is(err, mongo.ErrNoDocuments) {
			return &domain.SystemState{ID: domain.SystemStateGlobalID, TradingHalted: false}, nil
		}
		return nil, err
	}
	return &s, nil
}

// SetSystemState upserts the global doc. Used by the admin halt/resume
// endpoints; never called from the hot path.
func (r *SystemRepo) SetSystemState(ctx context.Context, s *domain.SystemState) error {
	s.ID = domain.SystemStateGlobalID
	_, err := r.state.ReplaceOne(
		ctx,
		bson.M{"_id": domain.SystemStateGlobalID},
		s,
		options.Replace().SetUpsert(true),
	)
	return err
}

// Halt marks trading halted with a reason + actor. HaltedAt stamped now.
func (r *SystemRepo) Halt(ctx context.Context, reason, actor string) (*domain.SystemState, error) {
	now := time.Now().UTC()
	s := &domain.SystemState{
		ID:            domain.SystemStateGlobalID,
		TradingHalted: true,
		HaltedAt:      &now,
		HaltedReason:  reason,
		HaltedBy:      actor,
	}
	if err := r.SetSystemState(ctx, s); err != nil {
		return nil, err
	}
	return s, nil
}

// Resume clears the halt flag. We *replace* rather than $unset so the
// historical reason is wiped cleanly (Phase 7 audit log captures the
// transition separately).
func (r *SystemRepo) Resume(ctx context.Context) (*domain.SystemState, error) {
	s := &domain.SystemState{
		ID:            domain.SystemStateGlobalID,
		TradingHalted: false,
	}
	if err := r.SetSystemState(ctx, s); err != nil {
		return nil, err
	}
	return s, nil
}

// GetPortfolioLimits returns the row for userId, or zero limits when
// none is configured. Zero limits are interpreted by the engine as
// "no cross-strategy cap" — admins must explicitly set one.
func (r *SystemRepo) GetPortfolioLimits(ctx context.Context, userID string) (*domain.PortfolioLimits, error) {
	if userID == "" {
		userID = domain.DefaultUserID
	}
	var p domain.PortfolioLimits
	err := r.limits.FindOne(ctx, bson.M{"userId": userID}).Decode(&p)
	if err != nil {
		if errors.Is(err, mongo.ErrNoDocuments) {
			return &domain.PortfolioLimits{UserID: userID}, nil
		}
		return nil, err
	}
	return &p, nil
}

// SetPortfolioLimits upserts the row keyed by userId.
func (r *SystemRepo) SetPortfolioLimits(ctx context.Context, p *domain.PortfolioLimits) error {
	if p.UserID == "" {
		p.UserID = domain.DefaultUserID
	}
	_, err := r.limits.ReplaceOne(
		ctx,
		bson.M{"userId": p.UserID},
		p,
		options.Replace().SetUpsert(true),
	)
	return err
}

// GetAIConfig returns the persisted aiConfig nested in the global
// system_state doc, or nil when the doc / field is absent. The handler
// merges nil with env-derived defaults to compute the effective config.
func (r *SystemRepo) GetAIConfig(ctx context.Context) (*domain.AIConfig, error) {
	s, err := r.GetSystemState(ctx)
	if err != nil {
		return nil, err
	}
	if s == nil || s.AIConfig == nil {
		return nil, nil
	}
	return s.AIConfig, nil
}

// SetAIConfig upserts the aiConfig nested field on system_state while
// leaving the kill-switch fields untouched. We use $set rather than
// ReplaceOne so a concurrent Halt/Resume can't race the aiConfig PUT.
// updatedAt is stamped here so callers can omit it.
func (r *SystemRepo) SetAIConfig(ctx context.Context, cfg *domain.AIConfig) error {
	if cfg == nil {
		return errors.New("SetAIConfig: cfg nil")
	}
	cfg.UpdatedAt = time.Now().UTC()
	_, err := r.state.UpdateOne(
		ctx,
		bson.M{"_id": domain.SystemStateGlobalID},
		bson.M{
			"$set":         bson.M{"aiConfig": cfg},
			"$setOnInsert": bson.M{"_id": domain.SystemStateGlobalID, "tradingHalted": false},
		},
		options.UpdateOne().SetUpsert(true),
	)
	return err
}
