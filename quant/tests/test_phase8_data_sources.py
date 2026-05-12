"""Phase 8 data-source tests — fully offline.

Each suite uses one of:

* monkeypatched fake module (akshare / yfinance / feedparser)
* respx for httpx-based clients (FRED, DefiLlama, Etherscan,
  blockchain.info, CryptoPanic)
* environment overrides for the paid stubs
"""

from __future__ import annotations

from datetime import UTC, date, datetime
from types import SimpleNamespace

import httpx
import pandas as pd
import pytest
import respx

from quant.data.equities.akshare_cn import AkshareCNEquities, infer_exchange
from quant.data.equities.polygon_stub import PolygonStockStub
from quant.data.equities.yfinance_intl import YFinanceEquities
from quant.data.errors import ErrAPIKeyNotConfigured
from quant.data.futures.akshare_cn import AkshareCNFutures
from quant.data.macro.akshare_cn import AkshareCNMacro
from quant.data.macro.fred import FREDClient
from quant.data.news.akshare_cn import AkshareCNNews
from quant.data.news.cryptopanic import CryptoPanicClient
from quant.data.news.rss_aggregator import RSSAggregator
from quant.data.news.sentiment import LexiconSentiment
from quant.data.onchain.blockchain_info import (
    BlockchainInfoClient,
    _decode_response,
)
from quant.data.onchain.defillama import DefiLlamaClient
from quant.data.onchain.etherscan import EtherscanClient
from quant.data.onchain.glassnode_stub import GlassnodeStub
from quant.data.onchain.nansen_stub import NansenStub

# ---------------------------------------------------------------------------
# Equities
# ---------------------------------------------------------------------------


def test_infer_exchange_basic() -> None:
    assert infer_exchange("600519") == "sse"
    assert infer_exchange("000001") == "szse"
    assert infer_exchange("300750") == "szse"
    # Unknown prefix → safe default ("sse").
    assert infer_exchange("abc") == "sse"


async def test_akshare_cn_daily_normalises() -> None:
    df = pd.DataFrame(
        {
            "日期": ["2024-01-02", "2024-01-03"],
            "开盘": [100.0, 101.0],
            "最高": [102.0, 103.0],
            "最低": [99.0, 100.0],
            "收盘": [101.5, 102.5],
            "成交量": [1_000_000, 1_100_000],
        }
    )
    fake = SimpleNamespace(stock_zh_a_hist=lambda **_: df)
    src = AkshareCNEquities(akshare_module=fake)
    bars = await src.fetch_daily("600519", date(2024, 1, 1), date(2024, 1, 4))
    assert len(bars) == 2
    assert bars[0].exchange == "sse"
    assert bars[0].symbol == "600519.sse"
    assert bars[0].timeframe == "1d"


async def test_akshare_cn_daily_handles_failure() -> None:
    def boom(**_):
        raise RuntimeError("upstream broken")

    fake = SimpleNamespace(stock_zh_a_hist=boom)
    src = AkshareCNEquities(akshare_module=fake)
    bars = await src.fetch_daily("600519", date(2024, 1, 1), date(2024, 1, 2))
    assert bars == []


async def test_yfinance_fetch_normalises() -> None:
    df = pd.DataFrame(
        {
            "Open": [180.0, 181.0],
            "High": [182.0, 183.0],
            "Low": [179.0, 180.0],
            "Close": [181.5, 182.5],
            "Volume": [100_000, 110_000],
        },
        index=pd.DatetimeIndex(
            [pd.Timestamp("2024-01-02"), pd.Timestamp("2024-01-03")], name="Date"
        ),
    )

    class _FakeTicker:
        def __init__(self, _sym: str) -> None:
            pass

        def history(self, **_):
            return df

    fake = SimpleNamespace(Ticker=_FakeTicker)
    src = YFinanceEquities(yfinance_module=fake)
    bars = await src.fetch(
        "AAPL", "1d", date(2024, 1, 1), date(2024, 1, 4), exchange="nasdaq"
    )
    assert len(bars) == 2
    assert bars[0].exchange == "nasdaq"
    assert bars[0].symbol == "AAPL.nasdaq"


def test_polygon_stub_raises_when_unset(monkeypatch) -> None:
    monkeypatch.delenv("POLYGON_API_KEY", raising=False)
    with pytest.raises(ErrAPIKeyNotConfigured) as exc:
        PolygonStockStub()
    assert exc.value.env_var == "POLYGON_API_KEY"


# ---------------------------------------------------------------------------
# Futures
# ---------------------------------------------------------------------------


