// Package mongo (cont.): ai_recommendations + optimization_runs CRUD.
//
// Phase 6 — the Python quant worker is the WRITE source of truth for both
// collections (see quant/src/quant/data/recommendations.py). The gateway
// uses these repos to:
//
//   * GET /api/v1/recommendations (list / filter)
//   * GET /api/v1/recommendations/:id (detail)
//   * POST /api/v1/recommendations/:id/approve (atomic Mongo session:
//       update strategies + bump currentVersion + mark recommendation
//       approved + emit event.strategy.upserted; supersede other pending
//       recommendations for the same strategy)
//   * POST /api/v1/recommendations/:id/reject
//   * GET /api/v1/optimizations/:id (status from optimization_runs)
//
// Schemas mirror the Python writes; field names are camelCase.
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

// Collection names — keep in sync with quant.data.recommendations.
const (
	RecommendationCollectionName    = "ai_recommendations"
	OptimizationRunsCollectionName  = "optimization_runs"
)

// Recommendation status values — string-typed for Mongo legibility.
const (
	RecommendationStatusPendingReview = "pending_review"
	RecommendationStatusApproved      = "approved"
	RecommendationStatusRejected      = "rejected"
	RecommendationStatusSuperseded    = "superseded"
)

// ErrRecommendationNotFound is returned when a doc id has no row.
var ErrRecommendationNotFound = errors.New("recommendation not found")

// ErrOptimizationRunNotFound is returned when a study id has no row.
var ErrOptimizationRunNotFound = errors.New("optimization run not found")

// ExpectedDelta is the projected metric change vs current params.
type ExpectedDelta struct {
	Sharpe float64 `bson:"sharpe" json:"sharpe"`
	Return float64 `bson:"return" json:"return"`
}

// RecommendationDoc mirrors the Python writer's shape.
type RecommendationDoc struct {
	ID             string                       `bson:"_id"               json:"id"`
	StrategyID     string                       `bson:"strategyId"        json:"strategyId"`
	StudyID        string                       `bson:"studyId"           json:"studyId"`
	ProposedParams map[string]any               `bson:"proposedParams"    json:"proposedParams"`
	ExpectedDelta  ExpectedDelta                `bson:"expectedDelta"     json:"expectedDelta"`
	Rationale      string                       `bson:"rationale"         json:"rationale"`
	Status         string                       `bson:"status"            json:"status"`
	ReviewedBy     *string                      `bson:"reviewedBy"        json:"reviewedBy,omitempty"`
	ReviewedAt     *time.Time                   `bson:"reviewedAt"        json:"reviewedAt,omitempty"`
	AppliedVersion *int64                       `bson:"appliedVersion"    json:"appliedVersion,omitempty"`
	Period         *domain.RecommendationPeriod `bson:"period,omitempty"  json:"period,omitempty"`
	CreatedAt      time.Time                    `bson:"createdAt"         json:"createdAt"`
	UpdatedAt      time.Time                    `bson:"updatedAt"         json:"updatedAt"`
}

// EnsurePeriod populates a default period when the doc has none. The
// quant worker writes the field at insert time; this fallback makes
// legacy docs render with context so the dashboard never shows a blank
// OOS window.
func (d *RecommendationDoc) EnsurePeriod() {
	if d.Period == nil {
		d.Period = domain.DefaultRecommendationPeriod()
	}
}

// OptimizationCost is the persisted cost ledger sub-document.
type OptimizationCost struct {
	ClaudeTokensIn  int64   `bson:"claudeTokensIn"  json:"claudeTokensIn"`
	ClaudeTokensOut int64   `bson:"claudeTokensOut" json:"claudeTokensOut"`
	CacheReadTokens int64   `bson:"cacheReadTokens" json:"cacheReadTokens"`
	CacheWriteTokens int64  `bson:"cacheWriteTokens" json:"cacheWriteTokens"`
	USDSpent        float64 `bson:"usdSpent"        json:"usdSpent"`
}

// OptimizationRunDoc is the head document for one Optuna study.
type OptimizationRunDoc struct {
	ID                string           `bson:"_id"               json:"studyId"`
	StrategyID        string           `bson:"strategyId"        json:"strategyId"`
	Algorithm         string           `bson:"algorithm"         json:"algorithm"`
	ParamSpace        map[string]any   `bson:"paramSpace"        json:"paramSpace"`
	ClaudeContextHash string           `bson:"claudeContextHash" json:"claudeContextHash"`
	TrialsTotal       int              `bson:"trialsTotal"       json:"trialsTotal"`
	TrialsCompleted   int              `bson:"trialsCompleted"   json:"trialsCompleted"`
	BestValue         float64          `bson:"bestValue"         json:"bestValue"`
	BestTrialID       *string          `bson:"bestTrialId"       json:"bestTrialId,omitempty"`
	Cost              OptimizationCost `bson:"cost"              json:"cost"`
	State             string           `bson:"state"             json:"state"`
	StartedAt         time.Time        `bson:"startedAt"         json:"startedAt"`
	FinishedAt        *time.Time       `bson:"finishedAt"        json:"finishedAt,omitempty"`
	Error             string           `bson:"error"             json:"error"`
	RecommendationID  *string          `bson:"recommendationId"  json:"recommendationId,omitempty"`
}

