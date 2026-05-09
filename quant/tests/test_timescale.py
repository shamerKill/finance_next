"""TimescaleDB integration tests.

These tests are gated on ``QUANT_TEST_TIMESCALE_DSN`` — the conftest
``timescale_dsn`` fixture pytest-skips when unset. CI runs without
TimescaleDB, so the tests simply skip rather than failing.
"""

from __future__ import annotations

from datetime import UTC, datetime, timedelta

import pytest

from quant.data import timescale
from quant.data.ccxt_source import OhlcvBar


async def test_pool_init_idempotent(timescale_dsn: str) -> None:
    p1 = await timescale.init_pool(timescale_dsn)
    p2 = await timescale.init_pool(timescale_dsn)
    assert p1 is p2
    await timescale.close_pool()


async def test_upsert_then_query_roundtrip(timescale_dsn: str) -> None:
    await timescale.init_pool(timescale_dsn)

    base = datetime(2024, 6, 1, tzinfo=UTC)
    bars = [
        OhlcvBar(
            exchange="testex",
            symbol="TESTUSDT",
            timeframe="1m",
            ts=base + timedelta(minutes=i),
            open=1.0 + i,
            high=1.5 + i,
            low=0.5 + i,
            close=1.2 + i,
            volume=10.0,
        )
        for i in range(5)
    ]

    written = await timescale.upsert_ohlcv(bars)
    assert written == 5

    rows = await timescale.query_range(
        "testex",
        "TESTUSDT",
        "1m",
        base,
        base + timedelta(minutes=10),
    )
    assert len(rows) == 5

    # ON CONFLICT DO NOTHING: re-inserting the same bars must not error.
    again = await timescale.upsert_ohlcv(bars)
    assert again == 5

    await timescale.close_pool()


async def test_query_empty_range(timescale_dsn: str) -> None:
    await timescale.init_pool(timescale_dsn)
    far_future = datetime(2099, 1, 1, tzinfo=UTC)
    rows = await timescale.query_range(
        "testex",
        "TESTUSDT",
        "1m",
        far_future,
        far_future + timedelta(days=1),
    )
    assert rows == []
    await timescale.close_pool()


@pytest.mark.skipif(
    True,
    reason="placeholder for Phase 3+: continuous aggregate refresh test",
)
async def test_continuous_aggregate_view_present() -> None:
    pass
