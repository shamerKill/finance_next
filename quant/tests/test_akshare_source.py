"""AKShare wrapper tests using a fake module."""

from __future__ import annotations

from types import SimpleNamespace

import pandas as pd

from quant.data.akshare_source import AkshareSource


def _fake_df() -> pd.DataFrame:
    return pd.DataFrame(
        {
            "date":   ["2024-01-02", "2024-01-03"],
            "open":   [3000.0, 3010.0],
            "high":   [3020.0, 3025.0],
            "low":    [2990.0, 2995.0],
            "close":  [3015.0, 3020.0],
            "volume": [1_000_000, 1_200_000],
        }
    )


async def test_fetch_index_daily_normalizes_dataframe() -> None:
    fake = SimpleNamespace(stock_zh_index_daily=lambda symbol: _fake_df())
    src = AkshareSource(akshare_module=fake)
    bars = await src.fetch_index_daily("sh000300")

    assert len(bars) == 2
    assert bars[0].symbol == "sh000300"
    assert bars[0].exchange == "ashare"
    assert bars[0].timeframe == "1d"
    assert bars[0].open == 3000.0
    assert bars[1].close == 3020.0


async def test_fetch_index_daily_swallows_exceptions() -> None:
    def boom(_symbol: str) -> pd.DataFrame:
        raise RuntimeError("upstream scraping broken")

    fake = SimpleNamespace(stock_zh_index_daily=boom)
    src = AkshareSource(akshare_module=fake)

    bars = await src.fetch_index_daily("sh000300")
    # Failure becomes empty list — caller decides whether to retry.
    assert bars == []


async def test_fetch_index_daily_empty_module_returns_empty() -> None:
    src = AkshareSource(akshare_module=None)
    # When akshare isn't even importable we still don't crash.
    bars = await src.fetch_index_daily("sh000300")
    assert bars == []


async def test_chinese_columns_supported() -> None:
    df = pd.DataFrame(
        {
            "日期":     ["2024-01-02"],
            "开盘":     [3000.0],
            "最高":     [3020.0],
            "最低":     [2990.0],
            "收盘":     [3015.0],
            "成交量":   [1_000_000],
        }
    )
    fake = SimpleNamespace(stock_zh_index_daily=lambda _s: df)
    src = AkshareSource(akshare_module=fake)
    bars = await src.fetch_index_daily("sh000300")
    assert len(bars) == 1
    assert bars[0].open == 3000.0
