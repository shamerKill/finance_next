// audit_repo.go — Phase 7 append-only audit log.
//
// We use a TTL index on `expiresAt` (default 7 years) so the collection
// auto-prunes without an external cron. The middleware sets ExpiresAt =
// Ts + AuditRetention at write time.
package mongo

import (
	"context"
	"time"

	"github.com/finance_next/gateway/internal/domain"
	"go.mongodb.org/mongo-driver/v2/bson"
	"go.mongodb.org/mongo-driver/v2/mongo"
	"go.mongodb.org/mongo-driver/v2/mongo/options"
)

// AuditCollectionName is the canonical Mongo collection.
const AuditCollectionName = "audit"

// DefaultAuditRetention is the TTL applied to new audit rows when the
// caller does not override it. Seven years comes from the SOX / SEC
// guidance most retail platforms anchor against; tune via env in main.
const DefaultAuditRetention = 7 * 365 * 24 * time.Hour

// AuditRepo wraps the audit collection.
type AuditRepo struct {
	col       *mongo.Collection
	retention time.Duration
}

// NewAuditRepo binds the collection and uses DefaultAuditRetention.
func NewAuditRepo(db *mongo.Database) *AuditRepo {
	return NewAuditRepoWithRetention(db, DefaultAuditRetention)
}

// NewAuditRepoWithRetention is the test-friendly constructor.
func NewAuditRepoWithRetention(db *mongo.Database, retention time.Duration) *AuditRepo {
	if retention <= 0 {
		retention = DefaultAuditRetention
	}
	return &AuditRepo{col: db.Collection(AuditCollectionName), retention: retention}
}

// Retention exposes the TTL used by Insert when the caller does not set
// ExpiresAt explicitly.
func (r *AuditRepo) Retention() time.Duration { return r.retention }

// EnsureIndexes builds the TTL on `expiresAt` plus query-side indices.
//
// Mongo TTLs require expireAfterSeconds=0 paired with an absolute date
// field — we use that pattern so individual rows can opt to live longer
// (e.g. catastrophic-event records pinned forever by setting expiresAt
// far in the future).
func (r *AuditRepo) EnsureIndexes(ctx context.Context) error {
	_, err := r.col.Indexes().CreateMany(ctx, []mongo.IndexModel{
		{
			Keys:    bson.D{{Key: "expiresAt", Value: 1}},
			Options: options.Index().SetExpireAfterSeconds(0).SetName("ttl_expires_at"),
		},
		{
			Keys:    bson.D{{Key: "ts", Value: -1}},
			Options: options.Index().SetName("ts_desc"),
		},
		{
			Keys:    bson.D{{Key: "actor", Value: 1}, {Key: "ts", Value: -1}},
			Options: options.Index().SetName("actor_ts"),
		},
		{
			Keys:    bson.D{{Key: "resourceType", Value: 1}, {Key: "ts", Value: -1}},
			Options: options.Index().SetName("resource_ts"),
		},
	})
	return err
}

// Insert persists one entry. Stamps Ts/ExpiresAt when missing.
func (r *AuditRepo) Insert(ctx context.Context, e *domain.AuditEntry) error {
	if e.Ts.IsZero() {
		e.Ts = time.Now().UTC()
	}
	if e.ExpiresAt.IsZero() {
		e.ExpiresAt = e.Ts.Add(r.retention)
	}
	_, err := r.col.InsertOne(ctx, e)
	return err
}

// AuditQuery is the filter + paging shape used by /admin/audit.
type AuditQuery struct {
	Actor        string
	ResourceType string
	Since        time.Time
	Limit        int
}

// List returns the most recent rows matching q (ts desc).
func (r *AuditRepo) List(ctx context.Context, q AuditQuery) ([]domain.AuditEntry, error) {
	if q.Limit <= 0 || q.Limit > 1000 {
		q.Limit = 100
	}
	filter := bson.M{}
	if q.Actor != "" {
		filter["actor"] = q.Actor
	}
	if q.ResourceType != "" {
		filter["resourceType"] = q.ResourceType
	}
	if !q.Since.IsZero() {
		filter["ts"] = bson.M{"$gte": q.Since}
	}
	cur, err := r.col.Find(ctx, filter, options.Find().
		SetSort(bson.D{{Key: "ts", Value: -1}}).
		SetLimit(int64(q.Limit)),
	)
	if err != nil {
		return nil, err
	}
	defer cur.Close(ctx)
	out := []domain.AuditEntry{}
	for cur.Next(ctx) {
		var raw bson.M
		if err := cur.Decode(&raw); err != nil {
			return nil, err
		}
		bs, err := bson.Marshal(raw)
		if err != nil {
			return nil, err
		}
		var e domain.AuditEntry
		if err := bson.Unmarshal(bs, &e); err != nil {
			return nil, err
		}
		if oid, ok := raw["_id"].(bson.ObjectID); ok {
			e.ID = oid.Hex()
		}
		out = append(out, e)
	}
	return out, cur.Err()
}
