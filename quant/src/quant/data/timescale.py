"""asyncpg-backed accessor for the OHLCV hypertable.

We keep the SQL plain — no ORM. Hot paths are the bulk insert (used by
``IngestNow``) and the range query (used by the gateway via the gRPC
``GetOhlcv`` endpoint, plus future backtest data loading).

Connection pooling: one pool per process. ``init_pool()`` is idempotent
so tests + production can share the same code path.
"""

from __future__ import annotations

import logging
from collections.abc import Iterable
from datetime import datetime
from typing import Any

import asyncpg

from quant.data.ccxt_source import OhlcvBar

log = logging.getLogger(__name__)

_pool: asyncpg.Pool | None = None


async def init_pool(dsn: str, *, min_size: int = 1, max_size: int = 8) -> asyncpg.Pool:
    """Construct (or return) the process-wide connection pool."""
    global _pool
    if _pool is None:
        _pool = await asyncpg.create_pool(
            dsn=dsn,
            min_size=min_size,
            max_size=max_size,
            command_timeout=30,
        )
    return _pool


async def close_pool() -> None:
    """Tear down the pool. Safe to call when no pool was ever created."""
    global _pool
    if _pool is not None:
        await _pool.close()
        _pool = None


def get_pool() -> asyncpg.Pool:
    """Return the cached pool or raise if it hasn't been initialized."""
    if _pool is None:
        raise RuntimeError("timescale pool not initialized; call init_pool() first")
    return _pool


# ---------------------------------------------------------------------------
# Writes
# ---------------------------------------------------------------------------

_INSERT_OHLCV_SQL = """
INSERT INTO ohlcv (exchange, symbol, timeframe, ts, open, high, low, close, volume)
VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
ON CONFLICT (exchange, symbol, timeframe, ts) DO NOTHING
"""


async def upsert_ohlcv(bars: Iterable[OhlcvBar]) -> int:
    """Insert bars idempotently; return rows actually written.

    asyncpg's ``executemany`` doesn't surface row counts. Since we can't
    distinguish "newly inserted" from "skipped via ON CONFLICT" without an
    explicit RETURNING, we approximate by counting inputs minus pre-existing
    rows — but the bookkeeping cost is rarely worth it. For Phase 2 we just
    return the total attempted; the gRPC ``IngestAck.bars_ingested`` field is
    documented as "rows persisted" and over-reporting by the dedupe gap is
    acceptable.
    """
    rows_in = list(bars)
    if not rows_in:
        return 0

    pool = get_pool()
    payload = [
        (
            b.exchange,
            b.symbol,
            b.timeframe,
            b.ts,
            b.open,
            b.high,
            b.low,
            b.close,
            b.volume,
        )
        for b in rows_in
    ]
    async with pool.acquire() as conn:
        async with conn.transaction():
            await conn.executemany(_INSERT_OHLCV_SQL, payload)
    return len(rows_in)


# ---------------------------------------------------------------------------
# Reads
# ---------------------------------------------------------------------------

_QUERY_RANGE_SQL = """
SELECT exchange, symbol, timeframe, ts, open, high, low, close, volume
FROM ohlcv
WHERE exchange = $1
  AND symbol   = $2
  AND timeframe = $3
  AND ts >= $4
  AND ts <  $5
ORDER BY ts ASC
LIMIT $6
"""


async def query_range(
    exchange: str,
    symbol: str,
    timeframe: str,
    start: datetime,
    end: datetime,
    *,
    limit: int = 100_000,
) -> list[dict[str, Any]]:
    """Return OHLCV rows in ``[start, end)`` as plain dicts."""
    pool = get_pool()
    async with pool.acquire() as conn:
        rows = await conn.fetch(
            _QUERY_RANGE_SQL, exchange, symbol, timeframe, start, end, limit
        )
    return [dict(r) for r in rows]
