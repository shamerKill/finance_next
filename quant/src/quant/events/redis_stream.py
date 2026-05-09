"""Redis Stream producers.

Phase 2 only emits ``event.ohlcv.ingested`` after each completed ingest.
We serialize the protobuf message as JSON so consumers can read it via
``XRANGE`` without needing the proto runtime — handy for ops debugging.
Phase 7 may switch to binary protobuf + a typed consumer to save bytes.
"""

from __future__ import annotations

import json
from datetime import datetime
from typing import Any

import redis.asyncio as aioredis

OHLCV_INGESTED_STREAM = "event.ohlcv.ingested"


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
    # Redis Stream values must be flat strings; JSON-encode the whole payload
    # under a single field rather than spreading it.
    return await client.xadd(
        OHLCV_INGESTED_STREAM,
        {"data": json.dumps(payload)},
    )