async def test_akshare_cn_futures_filters_window() -> None:
    df = pd.DataFrame(
        {
            "日期": ["2024-01-02", "2024-02-02", "2024-03-02"],
            "开盘": [70_000, 71_000, 72_000],
            "最高": [70_500, 71_500, 72_500],
            "最低": [69_500, 70_500, 71_500],
            "收盘": [70_200, 71_200, 72_200],
            "成交量": [10_000, 11_000, 12_000],
        }
    )
    fake = SimpleNamespace(futures_zh_daily_sina=lambda symbol: df)
    f = AkshareCNFutures(akshare_module=fake)
    bars = await f.fetch_daily("cu2412", "shfe", date(2024, 1, 15), date(2024, 2, 15))
    assert len(bars) == 1
    assert bars[0].exchange == "shfe"
    assert bars[0].symbol == "cu2412"
    assert bars[0].close == 71_200.0


# ---------------------------------------------------------------------------
# Macro: FRED
# ---------------------------------------------------------------------------


def test_fred_client_raises_without_key(monkeypatch) -> None:
    monkeypatch.delenv("FRED_API_KEY", raising=False)
    with pytest.raises(ErrAPIKeyNotConfigured):
        FREDClient()


@respx.mock
async def test_fred_fetch_skips_missing_values() -> None:
    respx.get(
        "https://api.stlouisfed.org/fred/series/observations"
    ).mock(
        return_value=httpx.Response(
            200,
            json={
                "observations": [
                    {"date": "2024-01-01", "value": "300.0"},
                    {"date": "2024-02-01", "value": "."},
                    {"date": "2024-03-01", "value": "302.0"},
                ]
            },
        )
    )
    async with httpx.AsyncClient() as http:
        c = FREDClient(api_key="testkey", http_client=http)
        pts = await c.fetch("CPIAUCSL", date(2024, 1, 1), date(2024, 3, 31))
    assert [p.value for p in pts] == [300.0, 302.0]
    assert all(p.code == "CPIAUCSL" and p.source == "fred" for p in pts)


# ---------------------------------------------------------------------------
# Macro: AKShare CN
# ---------------------------------------------------------------------------


async def test_akshare_cn_macro_cpi() -> None:
    df = pd.DataFrame(
        {
            "日期": ["2024-01", "2024-02"],
            "今值": [2.1, 2.3],
        }
    )
    fake = SimpleNamespace(macro_china_cpi_yearly=lambda: df)
    m = AkshareCNMacro(akshare_module=fake)
    pts = await m.fetch("cpi")
    # Two observations decoded; unit "yoy_pct".
    assert len(pts) == 2
    assert pts[0].source == "cn_macro"
    assert pts[0].code == "cpi"
    assert pts[0].unit == "yoy_pct"


async def test_akshare_cn_macro_unknown_indicator_returns_empty() -> None:
    fake = SimpleNamespace()  # no functions
    m = AkshareCNMacro(akshare_module=fake)
    assert await m.fetch("cpi") == []  # type: ignore[arg-type]


# ---------------------------------------------------------------------------
# On-chain
# ---------------------------------------------------------------------------


def test_blockchain_info_decode_response() -> None:
    payload = {
        "hash_rate": 5e8,
        "totalbc": 1_960_000_000_000_000,  # 19.6M BTC in satoshis
        "n_tx": 350_000,
    }
    out = _decode_response(payload)
    assert out["hash_rate"].value == 5e8
    assert out["total_btc"].value == 1_960_000_000_000_000
    assert out["n_tx"].chain == "btc"


@respx.mock
async def test_blockchain_info_fetch_stats() -> None:
    respx.get("https://api.blockchain.info/stats").mock(
        return_value=httpx.Response(200, json={"hash_rate": 4e8})
    )
    async with httpx.AsyncClient() as http:
        c = BlockchainInfoClient(http_client=http)
        out = await c.fetch_stats()
    assert "hash_rate" in out
    assert out["hash_rate"].value == 4e8


@respx.mock
async def test_defillama_protocol_returns_one_point() -> None:
    respx.get("https://api.llama.fi/tvl/aave").mock(
        return_value=httpx.Response(200, text="123456.789")
    )
    async with httpx.AsyncClient() as http:
        c = DefiLlamaClient(http_client=http)
        pts = await c.fetch_tvl("aave")
    assert len(pts) == 1
    assert pts[0].metric == "tvl_usd:aave"
    assert pts[0].value == 123456.789


