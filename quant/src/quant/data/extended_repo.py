"""asyncpg-backed writers / readers for Phase 8 extended-data tables.

Three tables:

* ``macro_indicators(source, code, ts, value, unit)``
* ``onchain_metrics(source, chain, metric, ts, value)``
* ``news_events(id, source, ts, title, url, body, sentiment, symbols)``

We share the existing :mod:`quant.data.timescale` connection pool —
calling :func:`init_pool` once per process is enough to enable both the
OHLCV hot path and the new tables.

All writes use ``ON CONFLICT DO NOTHING`` so re-ingest is idempotent.
"""

from __future__ import annotations

from collections.abc import Iterable
from datetime import datetime
from typing import Any

from quant.data.macro.fred import MacroPoint
from quant.data.news.cryptopanic import NewsItem
from quant.data.onchain.blockchain_info import OnchainPoint
from quant.data.timescale import get_pool

# ---------------------------------------------------------------------------
# macro_indicators
# ---------------------------------------------------------------------------

_INSERT_MACRO_SQL = """
INSERT INTO macro_indicators (source, code, ts, value, unit)
VALUES ($1, $2, $3, $4, $5)
ON CONFLICT (source, code, ts) DO NOTHING
"""


async def upsert_macro(points: Iterable[MacroPoint]) -> int:
    """Insert macro observations idempotently. Returns input count."""
    rows = [(p.source, p.code, p.ts, p.value, p.unit or "") for p in points]
    if not rows:
        return 0
    pool = get_pool()
    async with pool.acquire() as conn:
        async with conn.transaction():
            await conn.executemany(_INSERT_MACRO_SQL, rows)
    return len(rows)


_QUERY_MACRO_SQL = """
SELECT source, code, ts, value, unit
FROM macro_indicators
WHERE source = $1
  AND code   = $2
  AND ts >= $3
  AND ts <  $4
ORDER BY ts ASC
LIMIT $5
"""


async def query_macro(
    source: str, code: str, start: datetime, end: datetime, *, limit: int = 50_000
) -> list[dict[str, Any]]:
    pool = get_pool()
    async with pool.acquire() as conn:
        rows = await conn.fetch(_QUERY_MACRO_SQL, source, code, start, end, limit)
    return [dict(r) for r in rows]


async def latest_macro(source: str, code: str) -> dict[str, Any] | None:
    """Return the most recent macro observation; used by AI context."""
    pool = get_pool()
    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            """
            SELECT source, code, ts, value, unit
            FROM macro_indicators
            WHERE source = $1 AND code = $2
            ORDER BY ts DESC LIMIT 1
            """,
            source,
            code,
        )
    return dict(row) if row else None


# ---------------------------------------------------------------------------
# onchain_metrics
# ---------------------------------------------------------------------------

_INSERT_ONCHAIN_SQL = """
INSERT INTO onchain_metrics (source, chain, metric, ts, value)
VALUES ($1, $2, $3, $4, $5)
ON CONFLICT (source, chain, metric, ts) DO NOTHING
"""


async def upsert_onchain(points: Iterable[OnchainPoint]) -> int:
    rows = [(p.source, p.chain, p.metric, p.ts, p.value) for p in points]
    if not rows:
        return 0
    pool = get_pool()
    async with pool.acquire() as conn:
        async with conn.transaction():
            await conn.executemany(_INSERT_ONCHAIN_SQL, rows)
    return len(rows)


_QUERY_ONCHAIN_SQL = """
SELECT source, chain, metric, ts, value
FROM onchain_metrics
WHERE chain  = $1
  AND metric = $2
  AND ts >= $3
  AND ts <  $4
ORDER BY ts ASC
LIMIT $5
"""


async def query_onchain(
    chain: str, metric: str, start: datetime, end: datetime, *, limit: int = 50_000
) -> list[dict[str, Any]]:
    pool = get_pool()
    async with pool.acquire() as conn:
        rows = await conn.fetch(_QUERY_ONCHAIN_SQL, chain, metric, start, end, limit)
    return [dict(r) for r in rows]


async def latest_onchain(chain: str, metric: str) -> dict[str, Any] | None:
    pool = get_pool()
    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            """
            SELECT source, chain, metric, ts, value
            FROM onchain_metrics
            WHERE chain = $1 AND metric = $2
            ORDER BY ts DESC LIMIT 1
            """,
            chain,
            metric,
        )
    return dict(row) if row else None


# ---------------------------------------------------------------------------
# news_events
# ---------------------------------------------------------------------------

_INSERT_NEWS_SQL = """
INSERT INTO news_events (id, source, ts, title, url, body, sentiment, symbols)
VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
ON CONFLICT (id) DO NOTHING
"""


async def upsert_news(items: Iterable[NewsItem]) -> int:
    rows = [
        (
            it.id,
            it.source,
            it.ts,
            it.title or "",
            it.url or "",
            it.body or "",
            float(it.sentiment),
            list(it.symbols or []),
        )
        for it in items
    ]
    if not rows:
        return 0
    pool = get_pool()
    async with pool.acquire() as conn:
        async with conn.transaction():
            await conn.executemany(_INSERT_NEWS_SQL, rows)
    return len(rows)


async def query_news(
    *,
    symbols: list[str] | None = None,
    since: datetime | None = None,
    limit: int = 100,
) -> list[dict[str, Any]]:
    """Return recent news rows ordered by ts desc.

    ``symbols`` (optional) filters via the GIN array overlap operator
    ``&&`` so any matching symbol qualifies. ``since`` (optional)
    constrains the lower time bound.
    """
    parts: list[str] = []
    args: list[Any] = []
    idx = 0

    def _next() -> str:
        nonlocal idx
        idx += 1
        return f"${idx}"

    if symbols:
        parts.append(f"symbols && {_next()}::text[]")
        args.append(list(symbols))
    if since is not None:
        parts.append(f"ts >= {_next()}")
        args.append(since)
    where_sql = (" WHERE " + " AND ".join(parts)) if parts else ""
    sql = (
        "SELECT id, source, ts, title, url, body, sentiment, symbols "
        f"FROM news_events{where_sql} ORDER BY ts DESC LIMIT {_next()}"
    )
    args.append(int(limit))
    pool = get_pool()
    async with pool.acquire() as conn:
        rows = await conn.fetch(sql, *args)
    return [dict(r) for r in rows]


async def recent_news_for_symbol(
    symbol: str, *, since: datetime, limit: int = 5
) -> list[dict[str, Any]]:
    """Convenience wrapper used by the AI optimizer context."""
    return await query_news(symbols=[symbol], since=since, limit=limit)
