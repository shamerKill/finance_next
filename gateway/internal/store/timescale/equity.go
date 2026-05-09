// equity.go — read access to the `equity_curve` hypertable populated by
// the Python quant worker (`quant.workers.backtest`). The gateway never
// writes here; that's the worker's job.
package timescale

import (
	"context"
	"fmt"
	"time"
)

// EquityPoint is one bar of the run's equity curve.
type EquityPoint struct {
	Time     time.Time `json:"time"`
	Equity   float64   `json:"equity"`
	Drawdown float64   `json:"drawdown"`
	Position float64   `json:"position"`
}

// QueryEquityCurve returns up to `limit` points for `runID`, ordered by
// timestamp ascending. limit ≤ 0 falls back to 50_000 (UI cap; downsample
// upstream when needed).
func (s *Store) QueryEquityCurve(ctx context.Context, runID string, limit int) ([]EquityPoint, error) {
	if limit <= 0 {
		limit = 50_000
	}
	const sqlText = `
SELECT ts, equity, drawdown, position
FROM equity_curve
WHERE run_id = $1
ORDER BY ts ASC
LIMIT $2`
	rows, err := s.pool.Query(ctx, sqlText, runID, limit)
	if err != nil {
		return nil, fmt.Errorf("query equity_curve: %w", err)
	}
	defer rows.Close()
	out := make([]EquityPoint, 0, 1024)
	for rows.Next() {
		var p EquityPoint
		if err := rows.Scan(&p.Time, &p.Equity, &p.Drawdown, &p.Position); err != nil {
			return nil, fmt.Errorf("scan equity row: %w", err)
		}
		out = append(out, p)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("iterate equity rows: %w", err)
	}
	return out, nil
}
