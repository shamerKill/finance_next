// wallet_repo.go — Phase 9 polygon_wallets collection.
//
// Stores envelope-encrypted Polygon wallet private keys. The cipher
// fields use bson tags for storage but `json:"-"` (in domain.Wallet)
// for the over-the-wire surface. The repo decoder respects the same
// contract: GET handlers receive a Wallet struct whose ciphertext
// fields are still populated in memory but are never serialised.
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

// WalletCollectionName is the Mongo collection storing Polygon wallets.
const WalletCollectionName = "polygon_wallets"

// ErrWalletNotFound is returned when no doc matches the query.
var ErrWalletNotFound = errors.New("wallet not found")

// WalletRepo is the Mongo-backed repository for [domain.Wallet].
type WalletRepo struct {
	col *mongo.Collection
}

// NewWalletRepo binds the given DB.
func NewWalletRepo(db *mongo.Database) *WalletRepo {
	return &WalletRepo{col: db.Collection(WalletCollectionName)}
}

// EnsureIndexes builds the (userId, address) unique index.
func (r *WalletRepo) EnsureIndexes(ctx context.Context) error {
	_, err := r.col.Indexes().CreateOne(ctx, mongo.IndexModel{
		Keys: bson.D{
			{Key: "userId", Value: 1},
			{Key: "address", Value: 1},
		},
		Options: options.Index().SetUnique(true).SetName("uniq_user_address"),
	})
	return err
}

// Create inserts a new wallet and returns the persisted doc.
func (r *WalletRepo) Create(ctx context.Context, w *domain.Wallet) (*domain.Wallet, error) {
	now := time.Now().UTC()
	if w.CreatedAt.IsZero() {
		w.CreatedAt = now
	}
	w.UpdatedAt = now
	w.ID = ""
	res, err := r.col.InsertOne(ctx, w)
	if err != nil {
		return nil, err
	}
	oid, ok := res.InsertedID.(bson.ObjectID)
	if !ok {
		return nil, errors.New("inserted id is not an ObjectID")
	}
	return r.FindByID(ctx, oid.Hex())
}

// FindAll returns every wallet for the given userId.
func (r *WalletRepo) FindAll(ctx context.Context, userID string) ([]domain.Wallet, error) {
	cur, err := r.col.Find(ctx, bson.D{{Key: "userId", Value: userID}})
	if err != nil {
		return nil, err
	}
	defer cur.Close(ctx)
	out := []domain.Wallet{}
	for cur.Next(ctx) {
		var raw bson.M
		if err := cur.Decode(&raw); err != nil {
			return nil, err
		}
		w, err := decodeWallet(raw)
		if err != nil {
			return nil, err
		}
		out = append(out, *w)
	}
	return out, cur.Err()
}

// FindByID returns one wallet by hex ObjectID.
func (r *WalletRepo) FindByID(ctx context.Context, id string) (*domain.Wallet, error) {
	oid, err := bson.ObjectIDFromHex(id)
	if err != nil {
		return nil, ErrWalletNotFound
	}
	var raw bson.M
	err = r.col.FindOne(ctx, bson.D{{Key: "_id", Value: oid}}).Decode(&raw)
	if errors.Is(err, mongo.ErrNoDocuments) {
		return nil, ErrWalletNotFound
	}
	if err != nil {
		return nil, err
	}
	return decodeWallet(raw)
}

// Delete removes a wallet by hex id.
func (r *WalletRepo) Delete(ctx context.Context, id string) error {
	oid, err := bson.ObjectIDFromHex(id)
	if err != nil {
		return ErrWalletNotFound
	}
	res, err := r.col.DeleteOne(ctx, bson.D{{Key: "_id", Value: oid}})
	if err != nil {
		return err
	}
	if res.DeletedCount == 0 {
		return ErrWalletNotFound
	}
	return nil
}

// UpdateCachedBalance refreshes the cached balance/allowance fields.
func (r *WalletRepo) UpdateCachedBalance(ctx context.Context, id string, balance, allowance float64) error {
	oid, err := bson.ObjectIDFromHex(id)
	if err != nil {
		return ErrWalletNotFound
	}
	_, err = r.col.UpdateOne(ctx,
		bson.M{"_id": oid},
		bson.M{"$set": bson.M{
			"usdcBalanceCached":   balance,
			"usdcAllowanceCached": allowance,
			"cachedAt":            time.Now().UTC(),
			"updatedAt":           time.Now().UTC(),
		}},
	)
	return err
}

func decodeWallet(m bson.M) (*domain.Wallet, error) {
	bs, err := bson.Marshal(m)
	if err != nil {
		return nil, err
	}
	var w domain.Wallet
	if err := bson.Unmarshal(bs, &w); err != nil {
		return nil, err
	}
	if oid, ok := m["_id"].(bson.ObjectID); ok {
		w.ID = oid.Hex()
	}
	return &w, nil
}
