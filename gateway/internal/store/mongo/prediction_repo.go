// prediction_repo.go — Phase 9 prediction_strategies + prediction_orders.
//
// Independent of the perp `strategies` (Option) and `order_log`
// collections — Phase 9 architectural decision: prediction markets are
// a separate vertical so the schema can evolve independently and the
// engine can have its own risk gate.
package mongo

import (
	"context"
	"encoding/json"
	"errors"
	"time"

	"github.com/finance_next/gateway/internal/domain"
	"go.mongodb.org/mongo-driver/v2/bson"
	"go.mongodb.org/mongo-driver/v2/mongo"
	"go.mongodb.org/mongo-driver/v2/mongo/options"
)

// Mongo collection names for the prediction vertical.
const (
	PredictionStrategyCollectionName = "prediction_strategies"
	PredictionOrderCollectionName    = "prediction_orders"
)

// Sentinel errors for the prediction repos.
var (
	// ErrPredictionStrategyNotFound is returned when no strategy doc matches.
	ErrPredictionStrategyNotFound = errors.New("prediction strategy not found")
	// ErrPredictionOrderNotFound is returned when no order doc matches.
	ErrPredictionOrderNotFound = errors.New("prediction order not found")
	// ErrPredictionOrderDuplicate is returned by Insert when the unique
	// clientOrderId index fires — the engine treats this as an idempotent hit.
	ErrPredictionOrderDuplicate = errors.New("prediction order already exists")
)

// PredictionStrategyRepo is the Mongo-backed repo.
type PredictionStrategyRepo struct {
	col *mongo.Collection
}

// NewPredictionStrategyRepo binds the collection.
func NewPredictionStrategyRepo(db *mongo.Database) *PredictionStrategyRepo {
	return &PredictionStrategyRepo{col: db.Collection(PredictionStrategyCollectionName)}
}

// EnsureIndexes builds the (userId, marketId) + (live.enabled) indices.
func (r *PredictionStrategyRepo) EnsureIndexes(ctx context.Context) error {
	_, err := r.col.Indexes().CreateMany(ctx, []mongo.IndexModel{
		{
			Keys:    bson.D{{Key: "userId", Value: 1}, {Key: "marketId", Value: 1}, {Key: "outcome", Value: 1}},
			Options: options.Index().SetName("user_market_outcome"),
		},
		{
			Keys:    bson.D{{Key: "live.enabled", Value: 1}},
			Options: options.Index().SetName("live_enabled"),
		},
		{
			Keys:    bson.D{{Key: "userId", Value: 1}, {Key: "_id", Value: 1}},
			Options: options.Index().SetName("user_id"),
		},
	})
	return err
}

// BackfillMissingUserID upserts userId=DefaultUserID on every doc missing
// the field. Idempotent.
func (r *PredictionStrategyRepo) BackfillMissingUserID(ctx context.Context) (int64, error) {
	res, err := r.col.UpdateMany(ctx,
		bson.M{"userId": bson.M{"$exists": false}},
		bson.M{"$set": bson.M{"userId": "default"}},
	)
	if err != nil {
		return 0, err
	}
	return res.ModifiedCount, nil
}

// Create inserts a new strategy.
func (r *PredictionStrategyRepo) Create(ctx context.Context, s *domain.PredictionStrategy) (*domain.PredictionStrategy, error) {
	now := time.Now().UTC()
	if s.CreatedAt.IsZero() {
		s.CreatedAt = now
	}
	s.UpdatedAt = now
	if s.CurrentVersion == 0 {
		s.CurrentVersion = 1
	}
	s.ID = ""
	res, err := r.col.InsertOne(ctx, s)
	if err != nil {
		return nil, err
	}
	oid, ok := res.InsertedID.(bson.ObjectID)
	if !ok {
		return nil, errors.New("inserted id is not an ObjectID")
	}
	return r.FindByID(ctx, oid.Hex())
}