// RecommendationRepo wraps the ai_recommendations collection.
type RecommendationRepo struct {
	col *mongo.Collection
}

// NewRecommendationRepo binds the given DB.
func NewRecommendationRepo(db *mongo.Database) *RecommendationRepo {
	return &RecommendationRepo{col: db.Collection(RecommendationCollectionName)}
}

// Coll returns the underlying collection — used by the approve handler
// which needs to run multi-collection transactions on the same session.
func (r *RecommendationRepo) Coll() *mongo.Collection { return r.col }

// EnsureIndexes installs the (strategyId, status, createdAt desc) index.
func (r *RecommendationRepo) EnsureIndexes(ctx context.Context) error {
	_, err := r.col.Indexes().CreateOne(ctx, mongo.IndexModel{
		Keys: bson.D{
			{Key: "strategyId", Value: 1},
			{Key: "status", Value: 1},
			{Key: "createdAt", Value: -1},
		},
		Options: options.Index().SetName("strategyId_status_createdAt"),
	})
	return err
}

// ListOptions filters list calls.
type RecommendationListOptions struct {
	Status     string
	StrategyID string
	Limit      int
}

// FindAll returns docs (most-recent first) with optional filters.
func (r *RecommendationRepo) FindAll(ctx context.Context, opts RecommendationListOptions) ([]RecommendationDoc, error) {
	if opts.Limit <= 0 {
		opts.Limit = 100
	}
	filter := bson.D{}
	if opts.Status != "" {
		filter = append(filter, bson.E{Key: "status", Value: opts.Status})
	}
	if opts.StrategyID != "" {
		filter = append(filter, bson.E{Key: "strategyId", Value: opts.StrategyID})
	}
	cur, err := r.col.Find(
		ctx,
		filter,
		options.Find().
			SetSort(bson.D{{Key: "createdAt", Value: -1}}).
			SetLimit(int64(opts.Limit)),
	)
	if err != nil {
		return nil, err
	}
	defer cur.Close(ctx)
	out := []RecommendationDoc{}
	for cur.Next(ctx) {
		var d RecommendationDoc
		if err := cur.Decode(&d); err != nil {
			return nil, err
		}
		out = append(out, d)
	}
	return out, cur.Err()
}

// FindByID returns one recommendation.
func (r *RecommendationRepo) FindByID(ctx context.Context, id string) (*RecommendationDoc, error) {
	var d RecommendationDoc
	err := r.col.FindOne(ctx, bson.D{{Key: "_id", Value: id}}).Decode(&d)
	if errors.Is(err, mongo.ErrNoDocuments) {
		return nil, ErrRecommendationNotFound
	}
	if err != nil {
		return nil, err
	}
	return &d, nil
}

// MarkRejected sets status=rejected. Best-effort timestamp.
func (r *RecommendationRepo) MarkRejected(ctx context.Context, id, reviewedBy string) (*RecommendationDoc, error) {
	now := time.Now().UTC()
	res, err := r.col.UpdateOne(
		ctx,
		bson.D{{Key: "_id", Value: id}, {Key: "status", Value: RecommendationStatusPendingReview}},
		bson.M{"$set": bson.M{
			"status":     RecommendationStatusRejected,
			"reviewedBy": reviewedBy,
			"reviewedAt": now,
			"updatedAt":  now,
		}},
	)
	if err != nil {
		return nil, err
	}
	if res.MatchedCount == 0 {
		// Either doc doesn't exist OR it isn't pending. Disambiguate via FindByID.
		doc, err2 := r.FindByID(ctx, id)
		if err2 != nil {
			return nil, err2
		}
		// Already in a terminal state — return as-is.
		return doc, nil
	}
	return r.FindByID(ctx, id)
}

// userIDFilter builds the userId match used by the *ForUser methods.
//
// Recommendations are written by the quant worker which historically did
// not stamp userId. To keep the dashboard accurate for the dev/default
// tenant we treat a docs-without-userId field as belonging to
// DefaultUserID. Non-default callers get a strict equality filter so
// cross-tenant data never leaks. Empty userID is rejected by the caller.
func userIDFilter(userID string) bson.M {
	if userID == "default" {
		return bson.M{"$or": bson.A{
			bson.M{"userId": "default"},
			bson.M{"userId": bson.M{"$exists": false}},
		}}
	}
	return bson.M{"userId": userID}
}

// CountByStatus counts recommendations for userID with the given status.
// Used by the dashboard summary's pending-review badge. Empty userID is
// rejected to prevent accidental cross-tenant counts.
func (r *RecommendationRepo) CountByStatus(ctx context.Context, userID, status string) (int64, error) {
	if userID == "" {
		return 0, errors.New("CountByStatus: userID required")
	}
	filter := userIDFilter(userID)
	if status != "" {
		filter["status"] = status
	}
	n, err := r.col.CountDocuments(ctx, filter)
	if err != nil {
		return 0, err
	}
	return n, nil
}

