// Package mongo (cont.): backtest_results CRUD.
//
// The Python quant worker is the WRITE source of truth for the head doc
// (state transitions, metrics, trades). The gateway uses this repo to:
//
//   - List + read for the UI (`GET /api/v1/backtests*`).
//   - Future-Phase-4 reads (signal evaluation joins on the latest backtest).
//
// Schema mirrors what `quant/src/quant/workers/backtest.py:create_pending_doc`
// writes; field names are camelCase to match the worker's Mongo writes.
package mongo

import (
	"context"
	"errors"
	"time"

	"go.mongodb.org/mongo-driver/v2/bson"
	"go.mongodb.org/mongo-driver/v2/mongo"
	"go.mongodb.org/mongo-driver/v2/mongo/options"
)

// BacktestCollectionName is the Mongo collection name. Mirrors
// `quant.data.mongo.BACKTESTS_COLLECTION`.
const BacktestCollectionName = "backtest_results"

// ErrBacktestNotFound is returned when a run id has no head doc.
var ErrBacktestNotFound = errors.New("backtest run not found")

// BacktestState mirrors quantpb.v1.BacktestState's wire integers.
const (
	BacktestStatePending   = 1
	BacktestStateRunning   = 2
	BacktestStateCompleted = 3
	BacktestStateFailed    = 4
)

// BacktestTrade is one realised trade.
type BacktestTrade struct {
	EntryTs    time.Time `bson:"entryTs"    json:"entryTs"`
	ExitTs     time.Time `bson:"exitTs"     json:"exitTs"`
	EntryPrice float64   `bson:"entryPrice" json:"entryPrice"`
	ExitPrice  float64   `bson:"exitPrice"  json:"exitPrice"`
	Size       float64   `bson:"size"       json:"size"`
	PnL        float64   `bson:"pnl"        json:"pnl"`
	ReturnPct  float64   `bson:"returnPct"  json:"returnPct"`
	NAdds      int       `bson:"nAdds"      json:"nAdds"`
	ExitReason string    `bson:"exitReason" json:"exitReason"`
}

// BacktestDoc is the head document for one backtest run.
//
// UserID is the R2 multi-tenant boundary owner; written by the quant
// worker on insert. Legacy docs predating Node 1.A.2 are backfilled to
// "default" on gateway startup via BackfillMissingUserID.
type BacktestDoc struct {
	ID         string             `bson:"_id"        json:"runId"`
	UserID     string             `bson:"userId,omitempty" json:"userId,omitempty"`
	StrategyID string             `bson:"strategyId" json:"strategyId"`
	Kind       string             `bson:"kind"       json:"kind"`
	Params     map[string]any     `bson:"params"     json:"params"`
	Request    map[string]any     `bson:"request"    json:"request"`
	State      int                `bson:"state"      json:"state"`
	Progress   float64            `bson:"progress"   json:"progress"`
	Metrics    map[string]float64 `bson:"metrics"    json:"metrics"`
	Trades     []BacktestTrade    `bson:"trades"     json:"trades"`
	CreatedAt  time.Time          `bson:"createdAt"  json:"createdAt"`
	StartedAt  *time.Time         `bson:"startedAt"  json:"startedAt"`
	FinishedAt *time.Time         `bson:"finishedAt" json:"finishedAt"`
	Error      string             `bson:"error"      json:"error"`
}

// BacktestRepo wraps the Mongo collection.
type BacktestRepo struct {
	col *mongo.Collection
}

// NewBacktestRepo binds the given DB.
func NewBacktestRepo(db *mongo.Database) *BacktestRepo {
	return &BacktestRepo{col: db.Collection(BacktestCollectionName)}
}

// EnsureIndexes installs the (strategyId, createdAt desc) index so the
// list query stays cheap as the collection grows.
func (r *BacktestRepo) EnsureIndexes(ctx context.Context) error {
	_, err := r.col.Indexes().CreateOne(ctx, mongo.IndexModel{
		Keys: bson.D{
			{Key: "strategyId", Value: 1},
			{Key: "createdAt", Value: -1},
		},
		Options: options.Index().SetName("strategyId_createdAt"),
	})
	return err
}

// EnsureUserIDIndex installs the (userId, createdAt desc) compound index
// supporting the R2 multi-tenant list queries. Idempotent.
//
// Kept separate from EnsureIndexes so the boot orchestration in
// cmd/gateway/main.go (runUserIDBackfills) can call it after the
// backfill — mirrors the pattern used by other user-scoped repos
// (option / order / wallet / prediction_*).
func (r *BacktestRepo) EnsureUserIDIndex(ctx context.Context) error {
	_, err := r.col.Indexes().CreateOne(ctx, mongo.IndexModel{
		Keys: bson.D{
			{Key: "userId", Value: 1},
			{Key: "createdAt", Value: -1},
		},
		Options: options.Index().SetName("userId_createdAt"),
	})
	return err
}

