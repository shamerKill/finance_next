"""Shared pytest fixtures.

Tests must work fully offline. Conftest sets up:
    - PYTHONPATH so the committed proto stubs are importable.
    - A monkeypatched ``ccxt.async_support`` exposing fake exchange classes.
    - A fakeredis async client.

We deliberately do NOT touch a real TimescaleDB; the timescale tests skip
when the env var ``QUANT_TEST_TIMESCALE_DSN`` is unset.
"""

from __future__ import annotations

import asyncio
import os
import sys
from collections.abc import Iterator
from datetime import UTC, datetime, timedelta
from pathlib import Path
from typing import Any

import pytest

# ---- proto stubs on PYTHONPATH --------------------------------------------
_REPO_ROOT = Path(__file__).resolve().parents[2]
_PROTO_GEN = _REPO_ROOT / "shared-proto" / "gen" / "python"
if _PROTO_GEN.exists():
    sys.path.insert(0, str(_PROTO_GEN))


# ---- common timestamps -----------------------------------------------------
@pytest.fixture
def fixed_start() -> datetime:
    return datetime(2024, 1, 1, tzinfo=UTC)


@pytest.fixture
def fixed_end(fixed_start: datetime) -> datetime:
    return fixed_start + timedelta(hours=2)


# ---- ccxt fake exchange ----------------------------------------------------
class _FakeBinanceUSDM:
    """Minimal stand-in for ccxt.async_support.binanceusdm.

    ``fetch_ohlcv`` returns deterministic synthetic candles so tests can
    assert on shape and pagination.
    """

    def __init__(self, _opts: dict | None = None) -> None:
        self.calls: list[tuple[str, str, int | None, int | None]] = []

    async def fetch_ohlcv(
        self,
        symbol: str,
        timeframe: str = "1m",
        since: int | None = None,
        limit: int | None = None,
    ) -> list[list[Any]]:
        self.calls.append((symbol, timeframe, since, limit))
        # Generate `limit` 1-minute candles starting from `since` (ms).
        start_ms = since or 0
        step = 60_000  # 1m
        n = limit or 1000
        return [
            [start_ms + i * step, 100.0 + i, 101.0 + i, 99.0 + i, 100.5 + i, 1.0]
            for i in range(n)
        ]

    async def close(self) -> None:
        return


class _FakeCcxtAsync:
    binanceusdm = _FakeBinanceUSDM


@pytest.fixture
def fake_ccxt() -> _FakeCcxtAsync:
    return _FakeCcxtAsync()


# ---- fakeredis -------------------------------------------------------------
@pytest.fixture
async def fake_redis() -> Any:
    import fakeredis.aioredis

    client = fakeredis.aioredis.FakeRedis(decode_responses=True)
    try:
        yield client
    finally:
        await client.aclose()


# ---- timescale skip helper -------------------------------------------------
@pytest.fixture
def timescale_dsn() -> str:
    dsn = os.getenv("QUANT_TEST_TIMESCALE_DSN")
    if not dsn:
        pytest.skip("QUANT_TEST_TIMESCALE_DSN not set; skipping live Timescale test")
    return dsn


# Force a fresh asyncio event loop per session so pytest-asyncio's default
# session-scoped loop doesn't fight with grpc.aio's loop pinning.
@pytest.fixture(scope="session")
def event_loop() -> Iterator[asyncio.AbstractEventLoop]:
    loop = asyncio.new_event_loop()
    yield loop
    loop.close()
