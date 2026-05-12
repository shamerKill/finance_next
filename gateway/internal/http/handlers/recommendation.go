// recommendation.go — Phase 6 REST endpoints for AI-generated strategy
// recommendations.
//
// Endpoints:
//
//   GET  /api/v1/recommendations                — list (filter by ?status, ?strategyId)
//   GET  /api/v1/recommendations/:id            — detail
//   POST /api/v1/recommendations/:id/approve    — atomic apply
//   POST /api/v1/recommendations/:id/reject     — set status=rejected
//
// The approve flow is the load-bearing piece: it MUST atomically (a) update
// the strategy doc with proposedParams, (b) bump currentVersion, (c) mark
// the recommendation approved with the applied version, (d) supersede other
// pending recommendations for the same strategy, and (e) emit
// `event.strategy.upserted` to Redis. We use a Mongo session+transaction so
// (a)-(d) are all-or-nothing; the Redis publish is best-effort and post-tx.
//
// Phase 6 does NOT auto-apply. A pending_review recommendation stays that
// way until a human sends an explicit POST /approve or /reject.
package handlers

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"strconv"
	"time"

	"github.com/finance_next/gateway/internal/domain"
	gwmw "github.com/finance_next/gateway/internal/http/middleware"
	mongostore "github.com/finance_next/gateway/internal/store/mongo"
	"github.com/labstack/echo/v4"
	"github.com/redis/go-redis/v9"
	"go.mongodb.org/mongo-driver/v2/bson"
	"go.mongodb.org/mongo-driver/v2/mongo"
)

// StrategyUpsertedStream mirrors the proto-defined stream name used by
// downstream consumers (Python strategy runtime + WS hub). Keep in sync
// with shared-proto/eventspb/v1/events.proto.
const StrategyUpsertedStream = "event.strategy.upserted"

// RecommendationHandler wires the recommendation routes.
type RecommendationHandler struct {
	repo    *mongostore.RecommendationRepo
	options *mongostore.OptionRepo
	rdb     *redis.Client
}

// NewRecommendationHandler builds the handler. Each dep may be nil; the
// handler returns 503 in that case so dev environments without a piece
// of infra get a clean error rather than crashing.
func NewRecommendationHandler(
	repo *mongostore.RecommendationRepo,
	options *mongostore.OptionRepo,
	rdb *redis.Client,
) *RecommendationHandler {
	return &RecommendationHandler{repo: repo, options: options, rdb: rdb}
}

// Register binds /recommendations* onto the v1 group.
func (h *RecommendationHandler) Register(g *echo.Group) {
	g.GET("/recommendations", h.list)
	g.GET("/recommendations/:id", h.findOne)
	g.POST("/recommendations/:id/approve", h.approve)
	g.POST("/recommendations/:id/reject", h.reject)
}

// ---- GET /api/v1/recommendations ----------------------------------------

func (h *RecommendationHandler) list(c echo.Context) error {
	if h.repo == nil {
		return echo.NewHTTPError(http.StatusServiceUnavailable, "recommendation repo not configured")
	}
	limit := 100
	if l := c.QueryParam("limit"); l != "" {
		if v, err := strconv.Atoi(l); err == nil && v > 0 && v <= 500 {
			limit = v
		}
	}
	docs, err := h.repo.FindAll(c.Request().Context(), mongostore.RecommendationListOptions{
		UserID:     gwmw.FromEcho(c),
		Status:     c.QueryParam("status"),
		StrategyID: c.QueryParam("strategyId"),
		Limit:      limit,
	})
	if err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, err.Error())
	}
	// Legacy docs may lack the OOS-window period field; populate the
	// gateway-side default at serialization time so the client always
	// sees a usable period block.
	for i := range docs {
		docs[i].EnsurePeriod()
	}
	return c.JSON(http.StatusOK, docs)
}

// ---- GET /api/v1/recommendations/:id ------------------------------------

