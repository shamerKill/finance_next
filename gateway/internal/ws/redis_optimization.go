// redis_optimization.go — Phase 6 generic upstream factory backed by Redis
// Streams, used to forward Optuna study progress + recommendation events
// to the WS hub.
//
// One Redis XREAD goroutine per (kind, id) — same shape as redis_backtest.go.

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
	OptimizationProgressStream  = "event.optimization.progress"
	OptimizationSuggestedStream = "event.optimization.suggested"
)

// RedisOptimizationSource implements GenericUpstream for one study id.
type RedisOptimizationSource struct {
	rdb     *redis.Client
	studyID string
	events  chan GenericEvent
	cancel  context.CancelFunc
	log     *slog.Logger
}

// NewRedisOptimizationUpstreamFactory returns a GenericUpstreamFactory that
// produces RedisOptimizationSource instances for TopicOptimization. Other
// topic kinds return an error so misuse fails loudly at subscribe time.
func NewRedisOptimizationUpstreamFactory(rdb *redis.Client, log *slog.Logger) GenericUpstreamFactory {
	if log == nil {
		log = slog.Default()
	}
	return func(ctx context.Context, kind TopicKind, id string) (GenericUpstream, error) {
		if kind != TopicOptimization {
			return nil, fmt.Errorf("ws: redis optimization factory got kind=%q", kind)
		}
		if rdb == nil {
			return nil, fmt.Errorf("ws: redis client is nil")
		}
		runCtx, cancel := context.WithCancel(ctx)
		src := &RedisOptimizationSource{
			rdb:     rdb,
			studyID: id,
			events:  make(chan GenericEvent, 32),
			cancel:  cancel,
			log:     log,
		}
		go src.loop(runCtx)
		return src, nil
	}
}

// Events returns the event channel. Closed by the source when it stops.
func (s *RedisOptimizationSource) Events() <-chan GenericEvent { return s.events }

// Stop tears down the goroutine and closes the channel.
func (s *RedisOptimizationSource) Stop() { s.cancel() }

// Optimization terminal-state ints — mirror quantpb.v1.OptimizationState.
const (
	optStateCompleted       = 3
	optStateFailed          = 4
	optStateBudgetExceeded  = 5
)

// loop blocks on XREAD against the two optimization streams and forwards
// matching entries to the hub. Terminates on a terminal state in the
// progress stream OR a `optimization.suggested` event for this study (both
// indicate the study is done from the UI's perspective).
func (s *RedisOptimizationSource) loop(ctx context.Context) {
	defer close(s.events)

	progressID := "$"  // only new entries
	suggestedID := "$"

	for {
		select {
		case <-ctx.Done():
			return
		default:
		}

		streams, err := s.rdb.XRead(ctx, &redis.XReadArgs{
			Streams: []string{
				OptimizationProgressStream, OptimizationSuggestedStream,
				progressID, suggestedID,
			},
			Count: 16,
			Block: 2 * time.Second,
		}).Result()
		if err != nil {
			if ctx.Err() != nil {
				return
			}
			if err == redis.Nil {
				continue
			}
			s.log.Warn("optimization stream xread failed", "err", err)
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

				// Match by study_id.
				sid, _ := payload["study_id"].(string)
				if sid != s.studyID {
					if st.Stream == OptimizationProgressStream {
						progressID = msg.ID
					} else {
						suggestedID = msg.ID
					}
					continue
				}

				eventType := "optimization.progress"
				terminal := false
				if st.Stream == OptimizationSuggestedStream {
					eventType = "optimization.suggested"
					terminal = true
				} else if state, ok := payload["state"].(float64); ok {
					switch int(state) {
					case optStateCompleted, optStateFailed, optStateBudgetExceeded:
						terminal = true
					}
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

				if st.Stream == OptimizationProgressStream {
					progressID = msg.ID
				} else {
					suggestedID = msg.ID
				}
				if terminal {
					return
				}
			}
		}
	}
}
