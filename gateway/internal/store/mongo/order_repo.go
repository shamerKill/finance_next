// order_repo.go — Phase 4 `order_log` collection.
//
// Schema is the source of truth for the gateway's audit trail. Every
// submission attempt — accepted, rejected, mainnet-blocked — produces a
// row. The unique index on `clientOrderId` is what gives us idempotency:
// a duplicate Submit call collapses on the existing row instead of
// double-firing at the exchange.
package mongo

import (
	"context"
	"encoding/json"
	"errors"
	"strconv"
	"time"

	"github.com/finance_next/gateway/internal/domain"
	"go.mongodb.org/mongo-driver/v2/bson"
	"go.mongodb.org/mongo-driver/v2/mongo"
	"go.mongodb.org/mongo-driver/v2/mongo/options"
)

// OrderCollectionName is the Mongo collection name; matches the field used
// in the project plan's data model section.
const OrderCollectionName = "order_log"

// ErrOrderNotFound is returned when the queried clientOrderId / id has no
// matching row.
var ErrOrderNotFound = errors.New("order not found")

// ErrOrderDuplicate is returned by Insert when the unique-clientOrderId
// constraint fires. The caller should treat this as a successful idempotent
// hit and FindByClientOrderID to retrieve the existing doc.
var ErrOrderDuplicate = errors.New("order already exists for clientOrderId")

// OrderRepo is the Mongo-backed repository for [domain.OrderLog].
type OrderRepo struct {
	col *mongo.Collection
}

// NewOrderRepo binds the given DB and returns a repository.
func NewOrderRepo(db *mongo.Database) *OrderRepo {
	return &OrderRepo{col: db.Collection(OrderCollectionName)}
}

// EnsureIndexes builds the indices the engine + reconcile loop need:
//   - unique(clientOrderId) — idempotency
//   - (strategyId, submittedAt desc) — order log listing
//   - (accountId, status) — open-order sweep
func (r *OrderRepo) EnsureIndexes(ctx context.Context) error {
	_, err := r.col.Indexes().CreateMany(ctx, []mongo.IndexModel{
		{
			Keys:    bson.D{{Key: "clientOrderId", Value: 1}},
			Options: options.Index().SetUnique(true).SetName("uniq_client_order_id"),
		},
		{
			Keys:    bson.D{{Key: "strategyId", Value: 1}, {Key: "submittedAt", Value: -1}},
			Options: options.Index().SetName("strategy_submittedAt"),
		},
		{
			Keys:    bson.D{{Key: "accountId", Value: 1}, {Key: "status", Value: 1}},
			Options: options.Index().SetName("account_status"),
		},
	})
	return err
}

// Insert attempts to persist a fresh [domain.OrderLog]. On a duplicate
// clientOrderId it returns [ErrOrderDuplicate] so the engine can fetch
// the canonical existing row and skip the exchange call entirely.
func (r *OrderRepo) Insert(ctx context.Context, o *domain.OrderLog) (*domain.OrderLog, error) {
	now := time.Now().UTC()
	if o.SubmittedAt.IsZero() {
		o.SubmittedAt = now
	}
	if o.LastEventAt.IsZero() {
		o.LastEventAt = now
	}
	if o.Status == "" {
		o.Status = domain.OrderStatusNew
	}
	o.ID = ""
	res, err := r.col.InsertOne(ctx, o)
	if err != nil {
		if mongo.IsDuplicateKeyError(err) {
			return nil, ErrOrderDuplicate
		}
		return nil, err
	}
	oid, ok := res.InsertedID.(bson.ObjectID)
	if !ok {
		return nil, errors.New("inserted id is not an ObjectID")
	}
	return r.findByObjectID(ctx, oid)
}

// FillUpdate is the patch applied by [UpdateStatus]. Zero-valued fields
// are not persisted (the engine sometimes only knows the status).
type FillUpdate struct {
	Status          domain.OrderStatus
	ExchangeOrderID string
	Filled          float64
	AvgFillPrice    float64
	RealisedPnlUsd  float64
	RawEvent        json.RawMessage
}

// UpdateStatus atomically applies a [FillUpdate] to the row identified
// by clientOrderId. Always pushes RawEvent (when non-nil) into rawEvents.
func (r *OrderRepo) UpdateStatus(ctx context.Context, clientOrderID string, fu FillUpdate) (*domain.OrderLog, error) {
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
		return nil, ErrOrderNotFound
	}
	return r.FindByClientOrderID(ctx, clientOrderID)
}

// FindByClientOrderID returns one row by its idempotency key.
func (r *OrderRepo) FindByClientOrderID(ctx context.Context, clientOrderID string) (*domain.OrderLog, error) {
	var raw bson.M
	err := r.col.FindOne(ctx, bson.D{{Key: "clientOrderId", Value: clientOrderID}}).Decode(&raw)
	if errors.Is(err, mongo.ErrNoDocuments) {
		return nil, ErrOrderNotFound
	}
	if err != nil {
		return nil, err
	}
	return decodeOrder(raw)
}

func (r *OrderRepo) findByObjectID(ctx context.Context, oid bson.ObjectID) (*domain.OrderLog, error) {
	var raw bson.M
	err := r.col.FindOne(ctx, bson.D{{Key: "_id", Value: oid}}).Decode(&raw)
	if errors.Is(err, mongo.ErrNoDocuments) {
		return nil, ErrOrderNotFound
	}
	if err != nil {
		return nil, err
	}
	return decodeOrder(raw)
}

// ListByStrategyOptions controls [ListByStrategy]. Limit defaults to 50.
type ListByStrategyOptions struct {
	Limit  int
	Before time.Time // exclusive upper bound on submittedAt for cursor pagination
}

