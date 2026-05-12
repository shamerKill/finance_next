// invitation_repo.go — Phase 1.A.1 invitations collection repo.
//
// Tokens are the `_id`; reads are point lookups. Expired or used tokens
// are filtered at the handler layer (we still return the doc so the
// handler can distinguish 410 Gone from 404 Not Found).
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

// InvitationCollectionName is the Mongo collection for invites.
const InvitationCollectionName = "invitations"

// ErrInvitationNotFound is returned when a token has no row.
var ErrInvitationNotFound = errors.New("invitation not found")

// InvitationRepo wraps the `invitations` collection.
type InvitationRepo struct {
	col *mongo.Collection
}

// NewInvitationRepo binds the given DB and returns a repository.
func NewInvitationRepo(db *mongo.Database) *InvitationRepo {
	return &InvitationRepo{col: db.Collection(InvitationCollectionName)}
}

// EnsureIndexes creates:
//   - unique(email) on unused invitations — at most one open invite per
//     email at a time (UsedAt missing). Partial index so the same email
//     can be re-invited once the previous invite is consumed.
//   - TTL on expiresAt — Mongo auto-deletes 7 days after expiry so the
//     collection doesn't grow forever. Background TTL monitor runs once
//     a minute.
func (r *InvitationRepo) EnsureIndexes(ctx context.Context) error {
	_, err := r.col.Indexes().CreateMany(ctx, []mongo.IndexModel{
		{
			Keys: bson.D{{Key: "email", Value: 1}},
			Options: options.Index().
				SetUnique(true).
				SetName("uniq_email_open").
				SetPartialFilterExpression(bson.M{"usedAt": bson.M{"$exists": false}}),
		},
		{
			Keys: bson.D{{Key: "expiresAt", Value: 1}},
			Options: options.Index().
				SetName("ttl_expiresAt").
				SetExpireAfterSeconds(int32((7 * 24 * time.Hour).Seconds())),
		},
	})
	return err
}

// Insert persists a new invitation. Caller fills Token / Email / Role /
// InvitedBy / ExpiresAt / CreatedAt. Duplicate open invite on the same
// email surfaces as a mongo duplicate-key error; the handler maps that
// to a friendlier 409.
func (r *InvitationRepo) Insert(ctx context.Context, inv *domain.Invitation) error {
	if inv.Token == "" {
		return errors.New("invitation token required")
	}
	_, err := r.col.InsertOne(ctx, inv)
	return err
}

// FindByToken returns the invitation with the matching token, or
// ErrInvitationNotFound. The handler must check ExpiresAt and UsedAt
// before honouring the invite.
func (r *InvitationRepo) FindByToken(ctx context.Context, token string) (*domain.Invitation, error) {
	var inv domain.Invitation
	err := r.col.FindOne(ctx, bson.D{{Key: "_id", Value: token}}).Decode(&inv)
	if errors.Is(err, mongo.ErrNoDocuments) {
		return nil, ErrInvitationNotFound
	}
	if err != nil {
		return nil, err
	}
	return &inv, nil
}

// MarkUsed stamps the invitation as consumed. Idempotent only in the
// sense that re-marking returns ErrInvitationNotFound — call this once
// from the accept-invite handler after the new user has been inserted.
func (r *InvitationRepo) MarkUsed(ctx context.Context, token string, at time.Time) error {
	res, err := r.col.UpdateOne(ctx,
		bson.D{
			{Key: "_id", Value: token},
			{Key: "usedAt", Value: bson.M{"$exists": false}},
		},
		bson.M{"$set": bson.M{"usedAt": at}},
	)
	if err != nil {
		return err
	}
	if res.MatchedCount == 0 {
		return ErrInvitationNotFound
	}
	return nil
}
