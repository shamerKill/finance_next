"""Tests for Phase 8 extended-ingest tasks.

We replace the underlying repo upserts with simple list collectors so the
tests don't need a live Timescale pool.
"""

from __future__ import annotations

from types import SimpleNamespace
from typing import Any

import pandas as pd
import pytest

from quant.workers import extended_ingest


@pytest.fixture
def captured_repo(monkeypatch) -> dict[str, list[Any]]:
    captured: dict[str, list[Any]] = {
        "ohlcv": [],
        "macro": [],
        "onchain": [],
        "news": [],
    }

    async def _fake_upsert_ohlcv(rows):
        captured["ohlcv"].extend(list(rows))
        return len(captured["ohlcv"])

    async def _fake_upsert_macro(rows):
        captured["macro"].extend(list(rows))
        return len(captured["macro"])

    async def _fake_upsert_onchain(rows):
        captured["onchain"].extend(list(rows))
        return len(captured["onchain"])

    async def _fake_upsert_news(rows):
        captured["news"].extend(list(rows))
        return len(captured["news"])

    monkeypatch.setattr(extended_ingest, "upsert_ohlcv", _fake_upsert_ohlcv)
    monkeypatch.setattr(
        extended_ingest.extended_repo, "upsert_macro", _fake_upsert_macro
    )
    monkeypatch.setattr(
        extended_ingest.extended_repo, "upsert_onchain", _fake_upsert_onchain
    )
    monkeypatch.setattr(
        extended_ingest.extended_repo, "upsert_news", _fake_upsert_news
    )
    return captured


async def test_run_equities_ingest_captures_rows(captured_repo) -> None:
    df_cn = pd.DataFrame(
        {
            "日期": ["2024-01-02"],
            "开盘": [100.0],
            "最高": [101.0],
            "最低": [99.0],
            "收盘": [100.5],
            "成交量": [1_000.0],
        }
    )
    fake_ak = SimpleNamespace(stock_zh_a_hist=lambda **_: df_cn)

    df_yf = pd.DataFrame(
        {
            "Open": [100.0],
            "High": [101.0],
            "Low": [99.0],
            "Close": [100.5],
            "Volume": [1_000],
        },
        index=pd.DatetimeIndex(["2024-01-02"], name="Date"),
    )

    class _T:
        def __init__(self, _s):
            pass

        def history(self, **_):
            return df_yf

    fake_yf = SimpleNamespace(Ticker=_T)

    ack = await extended_ingest.run_equities_ingest(
        symbols_cn=["600519"],
        symbols_intl=[("AAPL", "nasdaq")],
        days=7,
        akshare_module=fake_ak,
        yfinance_module=fake_yf,
    )
    assert ack["bars_ingested"] >= 2
    # CN row + intl row both appended.
    assert any(b.symbol == "600519.sse" for b in captured_repo["ohlcv"])
    assert any(b.symbol == "AAPL.nasdaq" for b in captured_repo["ohlcv"])


async def test_run_macro_ingest_skips_fred_when_unset(
    monkeypatch, captured_repo
) -> None:
    monkeypatch.delenv("FRED_API_KEY", raising=False)
    df = pd.DataFrame(
        {
            "日期": ["2024-01"],
            "今值": [2.1],
        }
    )
    fake_ak = SimpleNamespace(macro_china_cpi_yearly=lambda: df)
    ack = await extended_ingest.run_macro_ingest(
        cn_indicators=["cpi"], akshare_module=fake_ak
    )
    # Only the CN side should write anything.
    assert ack["points_ingested"] == 1
    assert captured_repo["macro"][0].code == "cpi"


async def test_run_news_ingest_scores_sentiment(monkeypatch, captured_repo) -> None:
    # Stub each upstream to a small async function via direct monkey-patches
    # at the source-class level. CryptoPanic now mocks the developer/v2
    # endpoint and we pre-set the token env so the client doesn't short-
    # circuit on token-absent skip.
    import httpx
    import respx

    monkeypatch.setenv("CRYPTOPANIC_TOKEN", "test-token")
    with respx.mock:
        respx.get("https://cryptopanic.com/api/developer/v2/posts/").mock(
            return_value=httpx.Response(
                200,
                json={
                    "results": [
                        {
                            "id": 1,
                            "published_at": "2024-01-02T00:00:00Z",
                            "title": "BTC surge boosts gains",
                            "url": "https://example/1",
                            "currencies": [{"code": "BTC"}],
                        }
                    ]
                },
            )
        )

        # No CLS, no RSS — simplifies assertion.
        ack = await extended_ingest.run_news_ingest(
            include_cls=False,
            feedparser_module=SimpleNamespace(parse=lambda _u: {"entries": []}),
        )

    assert ack["items_ingested"] == 1
    item = captured_repo["news"][0]
    assert item.source == "cryptopanic"
    # Lexicon sees "surge"+"boosts"+"gains" → strongly positive.
    assert item.sentiment > 0.5
