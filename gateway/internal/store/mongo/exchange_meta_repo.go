// exchange_meta_repo.go — Phase 5 `exchange_meta` collection.
//
// Stores per-exchange-per-symbol metadata that the order engine needs
// (price/qty precision, min notional, taker/maker fees) and that the UI
// uses for display formatting. The data is refreshed at gateway startup
// only when the collection has rows older than [StalenessThreshold] —
// re-running the gateway on a fresh DB pulls full metadata from each
// exchange's "exchange info" endpoint; a hot reload skips the network.
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

// ExchangeMetaCollectionName is the Mongo collection name.
const ExchangeMetaCollectionName = "exchange_meta"

// StalenessThreshold is the max age the startup refresh job tolerates
// before re-fetching from the upstream "exchange info" endpoint.
const StalenessThreshold = 24 * time.Hour

// ErrExchangeMetaNotFound is returned when a (exchange, canonical) lookup
// has no matching row.
var ErrExchangeMetaNotFound = errors.New("exchange_meta not found")

// ExchangeMetaRepo is the Mongo-backed repository for [domain.ExchangeMeta].
type ExchangeMetaRepo struct {
	col *mongo.Collection
}

// NewExchangeMetaRepo binds the collection.
func NewExchangeMetaRepo(db *mongo.Database) *ExchangeMetaRepo {
	return &ExchangeMetaRepo{col: db.Collection(ExchangeMetaCollectionName)}
}

// EnsureIndexes creates the (exchange, canonicalSymbol) composite unique
// index.
func (r *ExchangeMetaRepo) EnsureIndexes(ctx context.Context) error {
	_, err := r.col.Indexes().CreateOne(ctx, mongo.IndexModel{
		Keys: bson.D{
			{Key: "exchange", Value: 1},
			{Key: "canonicalSymbol", Value: 1},
		},
		Options: options.Index().SetUnique(true).SetName("uniq_exchange_canonical"),
	})
	return err
}

// Upsert writes or replaces a row keyed by (exchange, canonicalSymbol).
func (r *ExchangeMetaRepo) Upsert(ctx context.Context, m *domain.ExchangeMeta) error {
	now := time.Now().UTC()
	m.LastUpdated = now
	filter := bson.D{
		{Key: "exchange", Value: m.Exchange},
		{Key: "canonicalSymbol", Value: m.CanonicalSymbol},
	}
	doc := bson.M{
		"exchange":        m.Exchange,
		"canonicalSymbol": m.CanonicalSymbol,
		"nativeSymbol":    m.NativeSymbol,
		"baseAsset":       m.BaseAsset,
		"quoteAsset":      m.QuoteAsset,
		"contractType":    m.ContractType,
		"pricePrecision":  m.PricePrecision,
		"qtyPrecision":    m.QtyPrecision,
		"minNotionalUsd":  m.MinNotionalUsd,
		"takerFeeRate":    m.TakerFeeRate,
		"makerFeeRate":    m.MakerFeeRate,
		"lastUpdated":     now,
	}
	_, err := r.col.UpdateOne(ctx, filter, bson.M{"$set": doc}, options.UpdateOne().SetUpsert(true))
	return err
}

// Find returns one row by (exchange, canonicalSymbol).
func (r *ExchangeMetaRepo) Find(ctx context.Context, exch domain.Exchange, canonical string) (*domain.ExchangeMeta, error) {
	var raw bson.M
	err := r.col.FindOne(ctx, bson.D{
		{Key: "exchange", Value: exch},
		{Key: "canonicalSymbol", Value: canonical},
	}).Decode(&raw)
	if errors.Is(err, mongo.ErrNoDocuments) {
		return nil, ErrExchangeMetaNotFound
	}
	if err != nil {
		return nil, err
	}
	return decodeMeta(raw)
}

// FindAll returns every row, optionally filtered by exchange.
func (r *ExchangeMetaRepo) FindAll(ctx context.Context, exch domain.Exchange) ([]domain.ExchangeMeta, error) {
	filter := bson.D{}
	if exch != "" {
		filter = append(filter, bson.E{Key: "exchange", Value: exch})
	}
	cur, err := r.col.Find(ctx, filter)
	if err != nil {
		return nil, err
	}
	defer cur.Close(ctx)
	out := []domain.ExchangeMeta{}
	for cur.Next(ctx) {
		var raw bson.M
		if err := cur.Decode(&raw); err != nil {
			return nil, err
		}
		m, err := decodeMeta(raw)
		if err != nil {
			return nil, err
		}
		out = append(out, *m)
	}
	return out, cur.Err()
}

// IsStale returns true when the collection is empty or the most recent
// row is older than StalenessThreshold. The startup refresh job uses
// this to decide whether to re-fetch.
func (r *ExchangeMetaRepo) IsStale(ctx context.Context) (bool, error) {
	cur, err := r.col.Find(ctx, bson.D{}, options.Find().SetSort(bson.D{{Key: "lastUpdated", Value: -1}}).SetLimit(1))
	if err != nil {
		return false, err
	}
	defer cur.Close(ctx)
	if !cur.Next(ctx) {
		return true, cur.Err()
	}
	var raw bson.M
	if err := cur.Decode(&raw); err != nil {
		return false, err
	}
	m, err := decodeMeta(raw)
	if err != nil {
		return false, err
	}
	return time.Since(m.LastUpdated) > StalenessThreshold, nil
}

func decodeMeta(m bson.M) (*domain.ExchangeMeta, error) {
	// _id arrives as bson.ObjectID from Mongo but ExchangeMeta.ID is a
	// string, and mongo-driver v2 refuses to decode ObjectID→string
	// without ObjectIDAsHexString. Stash the raw _id, drop it from the
	// map so Unmarshal doesn't choke, then patch the hex back on.
	rawID := m["_id"]
	delete(m, "_id")
	bs, err := bson.Marshal(m)
	if err != nil {
		return nil, err
	}
	var meta domain.ExchangeMeta
	if err := bson.Unmarshal(bs, &meta); err != nil {
		return nil, err
	}
	switch v := rawID.(type) {
	case bson.ObjectID:
		meta.ID = v.Hex()
	case string:
		meta.ID = v
	}
	return &meta, nil
}
