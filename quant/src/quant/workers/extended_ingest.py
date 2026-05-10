"""Arq tasks for Phase 8 extended-data ingest.

Each ingest task is small + idempotent. The shared pattern is:

    1. construct the source client (lazy import its heavy deps)
    2. fetch
    3. upsert via :mod:`quant.data.extended_repo`
    4. return a small dict ack

Tests inject fake module objects so no network calls happen.
"""

from __future__ import annotations

import logging
from datetime import UTC, date, datetime, timedelta
from typing import Any

from quant.data import extended_repo
from quant.data.equities.akshare_cn import AkshareCNEquities
from quant.data.equities.yfinance_intl import YFinanceEquities
from quant.data.errors import ErrAPIKeyNotConfigured
from quant.data.futures.akshare_cn import AkshareCNFutures
from quant.data.macro.akshare_cn import AkshareCNMacro
from quant.data.macro.fred import DEFAULT_FRED_SERIES, FREDClient
from quant.data.news.akshare_cn import AkshareCNNews
from quant.data.news.cryptopanic import CryptoPanicClient
from quant.data.news.rss_aggregator import RSSAggregator
from quant.data.news.sentiment import LexiconSentiment
from quant.data.onchain.blockchain_info import BlockchainInfoClient
from quant.data.onchain.defillama import DefiLlamaClient
from quant.data.onchain.etherscan import EtherscanClient
from quant.data.timescale import upsert_ohlcv

log = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Equities
# ---------------------------------------------------------------------------


async def run_equities_ingest(
    *,
    symbols_cn: list[str] | None = None,
    symbols_intl: list[tuple[str, str]] | None = None,
    days: int = 30,
    akshare_module: Any | None = None,
    yfinance_module: Any | None = None,
) -> dict[str, Any]:
    """Pull recent daily bars for CN + international equities.

    ``symbols_cn`` are bare CSRC codes (e.g. ``600519``). ``symbols_intl``
    are ``(yahoo_symbol, storage_exchange)`` tuples — Yahoo's ticker
    syntax doesn't disambiguate venue for US listings, so the caller
    must declare it.
    """
    end = date.today()
    start = end - timedelta(days=days)
    written = 0

    cn = AkshareCNEquities(akshare_module=akshare_module)
    for sym in symbols_cn or []:
        bars = await cn.fetch_daily(sym, start, end)
        if bars:
            written += await upsert_ohlcv(bars)

    yf = YFinanceEquities(yfinance_module=yfinance_module)
    for sym, exchange in symbols_intl or []:
        bars = await yf.fetch(sym, "1d", start, end, exchange=exchange)
        if bars:
            written += await upsert_ohlcv(bars)

    return {"bars_ingested": written, "from": start.isoformat(), "to": end.isoformat()}


async def run_futures_ingest(
    *,
    contracts: list[tuple[str, str]] | None = None,
    days: int = 30,
    akshare_module: Any | None = None,
) -> dict[str, Any]:
    """Pull recent daily bars for CN futures contracts.

    ``contracts`` is a list of ``(contract_id, exchange)`` tuples
    (e.g. ``("cu2412", "shfe")``).
    """
    end = date.today()
    start = end - timedelta(days=days)
    written = 0
    f = AkshareCNFutures(akshare_module=akshare_module)
    for contract, ex in contracts or []:
        bars = await f.fetch_daily(contract, ex, start, end)  # type: ignore[arg-type]
        if bars:
            written += await upsert_ohlcv(bars)
    return {"bars_ingested": written, "from": start.isoformat(), "to": end.isoformat()}


# ---------------------------------------------------------------------------
# Macro
# ---------------------------------------------------------------------------


async def run_macro_ingest(
    *,
    fred_series: list[str] | None = None,
    cn_indicators: list[str] | None = None,
    days: int = 365 * 5,
    akshare_module: Any | None = None,
    fred_http_client: Any | None = None,
) -> dict[str, Any]:
    """Pull macro observations from FRED + CN AKShare.

    Skips FRED entirely if ``FRED_API_KEY`` is unset (the
    :class:`FREDClient` constructor raises ``ErrAPIKeyNotConfigured``).
    """
    end = date.today()
    start = end - timedelta(days=days)
    written = 0

    try:
        fred = FREDClient(http_client=fred_http_client)
        for code in fred_series or DEFAULT_FRED_SERIES:
            points = await fred.fetch(code, start, end)
            if points:
                written += await extended_repo.upsert_macro(points)
        await fred.aclose()
    except ErrAPIKeyNotConfigured as exc:
        log.warning("FRED skipped: %s", exc)

    cn = AkshareCNMacro(akshare_module=akshare_module)
    for ind in cn_indicators or ["cpi", "ppi", "m2", "gdp", "pmi"]:
        points = await cn.fetch(ind)  # type: ignore[arg-type]
        if points:
            written += await extended_repo.upsert_macro(points)

    return {"points_ingested": written, "from": start.isoformat(), "to": end.isoformat()}


# ---------------------------------------------------------------------------
# On-chain
# ---------------------------------------------------------------------------


