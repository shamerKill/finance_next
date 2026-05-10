// redis_prediction.go — Phase 9 WS topic for prediction strategy events.
//
// Browsers subscribe via topic="prediction_strategy", id=<strategyId>
// and receive every event.prediction_order.* envelope whose `strategyId`
// matches. Mirrors redis_strategy.go for the perp engine.
package ws

import (
	"context"
	"encoding/json"
	"fmt"
	"log/slog"
	"strings"
	"time"

	"github.com/redis/go-redis/v9"
)

// TopicPredictionStrategy is the (kind, id) discriminator for prediction
// order events.
const TopicPredictionStrategy TopicKind = "prediction_strategy"

// RedisPredictionSource implements GenericUpstream for one strategy id.
type RedisPredictionSource struct {
	rdb        *redis.Client
	strategyID string
	events     chan GenericEvent
	cancel     context.CancelFunc
	log        *slog.Logger
}

// NewRedisPredictionUpstreamFactory returns a GenericUpstreamFactory for
// TopicPredictionStrategy.
func NewRedisPredictionUpstreamFactory(rdb *redis.Client, log *slog.Logger) GenericUpstreamFactory {
	if log == nil {
		log = slog.Default()
	}
	return func(ctx context.Context, kind TopicKind, id string) (GenericUpstream, error) {
		if kind != TopicPredictionStrategy {
			return nil, fmt.Errorf("ws: redis prediction factory got kind=%q", kind)
		}
		if rdb == nil {
			return nil, fmt.Errorf("ws: redis client is nil")
		}
		runCtx, cancel := context.WithCancel(ctx)
		src := &RedisPredictionSource{
			rdb:        rdb,
			strategyID: id,
			events:     make(chan GenericEvent, 64),
			cancel:     cancel,
			log:        log,
		}
		go src.loop(runCtx)
		return src, nil
	}
}

// Events returns the event channel.
func (s *RedisPredictionSource) Events() <-chan GenericEvent { return s.events }

// Stop tears down the goroutine.
func (s *RedisPredictionSource) Stop() { s.cancel() }

// loop forwards events whose `type` starts with `event.prediction_order.`
// AND whose `strategyId` matches.
func (s *RedisPredictionSource) loop(ctx context.Context) {
	defer close(s.events)
	lastID := "$"
	for {
		select {
		case <-ctx.Done():
			return
		default:
		}
		streams, err := s.rdb.XRead(ctx, &redis.XReadArgs{
			Streams: []string{EventsStream, lastID},
			Count:   16,
			Block:   2 * time.Second,
		}).Result()
		if err != nil {
			if ctx.Err() != nil {
				return
			}
			if err == redis.Nil {
				continue
			}
			s.log.Warn("prediction stream xread failed", "err", err)
			time.Sleep(500 * time.Millisecond)
			continue
		}
		for _, st := range streams {
			for _, msg := range st.Messages {
				lastID = msg.ID
				rawAny, ok := msg.Values["data"]
				if !ok {
					continue
				}
				raw, ok := rawAny.(string)
				if !ok {
					continue
				}
				var payload map[string]any
				if err := json.Unmarshal([]byte(raw), &payload); err != nil {
					continue
				}
				eventType, _ := payload["type"].(string)
				if !strings.HasPrefix(eventType, "event.prediction_order.") {
					continue
				}
				stratID, _ := payload["strategyId"].(string)
				if stratID != s.strategyID {
					continue
				}
				bs, err := json.Marshal(payload)
				if err != nil {
					continue
				}
				select {
				case s.events <- GenericEvent{Type: eventType, Payload: bs}:
				case <-ctx.Done():
					return
				}
			}
		}
	}
}