func (h *RecommendationHandler) findOne(c echo.Context) error {
	if h.repo == nil {
		return echo.NewHTTPError(http.StatusServiceUnavailable, "recommendation repo not configured")
	}
	doc, err := h.repo.FindByIDForUser(c.Request().Context(), gwmw.FromEcho(c), c.Param("id"))
	if errors.Is(err, mongostore.ErrRecommendationNotFound) {
		return echo.NewHTTPError(http.StatusNotFound, "recommendation not found")
	}
	if err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, err.Error())
	}
	doc.EnsurePeriod()
	return c.JSON(http.StatusOK, doc)
}

// ---- POST /api/v1/recommendations/:id/reject ----------------------------

func (h *RecommendationHandler) reject(c echo.Context) error {
	if h.repo == nil {
		return echo.NewHTTPError(http.StatusServiceUnavailable, "recommendation repo not configured")
	}
	// R2: pre-check that the doc belongs to this tenant before mutating.
	// Without this guard a caller could reject another tenant's
	// recommendation by id (MarkRejected itself doesn't see userId).
	userID := gwmw.FromEcho(c)
	if _, err := h.repo.FindByIDForUser(c.Request().Context(), userID, c.Param("id")); err != nil {
		if errors.Is(err, mongostore.ErrRecommendationNotFound) {
			return echo.NewHTTPError(http.StatusNotFound, "recommendation not found")
		}
		return echo.NewHTTPError(http.StatusInternalServerError, err.Error())
	}
	reviewer := userID
	doc, err := h.repo.MarkRejected(c.Request().Context(), c.Param("id"), reviewer)
	if errors.Is(err, mongostore.ErrRecommendationNotFound) {
		return echo.NewHTTPError(http.StatusNotFound, "recommendation not found")
	}
	if err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, err.Error())
	}
	doc.EnsurePeriod()
	return c.JSON(http.StatusOK, doc)
}

// ---- POST /api/v1/recommendations/:id/approve ---------------------------

// approveResponse is the JSON shape returned on success.
type approveResponse struct {
	Recommendation *mongostore.RecommendationDoc `json:"recommendation"`
	Strategy       *domain.Option                `json:"strategy"`
	NewVersion     int64                         `json:"newVersion"`
}

