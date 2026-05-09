"""Redis Stream producers.

Phase 2 emits ``event.ohlcv.ingested`` after each completed ingest.
Phase 3 adds two backtest-related streams:

* ``event.backtest.progress`` — per-update progress payload during a run.
* ``event.backtest.completed`` — terminal-state payload (state + metrics).

We serialize protobuf-shaped payloads as JSON so consumers can read via
``XRANGE`` without needing the proto runtime — handy for ops debugging.
Phase 7 may switch to binary protobuf + a typed consumer.
"""

from __future__ import annotations

import json
from datetime import datetime
from typing import Any

import redis.asyncio as aioredis

OHLCV_INGESTED_STREAM = "event.ohlcv.ingested"
BACKTEST_PROGRESS_STREAM = "event.backtest.progress"
BACKTEST_COMPLETED_STREAM = "event.backtest.completed"


async def publish_ohlcv_ingested(
    client: aioredis.Redis,
    *,
    exchange: str,
    symbol: str,
    timeframe: str,
    from_ts: datetime,
    to_ts: datetime,
    bars_ingested: int,
    run_id: str,
) -> str:
    """XADD a new entry; returns the assigned stream id."""
    payload: dict[str, Any] = {
        "exchange": exchange,
        "symbol": symbol,
        "timeframe": timeframe,
        "from_ts": from_ts.isoformat(),
        "to_ts": to_ts.isoformat(),
        "bars_ingested": bars_ingested,
        "run_id": run_id,
    }
    return await client.xadd(
        OHLCV_INGESTED_STREAM,
        {"data": json.dumps(payload)},
    )


async def publish_backtest_progress(
    client: aioredis.Redis,
    *,
    run_id: str,
    progress: float,
    recent_equity: list[float],
    state: int,
) -> str:
    """Emit a progress update for an in-flight backtest run.

    ``state`` mirrors :class:`quantpb.v1.BacktestState` (1=PENDING, 2=RUNNING,
    3=COMPLETED, 4=FAILED).
    """
    payload: dict[str, Any] = {
        "run_id": run_id,
        "progress": progress,
        "recent_equity": recent_equity,
        "state": state,
    }
    return await client.xadd(
        BACKTEST_PROGRESS_STREAM,
        {"data": json.dumps(payload)},
    )


async def publish_backtest_completed(
    client: aioredis.Redis,
    *,
    run_id: str,
    strategy_id: str,
    metrics: dict[str, float],
    state: int,
    error_message: str = "",
    finished_at: datetime | None = None,
) -> str:
    """Emit a terminal-state event for a backtest run."""
    payload: dict[str, Any] = {
        "run_id": run_id,
        "strategy_id": strategy_id,
        "metrics": metrics,
        "state": state,
        "error_message": error_message,
        "finished_at": (finished_at or datetime.utcnow()).isoformat(),
    }
    return await client.xadd(
        BACKTEST_COMPLETED_STREAM,
        {"data": json.dumps(payload)},
    )
