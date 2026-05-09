// redis_backtest.go — generic upstream factory backed by Redis Streams,
// used to forward backtest progress / completion events to the WS hub.
//
// One Redis XREAD goroutine per (kind, id) — keeps lifecycle simple. For
// the backtest case there's typically a single subscriber per run id
// (the user looking at the backtest detail page) so this isn't a
// bottleneck. If we ever need fan-out across many subscribers we can
// front this with one global consumer + an internal pub/sub.

package ws

import (
	"context"
	"encoding/json"
	"fmt"
	"log/slog"
	"time"

	"github.com/redis/go-redis/v9"
)

// Stream names mirror quant/src/quant/events/redis_stream.py.
const (
	BacktestProgressStream  = "event.backtest.progress"
	BacktestCompletedStream = "event.backtest.completed"
)

// RedisBacktestSource implements GenericUpstream for one backtest run id.
type RedisBacktestSource struct {
	rdb    *redis.Client
	runID  string
	events chan GenericEvent
	cancel context.CancelFunc
	log    *slog.Logger
}

// NewRedisBacktestUpstreamFactory returns a GenericUpstreamFactory that
// produces RedisBacktestSource instances for TopicBacktest. Other topic
// kinds return an error so misuse fails loudly at subscribe time.
func NewRedisBacktestUpstreamFactory(rdb *redis.Client, log *slog.Logger) GenericUpstreamFactory {
	if log == nil {
		log = slog.Default()
	}
	return func(ctx context.Context, kind TopicKind, id string) (GenericUpstream, error) {
		if kind != TopicBacktest {
			return nil, fmt.Errorf("ws: redis backtest factory got kind=%q", kind)
		}
		if rdb == nil {
			return nil, fmt.Errorf("ws: redis client is nil")
		}
		runCtx, cancel := context.WithCancel(ctx)
		src := &RedisBacktestSource{
			rdb:    rdb,
			runID:  id,
			events: make(chan GenericEvent, 32),
			cancel: cancel,
			log:    log,
		}
		go src.loop(runCtx)
		return src, nil
	}
}

// Events returns the event channel. Closed by the source when it stops.
func (s *RedisBacktestSource) Events() <-chan GenericEvent { return s.events }

// Stop tears down the goroutine and closes the channel.
func (s *RedisBacktestSource) Stop() {
	s.cancel()
}

// loop blocks on XREAD against the two backtest streams and forwards
// matching entries to the hub. Terminates on the completed event or ctx
// cancellation.
func (s *RedisBacktestSource) loop(ctx context.Context) {
	defer close(s.events)

	progressID := "$" // only new entries
	completedID := "$"

	for {
		select {
		case <-ctx.Done():
			return
		default:
		}

		streams, err := s.rdb.XRead(ctx, &redis.XReadArgs{
			Streams: []string{BacktestProgressStream, BacktestCompletedStream, progressID, completedID},
			Count:   16,
			Block:   2 * time.Second,
		}).Result()
		if err != nil {
			if ctx.Err() != nil {
				return
			}
			// redis.Nil = block timeout with no entries → just retry.
			if err == redis.Nil {
				continue
			}
			s.log.Warn("backtest stream xread failed", "err", err)
			time.Sleep(500 * time.Millisecond)
			continue
		}
		for _, st := range streams {
			for _, msg := range st.Messages {
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
				rid, _ := payload["run_id"].(string)
				if rid != s.runID {
					// Advance cursor regardless of run_id match.
					if st.Stream == BacktestProgressStream {
						progressID = msg.ID
					} else {
						completedID = msg.ID
					}
					continue
				}

				// Tag the envelope by stream name → "backtest.progress" or "backtest.completed".
				eventType := "backtest.progress"
				if st.Stream == BacktestCompletedStream {
					eventType = "backtest.completed"
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

				if st.Stream == BacktestProgressStream {
					progressID = msg.ID
				} else {
					completedID = msg.ID
					// Terminal event — close the source.
					return
				}
			}
		}
	}
}
