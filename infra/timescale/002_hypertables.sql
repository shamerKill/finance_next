-- 002_hypertables.sql — Phase 2 time-series schema.
--
-- All time-series tables follow the data model in the architecture plan:
--   ohlcv          — primary OHLCV store (hypertable, 7-day chunks)
--   ticks          — optional tick stream for opt-in symbols
--   equity_curve   — backtest / live equity over time (Phase 3+ writes)
--   opt_trials    — Optuna trial archive (Phase 6 writes)
--
-- We additionally materialize 5m and 1h continuous aggregates from raw
-- 1m/5m bars so the UI/backtest can hit pre-computed buckets.

-- Connect as the postgres superuser (default in init scripts) and switch
-- ownership/grants to `app` after creation.
SET ROLE postgres;

-- ---------------------------------------------------------------------------
-- ohlcv
-- ---------------------------------------------------------------------------
-- Composite PK lets ON CONFLICT DO NOTHING dedupe ingest reruns. Timescale
-- requires the hypertable's time column be part of any unique index, which
-- this PK satisfies.
CREATE TABLE IF NOT EXISTS ohlcv (
    exchange   TEXT        NOT NULL,
    symbol     TEXT        NOT NULL,
    timeframe  TEXT        NOT NULL,
    ts         TIMESTAMPTZ NOT NULL,
    open       DOUBLE PRECISION NOT NULL,
    high       DOUBLE PRECISION NOT NULL,
    low        DOUBLE PRECISION NOT NULL,
    close      DOUBLE PRECISION NOT NULL,
    volume     DOUBLE PRECISION NOT NULL,
    PRIMARY KEY (exchange, symbol, timeframe, ts)
);

SELECT create_hypertable(
    'ohlcv',
    'ts',
    chunk_time_interval => INTERVAL '7 days',
    if_not_exists       => TRUE
);

-- Range scans by (exchange, symbol, timeframe) are the dominant query;
-- the PK already covers them but we add an explicit index for clarity
-- and so EXPLAIN plans don't surprise ops.
CREATE INDEX IF NOT EXISTS ohlcv_symbol_ts_idx
    ON ohlcv (exchange, symbol, timeframe, ts DESC);

-- ---------------------------------------------------------------------------
-- ticks (Phase 5+ opt-in)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS ticks (
    exchange TEXT        NOT NULL,
    symbol   TEXT        NOT NULL,
    ts       TIMESTAMPTZ NOT NULL,
    price    DOUBLE PRECISION NOT NULL,
    qty      DOUBLE PRECISION NOT NULL,
    side     TEXT        NOT NULL,
    PRIMARY KEY (exchange, symbol, ts)
);

SELECT create_hypertable(
    'ticks',
    'ts',
    chunk_time_interval => INTERVAL '1 day',
    if_not_exists       => TRUE
);

-- ---------------------------------------------------------------------------
-- equity_curve (Phase 3+: backtest + live writes)
-- ---------------------------------------------------------------------------
-- run_id is a hex string referencing Mongo's `backtest_results._id` or a
-- live execution id; we don't FK-enforce because Timescale lives in a
-- different DB.
CREATE TABLE IF NOT EXISTS equity_curve (
    run_id   TEXT        NOT NULL,
    ts       TIMESTAMPTZ NOT NULL,
    equity   DOUBLE PRECISION NOT NULL,
    drawdown DOUBLE PRECISION NOT NULL,
    position DOUBLE PRECISION NOT NULL,
    PRIMARY KEY (run_id, ts)
);

SELECT create_hypertable(
    'equity_curve',
    'ts',
    chunk_time_interval => INTERVAL '7 days',
    if_not_exists       => TRUE
);

-- ---------------------------------------------------------------------------
-- opt_trials (Phase 6: Optuna)
-- ---------------------------------------------------------------------------
-- Plain table (not a hypertable) — trial volume is small per study.
CREATE TABLE IF NOT EXISTS opt_trials (
    study_id     TEXT        NOT NULL,
    trial_number INTEGER     NOT NULL,
    params       JSONB       NOT NULL,
    value        DOUBLE PRECISION,
    state        TEXT        NOT NULL,
    started_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    finished_at  TIMESTAMPTZ,
    PRIMARY KEY (study_id, trial_number)
);

CREATE INDEX IF NOT EXISTS opt_trials_value_idx
    ON opt_trials (study_id, value DESC NULLS LAST);

-- ---------------------------------------------------------------------------
-- Continuous aggregates: ohlcv_5m and ohlcv_1h
-- ---------------------------------------------------------------------------
-- These materialize 5m / 1h bars from the raw 1m bars. Querying them is
-- still a regular SELECT; Timescale handles incremental refresh.
CREATE MATERIALIZED VIEW IF NOT EXISTS ohlcv_5m
WITH (timescaledb.continuous) AS
SELECT
    exchange,
    symbol,
    time_bucket(INTERVAL '5 minutes', ts) AS bucket,
    first(open, ts)  AS open,
    max(high)        AS high,
    min(low)         AS low,
    last(close, ts)  AS close,
    sum(volume)      AS volume
FROM ohlcv
WHERE timeframe = '1m'
GROUP BY exchange, symbol, bucket
WITH NO DATA;

CREATE MATERIALIZED VIEW IF NOT EXISTS ohlcv_1h
WITH (timescaledb.continuous) AS
SELECT
    exchange,
    symbol,
    time_bucket(INTERVAL '1 hour', ts) AS bucket,
    first(open, ts)  AS open,
    max(high)        AS high,
    min(low)         AS low,
    last(close, ts)  AS close,
    sum(volume)      AS volume
FROM ohlcv
WHERE timeframe = '1m'
GROUP BY exchange, symbol, bucket
WITH NO DATA;

-- Refresh policies: keep last 30 days of 5m fresh; last 1 year of 1h fresh.
-- Adjust as backfill volume grows.
SELECT add_continuous_aggregate_policy('ohlcv_5m',
    start_offset => INTERVAL '30 days',
    end_offset   => INTERVAL '1 minute',
    schedule_interval => INTERVAL '5 minutes',
    if_not_exists => TRUE);

SELECT add_continuous_aggregate_policy('ohlcv_1h',
    start_offset => INTERVAL '365 days',
    end_offset   => INTERVAL '1 hour',
    schedule_interval => INTERVAL '1 hour',
    if_not_exists => TRUE);

-- Hand ownership of every Phase-2 object to the app role so asyncpg/pgx
-- connections (which authenticate as `app`) can read & write.
ALTER TABLE ohlcv         OWNER TO app;
ALTER TABLE ticks         OWNER TO app;
ALTER TABLE equity_curve  OWNER TO app;
ALTER TABLE opt_trials    OWNER TO app;
ALTER MATERIALIZED VIEW ohlcv_5m OWNER TO app;
ALTER MATERIALIZED VIEW ohlcv_1h OWNER TO app;

RESET ROLE;