// FindAll returns every strategy for the given userId. Passing "" returns
// every strategy across all tenants — reserved for background workers
// (prediction engine reconcile loop). HTTP handlers must always pass the
// resolved userId.
func (r *PredictionStrategyRepo) FindAll(ctx context.Context, userID string) ([]domain.PredictionStrategy, error) {
	filter := bson.D{}
	if userID != "" {
		filter = bson.D{{Key: "userId", Value: userID}}
	}
	cur, err := r.col.Find(ctx, filter)
	if err != nil {
		return nil, err
	}
	defer cur.Close(ctx)
	out := []domain.PredictionStrategy{}
	for cur.Next(ctx) {
		var raw bson.M
		if err := cur.Decode(&raw); err != nil {
			return nil, err
		}
		s, err := decodePredictionStrategy(raw)
		if err != nil {
			return nil, err
		}
		out = append(out, *s)
	}
	return out, cur.Err()
}

// FindByID returns one strategy by hex ObjectID.
func (r *PredictionStrategyRepo) FindByID(ctx context.Context, id string) (*domain.PredictionStrategy, error) {
	oid, err := bson.ObjectIDFromHex(id)
	if err != nil {
		return nil, ErrPredictionStrategyNotFound
	}
	var raw bson.M
	err = r.col.FindOne(ctx, bson.D{{Key: "_id", Value: oid}}).Decode(&raw)
	if errors.Is(err, mongo.ErrNoDocuments) {
		return nil, ErrPredictionStrategyNotFound
	}
	if err != nil {
		return nil, err
	}
	return decodePredictionStrategy(raw)
}

// Delete removes a strategy by id.
func (r *PredictionStrategyRepo) Delete(ctx context.Context, id string) error {
	oid, err := bson.ObjectIDFromHex(id)
	if err != nil {
		return ErrPredictionStrategyNotFound
	}
	res, err := r.col.DeleteOne(ctx, bson.D{{Key: "_id", Value: oid}})
	if err != nil {
		return err
	}
	if res.DeletedCount == 0 {
		return ErrPredictionStrategyNotFound
	}
	return nil
}

// Update patches arbitrary fields. Used by the live-toggle + risk-edit
// endpoints; the handler builds the $set map.
func (r *PredictionStrategyRepo) Update(ctx context.Context, id string, set bson.M) (*domain.PredictionStrategy, error) {
	oid, err := bson.ObjectIDFromHex(id)
	if err != nil {
		return nil, ErrPredictionStrategyNotFound
	}
	if set == nil {
		set = bson.M{}
	}
	set["updatedAt"] = time.Now().UTC()
	res, err := r.col.UpdateOne(ctx, bson.M{"_id": oid}, bson.M{"$set": set})
	if err != nil {
		return nil, err
	}
	if res.MatchedCount == 0 {
		return nil, ErrPredictionStrategyNotFound
	}
	return r.FindByID(ctx, id)
}

func decodePredictionStrategy(m bson.M) (*domain.PredictionStrategy, error) {
	bs, err := bson.Marshal(m)
	if err != nil {
		return nil, err
	}
	var s domain.PredictionStrategy
	if err := bson.Unmarshal(bs, &s); err != nil {
		return nil, err
	}
	if oid, ok := m["_id"].(bson.ObjectID); ok {
		s.ID = oid.Hex()
	}
	return &s, nil
}

// PredictionOrderRepo persists `prediction_orders` rows.
type PredictionOrderRepo struct {
	col *mongo.Collection
}

// NewPredictionOrderRepo binds the collection.
func NewPredictionOrderRepo(db *mongo.Database) *PredictionOrderRepo {
	return &PredictionOrderRepo{col: db.Collection(PredictionOrderCollectionName)}
}

// EnsureIndexes builds:
//   - unique(clientOrderId)
//   - (strategyId, submittedAt desc)
//   - (walletId, status)
//   - (userId, submittedAt desc) — R2 multi-tenant aggregation
func (r *PredictionOrderRepo) EnsureIndexes(ctx context.Context) error {
	_, err := r.col.Indexes().CreateMany(ctx, []mongo.IndexModel{
		{
			Keys:    bson.D{{Key: "clientOrderId", Value: 1}},
			Options: options.Index().SetUnique(true).SetName("uniq_pred_client_order_id"),
		},
		{
			Keys:    bson.D{{Key: "strategyId", Value: 1}, {Key: "submittedAt", Value: -1}},
			Options: options.Index().SetName("pred_strategy_submittedAt"),
		},
		{
			Keys:    bson.D{{Key: "walletId", Value: 1}, {Key: "status", Value: 1}},
			Options: options.Index().SetName("pred_wallet_status"),
		},
		{
			Keys:    bson.D{{Key: "userId", Value: 1}, {Key: "submittedAt", Value: -1}},
			Options: options.Index().SetName("pred_user_submittedAt"),
		},
	})
	return err
}

