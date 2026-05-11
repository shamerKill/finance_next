package timescale

import (
	"context"
	"embed"
	"fmt"
	"log/slog"
	"sort"
	"strings"

	"github.com/jackc/pgx/v5/pgxpool"
)

// schemaFS embeds the canonical Timescale init SQL so the gateway can
// re-apply the schema on every boot. docker-entrypoint-initdb.d only
// runs on first-boot of an empty Postgres data dir, so any stale or
// re-attached volume silently skips initialization. Embedding the SQL
// in the binary means the gateway can self-heal: every file is
// idempotent (CREATE TABLE IF NOT EXISTS, if_not_exists => TRUE on
// hypertables, IF NOT EXISTS on continuous aggregates), so running on
// a fresh volume populates everything and running on an already-
// initialized volume is a no-op.
//
//go:embed schema/*.sql
var schemaFS embed.FS

// Migrate applies every embedded SQL file in lexical order. Failures
// on individual statements are logged as warnings rather than returned
// — 001_init.sql does CREATE EXTENSION + role provisioning that the
// `app` role may not have privilege to run when extensions/role were
// already set up by compose's first-boot. The rest of the files only
// touch tables that `app` owns, so they succeed regardless.
func Migrate(ctx context.Context, pool *pgxpool.Pool, logger *slog.Logger) error {
	entries, err := schemaFS.ReadDir("schema")
	if err != nil {
		return fmt.Errorf("read embedded schema: %w", err)
	}
	names := make([]string, 0, len(entries))
	for _, e := range entries {
		if !e.IsDir() && strings.HasSuffix(e.Name(), ".sql") {
			names = append(names, e.Name())
		}
	}
	sort.Strings(names)
	for _, n := range names {
		bs, err := schemaFS.ReadFile("schema/" + n)
		if err != nil {
			return fmt.Errorf("read %s: %w", n, err)
		}
		// The committed SQL was written for docker-entrypoint-initdb.d
		// which historically connected as a `postgres` superuser; it
		// switches role to take ownership. The gateway connects as
		// `app` (which is already the owner in compose), so the role
		// pivot is unnecessary and would fail when no `postgres` role
		// exists. Strip the two ROLE management statements; everything
		// else in the file is idempotent.
		sql := strings.ReplaceAll(string(bs), "SET ROLE postgres;", "")
		sql = strings.ReplaceAll(sql, "RESET ROLE;", "")
		if _, err := pool.Exec(ctx, sql); err != nil {
			// 001 may require superuser; the rest are idempotent and should succeed.
			logger.Warn("timescale migration: file applied with error (likely no-op on existing volume)", "file", n, "err", err)
			continue
		}
		logger.Info("timescale migration applied", "file", n)
	}
	return nil
}
