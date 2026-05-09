"""Tests for quant.runtime — the Phase 4 strategy runtime."""

from __future__ import annotations

import json
from datetime import UTC, datetime, timedelta
from typing import Any

import numpy as np
import pandas as pd
import pytest

from quant.runtime.runtime import COMMAND_SUBMIT_STREAM, StrategyRuntime

# ---------------------------------------------------------------------------
# Fakes
# ---------------------------------------------------------------------------


class FakeMongoCursor:
    """Minimal async-iterator cursor for the runtime's tests.

    We deliberately implement the ``async for`` protocol but NOT
    ``to_list``, so we exercise the secondary path the runtime falls
    back on when motor's helper isn't present.
    """

    def __init__(self, docs: list[dict[str, Any]]) -> None:
        self._docs = list(docs)
        self._i = 0

    def __aiter__(self) -> FakeMongoCursor:
        return self

    async def __anext__(self) -> dict[str, Any]:
        if self._i >= len(self._docs):
            raise StopAsyncIteration
        d = self._docs[self._i]
        self._i += 1
        return d


class FakeMongoCollection:
    def __init__(self, docs: list[dict[str, Any]]) -> None:
        self._docs = docs

    def find(self, _filter: dict[str, Any]) -> FakeMongoCursor:
        # The runtime filters by `live.enabled=True`; replicate.
        out = [d for d in self._docs if (d.get("live") or {}).get("enabled")]
        return FakeMongoCursor(out)


class FakeMongoDB:
    def __init__(self, options: list[dict[str, Any]]) -> None:
        self._options = FakeMongoCollection(options)

    def __getitem__(self, name: str) -> FakeMongoCollection:
        if name == "options":
            return self._options
        raise KeyError(name)


def _ohlcv_with_fall(n: int = 60, start_ts: datetime | None = None) -> pd.DataFrame:
    """Build a synthetic OHLCV that triggers grid_dca's stop-loss exit on the
    last bar: a steady high price, then a sudden drop on the last bar.

    The first tier opens on bar 0; we then keep price flat at 100 for n-2
    bars and crash to 80 (= -20%) on the last bar so the stop-loss
    threshold (default 10%) fires.
    """
    if start_ts is None:
        start_ts = datetime(2026, 5, 9, 0, 0, tzinfo=UTC)
    idx = pd.DatetimeIndex(
        [start_ts + timedelta(hours=i) for i in range(n)], name="ts"
    )
    opens = np.full(n, 100.0)
    closes = np.full(n, 100.0)
    closes[-1] = 80.0  # 20% drop = exit via stop-loss
    return pd.DataFrame(
        {
            "open": opens,
            "high": closes + 0.5,
            "low": closes - 0.5,
            "close": closes,
            "volume": np.ones(n),
        },
        index=idx,
    )


# ---------------------------------------------------------------------------
# Fetcher fixtures
# ---------------------------------------------------------------------------


def make_fetcher(df: pd.DataFrame):
    async def fetch(exchange: str, symbol: str, timeframe: str, n: int) -> pd.DataFrame:
        return df.iloc[-n:]

    return fetch


# ---------------------------------------------------------------------------
# Tests
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_runtime_first_tick_initialises_no_emit(fake_redis):
    """The first time the runtime sees a strategy, it must NOT emit a
    command — we don't know the previous state, and emitting on a
    historical bar is misleading. The runtime should only emit on
    subsequent bars.
    """
    options = [
        {
            "_id": "strat-1",
            "execSymbol": "BTCUSDT",
            "createPositions": [{"marginRate": 1.0, "lossAddRate": 0.0}],
            "stopProfitRate": 0.03,
            "stopLossRate": 0.10,
            "live": {
                "enabled": True,
                "mode": "testnet",
                "accountId": "acc-1",
                "kind": "grid_dca",
                "exchange": "binance",
                "timeframe": "1h",
            },
            "risk": {
                "maxPositionUsd": 1000.0,
                "maxLeverage": 5.0,
                "dailyLossCapUsd": 500.0,
            },
        }
    ]
    df = _ohlcv_with_fall(n=60)
    rt = StrategyRuntime(
        mongo_db=FakeMongoDB(options),
        redis_client=fake_redis,
        ohlcv_fetcher=make_fetcher(df),
    )
    ticks = await rt.tick_once()
    assert len(ticks) == 1
    assert ticks[0].command is None
    # Stream must not have any entries.
    assert (await fake_redis.xlen(COMMAND_SUBMIT_STREAM)) == 0


