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

// AccountCollectionName is the Mongo collection storing exchange accounts.
const AccountCollectionName = "accounts"

// ErrAccountNotFound is returned when no doc matches the query.
var ErrAccountNotFound = errors.New("account not found")

// AccountRepo is the Mongo-backed repository for domain.Account.
type AccountRepo struct {
	col *mongo.Collection
}

// NewAccountRepo binds the given DB and returns a repository for the accounts
// collection.
func NewAccountRepo(db *mongo.Database) *AccountRepo {
	return &AccountRepo{col: db.Collection(AccountCollectionName)}
}

// EnsureIndexes creates the (userId, exchange, label) unique index.
func (r *AccountRepo) EnsureIndexes(ctx context.Context) error {
	_, err := r.col.Indexes().CreateOne(ctx, mongo.IndexModel{
		Keys: bson.D{
			{Key: "userId", Value: 1},
			{Key: "exchange", Value: 1},
			{Key: "label", Value: 1},
		},
		Options: options.Index().SetUnique(true).SetName("uniq_user_exchange_label"),
	})
	return err
}

// BackfillMissingUserID upserts userId=DefaultUserID on every doc missing
// the field. Accounts already carry userId today, but legacy NestJS docs
// from before Phase 1 may not — this is the migration safety net. Idempotent.
func (r *AccountRepo) BackfillMissingUserID(ctx context.Context) (int64, error) {
	res, err := r.col.UpdateMany(ctx,
		bson.M{"userId": bson.M{"$exists": false}},
		bson.M{"$set": bson.M{"userId": "default"}},
	)
	if err != nil {
		return 0, err
	}
	return res.ModifiedCount, nil
}

// Create inserts a new account and returns the persisted doc.
func (r *AccountRepo) Create(ctx context.Context, a *domain.Account) (*domain.Account, error) {
	now := time.Now().UTC()
	if a.CreatedAt.IsZero() {
		a.CreatedAt = now
	}
	a.UpdatedAt = now
	a.ID = ""
	res, err := r.col.InsertOne(ctx, a)
	if err != nil {
		return nil, err
	}
	oid, ok := res.InsertedID.(bson.ObjectID)
	if !ok {
		return nil, errors.New("inserted id is not an ObjectID")
	}
	return r.FindByID(ctx, oid.Hex())
}

// FindAll returns every account for the given userId. Passing "" returns
// every account across all tenants — reserved for background workers
// (order engine reconcile loop) that need to enumerate every user's
// accounts. HTTP handlers must always pass the resolved userId.
func (r *AccountRepo) FindAll(ctx context.Context, userID string) ([]domain.Account, error) {
	filter := bson.D{}
	if userID != "" {
		filter = bson.D{{Key: "userId", Value: userID}}
	}
	cur, err := r.col.Find(ctx, filter)
	if err != nil {
		return nil, err
	}
	defer cur.Close(ctx)
	out := []domain.Account{}
	for cur.Next(ctx) {
		var raw bson.M
		if err := cur.Decode(&raw); err != nil {
			return nil, err
		}
		a, err := decodeAccount(raw)
		if err != nil {
			return nil, err
		}
		out = append(out, *a)
	}
	if err := cur.Err(); err != nil {
		return nil, err
	}
	return out, nil
}

// FindByID returns a single account by hex ObjectID.
func (r *AccountRepo) FindByID(ctx context.Context, id string) (*domain.Account, error) {
	oid, err := bson.ObjectIDFromHex(id)
	if err != nil {
		return nil, ErrAccountNotFound
	}
	var raw bson.M
	err = r.col.FindOne(ctx, bson.D{{Key: "_id", Value: oid}}).Decode(&raw)
	if errors.Is(err, mongo.ErrNoDocuments) {
		return nil, ErrAccountNotFound
	}
	if err != nil {
		return nil, err
	}
	return decodeAccount(raw)
}

// Delete removes an account by hex ObjectID.
func (r *AccountRepo) Delete(ctx context.Context, id string) error {
	oid, err := bson.ObjectIDFromHex(id)
	if err != nil {
		return ErrAccountNotFound
	}
	res, err := r.col.DeleteOne(ctx, bson.D{{Key: "_id", Value: oid}})
	if err != nil {
		return err
	}
	if res.DeletedCount == 0 {
		return ErrAccountNotFound
	}
	return nil
}

// decodeAccount maps a raw bson document into the domain shape.
//
// mongo-driver v2 refuses to decode ObjectID→string by default; stash _id,
// drop it from the map so Unmarshal doesn't choke, then patch the hex back
// onto the domain field. Same pattern as decodeMeta in exchange_meta_repo.go.
func decodeAccount(m bson.M) (*domain.Account, error) {
	rawID := m["_id"]
	delete(m, "_id")
	bs, err := bson.Marshal(m)
	if err != nil {
		return nil, err
	}
	var a domain.Account
	if err := bson.Unmarshal(bs, &a); err != nil {
		return nil, err
	}
	switch v := rawID.(type) {
	case bson.ObjectID:
		a.ID = v.Hex()
	case string:
		a.ID = v
	}
	return &a, nil
}