// BackfillMissingUserID upserts userId=DefaultUserID on every doc missing
// the field. Idempotent.
func (r *PredictionOrderRepo) BackfillMissingUserID(ctx context.Context) (int64, error) {
	res, err := r.col.UpdateMany(ctx,
		bson.M{"userId": bson.M{"$exists": false}},
		bson.M{"$set": bson.M{"userId": "default"}},
	)
	if err != nil {
		return 0, err
	}
	return res.ModifiedCount, nil
}

// Insert attempts to persist a fresh row; idempotency on clientOrderId.
func (r *PredictionOrderRepo) Insert(ctx context.Context, o *domain.PredictionOrderLog) (*domain.PredictionOrderLog, error) {
	now := time.Now().UTC()
	if o.SubmittedAt.IsZero() {
		o.SubmittedAt = now
	}
	if o.LastEventAt.IsZero() {
		o.LastEventAt = now
	}
	if o.Status == "" {
		o.Status = domain.PredictionOrderNew
	}
	o.ID = ""
	res, err := r.col.InsertOne(ctx, o)
	if err != nil {
		if mongo.IsDuplicateKeyError(err) {
			return nil, ErrPredictionOrderDuplicate
		}
		return nil, err
	}
	oid, ok := res.InsertedID.(bson.ObjectID)
	if !ok {
		return nil, errors.New("inserted id is not an ObjectID")
	}
	return r.findByObjectID(ctx, oid)
}

// PredictionFillUpdate is the patch applied by UpdateStatus.
type PredictionFillUpdate struct {
	Status          domain.PredictionOrderStatus
	ExchangeOrderID string
	Filled          float64
	AvgFillPrice    float64
	RealisedPnlUsd  float64
	RawEvent        json.RawMessage
}

// UpdateStatus applies a status patch keyed by clientOrderId.
func (r *PredictionOrderRepo) UpdateStatus(ctx context.Context, clientOrderID string, fu PredictionFillUpdate) (*domain.PredictionOrderLog, error) {
	if clientOrderID == "" {
		return nil, errors.New("clientOrderId required")
	}
	set := bson.M{"lastEventAt": time.Now().UTC()}
	if fu.Status != "" {
		set["status"] = fu.Status
	}
	if fu.ExchangeOrderID != "" {
		set["exchangeOrderId"] = fu.ExchangeOrderID
	}
	if fu.Filled > 0 {
		set["filled"] = fu.Filled
	}
	if fu.AvgFillPrice > 0 {
		set["avgFillPrice"] = fu.AvgFillPrice
	}
	if fu.RealisedPnlUsd != 0 {
		set["realisedPnlUsd"] = fu.RealisedPnlUsd
	}
	update := bson.M{"$set": set}
	if len(fu.RawEvent) > 0 {
		update["$push"] = bson.M{"rawEvents": bson.Raw(fu.RawEvent)}
	}
	res, err := r.col.UpdateOne(ctx, bson.D{{Key: "clientOrderId", Value: clientOrderID}}, update)
	if err != nil {
		return nil, err
	}
	if res.MatchedCount == 0 {
		return nil, ErrPredictionOrderNotFound
	}
	return r.FindByClientOrderID(ctx, clientOrderID)
}

// FindByClientOrderID returns one row by idempotency key.
func (r *PredictionOrderRepo) FindByClientOrderID(ctx context.Context, clientOrderID string) (*domain.PredictionOrderLog, error) {
	var raw bson.M
	err := r.col.FindOne(ctx, bson.D{{Key: "clientOrderId", Value: clientOrderID}}).Decode(&raw)
	if errors.Is(err, mongo.ErrNoDocuments) {
		return nil, ErrPredictionOrderNotFound
	}
	if err != nil {
		return nil, err
	}
	return decodePredictionOrder(raw)
}

