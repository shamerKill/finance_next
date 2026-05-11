-- 004_prediction.sql — Phase 9 schema for Polymarket prediction-market data.
--
-- Independent vertical from spot/perp OHLCV. Three new tables:
--   * prediction_markets — metadata catalogue (NOT a hypertable; PK is text)
--   * prediction_quotes  — orderbook mid/last/bid/ask snapshots (hypertable)
--   * prediction_trades  — executed trades, dedupe by tx_hash (hypertable)
--
-- Idempotent: CREATE TABLE IF NOT EXISTS, indexes IF NOT EXISTS,
-- hypertables with if_not_exists => TRUE.

SET ROLE postgres;

-- ---------------------------------------------------------------------------
-- prediction_markets (Phase 9)
-- ---------------------------------------------------------------------------
-- The Polymarket "condition" is the market; each binary market has
-- two outcome `token_id`s (YES/NO). We key on a stable `market_id`
-- (Polymarket's slug or condition_id) so the quotes/trades tables
-- can foreign-reference cheaply via the same identifier.
CREATE TABLE IF NOT EXISTS prediction_markets (
    source       TEXT              NOT NULL,
    market_id    TEXT              PRIMARY KEY,
    condition_id TEXT,
    question     TEXT              NOT NULL,
    end_date     TIMESTAMPTZ,
    category     TEXT,
    tags         TEXT[],
    created_at   TIMESTAMPTZ       NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS prediction_markets_category_idx
    ON prediction_markets (category);

CREATE INDEX IF NOT EXISTS prediction_markets_tags_gin
    ON prediction_markets USING GIN (tags);

CREATE INDEX IF NOT EXISTS prediction_markets_end_date_idx
    ON prediction_markets (end_date);


-- ---------------------------------------------------------------------------
-- prediction_quotes (Phase 9)
-- ---------------------------------------------------------------------------
-- Time-series of orderbook snapshots per outcome token. We key on
-- (source, token_id, ts) so two outcomes for the same market are
-- distinguished. mid/last/bid/ask are nullable since intermediate
-- snapshots may only have a subset.
CREATE TABLE IF NOT EXISTS prediction_quotes (
    source     TEXT              NOT NULL,
    market_id  TEXT              NOT NULL,
    token_id   TEXT              NOT NULL,
    ts         TIMESTAMPTZ       NOT NULL,
    mid        DOUBLE PRECISION,
    last       DOUBLE PRECISION,
    bid        DOUBLE PRECISION,
    ask        DOUBLE PRECISION,
    volume_24h DOUBLE PRECISION,
    PRIMARY KEY (source, token_id, ts)
);

SELECT create_hypertable(
    'prediction_quotes',
    'ts',
    chunk_time_interval => INTERVAL '7 days',
    if_not_exists       => TRUE
);

CREATE INDEX IF NOT EXISTS prediction_quotes_market_ts_idx
    ON prediction_quotes (market_id, ts DESC);


-- ---------------------------------------------------------------------------
-- prediction_trades (Phase 9)
-- ---------------------------------------------------------------------------
-- Executed trades. tx_hash is on-chain settlement identifier — globally
-- unique, so we use it as PK to dedupe re-ingests. ts is the hypertable
-- partition key.
CREATE TABLE IF NOT EXISTS prediction_trades (
    source     TEXT              NOT NULL,
    market_id  TEXT              NOT NULL,
    token_id   TEXT              NOT NULL,
    ts         TIMESTAMPTZ       NOT NULL,
    side       TEXT              NOT NULL,
    price      DOUBLE PRECISION  NOT NULL,
    size       DOUBLE PRECISION  NOT NULL,
    tx_hash    TEXT              NOT NULL,
    created_at TIMESTAMPTZ       NOT NULL DEFAULT now(),
    PRIMARY KEY (tx_hash, ts)
);

SELECT create_hypertable(
    'prediction_trades',
    'ts',
    chunk_time_interval => INTERVAL '7 days',
    if_not_exists       => TRUE
);

CREATE INDEX IF NOT EXISTS prediction_trades_market_ts_idx
    ON prediction_trades (market_id, ts DESC);

CREATE INDEX IF NOT EXISTS prediction_trades_token_ts_idx
    ON prediction_trades (token_id, ts DESC);