// BackfillMissingUserID upserts userId="default" on every doc missing the
// field. Idempotent; safe to run on every boot. Returns the number of
// updated documents.
//
// Backtest results were inserted by the Python quant worker without a
// userId field through Phase 6; this fills the gap so the new
// (userId, createdAt) index actually has values to bind against. After
// Node 1.A.2 the quant worker is expected to stamp userId on insert
// (separate plan node).
func (r *BacktestRepo) BackfillMissingUserID(ctx context.Context) (int64, error) {
	res, err := r.col.UpdateMany(ctx,
		bson.M{"userId": bson.M{"$exists": false}},
		bson.M{"$set": bson.M{"userId": "default"}},
	)
	if err != nil {
		return 0, err
	}
	return res.ModifiedCount, nil
}

// FindAll returns docs (most-recent first), optionally filtered by strategyId.
// limit ≤ 0 means use the default 100.
//
// Deprecated: cross-tenant scan. Use FindAllForUser from HTTP handlers.
// Kept for background callers that intentionally iterate every tenant.
func (r *BacktestRepo) FindAll(ctx context.Context, strategyID string, limit int) ([]BacktestDoc, error) {
	if limit <= 0 {
		limit = 100
	}
	filter := bson.D{}
	if strategyID != "" {
		filter = bson.D{{Key: "strategyId", Value: strategyID}}
	}
	return r.findWithFilter(ctx, filter, limit)
}

// FindAllForUser returns docs for userID, optionally filtered by strategyID.
// Most-recent first. Empty userID is rejected so HTTP handlers can't
// accidentally fall back to a cross-tenant scan. Like the recommendation
// repo, docs without a userId field are attributed to the "default"
// tenant via userIDFilter — covers the window between Node 1.A.2 boot
// and the next quant-worker rollout that stamps userId on insert.
func (r *BacktestRepo) FindAllForUser(ctx context.Context, userID, strategyID string, limit int) ([]BacktestDoc, error) {
	if userID == "" {
		return nil, errors.New("FindAllForUser: userID required")
	}
	if limit <= 0 {
		limit = 100
	}
	match := userIDFilter(userID)
	if strategyID != "" {
		match["strategyId"] = strategyID
	}
	filter := bson.D{}
	for k, v := range match {
		filter = append(filter, bson.E{Key: k, Value: v})
	}
	return r.findWithFilter(ctx, filter, limit)
}

func (r *BacktestRepo) findWithFilter(ctx context.Context, filter bson.D, limit int) ([]BacktestDoc, error) {
	cur, err := r.col.Find(
		ctx,
		filter,
		options.Find().SetSort(bson.D{{Key: "createdAt", Value: -1}}).SetLimit(int64(limit)),
	)
	if err != nil {
		return nil, err
	}
	defer cur.Close(ctx)
	out := []BacktestDoc{}
	for cur.Next(ctx) {
		var d BacktestDoc
		if err := cur.Decode(&d); err != nil {
			return nil, err
		}
		out = append(out, d)
	}
	if err := cur.Err(); err != nil {
		return nil, err
	}
	return out, nil
}

// FindByID returns the head doc for a run id.
//
// Deprecated: cross-tenant lookup. Use FindByIDForUser from HTTP handlers
// so a caller can't fetch another tenant's backtest head doc by id.
func (r *BacktestRepo) FindByID(ctx context.Context, id string) (*BacktestDoc, error) {
	var d BacktestDoc
	err := r.col.FindOne(ctx, bson.D{{Key: "_id", Value: id}}).Decode(&d)
	if errors.Is(err, mongo.ErrNoDocuments) {
		return nil, ErrBacktestNotFound
	}
	if err != nil {
		return nil, err
	}
	return &d, nil
}

// FindByIDForUser returns the head doc only when it belongs to userID
// (or pre-dates the migration and has no userId field — that case is
// attributed to "default" for legacy compatibility). Empty userID is
// rejected.
func (r *BacktestRepo) FindByIDForUser(ctx context.Context, userID, id string) (*BacktestDoc, error) {
	if userID == "" {
		return nil, errors.New("FindByIDForUser: userID required")
	}
	match := userIDFilter(userID)
	match["_id"] = id
	var d BacktestDoc
	err := r.col.FindOne(ctx, match).Decode(&d)
	if errors.Is(err, mongo.ErrNoDocuments) {
		return nil, ErrBacktestNotFound
	}
	if err != nil {
		return nil, err
	}
	return &d, nil
}
