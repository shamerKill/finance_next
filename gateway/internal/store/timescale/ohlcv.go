// Package timescale exposes the gateway's read/write surface against the
// TimescaleDB OHLCV hypertable. Phase 2 only needs read access; the Python
// quant worker is the sole writer.
package timescale

import (
	"context"
	"errors"
	"fmt"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
)

// OhlcvBar is one OHLCV row. JSON tags match the lightweight-charts
// convention so the UI can consume the response with minimal massaging.
type OhlcvBar struct {
	Exchange  string    `json:"exchange"`
	Symbol    string    `json:"symbol"`
	Timeframe string    `json:"timeframe"`
	Time      time.Time `json:"time"`
	Open      float64   `json:"open"`
	High      float64   `json:"high"`
	Low       float64   `json:"low"`
	Close     float64   `json:"close"`
	Volume    float64   `json:"volume"`
}

// Store is a thin wrapper around a pgxpool. Callers should construct it
// once at process startup and inject it into HTTP handlers.
type Store struct {
	pool *pgxpool.Pool
}

// New returns a Store backed by an existing pgxpool. The caller owns pool
// lifetime — Store does not call Close().
func New(pool *pgxpool.Pool) *Store {
	return &Store{pool: pool}
}

// Connect dials TimescaleDB and pings it. Used from main(); separated
// from New so tests can inject pre-built pools.
func Connect(ctx context.Context, dsn string) (*pgxpool.Pool, error) {
	if dsn == "" {
		return nil, errors.New("timescale DSN is empty")
	}
	cfg, err := pgxpool.ParseConfig(dsn)
	if err != nil {
		return nil, fmt.Errorf("parse timescale DSN: %w", err)
	}
	// Modest defaults; ops can tune via env in later phases.
	cfg.MaxConns = 8
	cfg.MinConns = 1
	cfg.MaxConnLifetime = 30 * time.Minute

	pool, err := pgxpool.NewWithConfig(ctx, cfg)
	if err != nil {
		return nil, fmt.Errorf("open timescale pool: %w", err)
	}
	pingCtx, cancel := context.WithTimeout(ctx, 5*time.Second)
	defer cancel()
	if err := pool.Ping(pingCtx); err != nil {
		pool.Close()
		return nil, fmt.Errorf("ping timescale: %w", err)
	}
	return pool, nil
}

// Query returns OHLCV rows in [start, end) ascending by ts, capped at limit.
//
// We accept the timeframe as a string and let the SQL filter on it directly.
// The hypertable PK is (exchange, symbol, timeframe, ts) so the query is
// index-only and bounded.
func (s *Store) Query(
	ctx context.Context,
	exchange, symbol, timeframe string,
	start, end time.Time,
	limit int,
) ([]OhlcvBar, error) {
	const sqlText = `
SELECT exchange, symbol, timeframe, ts, open, high, low, close, volume
FROM ohlcv
WHERE exchange = $1
  AND symbol = $2
  AND timeframe = $3
  AND ts >= $4
  AND ts <  $5
ORDER BY ts ASC
LIMIT $6`

	rows, err := s.pool.Query(ctx, sqlText, exchange, symbol, timeframe, start, end, limit)
	if err != nil {
		return nil, fmt.Errorf("query ohlcv: %w", err)
	}
	defer rows.Close()

	out := make([]OhlcvBar, 0, 256)
	for rows.Next() {
		var b OhlcvBar
		if err := rows.Scan(
			&b.Exchange, &b.Symbol, &b.Timeframe, &b.Time,
			&b.Open, &b.High, &b.Low, &b.Close, &b.Volume,
		); err != nil {
			return nil, fmt.Errorf("scan ohlcv row: %w", err)
		}
		out = append(out, b)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("iterate ohlcv rows: %w", err)
	}
	return out, nil
}
