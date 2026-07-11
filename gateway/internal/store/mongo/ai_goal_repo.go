package mongo

import (
	"context"
	"errors"
	"time"

	"go.mongodb.org/mongo-driver/v2/bson"
	"go.mongodb.org/mongo-driver/v2/mongo"
	"go.mongodb.org/mongo-driver/v2/mongo/options"
)

const AIGoalRunCollectionName = "ai_goal_runs"

var ErrAIGoalRunNotFound = errors.New("ai goal run not found")

// AIGoalRunDoc is one persisted goal-agent response. The top-level
// fields support fast history rendering while Analysis keeps the full
// structured AI output for reopening a run.
type AIGoalRunDoc struct {
	ID                  string            `bson:"_id,omitempty"              json:"id"`
	UserID              string            `bson:"userId"                     json:"userId"`
	CreatedAt           time.Time         `bson:"createdAt"                  json:"createdAt"`
	UpdatedAt           time.Time         `bson:"updatedAt"                  json:"updatedAt"`
	Goal                string            `bson:"goal"                       json:"goal"`
	Summary             string            `bson:"summary"                    json:"summary"`
	Symbols             []string          `bson:"symbols"                    json:"symbols"`
	Horizon             string            `bson:"horizon,omitempty"           json:"horizon,omitempty"`
	RiskPreference      string            `bson:"riskPreference,omitempty"    json:"riskPreference,omitempty"`
	Status              string            `bson:"status"                     json:"status"`
	AIStatus            string            `bson:"aiStatus"                   json:"aiStatus"`
	AIModel             string            `bson:"aiModel,omitempty"           json:"aiModel,omitempty"`
	ExecutionMode       string            `bson:"executionMode"              json:"executionMode"`
	StrategyDraftCount  int               `bson:"strategyDraftCount"         json:"strategyDraftCount"`
	ContextNewsCount    int               `bson:"contextNewsCount"           json:"contextNewsCount"`
	ContextMacroCount   int               `bson:"contextMacroCount"          json:"contextMacroCount"`
	ContextOnchainCount int               `bson:"contextOnchainCount"        json:"contextOnchainCount"`
	Analysis            map[string]any    `bson:"analysis,omitempty"         json:"analysis,omitempty"`
	Actions             []AIGoalRunAction `bson:"actions,omitempty"       json:"actions,omitempty"`
}

type AIGoalRunAction struct {
	ID        string    `bson:"id"                  json:"id"`
	Status    string    `bson:"status"              json:"status"`
	RelatedID string    `bson:"relatedId,omitempty" json:"relatedId,omitempty"`
	Href      string    `bson:"href,omitempty"      json:"href,omitempty"`
	Note      string    `bson:"note,omitempty"      json:"note,omitempty"`
	UpdatedAt time.Time `bson:"updatedAt"           json:"updatedAt"`
}

type AIGoalRunRepo struct {
	col *mongo.Collection
}

func NewAIGoalRunRepo(db *mongo.Database) *AIGoalRunRepo {
	return &AIGoalRunRepo{col: db.Collection(AIGoalRunCollectionName)}
}

func (r *AIGoalRunRepo) EnsureIndexes(ctx context.Context) error {
	_, err := r.col.Indexes().CreateMany(ctx, []mongo.IndexModel{
		{
			Keys:    bson.D{{Key: "userId", Value: 1}, {Key: "createdAt", Value: -1}},
			Options: options.Index().SetName("user_created_at"),
		},
	})
	return err
}

func (r *AIGoalRunRepo) Create(ctx context.Context, run *AIGoalRunDoc) error {
	if run == nil {
		return errors.New("AIGoalRunRepo.Create: run required")
	}
	if run.UserID == "" {
		return errors.New("AIGoalRunRepo.Create: userID required")
	}
	if run.ID == "" {
		return errors.New("AIGoalRunRepo.Create: id required")
	}
	now := time.Now().UTC()
	if run.CreatedAt.IsZero() {
		run.CreatedAt = now
	}
	run.UpdatedAt = now
	_, err := r.col.InsertOne(ctx, run)
	return err
}

