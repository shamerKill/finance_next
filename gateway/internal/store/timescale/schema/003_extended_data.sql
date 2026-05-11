-- 003_extended_data.sql — Phase 8 schema for macro / on-chain / news.
--
-- Touches new tables only — existing 001/002 init scripts are unchanged.
-- Apply on top of the Phase 2 schema; idempotent (CREATE TABLE IF NOT
-- EXISTS, hypertable creation gated on if_not_exists, GIN indexes ditto).

SET ROLE postgres;

-- ---------------------------------------------------------------------------
-- macro_indicators (Phase 8)
-- ---------------------------------------------------------------------------
-- Composite PK keeps re-ingests idempotent (same source/code/ts can be
-- re-fetched without conflicts via ON CONFLICT DO NOTHING). Hypertable
-- on `ts` with 30-day chunks — macro series are sparse (one row per
-- month for most series), so smaller chunks waste metadata.
CREATE TABLE IF NOT EXISTS macro_indicators (
    source TEXT             NOT NULL,
    code   TEXT             NOT NULL,
    ts     TIMESTAMPTZ      NOT NULL,
    value  DOUBLE PRECISION NOT NULL,
    unit   TEXT             NOT NULL DEFAULT '',
    PRIMARY KEY (source, code, ts)
);

SELECT create_hypertable(
    'macro_indicators',
    'ts',
    chunk_time_interval => INTERVAL '30 days',
    if_not_exists       => TRUE
);

CREATE INDEX IF NOT EXISTS macro_indicators_code_ts_idx
    ON macro_indicators (code, ts DESC);


-- ---------------------------------------------------------------------------
-- onchain_metrics (Phase 8)
-- ---------------------------------------------------------------------------
-- Smaller chunks — on-chain metrics are hourly and we expect higher
-- write velocity than macro. Composite PK lets us upsert idempotently.
CREATE TABLE IF NOT EXISTS onchain_metrics (
    source TEXT             NOT NULL,
    chain  TEXT             NOT NULL,
    metric TEXT             NOT NULL,
    ts     TIMESTAMPTZ      NOT NULL,
    value  DOUBLE PRECISION NOT NULL,
    PRIMARY KEY (source, chain, metric, ts)
);

SELECT create_hypertable(
    'onchain_metrics',
    'ts',
    chunk_time_interval => INTERVAL '7 days',
    if_not_exists       => TRUE
);

CREATE INDEX IF NOT EXISTS onchain_metrics_chain_metric_ts_idx
    ON onchain_metrics (chain, metric, ts DESC);


-- ---------------------------------------------------------------------------
-- news_events (Phase 8)
-- ---------------------------------------------------------------------------
-- NOT a hypertable — primary key is the article id (text). News volume
-- is modest (few thousand/day at most) and the dominant query is
-- "recent items by symbol", which a btree on ts plus a GIN on symbols
-- covers cleanly.
CREATE TABLE IF NOT EXISTS news_events (
    id        TEXT             PRIMARY KEY,
    source    TEXT             NOT NULL,
    ts        TIMESTAMPTZ      NOT NULL,
    title     TEXT             NOT NULL DEFAULT '',
    url       TEXT             NOT NULL DEFAULT '',
    body      TEXT             NOT NULL DEFAULT '',
    sentiment DOUBLE PRECISION NOT NULL DEFAULT 0.0,
    symbols   TEXT[]           NOT NULL DEFAULT ARRAY[]::TEXT[]
);

CREATE INDEX IF NOT EXISTS news_events_ts_desc_idx
    ON news_events (ts DESC);

CREATE INDEX IF NOT EXISTS news_events_symbols_gin_idx
    ON news_events USING GIN (symbols);

-- Full-text on title + body for recency-aware keyword queries. We use
-- `simple` instead of `english` so non-English headlines (CLS feed in
-- Mandarin) still match on substring tokens.
CREATE INDEX IF NOT EXISTS news_events_fts_idx
    ON news_events USING GIN (
        to_tsvector('simple', coalesce(title, '') || ' ' || coalesce(body, ''))
    );


-- Hand ownership to the app role.
ALTER TABLE macro_indicators OWNER TO app;
ALTER TABLE onchain_metrics  OWNER TO app;
ALTER TABLE news_events      OWNER TO app;

RESET ROLE;