// approve runs the load-bearing atomic update. See the package docstring
// for the full ordering. We deliberately use the raw collections via the
// repos so the same Mongo session covers both writes; the alternative
// (separate UpdateByID calls) wouldn't be transactional.
func (h *RecommendationHandler) approve(c echo.Context) error {
	if h.repo == nil || h.options == nil {
		return echo.NewHTTPError(http.StatusServiceUnavailable, "recommendation deps not configured")
	}
	id := c.Param("id")
	userID := gwmw.FromEcho(c)
	reviewer := userID
	now := time.Now().UTC()

	// 1. Read the recommendation outside the tx so we can early-out on
	//    invalid state (already approved, missing, etc.) without
	//    consuming a session. UserID-scoped so a caller can't apply
	//    another tenant's recommendation.
	rec, err := h.repo.FindByIDForUser(c.Request().Context(), userID, id)
	if errors.Is(err, mongostore.ErrRecommendationNotFound) {
		return echo.NewHTTPError(http.StatusNotFound, "recommendation not found")
	}
	if err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, err.Error())
	}
	if rec.Status != mongostore.RecommendationStatusPendingReview {
		return echo.NewHTTPError(
			http.StatusConflict,
			"recommendation is not pending_review (status="+rec.Status+")",
		)
	}

	// 2. Find the underlying strategy. We use the repo's FindByID so
	//    decoding mirrors the existing Option semantics (which excludes
	//    encrypted credential fields from the JSON response).
	strat, err := h.options.FindByID(c.Request().Context(), rec.StrategyID)
	if errors.Is(err, mongostore.ErrNotFound) {
		return echo.NewHTTPError(http.StatusConflict, "strategy not found for this recommendation")
	}
	if err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, err.Error())
	}

	// 3. Run the atomic part inside a Mongo session/tx.
	client := h.repo.Coll().Database().Client()
	sess, err := client.StartSession()
	if err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, "start session: "+err.Error())
	}
	defer sess.EndSession(c.Request().Context())

	var newVersion int64
	_, err = sess.WithTransaction(
		c.Request().Context(),
		func(ctx context.Context) (any, error) {
			newVersion = strat.CurrentVersion + 1
			if newVersion <= 0 {
				newVersion = 1
			}

			// (a) Update the strategy doc with proposedParams. We $set
			//     the params verbatim plus bump currentVersion. If the
			//     strategy schema didn't carry currentVersion before, the
			//     $set creates it.
			optionUpdate := bson.M{}
			for k, v := range rec.ProposedParams {
				optionUpdate[k] = v
			}
			optionUpdate["currentVersion"] = newVersion
			optionUpdate["lastTunedAt"] = now

			// Convert string id back to ObjectID for the option collection.
			oid, oidErr := bson.ObjectIDFromHex(rec.StrategyID)
			if oidErr != nil {
				return nil, oidErr
			}
			optColl := client.Database(h.repo.Coll().Database().Name()).Collection(mongostore.CollectionName)
			res, optErr := optColl.UpdateOne(
				ctx,
				bson.D{{Key: "_id", Value: oid}},
				bson.M{"$set": optionUpdate},
			)
			if optErr != nil {
				return nil, optErr
			}
			if res.MatchedCount == 0 {
				return nil, mongostore.ErrNotFound
			}

			// (c) Mark this recommendation approved. Conditional on
			//     status=pending_review so a concurrent approve loses
			//     gracefully.
			recColl := h.repo.Coll()
			recRes, recErr := recColl.UpdateOne(
				ctx,
				bson.D{
					{Key: "_id", Value: id},
					{Key: "status", Value: mongostore.RecommendationStatusPendingReview},
				},
				bson.M{"$set": bson.M{
					"status":         mongostore.RecommendationStatusApproved,
					"reviewedBy":     reviewer,
					"reviewedAt":     now,
					"appliedVersion": newVersion,
					"updatedAt":      now,
				}},
			)
			if recErr != nil {
				return nil, recErr
			}
			if recRes.MatchedCount == 0 {
				// Concurrent modification — abort the tx so the strategy
				// update rolls back.
				return nil, mongo.ErrNoDocuments
			}

			// (d) Supersede other pending_review recs for this strategy.
			_, supErr := recColl.UpdateMany(
				ctx,
				bson.D{
					{Key: "strategyId", Value: rec.StrategyID},
					{Key: "status", Value: mongostore.RecommendationStatusPendingReview},
					{Key: "_id", Value: bson.M{"$ne": id}},
				},
				bson.M{"$set": bson.M{
					"status":    mongostore.RecommendationStatusSuperseded,
					"updatedAt": now,
				}},
			)
			if supErr != nil {
				return nil, supErr
			}
			return nil, nil
		},
	)
	if err != nil {
		// Standalone Mongo (no replica set) doesn't support transactions —
		// surface a 500 rather than misleading the user. Phase 7 ops will
		// validate Atlas/replica-set deployment.
		return echo.NewHTTPError(http.StatusInternalServerError, "approve transaction failed: "+err.Error())
	}

	// (e) Best-effort publish event.strategy.upserted. We never fail the
	//     request on a Redis hiccup; the strategy + recommendation are
	//     already updated in Mongo.
	if h.rdb != nil {
		payload := map[string]any{
			"strategy_id": rec.StrategyID,
			"version":     newVersion,
			"kind":        strat.Kind,
		}
		if buf, err := json.Marshal(payload); err == nil {
			ctx, cancel := context.WithTimeout(c.Request().Context(), 2*time.Second)
			defer cancel()
			if err := h.rdb.XAdd(ctx, &redis.XAddArgs{
				Stream: StrategyUpsertedStream,
				Values: map[string]any{"data": string(buf)},
			}).Err(); err != nil {
				c.Logger().Warnf("strategy.upserted publish failed: %v", err)
			}
		}
	}

	// Re-read the (now updated) recommendation + strategy for the response.
	approvedRec, err := h.repo.FindByIDForUser(c.Request().Context(), userID, id)
	if err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, err.Error())
	}
	approvedRec.EnsurePeriod()
	updatedStrat, err := h.options.FindByID(c.Request().Context(), rec.StrategyID)
	if err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, err.Error())
	}
	return c.JSON(http.StatusOK, approveResponse{
		Recommendation: approvedRec,
		Strategy:       updatedStrat,
		NewVersion:     newVersion,
	})
}
