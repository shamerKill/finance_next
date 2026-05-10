// onchain.go — Phase 8 onchain_metrics read access.

package timescale

import (
	"context"
	"fmt"
	"time"
)

// OnchainPoint is one on-chain metric observation row.
type OnchainPoint struct {
	Source string    `json:"source"`
	Chain  string    `json:"chain"`
	Metric string    `json:"metric"`
	Time   time.Time `json:"ts"`
	Value  float64   `json:"value"`
}

// QueryOnchain returns observations in [start, end) ascending.
func (s *Store) QueryOnchain(
	ctx context.Context,
	chain, metric string,
	start, end time.Time,
	limit int,
) ([]OnchainPoint, error) {
	const sqlText = `
SELECT source, chain, metric, ts, value
FROM onchain_metrics
WHERE chain  = $1
  AND metric = $2
  AND ts >= $3
  AND ts <  $4
ORDER BY ts ASC
LIMIT $5`
	rows, err := s.pool.Query(ctx, sqlText, chain, metric, start, end, limit)
	if err != nil {
		return nil, fmt.Errorf("query onchain_metrics: %w", err)
	}
	defer rows.Close()
	out := make([]OnchainPoint, 0, 64)
	for rows.Next() {
		var p OnchainPoint
		if err := rows.Scan(&p.Source, &p.Chain, &p.Metric, &p.Time, &p.Value); err != nil {
			return nil, fmt.Errorf("scan onchain_metrics: %w", err)
		}
		out = append(out, p)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("iterate onchain_metrics: %w", err)
	}
	return out, nil
}
