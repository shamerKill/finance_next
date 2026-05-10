// macro.go — Phase 8 macro_indicators read access.
//
// The Python quant worker is the sole writer; the gateway only reads.
// Schema: (source, code, ts, value, unit) hypertable on ts.

package timescale

import (
	"context"
	"fmt"
	"time"
)

// MacroPoint is one observation row.
type MacroPoint struct {
	Source string    `json:"source"`
	Code   string    `json:"code"`
	Time   time.Time `json:"ts"`
	Value  float64   `json:"value"`
	Unit   string    `json:"unit"`
}

// QueryMacro returns observations in [start, end) ascending. Caller passes
// the soft limit; the SQL caps at limit regardless to avoid a runaway query.
func (s *Store) QueryMacro(
	ctx context.Context,
	source, code string,
	start, end time.Time,
	limit int,
) ([]MacroPoint, error) {
	const sqlText = `
SELECT source, code, ts, value, unit
FROM macro_indicators
WHERE source = $1
  AND code   = $2
  AND ts >= $3
  AND ts <  $4
ORDER BY ts ASC
LIMIT $5`
	rows, err := s.pool.Query(ctx, sqlText, source, code, start, end, limit)
	if err != nil {
		return nil, fmt.Errorf("query macro_indicators: %w", err)
	}
	defer rows.Close()
	out := make([]MacroPoint, 0, 64)
	for rows.Next() {
		var p MacroPoint
		if err := rows.Scan(&p.Source, &p.Code, &p.Time, &p.Value, &p.Unit); err != nil {
			return nil, fmt.Errorf("scan macro_indicators: %w", err)
		}
		out = append(out, p)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("iterate macro_indicators: %w", err)
	}
	return out, nil
}