func (r *AIGoalRunRepo) FindAllForUser(ctx context.Context, userID string, limit int) ([]AIGoalRunDoc, error) {
	if userID == "" {
		return nil, errors.New("FindAllForUser: userID required")
	}
	if limit <= 0 {
		limit = 20
	}
	if limit > 100 {
		limit = 100
	}
	cur, err := r.col.Find(
		ctx,
		bson.M{"userId": userID},
		options.Find().SetSort(bson.D{{Key: "createdAt", Value: -1}}).SetLimit(int64(limit)),
	)
	if err != nil {
		return nil, err
	}
	defer cur.Close(ctx)
	out := []AIGoalRunDoc{}
	for cur.Next(ctx) {
		var raw bson.M
		if err := cur.Decode(&raw); err != nil {
			return nil, err
		}
		doc, err := decodeAIGoalRun(raw)
		if err != nil {
			return nil, err
		}
		out = append(out, *doc)
	}
	return out, cur.Err()
}

func (r *AIGoalRunRepo) FindByIDForUser(ctx context.Context, userID, id string) (*AIGoalRunDoc, error) {
	if userID == "" {
		return nil, errors.New("FindByIDForUser: userID required")
	}
	if id == "" {
		return nil, errors.New("FindByIDForUser: id required")
	}
	var raw bson.M
	err := r.col.FindOne(ctx, bson.M{"_id": id, "userId": userID}).Decode(&raw)
	if errors.Is(err, mongo.ErrNoDocuments) {
		return nil, ErrAIGoalRunNotFound
	}
	if err != nil {
		return nil, err
	}
	return decodeAIGoalRun(raw)
}

func (r *AIGoalRunRepo) UpsertActionForUser(
	ctx context.Context,
	userID, id string,
	action AIGoalRunAction,
) (*AIGoalRunDoc, error) {
	if userID == "" {
		return nil, errors.New("UpsertActionForUser: userID required")
	}
	if id == "" {
		return nil, errors.New("UpsertActionForUser: id required")
	}
	if action.ID == "" {
		return nil, errors.New("UpsertActionForUser: action id required")
	}
	if action.Status == "" {
		return nil, errors.New("UpsertActionForUser: action status required")
	}
	if action.UpdatedAt.IsZero() {
		action.UpdatedAt = time.Now().UTC()
	}
	doc, err := r.FindByIDForUser(ctx, userID, id)
	if err != nil {
		return nil, err
	}
	actions := upsertAIGoalRunAction(doc.Actions, action)
	_, err = r.col.UpdateOne(
		ctx,
		bson.M{"_id": id, "userId": userID},
		bson.M{"$set": bson.M{
			"actions":   actions,
			"updatedAt": time.Now().UTC(),
		}},
	)
	if err != nil {
		return nil, err
	}
	return r.FindByIDForUser(ctx, userID, id)
}

func upsertAIGoalRunAction(actions []AIGoalRunAction, action AIGoalRunAction) []AIGoalRunAction {
	next := append([]AIGoalRunAction{}, actions...)
	for i := range next {
		if next[i].ID == action.ID {
			next[i] = action
			return next
		}
	}
	return append(next, action)
}

func decodeAIGoalRun(m bson.M) (*AIGoalRunDoc, error) {
	rawID := m["_id"]
	delete(m, "_id")
	bs, err := bson.Marshal(m)
	if err != nil {
		return nil, err
	}
	var out AIGoalRunDoc
	if err := bson.Unmarshal(bs, &out); err != nil {
		return nil, err
	}
	switch v := rawID.(type) {
	case bson.ObjectID:
		out.ID = v.Hex()
	case string:
		out.ID = v
	}
	return &out, nil
}
