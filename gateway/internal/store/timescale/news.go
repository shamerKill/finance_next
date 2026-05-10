// news.go — Phase 8 news_events read access.

package timescale

import (
	"context"
	"fmt"
	"strings"
	"time"
)

// NewsItem is one news article row.
type NewsItem struct {
	ID        string    `json:"id"`
	Source    string    `json:"source"`
	Time      time.Time `json:"ts"`
	Title     string    `json:"title"`
	URL       string    `json:"url"`
	Body      string    `json:"body"`
	Sentiment float64   `json:"sentiment"`
	Symbols   []string  `json:"symbols"`
}

// QueryNews returns recent news rows ordered by ts desc.
//
// `symbols` (optional) filters via the GIN array overlap operator (`&&`).
// `since` (optional) constrains the lower time bound.
func (s *Store) QueryNews(
	ctx context.Context,
	symbols []string,
	since time.Time,
	limit int,
) ([]NewsItem, error) {
	parts := make([]string, 0, 2)
	args := make([]any, 0, 3)
	idx := 1
	if len(symbols) > 0 {
		parts = append(parts, fmt.Sprintf("symbols && $%d::text[]", idx))
		args = append(args, symbols)
		idx++
	}
	if !since.IsZero() {
		parts = append(parts, fmt.Sprintf("ts >= $%d", idx))
		args = append(args, since)
		idx++
	}
	where := ""
	if len(parts) > 0 {
		where = " WHERE " + strings.Join(parts, " AND ")
	}
	args = append(args, limit)
	sqlText := fmt.Sprintf(
		"SELECT id, source, ts, title, url, body, sentiment, symbols "+
			"FROM news_events%s ORDER BY ts DESC LIMIT $%d",
		where, idx,
	)
	rows, err := s.pool.Query(ctx, sqlText, args...)
	if err != nil {
		return nil, fmt.Errorf("query news_events: %w", err)
	}
	defer rows.Close()
	out := make([]NewsItem, 0, 32)
	for rows.Next() {
		var n NewsItem
		if err := rows.Scan(
			&n.ID, &n.Source, &n.Time, &n.Title, &n.URL, &n.Body, &n.Sentiment, &n.Symbols,
		); err != nil {
			return nil, fmt.Errorf("scan news_events: %w", err)
		}
		if n.Symbols == nil {
			n.Symbols = []string{}
		}
		out = append(out, n)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("iterate news_events: %w", err)
	}
	return out, nil
}
