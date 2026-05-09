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

// FindAll returns every account for the given userId.
func (r *AccountRepo) FindAll(ctx context.Context, userID string) ([]domain.Account, error) {
	cur, err := r.col.Find(ctx, bson.D{{Key: "userId", Value: userID}})
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
func decodeAccount(m bson.M) (*domain.Account, error) {
	bs, err := bson.Marshal(m)
	if err != nil {
		return nil, err
	}
	var a domain.Account
	if err := bson.Unmarshal(bs, &a); err != nil {
		return nil, err
	}
	if oid, ok := m["_id"].(bson.ObjectID); ok {
		a.ID = oid.Hex()
	}
	return &a, nil
}