async def run_onchain_ingest(
    *,
    defillama_protocols: list[str] | None = None,
    include_blockchain_info: bool = True,
    include_etherscan: bool = True,
    http_client: Any | None = None,
    etherscan_http_client: Any | None = None,
) -> dict[str, Any]:
    """Pull a snapshot of free on-chain metrics."""
    written = 0

    if include_blockchain_info:
        bi = BlockchainInfoClient(http_client=http_client)
        snap = await bi.fetch_stats()
        if snap:
            written += await extended_repo.upsert_onchain(snap.values())
        await bi.aclose()

    dl = DefiLlamaClient(http_client=http_client)
    for proto in defillama_protocols or ["aave", "uniswap", "lido"]:
        pts = await dl.fetch_tvl(proto)
        if pts:
            written += await extended_repo.upsert_onchain(pts)
    await dl.aclose()

    if include_etherscan:
        try:
            es = EtherscanClient(http_client=etherscan_http_client)
            supply = await es.fetch_eth_supply()
            if supply is not None:
                written += await extended_repo.upsert_onchain([supply])
            gas = await es.fetch_gas_price()
            if gas:
                written += await extended_repo.upsert_onchain(gas.values())
            await es.aclose()
        except ErrAPIKeyNotConfigured as exc:
            log.warning("Etherscan skipped: %s", exc)

    return {"points_ingested": written}


# ---------------------------------------------------------------------------
# News
# ---------------------------------------------------------------------------


async def run_news_ingest(
    *,
    cryptopanic_currencies: list[str] | None = None,
    rss_feeds: list[str] | None = None,
    include_cls: bool = True,
    cryptopanic_http_client: Any | None = None,
    feedparser_module: Any | None = None,
    akshare_module: Any | None = None,
) -> dict[str, Any]:
    """Pull recent news from every configured source + score sentiment."""
    sentiment = LexiconSentiment()
    items_all: list[Any] = []

    cp = CryptoPanicClient(http_client=cryptopanic_http_client)
    items_all.extend(
        await cp.fetch(currencies=cryptopanic_currencies or ["BTC", "ETH"])
    )
    await cp.aclose()

    rss = RSSAggregator(feedparser_module=feedparser_module)
    items_all.extend(await rss.fetch(rss_feeds))

    if include_cls:
        cls = AkshareCNNews(akshare_module=akshare_module)
        items_all.extend(await cls.fetch_cls())

    # Score sentiment in-place (item is a dataclass; rebuild to avoid
    # mutating "frozen" assumptions — NewsItem is mutable but rebuilding
    # is cheap and explicit).
    scored = []
    for it in items_all:
        s = sentiment.score(f"{it.title} {it.body}")
        it.sentiment = s
        scored.append(it)

    written = await extended_repo.upsert_news(scored)
    return {"items_ingested": written, "items_seen": len(scored)}


# ---------------------------------------------------------------------------
# Arq adapters
# ---------------------------------------------------------------------------


async def ingest_equities(ctx: dict[str, Any], **kwargs: Any) -> dict[str, Any]:
    return await run_equities_ingest(**kwargs)


async def ingest_futures(ctx: dict[str, Any], **kwargs: Any) -> dict[str, Any]:
    return await run_futures_ingest(**kwargs)


async def ingest_macro(ctx: dict[str, Any], **kwargs: Any) -> dict[str, Any]:
    return await run_macro_ingest(**kwargs)


async def ingest_onchain(ctx: dict[str, Any], **kwargs: Any) -> dict[str, Any]:
    return await run_onchain_ingest(**kwargs)


async def ingest_news(ctx: dict[str, Any], **kwargs: Any) -> dict[str, Any]:
    return await run_news_ingest(**kwargs)


# Cron entrypoints — these are thin so the worker schedule doesn't have
# to care about kwargs. Operators should configure the symbol universe
# via env / config, not via cron-call args.


async def daily_equities_cron(ctx: dict[str, Any]) -> None:
    """Daily 16:00 UTC — backfill the last 7 days of CN + intl equities."""
    try:
        await run_equities_ingest(
            symbols_cn=["600519", "000001"],
            symbols_intl=[("AAPL", "nasdaq"), ("MSFT", "nasdaq")],
            days=7,
        )
    except Exception as exc:  # noqa: BLE001
        log.warning("daily_equities_cron failed: %s", exc)


async def daily_macro_cron(ctx: dict[str, Any]) -> None:
    """Daily 00:30 UTC — refresh FRED + CN macro."""
    try:
        await run_macro_ingest(days=365)
    except Exception as exc:  # noqa: BLE001
        log.warning("daily_macro_cron failed: %s", exc)


async def hourly_onchain_cron(ctx: dict[str, Any]) -> None:
    """Hourly — TVL changes throughout the day."""
    try:
        await run_onchain_ingest()
    except Exception as exc:  # noqa: BLE001
        log.warning("hourly_onchain_cron failed: %s", exc)


async def hourly_news_cron(ctx: dict[str, Any]) -> None:
    """Hourly — pull news + score sentiment."""
    try:
        await run_news_ingest()
    except Exception as exc:  # noqa: BLE001
        log.warning("hourly_news_cron failed: %s", exc)


# Helper: build the start datetime (UTC, tz-aware) given a date.
def _to_dt(d: date) -> datetime:
    return datetime(d.year, d.month, d.day, tzinfo=UTC)