// ListByStrategy returns the most recent rows for strategyId.
func (r *OrderRepo) ListByStrategy(ctx context.Context, strategyID string, opts ListByStrategyOptions) ([]domain.OrderLog, error) {
	if opts.Limit <= 0 || opts.Limit > 500 {
		opts.Limit = 50
	}
	filter := bson.D{{Key: "strategyId", Value: strategyID}}
	if !opts.Before.IsZero() {
		filter = append(filter, bson.E{Key: "submittedAt", Value: bson.M{"$lt": opts.Before}})
	}
	cur, err := r.col.Find(ctx, filter, options.Find().
		SetSort(bson.D{{Key: "submittedAt", Value: -1}}).
		SetLimit(int64(opts.Limit)),
	)
	if err != nil {
		return nil, err
	}
	defer cur.Close(ctx)
	out := []domain.OrderLog{}
	for cur.Next(ctx) {
		var raw bson.M
		if err := cur.Decode(&raw); err != nil {
			return nil, err
		}
		o, err := decodeOrder(raw)
		if err != nil {
			return nil, err
		}
		out = append(out, *o)
	}
	return out, cur.Err()
}

// ListOpenForAccount returns rows for accountId whose status is in the
// open-set (new | partial). Used by the reconcile loop.
func (r *OrderRepo) ListOpenForAccount(ctx context.Context, accountID string) ([]domain.OrderLog, error) {
	filter := bson.D{
		{Key: "accountId", Value: accountID},
		{Key: "status", Value: bson.M{"$in": bson.A{
			string(domain.OrderStatusNew),
			string(domain.OrderStatusPartial),
		}}},
	}
	cur, err := r.col.Find(ctx, filter)
	if err != nil {
		return nil, err
	}
	defer cur.Close(ctx)
	out := []domain.OrderLog{}
	for cur.Next(ctx) {
		var raw bson.M
		if err := cur.Decode(&raw); err != nil {
			return nil, err
		}
		o, err := decodeOrder(raw)
		if err != nil {
			return nil, err
		}
		out = append(out, *o)
	}
	return out, cur.Err()
}

// SumRealisedPnlSince computes the sum of realisedPnlUsd for filled
// orders submitted after `since` for the given strategy. Used by the
// daily-loss-cap risk gate. Returns 0 when no rows match (a fresh day
// or fresh strategy).
func (r *OrderRepo) SumRealisedPnlSince(ctx context.Context, strategyID string, since time.Time) (float64, error) {
	cur, err := r.col.Aggregate(ctx, []bson.D{
		{
			{Key: "$match", Value: bson.M{
				"strategyId":  strategyID,
				"status":      string(domain.OrderStatusFilled),
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

// SumOpenNotionalForUser computes the sum of (qty - filled) * price for
// all currently-open orders belonging to the given userId. Phase 7's
// portfolio cap consults this across every strategy. We approximate
// "open notional" as the *unfilled* portion of orders in status
// {new,partial}; matched filled portions roll into RealisedPnl instead.
//
// Pre-auth, every order is the "default" user — there is no userId
// column on order_log yet, so this returns the sum across ALL rows.
// Phase 8 will add a userId field + filter.
func (r *OrderRepo) SumOpenNotionalForUser(ctx context.Context, userID string) (notional float64, count int, err error) {
	cur, aggErr := r.col.Aggregate(ctx, []bson.D{
		{
			{Key: "$match", Value: bson.M{
				"status": bson.M{"$in": bson.A{
					string(domain.OrderStatusNew),
					string(domain.OrderStatusPartial),
				}},
			}},
		},
		{
			{Key: "$group", Value: bson.M{
				"_id": nil,
				"notional": bson.M{"$sum": bson.M{
					"$multiply": bson.A{
						bson.M{"$subtract": bson.A{"$qty", bson.M{"$ifNull": bson.A{"$filled", 0}}}},
						bson.M{"$ifNull": bson.A{"$price", 0}},
					},
				}},
				"count": bson.M{"$sum": 1},
			}},
		},
	})
	if aggErr != nil {
		return 0, 0, aggErr
	}
	defer cur.Close(ctx)
	if cur.Next(ctx) {
		var row struct {
			Notional float64 `bson:"notional"`
			Count    int     `bson:"count"`
		}
		if derr := cur.Decode(&row); derr != nil {
			return 0, 0, derr
		}
		return row.Notional, row.Count, nil
	}
	return 0, 0, cur.Err()
}

// SumRealisedPnlSinceForUser is the cross-strategy variant of
// SumRealisedPnlSince. Same caveat re: userId — Phase 7 sums across all
// rows; Phase 8 will filter by user.
func (r *OrderRepo) SumRealisedPnlSinceForUser(ctx context.Context, userID string, since time.Time) (float64, error) {
	cur, err := r.col.Aggregate(ctx, []bson.D{
		{
			{Key: "$match", Value: bson.M{
				"status":      string(domain.OrderStatusFilled),
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

// decodeOrder mirrors decodeOption / decodeAccount. We use a marshal
// round-trip so legacy fields don't trip strict decoding.
func decodeOrder(m bson.M) (*domain.OrderLog, error) {
	bs, err := bson.Marshal(m)
	if err != nil {
		return nil, err
	}
	var o domain.OrderLog
	if err := bson.Unmarshal(bs, &o); err != nil {
		return nil, err
	}
	if oid, ok := m["_id"].(bson.ObjectID); ok {
		o.ID = oid.Hex()
	}
	return &o, nil
}

// FormatPnL is a tiny utility for log lines / WS envelopes; renders a
// pnl as "+12.34" / "-12.34" with two decimals.
func FormatPnL(v float64) string {
	if v >= 0 {
		return "+" + strconv.FormatFloat(v, 'f', 2, 64)
	}
	return strconv.FormatFloat(v, 'f', 2, 64)
}
