// prediction.go — Phase 9 prediction-market read access.
//
// Three tables:
//   * prediction_markets — metadata catalogue (NOT a hypertable)
//   * prediction_quotes  — orderbook mid/last snapshots (hypertable)
//   * prediction_trades  — executed trades, dedupe by tx_hash (hypertable)
//
// The Python quant worker is the sole writer; the gateway only reads.
package timescale

import (
	"context"
	"fmt"
	"time"
)

// PredictionMarket is one row in prediction_markets.
type PredictionMarket struct {
	Source      string    `json:"source"`
	MarketID    string    `json:"marketId"`
	ConditionID string    `json:"conditionId,omitempty"`
	Question    string    `json:"question"`
	EndDate     time.Time `json:"endDate,omitzero"`
	Category    string    `json:"category,omitempty"`
	Tags        []string  `json:"tags,omitempty"`
	CreatedAt   time.Time `json:"createdAt"`
}

// PredictionQuote is one orderbook snapshot.
type PredictionQuote struct {
	Source    string    `json:"source"`
	MarketID  string    `json:"marketId"`
	TokenID   string    `json:"tokenId"`
	Time      time.Time `json:"ts"`
	Mid       float64   `json:"mid,omitempty"`
	Last      float64   `json:"last,omitempty"`
	Bid       float64   `json:"bid,omitempty"`
	Ask       float64   `json:"ask,omitempty"`
	Volume24h float64   `json:"volume24h,omitempty"`
}

// PredictionTrade is one row in prediction_trades.
type PredictionTrade struct {
	Source   string    `json:"source"`
	MarketID string    `json:"marketId"`
	TokenID  string    `json:"tokenId"`
	Time     time.Time `json:"ts"`
	Side     string    `json:"side"`
	Price    float64   `json:"price"`
	Size     float64   `json:"size"`
	TxHash   string    `json:"txHash"`
}

// QueryPredictionMarkets returns markets, optionally filtered by category.
// `activeOnly` when true filters to end_date > now.
func (s *Store) QueryPredictionMarkets(
	ctx context.Context,
	category string,
	activeOnly bool,
	limit, offset int,
) ([]PredictionMarket, error) {
	if limit <= 0 || limit > 1000 {
		limit = 100
	}
	if offset < 0 {
		offset = 0
	}
	q := `SELECT source, market_id, COALESCE(condition_id, ''), question,
		COALESCE(end_date, '1970-01-01'::timestamptz), COALESCE(category, ''), COALESCE(tags, ARRAY[]::text[]), created_at
		FROM prediction_markets WHERE 1=1`
	args := []any{}
	if category != "" {
		args = append(args, category)
		q += fmt.Sprintf(" AND category = $%d", len(args))
	}
	if activeOnly {
		q += " AND end_date > NOW()"
	}
	q += " ORDER BY end_date NULLS LAST"
	args = append(args, limit, offset)
	q += fmt.Sprintf(" LIMIT $%d OFFSET $%d", len(args)-1, len(args))

	rows, err := s.pool.Query(ctx, q, args...)
	if err != nil {
		return nil, fmt.Errorf("query prediction_markets: %w", err)
	}
	defer rows.Close()
	out := []PredictionMarket{}
	for rows.Next() {
		var m PredictionMarket
		if err := rows.Scan(&m.Source, &m.MarketID, &m.ConditionID, &m.Question,
			&m.EndDate, &m.Category, &m.Tags, &m.CreatedAt); err != nil {
			return nil, fmt.Errorf("scan prediction_markets: %w", err)
		}
		out = append(out, m)
	}
	return out, rows.Err()
}

// FindPredictionMarket returns one market by id.
func (s *Store) FindPredictionMarket(ctx context.Context, marketID string) (*PredictionMarket, error) {
	const q = `SELECT source, market_id, COALESCE(condition_id, ''), question,
		COALESCE(end_date, '1970-01-01'::timestamptz), COALESCE(category, ''), COALESCE(tags, ARRAY[]::text[]), created_at
		FROM prediction_markets WHERE market_id = $1`
	row := s.pool.QueryRow(ctx, q, marketID)
	var m PredictionMarket
	if err := row.Scan(&m.Source, &m.MarketID, &m.ConditionID, &m.Question,
		&m.EndDate, &m.Category, &m.Tags, &m.CreatedAt); err != nil {
		return nil, fmt.Errorf("scan prediction_markets: %w", err)
	}
	return &m, nil
}

// QueryPredictionQuotes returns quotes in [start, end) for token_id.
func (s *Store) QueryPredictionQuotes(
	ctx context.Context,
	tokenID string,
	start, end time.Time,
	limit int,
) ([]PredictionQuote, error) {
	if limit <= 0 || limit > 50_000 {
		limit = 5_000
	}
	const q = `
SELECT source, market_id, token_id, ts,
	COALESCE(mid, 0), COALESCE(last, 0), COALESCE(bid, 0),
	COALESCE(ask, 0), COALESCE(volume_24h, 0)
FROM prediction_quotes
WHERE token_id = $1 AND ts >= $2 AND ts < $3
ORDER BY ts ASC LIMIT $4`
	rows, err := s.pool.Query(ctx, q, tokenID, start, end, limit)
	if err != nil {
		return nil, fmt.Errorf("query prediction_quotes: %w", err)
	}
	defer rows.Close()
	out := []PredictionQuote{}
	for rows.Next() {
		var q PredictionQuote
		if err := rows.Scan(&q.Source, &q.MarketID, &q.TokenID, &q.Time,
			&q.Mid, &q.Last, &q.Bid, &q.Ask, &q.Volume24h); err != nil {
			return nil, fmt.Errorf("scan prediction_quotes: %w", err)
		}
		out = append(out, q)
	}
	return out, rows.Err()
}

// QueryPredictionTrades returns the most recent trades for market_id.
func (s *Store) QueryPredictionTrades(
	ctx context.Context,
	marketID string,
	limit int,
) ([]PredictionTrade, error) {
	if limit <= 0 || limit > 1000 {
		limit = 100
	}
	const q = `
SELECT source, market_id, token_id, ts, side, price, size, tx_hash
FROM prediction_trades
WHERE market_id = $1
ORDER BY ts DESC LIMIT $2`
	rows, err := s.pool.Query(ctx, q, marketID, limit)
	if err != nil {
		return nil, fmt.Errorf("query prediction_trades: %w", err)
	}
	defer rows.Close()
	out := []PredictionTrade{}
	for rows.Next() {
		var t PredictionTrade
		if err := rows.Scan(&t.Source, &t.MarketID, &t.TokenID, &t.Time,
			&t.Side, &t.Price, &t.Size, &t.TxHash); err != nil {
			return nil, fmt.Errorf("scan prediction_trades: %w", err)
		}
		out = append(out, t)
	}
	return out, rows.Err()
}
