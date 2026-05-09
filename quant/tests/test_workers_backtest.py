"""Backtest worker integration: mocked Timescale + Mongo + Redis.

We avoid pulling motor/mongomock by hand-rolling a tiny in-memory Mongo
that exposes ``insert_one`` / ``update_one`` / ``find_one`` with the
subset of behaviour ``run_backtest_task`` needs.
"""

from __future__ import annotations

from datetime import UTC, datetime, timedelta
from typing import Any

import numpy as np
import pandas as pd
import pytest

from quant.events import redis_stream
from quant.workers import backtest as bt

# --- Tiny fake Mongo collection ------------------------------------------


class _FakeCollection:
    def __init__(self) -> None:
        self.docs: dict[str, dict[str, Any]] = {}

    async def insert_one(self, doc: dict[str, Any]) -> None:
        self.docs[doc["_id"]] = dict(doc)

    async def update_one(self, filt: dict[str, Any], update: dict[str, Any]) -> None:
        _id = filt["_id"]
        if _id not in self.docs:
            return
        if "$set" in update:
            self.docs[_id].update(update["$set"])

    async def find_one(self, filt: dict[str, Any]) -> dict[str, Any] | None:
        _id = filt.get("_id")
        return self.docs.get(_id)


class _FakeDB:
    def __init__(self) -> None:
        self.collections: dict[str, _FakeCollection] = {}

    def __getitem__(self, name: str) -> _FakeCollection:
        if name not in self.collections:
            self.collections[name] = _FakeCollection()
        return self.collections[name]


# --- Fixtures ------------------------------------------------------------


@pytest.fixture
def fake_db() -> _FakeDB:
    return _FakeDB()


@pytest.fixture
def synthetic_ohlcv() -> pd.DataFrame:
    n = 80
    closes = np.linspace(100.0, 110.0, n)
    ts = pd.DatetimeIndex(
        [datetime(2024, 1, 1, tzinfo=UTC) + timedelta(hours=i) for i in range(n)],
        name="ts",
    )
    return pd.DataFrame(
        {"open": closes, "high": closes, "low": closes, "close": closes, "volume": 1.0},
        index=ts,
    )


# --- Tests ---------------------------------------------------------------


async def test_run_backtest_task_persists_head_and_emits_events(
    fake_db: _FakeDB, fake_redis, synthetic_ohlcv: pd.DataFrame
) -> None:
    written_rows: list[tuple] = []

    async def loader(**kwargs: Any) -> pd.DataFrame:
        return synthetic_ohlcv

    async def writer(run_id: str, rows: list) -> int:
        written_rows.extend(rows)
        return len(rows)

    run_id = bt.new_run_id()
    request = {
        "strategy_id": "strat-1",
        "kind": "grid_dca",
        "params": {
            "createPositions": [{"marginRate": 1.0, "lossAddRate": 0.0}],
            "stopProfitRate": 0.05,
            "stopLossRate": 0.5,
        },
        "exchange": "binance",
        "symbol": "BTCUSDT",
        "timeframe": "1h",
        "start": datetime(2024, 1, 1, tzinfo=UTC),
        "end": datetime(2024, 1, 5, tzinfo=UTC),
        "initial_capital": 10_000.0,
        "commission_rate": 0.0,
        "slippage_bps": 0.0,
    }

    await bt.create_pending_doc(fake_db, run_id=run_id, request=request)
    out = await bt.run_backtest_task(
        ctx={},
        run_id=run_id,
        request=request,
        ohlcv_loader=loader,
        equity_writer=writer,
        mongo_db=fake_db,
        redis_client=fake_redis,
    )

    # Mongo head doc reached COMPLETED.
    head = await fake_db["backtest_results"].find_one({"_id": run_id})
    assert head is not None
    assert head["state"] == bt.STATE_COMPLETED
    assert head["progress"] == pytest.approx(1.0)
    assert "total_return" in head["metrics"]

    # Equity curve was written to the (fake) Timescale writer.
    assert len(written_rows) == len(synthetic_ohlcv)

    # Completed event landed on redis stream.
    completed_len = await fake_redis.xlen(redis_stream.BACKTEST_COMPLETED_STREAM)
    assert completed_len == 1
    assert out["state"] == bt.STATE_COMPLETED


async def test_run_backtest_task_failure_marks_failed_state(
    fake_db: _FakeDB, fake_redis
) -> None:
    async def loader(**kwargs: Any) -> pd.DataFrame:
        # Simulate "no data" — worker should mark FAILED, not crash.
        return pd.DataFrame(columns=["open", "high", "low", "close", "volume"])

    async def writer(run_id: str, rows: list) -> int:
        return 0

    run_id = bt.new_run_id()
    request = {
        "strategy_id": "strat-x",
        "kind": "grid_dca",
        "params": {},
        "exchange": "binance",
        "symbol": "BTCUSDT",
        "timeframe": "1h",
        "start": datetime(2024, 1, 1, tzinfo=UTC),
        "end": datetime(2024, 1, 2, tzinfo=UTC),
        "initial_capital": 10_000.0,
        "commission_rate": 0.0,
        "slippage_bps": 0.0,
    }
    await bt.create_pending_doc(fake_db, run_id=run_id, request=request)
    out = await bt.run_backtest_task(
        ctx={},
        run_id=run_id,
        request=request,
        ohlcv_loader=loader,
        equity_writer=writer,
        mongo_db=fake_db,
        redis_client=fake_redis,
    )
    head = await fake_db["backtest_results"].find_one({"_id": run_id})
    assert head["state"] == bt.STATE_FAILED
    assert "no OHLCV data" in head["error"]
    assert out["state"] == bt.STATE_FAILED


async def test_unknown_kind_marks_failed(fake_db: _FakeDB, fake_redis) -> None:
    async def loader(**kwargs: Any) -> pd.DataFrame:
        # Loader is unreachable because get_strategy raises first.
        raise AssertionError("should not be called")

    async def writer(run_id: str, rows: list) -> int:
        return 0

    run_id = bt.new_run_id()
    request = {
        "strategy_id": "strat-z",
        "kind": "some_unknown_strategy",
        "params": {},
        "exchange": "binance",
        "symbol": "BTCUSDT",
        "timeframe": "1h",
        "start": datetime(2024, 1, 1, tzinfo=UTC),
        "end": datetime(2024, 1, 2, tzinfo=UTC),
        "initial_capital": 1_000.0,
    }
    await bt.create_pending_doc(fake_db, run_id=run_id, request=request)
    out = await bt.run_backtest_task(
        ctx={}, run_id=run_id, request=request,
        ohlcv_loader=loader, equity_writer=writer,
        mongo_db=fake_db, redis_client=fake_redis,
    )
    assert out["state"] == bt.STATE_FAILED
    head = await fake_db["backtest_results"].find_one({"_id": run_id})
    assert "unknown strategy" in head["error"]