@respx.mock
async def test_defillama_failed_request_returns_empty() -> None:
    respx.get("https://api.llama.fi/tvl/broken").mock(
        return_value=httpx.Response(500, text="oops")
    )
    async with httpx.AsyncClient() as http:
        c = DefiLlamaClient(http_client=http)
        pts = await c.fetch_tvl("broken")
    assert pts == []


@respx.mock
async def test_etherscan_eth_supply() -> None:
    respx.get("https://api.etherscan.io/api").mock(
        return_value=httpx.Response(
            200, json={"status": "1", "result": "120000000000000000000000000"}
        )
    )
    async with httpx.AsyncClient() as http:
        c = EtherscanClient(api_key="x", http_client=http)
        pt = await c.fetch_eth_supply()
    assert pt is not None
    # 1.2e26 wei → 1.2e8 ETH.
    assert abs(pt.value - 1.2e8) < 1e-3


def test_etherscan_raises_without_key(monkeypatch) -> None:
    monkeypatch.delenv("ETHERSCAN_API_KEY", raising=False)
    with pytest.raises(ErrAPIKeyNotConfigured):
        EtherscanClient()


def test_glassnode_and_nansen_stubs_fail_closed(monkeypatch) -> None:
    monkeypatch.delenv("GLASSNODE_API_KEY", raising=False)
    monkeypatch.delenv("NANSEN_API_KEY", raising=False)
    with pytest.raises(ErrAPIKeyNotConfigured):
        GlassnodeStub()
    with pytest.raises(ErrAPIKeyNotConfigured):
        NansenStub()


# ---------------------------------------------------------------------------
# News
# ---------------------------------------------------------------------------


@respx.mock
async def test_cryptopanic_fetch_filters_since() -> None:
    # CryptoPanic retired v1 public-token-less API in 2025; v2 requires
    # auth. We mock the developer/v2 endpoint and pass a token explicitly.
    respx.get("https://cryptopanic.com/api/developer/v2/posts/").mock(
        return_value=httpx.Response(
            200,
            json={
                "results": [
                    {
                        "id": 101,
                        "published_at": "2024-01-02T00:00:00Z",
                        "title": "BTC up",
                        "url": "https://example/1",
                        "currencies": [{"code": "BTC"}],
                    },
                    {
                        "id": 102,
                        "published_at": "2024-01-04T00:00:00Z",
                        "title": "ETH down",
                        "url": "https://example/2",
                        "currencies": [{"code": "ETH"}],
                    },
                ]
            },
        )
    )
    async with httpx.AsyncClient() as http:
        c = CryptoPanicClient(token="test-token", http_client=http)
        items = await c.fetch(
            currencies=["BTC"], since=datetime(2024, 1, 3, tzinfo=UTC)
        )
    # Item 101 is filtered by since=Jan 3.
    assert len(items) == 1
    assert items[0].title == "ETH down"
    assert "ETH" in items[0].symbols


async def test_cryptopanic_fetch_skips_without_token() -> None:
    """v1 public endpoint is gone; with no token the client returns []
    rather than hitting a known-404 URL and logging a confusing failure."""
    async with httpx.AsyncClient() as http:
        c = CryptoPanicClient(token="", http_client=http)
        items = await c.fetch()
    assert items == []


async def test_akshare_cls_news_decodes() -> None:
    df = pd.DataFrame(
        {
            "标题": ["A 公司发布新品"],
            "内容": ["据 600519 公告..."],
            "发布时间": ["2024-01-02 10:00:00"],
        }
    )
    fake = SimpleNamespace(stock_news_cls=lambda: df)
    n = AkshareCNNews(akshare_module=fake)
    items = await n.fetch_cls()
    assert len(items) == 1
    assert "600519" in items[0].symbols
    assert items[0].source == "cls"


async def test_rss_aggregator_decodes_feedparser() -> None:
    fake_parsed = {
        "entries": [
            {
                "id": "abc",
                "title": "Crypto rally as ETF approves",
                "link": "https://example/abc",
                "summary": "...",
                "published_parsed": (2024, 1, 2, 12, 0, 0, 0, 0, 0),
            }
        ]
    }
    fake = SimpleNamespace(parse=lambda url: fake_parsed)
    rss = RSSAggregator(feedparser_module=fake)
    items = await rss.fetch(["https://example/feed"])
    assert len(items) == 1
    assert items[0].source == "rss"


def test_lexicon_sentiment_polarity() -> None:
    s = LexiconSentiment()
    assert s.score("stocks rally as gains beat estimates") > 0.3
    assert s.score("crash and bankruptcy hits market") < -0.3
    assert s.score("the meeting is at noon") == 0.0
    assert s.score("") == 0.0
