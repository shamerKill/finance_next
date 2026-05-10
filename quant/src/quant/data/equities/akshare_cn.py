"""AKShare wrapper for A-share equities (Phase 8).

Endpoints used
--------------
* ``ak.stock_zh_a_hist(symbol, period="daily", start_date, end_date,
  adjust="qfq")`` — daily bars, qfq = forward-adjusted prices.
* ``ak.stock_zh_a_minute(symbol="sh600519", period="1", adjust="qfq")``
  — intraday bars; period ∈ {"1", "5", "15", "30", "60"}.

Symbol format
-------------
AKShare wants bare 6-digit codes for the daily endpoint (``600519``,
``000001``) and ``sh<code>``/``sz<code>`` for the minute endpoint. We
also derive the storage exchange code from the digit prefix:

    600/601/603/688 → ``sse`` (Shanghai)
    000/002/300     → ``szse`` (Shenzhen)

Storage symbol is always ``<code>.<exchange>`` (e.g. ``600519.sse``).

Failure mode: AKShare scrapes Eastmoney/Sina, which can break at any
time. We log a warning and return an empty list — never raise — so the
caller can decide whether an empty batch should retry. Tests must
inject a fake ``akshare_module`` so no network calls happen.

Rate limit: ~10 req/sec per source. Caller-side rate limiting is
delegated to :mod:`quant.ratelimit` registry under the ``ashare``
bucket (shared with the index daily endpoint).
"""

from __future__ import annotations

import asyncio
import logging
from datetime import UTC, date, datetime
from typing import Any, Literal

from quant.data.akshare_source import _normalize_to_bars
from quant.data.ccxt_source import OhlcvBar
from quant.ratelimit import registry as rate_registry

log = logging.getLogger(__name__)


IntradayPeriod = Literal["1", "5", "15", "30", "60"]


def infer_exchange(symbol: str) -> str:
    """Infer the storage ``exchange`` code from a 6-digit A-share symbol.

    The mapping is the canonical CSRC convention. We default to ``sse``
    when the prefix is unknown rather than raising; the caller probably
    has a valid symbol from a curated universe and we'd rather store it
    than drop it.
    """
    if not symbol or not symbol.isdigit() or len(symbol) != 6:
        return "sse"
    head = symbol[:3]
    if head in {"600", "601", "603", "605", "688"}:
        return "sse"
    if head in {"000", "001", "002", "300", "301"}:
        return "szse"
    return "sse"


def _akshare_minute_symbol(symbol: str) -> str:
    """Translate ``600519`` to ``sh600519`` for ``stock_zh_a_minute``."""
    if symbol.startswith(("sh", "sz")):
        return symbol
    ex = infer_exchange(symbol)
    return ("sh" if ex == "sse" else "sz") + symbol


def _storage_symbol(symbol: str) -> str:
    """Storage symbol form ``<code>.<exchange>``."""
    bare = symbol.removeprefix("sh").removeprefix("sz")
    return f"{bare}.{infer_exchange(bare)}"


class AkshareCNEquities:
    """A-share daily / intraday OHLCV via AKShare."""

    def __init__(self, akshare_module: Any | None = None) -> None:
        if akshare_module is None:
            try:
                import akshare as akshare_module  # type: ignore
            except Exception:  # pragma: no cover
                akshare_module = None
        self._ak = akshare_module
        self._bucket = rate_registry.get("ashare")

    async def fetch_daily(
        self,
        ts_code: str,
        start: date,
        end: date,
    ) -> list[OhlcvBar]:
        """Return daily ``qfq``-adjusted bars for the requested window."""
        if self._ak is None:
            log.warning("akshare not installed; skipping daily fetch for %s", ts_code)
            return []

        await self._bucket.acquire()
        bare = ts_code.removeprefix("sh").removeprefix("sz")
        try:
            df = await asyncio.get_running_loop().run_in_executor(
                None,
                lambda: self._ak.stock_zh_a_hist(
                    symbol=bare,
                    period="daily",
                    start_date=start.strftime("%Y%m%d"),
                    end_date=end.strftime("%Y%m%d"),
                    adjust="qfq",
                ),
            )
        except Exception as exc:  # noqa: BLE001
            log.warning("akshare daily fetch failed for %s: %s", ts_code, exc)
            return []

        bars = _normalize_to_bars(
            df, symbol=_storage_symbol(ts_code), timeframe="1d"
        )
        # _normalize_to_bars sets exchange="ashare" by default (legacy
        # index-daily caller). Fix it to the venue.
        ex = infer_exchange(bare)
        return [
            OhlcvBar(
                exchange=ex,
                symbol=b.symbol,
                timeframe=b.timeframe,
                ts=b.ts,
                open=b.open,
                high=b.high,
                low=b.low,
                close=b.close,
                volume=b.volume,
            )
            for b in bars
        ]

    async def fetch_intraday(
        self,
        ts_code: str,
        period: IntradayPeriod,
        start: date,
        end: date,
    ) -> list[OhlcvBar]:
        """Return intraday bars (period in minutes as a string).

        AKShare's ``stock_zh_a_minute`` returns the most recent N days
        regardless of start/end (the endpoint doesn't accept a range);
        we filter client-side to ``[start, end)``.
        """
        if self._ak is None:
            log.warning("akshare not installed; skipping intraday for %s", ts_code)
            return []

        await self._bucket.acquire()
        ak_symbol = _akshare_minute_symbol(ts_code)
        try:
            df = await asyncio.get_running_loop().run_in_executor(
                None,
                lambda: self._ak.stock_zh_a_minute(
                    symbol=ak_symbol, period=period, adjust="qfq"
                ),
            )
        except Exception as exc:  # noqa: BLE001
            log.warning("akshare intraday fetch failed for %s: %s", ts_code, exc)
            return []

        timeframe = f"{period}m"
        bars = _normalize_to_bars(
            df, symbol=_storage_symbol(ts_code), timeframe=timeframe
        )
        ex = infer_exchange(ts_code.removeprefix("sh").removeprefix("sz"))
        start_dt = datetime(start.year, start.month, start.day, tzinfo=UTC)
        end_dt = datetime(end.year, end.month, end.day, tzinfo=UTC)
        out: list[OhlcvBar] = []
        for b in bars:
            if b.ts < start_dt or b.ts >= end_dt:
                continue
            out.append(
                OhlcvBar(
                    exchange=ex,
                    symbol=b.symbol,
                    timeframe=b.timeframe,
                    ts=b.ts,
                    open=b.open,
                    high=b.high,
                    low=b.low,
                    close=b.close,
                    volume=b.volume,
                )
            )
        return out
