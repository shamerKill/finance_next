"""ccxt wrapper tests using a fake ccxt module — no network."""

from __future__ import annotations

from datetime import UTC, datetime, timedelta

import pytest

from quant.data.ccxt_source import CcxtSource


async def test_fetch_ohlcv_range_returns_typed_bars(fake_ccxt) -> None:
    src = CcxtSource("binance", ccxt_module=fake_ccxt)
    start = datetime(2024, 1, 1, tzinfo=UTC)
    end = start + timedelta(minutes=5)

    bars = await src.fetch_ohlcv_range(
        "BTCUSDT", "1m", start, end, chunk_limit=10
    )
    await src.close()

    # The fake returns 1m candles starting at `since=start_ms`. We requested
    # 5 minutes so we expect exactly 5 bars (300s / 60s).
    assert len(bars) == 5
    first = bars[0]
    assert first.exchange == "binance"
    assert first.symbol == "BTCUSDT"
    assert first.timeframe == "1m"
    assert first.ts == start
    assert first.open == 100.0
    assert bars[-1].ts == start + timedelta(minutes=4)


async def test_fetch_ohlcv_range_paginates(fake_ccxt) -> None:
    src = CcxtSource("binance", ccxt_module=fake_ccxt)
    start = datetime(2024, 1, 1, tzinfo=UTC)
    end = start + timedelta(minutes=25)

    bars = await src.fetch_ohlcv_range(
        "BTCUSDT", "1m", start, end, chunk_limit=10
    )
    await src.close()

    # 25 minutes / 1m bars / chunk_limit=10 → 3 underlying calls.
    binanceusdm = src._client  # noqa: SLF001 — test introspection
    assert len(binanceusdm.calls) >= 3
    assert len(bars) == 25


async def test_fetch_ohlcv_range_empty_when_start_ge_end(fake_ccxt) -> None:
    src = CcxtSource("binance", ccxt_module=fake_ccxt)
    now = datetime(2024, 1, 1, tzinfo=UTC)
    bars = await src.fetch_ohlcv_range("BTCUSDT", "1m", now, now)
    await src.close()
    assert bars == []


async def test_unknown_exchange_raises(fake_ccxt) -> None:
    with pytest.raises(ValueError):
        CcxtSource("kraken", ccxt_module=fake_ccxt)


async def test_unsupported_timeframe_raises(fake_ccxt) -> None:
    src = CcxtSource("binance", ccxt_module=fake_ccxt)
    start = datetime(2024, 1, 1, tzinfo=UTC)
    end = start + timedelta(minutes=5)
    with pytest.raises(ValueError):
        await src.fetch_ohlcv_range("BTCUSDT", "30m", start, end)
    await src.close()
