// Package mongo holds Mongo-backed repositories.
//
// The collection is intentionally named "options" (current schema). The Phase 1
// migration will rename it to "strategies".
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

// CollectionName is the Mongo collection used for strategy configs.
const CollectionName = "options"

// ErrNotFound is returned when a document does not exist.
var ErrNotFound = errors.New("option not found")

// OptionRepo wraps a single Mongo collection.
type OptionRepo struct {
	col *mongo.Collection
}

// NewOptionRepo binds the given DB and returns a repository for the options collection.
func NewOptionRepo(db *mongo.Database) *OptionRepo {
	return &OptionRepo{col: db.Collection(CollectionName)}
}

// EnsureIndexes creates:
//   - unique(name)               — legacy uniqueness from Mongoose
//   - (userId, _id)              — R2 multi-tenant lookup
func (r *OptionRepo) EnsureIndexes(ctx context.Context) error {
	_, err := r.col.Indexes().CreateMany(ctx, []mongo.IndexModel{
		{
			Keys:    bson.D{{Key: "name", Value: 1}},
			Options: options.Index().SetUnique(true).SetName("uniq_name"),
		},
		{
			Keys:    bson.D{{Key: "userId", Value: 1}, {Key: "_id", Value: 1}},
			Options: options.Index().SetName("user_id"),
		},
	})
	return err
}

// BackfillMissingUserID upserts userId=DefaultUserID on every doc missing
// the field. Idempotent; safe to run on every boot. Returns the number of
// updated documents so the caller can log it.
func (r *OptionRepo) BackfillMissingUserID(ctx context.Context) (int64, error) {
	res, err := r.col.UpdateMany(ctx,
		bson.M{"userId": bson.M{"$exists": false}},
		bson.M{"$set": bson.M{"userId": "default"}},
	)
	if err != nil {
		return 0, err
	}
	return res.ModifiedCount, nil
}

// Create inserts a new option and returns the persisted doc (with assigned _id).
func (r *OptionRepo) Create(ctx context.Context, o *domain.Option) (*domain.Option, error) {
	if o.CreateTime.IsZero() {
		o.CreateTime = time.Now().UTC()
	}
	// Let Mongo assign _id; clear any caller-supplied empty string so bson omits it.
	o.ID = ""
	res, err := r.col.InsertOne(ctx, o)
	if err != nil {
		return nil, err
	}
	oid, ok := res.InsertedID.(bson.ObjectID)
	if !ok {
		return nil, errors.New("inserted id is not an ObjectID")
	}
	return r.FindByID(ctx, oid.Hex())
}

// FindAll returns every option for the given userId. Passing "" returns
// every option across all tenants — reserved for admin / migration paths
// only; HTTP handlers must always pass the resolved userId.
func (r *OptionRepo) FindAll(ctx context.Context, userID string) ([]domain.Option, error) {
	filter := bson.D{}
	if userID != "" {
		filter = bson.D{{Key: "userId", Value: userID}}
	}
	cur, err := r.col.Find(ctx, filter)
	if err != nil {
		return nil, err
	}
	defer cur.Close(ctx)
	out := []domain.Option{}
	for cur.Next(ctx) {
		var raw bson.M
		if err := cur.Decode(&raw); err != nil {
			return nil, err
		}
		o, err := decodeOption(raw)
		if err != nil {
			return nil, err
		}
		out = append(out, *o)
	}
	if err := cur.Err(); err != nil {
		return nil, err
	}
	return out, nil
}

// FindByID returns the option for the given hex ObjectID.
func (r *OptionRepo) FindByID(ctx context.Context, id string) (*domain.Option, error) {
	oid, err := bson.ObjectIDFromHex(id)
	if err != nil {
		return nil, ErrNotFound
	}
	var raw bson.M
	err = r.col.FindOne(ctx, bson.D{{Key: "_id", Value: oid}}).Decode(&raw)
	if errors.Is(err, mongo.ErrNoDocuments) {
		return nil, ErrNotFound
	}
	if err != nil {
		return nil, err
	}
	return decodeOption(raw)
}

// UpdateByID applies $set with the given fields and returns the refreshed doc.
// `set` should already contain encrypted credentials when applicable.
func (r *OptionRepo) UpdateByID(ctx context.Context, id string, set bson.M) (*domain.Option, error) {
	oid, err := bson.ObjectIDFromHex(id)
	if err != nil {
		return nil, ErrNotFound
	}
	if len(set) == 0 {
		return r.FindByID(ctx, id)
	}
	res, err := r.col.UpdateOne(ctx, bson.D{{Key: "_id", Value: oid}}, bson.M{"$set": set})
	if err != nil {
		return nil, err
	}
	if res.MatchedCount == 0 {
		return nil, ErrNotFound
	}
	return r.FindByID(ctx, id)
}

// Delete removes the option by id; returns ErrNotFound if it didn't exist.
func (r *OptionRepo) Delete(ctx context.Context, id string) error {
	oid, err := bson.ObjectIDFromHex(id)
	if err != nil {
		return ErrNotFound
	}
	res, err := r.col.DeleteOne(ctx, bson.D{{Key: "_id", Value: oid}})
	if err != nil {
		return err
	}
	if res.DeletedCount == 0 {
		return ErrNotFound
	}
	return nil
}

// decodeOption pulls a raw bson.M into our domain shape, including _id->id.
//
// We intentionally decode through bson.M (rather than directly into Option) so
// legacy documents with extra fields like __v don't trip strict decoding, and
// so we can stringify _id ourselves.
func decodeOption(m bson.M) (*domain.Option, error) {
	// Re-marshal raw to bytes then decode into the typed struct (drops _id).
	// Using mongo's bson.Marshal/Unmarshal keeps types coherent.
	bs, err := bson.Marshal(m)
	if err != nil {
		return nil, err
	}
	var o domain.Option
	if err := bson.Unmarshal(bs, &o); err != nil {
		return nil, err
	}
	if oid, ok := m["_id"].(bson.ObjectID); ok {
		o.ID = oid.Hex()
	}
	return &o, nil
}
