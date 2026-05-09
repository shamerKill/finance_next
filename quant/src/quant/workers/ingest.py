"""Arq tasks for OHLCV ingest.

The gRPC ``IngestNow`` RPC also calls :func:`run_ingest` directly so the
caller can block on completion. Background scheduling (cron-style backfill)
goes through Arq via :func:`enqueue_ingest`.
"""

from __future__ import annotations

import logging
import uuid
from datetime import datetime
from typing import Any

from quant.data import timescale
from quant.data.akshare_source import AkshareSource
from quant.data.ccxt_source import CcxtSource, OhlcvBar
from quant.events.redis_stream import publish_ohlcv_ingested

log = logging.getLogger(__name__)


async def run_ingest(
    *,
    exchange: str,
    symbol: str,
    timeframe: str,
    start: datetime,
    end: datetime,
    redis_client: Any | None = None,
    ccxt_module: Any | None = None,
    akshare_module: Any | None = None,
) -> dict[str, Any]:
    """End-to-end: fetch -> upsert -> publish event. Returns ack-shape dict.

    The ``ccxt_module`` / ``akshare_module`` injection seams exist for tests
    so they can pass mocked modules. Production passes ``None`` to use the
    real libs.
    """
    run_id = uuid.uuid4().hex

    bars: list[OhlcvBar]
    if exchange.lower() == "ashare":
        ak = AkshareSource(akshare_module=akshare_module)
        bars = await ak.fetch_index_daily(symbol)
        # Filter to requested range; AKShare returns the full history.
        bars = [b for b in bars if start <= b.ts < end]
    else:
        src = CcxtSource(exchange, ccxt_module=ccxt_module)
        try:
            bars = await src.fetch_ohlcv_range(symbol, timeframe, start, end)
        finally:
            await src.close()

    bars_written = await timescale.upsert_ohlcv(bars)

    from_ts = bars[0].ts if bars else start
    to_ts = bars[-1].ts if bars else start

    if redis_client is not None and bars_written > 0:
        try:
            await publish_ohlcv_ingested(
                redis_client,
                exchange=exchange,
                symbol=symbol,
                timeframe=timeframe,
                from_ts=from_ts,
                to_ts=to_ts,
                bars_ingested=bars_written,
                run_id=run_id,
            )
        except Exception as exc:  # noqa: BLE001 — never fail ingest on event publish
            log.warning("event.ohlcv.ingested publish failed: %s", exc)

    return {
        "run_id": run_id,
        "bars_ingested": bars_written,
        "from_ts": from_ts,
        "to_ts": to_ts,
    }


# Arq job entrypoint — kept thin so unit tests can call run_ingest directly.
async def ingest_task(
    ctx: dict[str, Any],
    *,
    exchange: str,
    symbol: str,
    timeframe: str,
    start: datetime,
    end: datetime,
) -> dict[str, Any]:
    """Arq-task adapter; ctx provides the Redis client + connection pool."""
    return await run_ingest(
        exchange=exchange,
        symbol=symbol,
        timeframe=timeframe,
        start=start,
        end=end,
        redis_client=ctx.get("redis"),
    )
