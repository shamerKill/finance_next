# Embedded Timescale schema

These SQL files are **mirrored** from `infra/timescale/`. The canonical
source-of-truth lives in `infra/timescale/` (mounted into compose's
docker-entrypoint-initdb.d on first boot). The copy here is embedded into
the gateway binary via `//go:embed` in `../migrate.go` and re-applied on
every gateway start so a re-attached / stale Postgres volume self-heals.

Every statement is idempotent (`CREATE TABLE IF NOT EXISTS`,
`if_not_exists => TRUE` on `create_hypertable`, `IF NOT EXISTS` on
continuous aggregates), so re-application on an already-initialized
database is a no-op.

**Keep in sync.** When editing schema, change both:

```
infra/timescale/<file>.sql
gateway/internal/store/timescale/schema/<file>.sql
```

A quick `diff -r infra/timescale gateway/internal/store/timescale/schema`
should report only the README difference.