// ListByStatusForUser returns up to `limit` recommendations for userID
// matching `status`, ordered by createdAt desc. The dashboard summary's
// `topPendingIds` calls this with limit=3. Empty userID is rejected.
func (r *RecommendationRepo) ListByStatusForUser(ctx context.Context, userID, status string, limit int) ([]RecommendationDoc, error) {
	if userID == "" {
		return nil, errors.New("ListByStatusForUser: userID required")
	}
	if limit <= 0 || limit > 500 {
		limit = 50
	}
	filter := userIDFilter(userID)
	if status != "" {
		filter["status"] = status
	}
	cur, err := r.col.Find(
		ctx,
		filter,
		options.Find().
			SetSort(bson.D{{Key: "createdAt", Value: -1}}).
			SetLimit(int64(limit)),
	)
	if err != nil {
		return nil, err
	}
	defer cur.Close(ctx)
	out := []RecommendationDoc{}
	for cur.Next(ctx) {
		var d RecommendationDoc
		if err := cur.Decode(&d); err != nil {
			return nil, err
		}
		out = append(out, d)
	}
	return out, cur.Err()
}

// OptimizationRunRepo wraps the optimization_runs collection.
type OptimizationRunRepo struct {
	col *mongo.Collection
}

// NewOptimizationRunRepo binds the given DB.
func NewOptimizationRunRepo(db *mongo.Database) *OptimizationRunRepo {
	return &OptimizationRunRepo{col: db.Collection(OptimizationRunsCollectionName)}
}

// EnsureIndexes installs the per-strategy + daily-aggregation indexes.
func (r *OptimizationRunRepo) EnsureIndexes(ctx context.Context) error {
	_, err := r.col.Indexes().CreateMany(ctx, []mongo.IndexModel{
		{
			Keys: bson.D{
				{Key: "strategyId", Value: 1},
				{Key: "startedAt", Value: -1},
			},
			Options: options.Index().SetName("strategyId_startedAt"),
		},
		{
			Keys:    bson.D{{Key: "startedAt", Value: -1}},
			Options: options.Index().SetName("startedAt"),
		},
	})
	return err
}

// FindByID returns the head doc for a study id.
func (r *OptimizationRunRepo) FindByID(ctx context.Context, id string) (*OptimizationRunDoc, error) {
	var d OptimizationRunDoc
	err := r.col.FindOne(ctx, bson.D{{Key: "_id", Value: id}}).Decode(&d)
	if errors.Is(err, mongo.ErrNoDocuments) {
		return nil, ErrOptimizationRunNotFound
	}
	if err != nil {
		return nil, err
	}
	return &d, nil
}

// FindAll lists studies, optionally filtered by strategyId. Most-recent first.
func (r *OptimizationRunRepo) FindAll(ctx context.Context, strategyID string, limit int) ([]OptimizationRunDoc, error) {
	if limit <= 0 {
		limit = 100
	}
	filter := bson.D{}
	if strategyID != "" {
		filter = bson.D{{Key: "strategyId", Value: strategyID}}
	}
	cur, err := r.col.Find(
		ctx,
		filter,
		options.Find().
			SetSort(bson.D{{Key: "startedAt", Value: -1}}).
			SetLimit(int64(limit)),
	)
	if err != nil {
		return nil, err
	}
	defer cur.Close(ctx)
	out := []OptimizationRunDoc{}
	for cur.Next(ctx) {
		var d OptimizationRunDoc
		if err := cur.Decode(&d); err != nil {
			return nil, err
		}
		out = append(out, d)
	}
	return out, cur.Err()
}

// SumSpentSinceForUser sums cost.usdSpent across optimization runs whose
// startedAt >= since for the given userID. Used by the dashboard's
// `aiBudget.usdSpentToday` card. Like the recommendation accessors,
// rows without a userId field are attributed to DefaultUserID so the
// dev tenant still sees its history before the quant worker migration
// stamps every row. Empty userID is rejected.
func (r *OptimizationRunRepo) SumSpentSinceForUser(ctx context.Context, userID string, since time.Time) (float64, error) {
	if userID == "" {
		return 0, errors.New("SumSpentSinceForUser: userID required")
	}
	match := userIDFilter(userID)
	match["startedAt"] = bson.M{"$gte": since}
	cur, err := r.col.Aggregate(ctx, []bson.D{
		{
			{Key: "$match", Value: match},
		},
		{
			{Key: "$group", Value: bson.M{
				"_id":   nil,
				"total": bson.M{"$sum": "$cost.usdSpent"},
			}},
		},
	})
	if err != nil {
		return 0, err
	}
	defer cur.Close(ctx)
	if cur.Next(ctx) {
		var row struct {
			Total float64 `bson:"total"`
		}
		if err := cur.Decode(&row); err != nil {
			return 0, err
		}
		return row.Total, nil
	}
	return 0, cur.Err()
}
