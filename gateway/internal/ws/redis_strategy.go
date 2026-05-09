// redis_strategy.go — Phase 4 generic-upstream factory for live order
// events. Browsers subscribe via topic="strategy", id=<strategyId> and
// receive every event.order.* envelope whose `strategyId` matches.
//
// Design mirrors redis_backtest.go: one XREAD goroutine per (kind, id),
// keeping ack/cursor state local. For a strategy-detail page that's
// typically one consumer per active strategy, which is fine.

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

// EventsStream is the canonical Redis stream consumed for order events.
// Matches gateway/internal/orderengine.EventsStream.
const EventsStream = "events"

// TopicStrategy is the (kind, id) discriminator for live order events.
const TopicStrategy TopicKind = "strategy"

// RedisStrategySource implements GenericUpstream for one strategy id.
type RedisStrategySource struct {
	rdb        *redis.Client
	strategyID string
	events     chan GenericEvent
	cancel     context.CancelFunc
	log        *slog.Logger
}

// NewRedisStrategyUpstreamFactory returns a GenericUpstreamFactory for
// TopicStrategy. Other topic kinds return an error so misuse fails
// loudly at subscribe time.
//
// IMPORTANT: this factory is composed *with* the backtest factory in
// router.go via [composeFactories]. They both consume disjoint topic
// kinds; the composed factory dispatches.
func NewRedisStrategyUpstreamFactory(rdb *redis.Client, log *slog.Logger) GenericUpstreamFactory {
	if log == nil {
		log = slog.Default()
	}
	return func(ctx context.Context, kind TopicKind, id string) (GenericUpstream, error) {
		if kind != TopicStrategy {
			return nil, fmt.Errorf("ws: redis strategy factory got kind=%q", kind)
		}
		if rdb == nil {
			return nil, fmt.Errorf("ws: redis client is nil")
		}
		runCtx, cancel := context.WithCancel(ctx)
		src := &RedisStrategySource{
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

// Events returns the event channel; closed by the source on Stop.
func (s *RedisStrategySource) Events() <-chan GenericEvent { return s.events }

// Stop tears down the goroutine.
func (s *RedisStrategySource) Stop() { s.cancel() }

// loop consumes the events stream and forwards strategy-matched entries.
// Filters by `payload.strategyId == s.strategyID` and event type prefix
// "event.order.".
func (s *RedisStrategySource) loop(ctx context.Context) {
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
			s.log.Warn("strategy stream xread failed", "err", err)
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
				if !strings.HasPrefix(eventType, "event.order.") {
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

// ComposeUpstreamFactories merges multiple per-kind factories into a
// single GenericUpstreamFactory. It dispatches by kind; first matching
// factory wins. Returns an error for unknown kinds.
//
// We use this to keep the backtest factory + the strategy factory side
// by side without inventing a top-level "registry" abstraction. Adding
// a third kind in Phase 5 is a one-line append in router.go.
func ComposeUpstreamFactories(factories map[TopicKind]GenericUpstreamFactory) GenericUpstreamFactory {
	return func(ctx context.Context, kind TopicKind, id string) (GenericUpstream, error) {
		f, ok := factories[kind]
		if !ok {
			return nil, fmt.Errorf("ws: no upstream factory registered for kind=%q", kind)
		}
		return f(ctx, kind, id)
	}
}