func (r *PredictionOrderRepo) findByObjectID(ctx context.Context, oid bson.ObjectID) (*domain.PredictionOrderLog, error) {
	var raw bson.M
	err := r.col.FindOne(ctx, bson.D{{Key: "_id", Value: oid}}).Decode(&raw)
	if errors.Is(err, mongo.ErrNoDocuments) {
		return nil, ErrPredictionOrderNotFound
	}
	if err != nil {
		return nil, err
	}
	return decodePredictionOrder(raw)
}

// ListByStrategy returns the most recent rows for strategyId.
func (r *PredictionOrderRepo) ListByStrategy(ctx context.Context, strategyID string, limit int) ([]domain.PredictionOrderLog, error) {
	if limit <= 0 || limit > 500 {
		limit = 50
	}
	cur, err := r.col.Find(ctx, bson.D{{Key: "strategyId", Value: strategyID}}, options.Find().
		SetSort(bson.D{{Key: "submittedAt", Value: -1}}).
		SetLimit(int64(limit)),
	)
	if err != nil {
		return nil, err
	}
	defer cur.Close(ctx)
	out := []domain.PredictionOrderLog{}
	for cur.Next(ctx) {
		var raw bson.M
		if err := cur.Decode(&raw); err != nil {
			return nil, err
		}
		o, err := decodePredictionOrder(raw)
		if err != nil {
			return nil, err
		}
		out = append(out, *o)
	}
	return out, cur.Err()
}

// CountOpenForStrategy returns the count of orders in {new,partial} for
// the given strategy. Used by the engine's `maxOpenMarkets` risk gate.
func (r *PredictionOrderRepo) CountOpenForStrategy(ctx context.Context, strategyID string) (int, error) {
	n, err := r.col.CountDocuments(ctx, bson.M{
		"strategyId": strategyID,
		"status": bson.M{"$in": bson.A{
			string(domain.PredictionOrderNew),
			string(domain.PredictionOrderPartial),
		}},
	})
	if err != nil {
		return 0, err
	}
	return int(n), nil
}

// SumRealisedPnlSince mirrors OrderRepo.SumRealisedPnlSince for prediction orders.
func (r *PredictionOrderRepo) SumRealisedPnlSince(ctx context.Context, strategyID string, since time.Time) (float64, error) {
	cur, err := r.col.Aggregate(ctx, []bson.D{
		{
			{Key: "$match", Value: bson.M{
				"strategyId":  strategyID,
				"status":      string(domain.PredictionOrderFilled),
				"submittedAt": bson.M{"$gte": since},
			}},
		},
		{
			{Key: "$group", Value: bson.M{
				"_id":   nil,
				"total": bson.M{"$sum": "$realisedPnlUsd"},
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

// ListOpenForWallet returns rows for walletId whose status is in the
// open-set (new | partial). Used by the reconcile loop.
func (r *PredictionOrderRepo) ListOpenForWallet(ctx context.Context, walletID string) ([]domain.PredictionOrderLog, error) {
	filter := bson.D{
		{Key: "walletId", Value: walletID},
		{Key: "status", Value: bson.M{"$in": bson.A{
			string(domain.PredictionOrderNew),
			string(domain.PredictionOrderPartial),
		}}},
	}
	cur, err := r.col.Find(ctx, filter)
	if err != nil {
		return nil, err
	}
	defer cur.Close(ctx)
	out := []domain.PredictionOrderLog{}
	for cur.Next(ctx) {
		var raw bson.M
		if err := cur.Decode(&raw); err != nil {
			return nil, err
		}
		o, err := decodePredictionOrder(raw)
		if err != nil {
			return nil, err
		}
		out = append(out, *o)
	}
	return out, cur.Err()
}

func decodePredictionOrder(m bson.M) (*domain.PredictionOrderLog, error) {
	bs, err := bson.Marshal(m)
	if err != nil {
		return nil, err
	}
	var o domain.PredictionOrderLog
	if err := bson.Unmarshal(bs, &o); err != nil {
		return nil, err
	}
	if oid, ok := m["_id"].(bson.ObjectID); ok {
		o.ID = oid.Hex()
	}
	return &o, nil
}