@pytest.mark.asyncio
async def test_runtime_emits_command_on_new_bar(fake_redis):
    """Once a prior bar is cached, a fresh bar with a stop-loss exit signal
    must produce an emitted command on the Redis stream.
    """
    options = [
        {
            "_id": "strat-2",
            "execSymbol": "BTCUSDT",
            "createPositions": [{"marginRate": 1.0, "lossAddRate": 0.0}],
            "stopProfitRate": 0.03,
            "stopLossRate": 0.10,
            "live": {
                "enabled": True,
                "mode": "testnet",
                "accountId": "acc-1",
                "kind": "grid_dca",
                "exchange": "binance",
                "timeframe": "1h",
            },
            "risk": {
                "maxPositionUsd": 1000.0,
                "maxLeverage": 5.0,
                "dailyLossCapUsd": 500.0,
            },
        }
    ]
    # First fetch returns a flat-price DataFrame (no exit signal).
    df_flat = _ohlcv_with_fall(n=30)
    df_flat["close"] = 100.0
    df_flat["open"] = 100.0
    df_flat["high"] = 100.5
    df_flat["low"] = 99.5
    # Second fetch is the same DF but with one extra bar at the end that
    # crashes (triggers stop-loss).
    extra_ts = df_flat.index[-1] + timedelta(hours=1)
    crash_row = pd.DataFrame(
        {"open": 100.0, "high": 100.5, "low": 79.0, "close": 80.0, "volume": 1.0},
        index=[extra_ts],
    )
    crash_row.index.name = "ts"
    df_with_exit = pd.concat([df_flat, crash_row])

    state = {"step": 0}

    async def two_step_fetcher(exchange, symbol, timeframe, n):
        if state["step"] == 0:
            state["step"] += 1
            return df_flat.iloc[-n:]
        return df_with_exit.iloc[-n:]

    rt = StrategyRuntime(
        mongo_db=FakeMongoDB(options),
        redis_client=fake_redis,
        ohlcv_fetcher=two_step_fetcher,
    )
    # First tick: caches the bar, no emit.
    await rt.tick_once()
    assert (await fake_redis.xlen(COMMAND_SUBMIT_STREAM)) == 0

    # Second tick: a fresh later bar that exits → must publish.
    ticks = await rt.tick_once()
    assert len(ticks) == 1
    cmd = ticks[0].command
    assert cmd is not None, "expected a command on the new bar"
    assert cmd["strategyId"] == "strat-2"
    assert cmd["symbol"] == "BTCUSDT"
    assert cmd["side"] == "SELL"
    assert cmd["type"] == "MARKET"
    assert cmd["accountId"] == "acc-1"
    # Idempotency key shape per spec.
    assert cmd["idempotencyKey"].startswith("strat-2:exit:BTCUSDT:")

    # Verify the emitted Redis Stream entry payload matches the command.
    entries = await fake_redis.xrange(COMMAND_SUBMIT_STREAM, "-", "+")
    assert len(entries) == 1
    _id, fields = entries[0]
    parsed = json.loads(fields["data"])
    assert parsed["strategyId"] == "strat-2"
    assert parsed["idempotencyKey"] == cmd["idempotencyKey"]


@pytest.mark.asyncio
async def test_runtime_skips_inactive_strategies(fake_redis):
    """Strategies with live.enabled=False (or missing live) must be ignored."""
    options = [
        {"_id": "x", "execSymbol": "BTCUSDT", "live": {"enabled": False}},
        {"_id": "y", "execSymbol": "ETHUSDT"},  # no live block at all
    ]
    df = _ohlcv_with_fall(n=30)
    rt = StrategyRuntime(
        mongo_db=FakeMongoDB(options),
        redis_client=fake_redis,
        ohlcv_fetcher=make_fetcher(df),
    )
    ticks = await rt.tick_once()
    assert ticks == []
    assert (await fake_redis.xlen(COMMAND_SUBMIT_STREAM)) == 0


@pytest.mark.asyncio
async def test_runtime_disabled_via_env(monkeypatch, fake_redis):
    """`run_runtime` returns None when QUANT_RUNTIME_DISABLED is set."""
    monkeypatch.setenv("QUANT_RUNTIME_DISABLED", "true")
    from quant.runtime.runtime import run_runtime  # late import

    rt = await run_runtime(
        mongo_db=FakeMongoDB([]),
        redis_client=fake_redis,
        ohlcv_fetcher=make_fetcher(_ohlcv_with_fall(n=10)),
    )
    assert rt is None


@pytest.mark.asyncio
async def test_runtime_idempotency_key_collapses_on_same_bar(fake_redis):
    """Re-running on an already-seen bar must not emit twice. This
    exercises the runtime-side idempotency cache (the gateway-side
    collapse via `clientOrderId` is tested in the Go suite).
    """
    options = [
        {
            "_id": "strat-3",
            "execSymbol": "BTCUSDT",
            "createPositions": [{"marginRate": 1.0, "lossAddRate": 0.0}],
            "stopProfitRate": 0.03,
            "stopLossRate": 0.10,
            "live": {
                "enabled": True,
                "mode": "testnet",
                "accountId": "acc-1",
                "kind": "grid_dca",
                "exchange": "binance",
                "timeframe": "1h",
            },
            "risk": {
                "maxPositionUsd": 1000.0,
                "maxLeverage": 5.0,
                "dailyLossCapUsd": 500.0,
            },
        }
    ]
    df = _ohlcv_with_fall(n=30)
    rt = StrategyRuntime(
        mongo_db=FakeMongoDB(options),
        redis_client=fake_redis,
        ohlcv_fetcher=make_fetcher(df),
    )
    # First tick caches the bar; second + third should be no-ops.
    await rt.tick_once()
    await rt.tick_once()
    await rt.tick_once()
    assert (await fake_redis.xlen(COMMAND_SUBMIT_STREAM)) == 0
