"""AKShare wrapper for A-share daily / 1m bars.

AKShare is a community-maintained scraping library; calls can fail at any
time when upstream sites change. We treat every call as best-effort and
return an empty result on error, logging a warning. Production should
revisit this in Phase 7 if AKShare proves unreliable enough to warrant
swapping for paid Tushare Pro.

Tests monkeypatch the AKShare module functions so no network access happens
in CI.
"""

from __future__ import annotations

import logging
from datetime import UTC, datetime
from typing import Any

from quant.data.ccxt_source import OhlcvBar
from quant.ratelimit import registry as rate_registry

log = logging.getLogger(__name__)


def _normalize_to_bars(
    df: Any, *, symbol: str, timeframe: str
) -> list[OhlcvBar]:
    """Convert an AKShare dataframe into OhlcvBar rows.

    AKShare uses Chinese column names for many endpoints. We accept both
    Chinese ("日期", "开盘", ...) and English ("date", "open", ...) by
    matching on a sensible case-insensitive priority.
    """
    if df is None or len(df) == 0:
        return []

    # Map across the few schemas we observe in practice.
    column_aliases = {
        "ts":     ["date", "日期", "datetime", "时间"],
        "open":   ["open", "开盘"],
        "high":   ["high", "最高"],
        "low":    ["low", "最低"],
        "close":  ["close", "收盘"],
        "volume": ["volume", "成交量"],
    }

    actual: dict[str, str] = {}
    cols_lower = {str(c).lower(): str(c) for c in df.columns}
    for canonical, aliases in column_aliases.items():
        for a in aliases:
            if a.lower() in cols_lower:
                actual[canonical] = cols_lower[a.lower()]
                break
        if canonical not in actual:
            log.warning("akshare dataframe missing column %s; skipping", canonical)
            return []

    bars: list[OhlcvBar] = []
    for _, row in df.iterrows():
        ts_raw = row[actual["ts"]]
        # AKShare returns either pandas Timestamp or naive str; coerce both.
        if hasattr(ts_raw, "to_pydatetime"):
            ts = ts_raw.to_pydatetime()
        else:
            ts = datetime.fromisoformat(str(ts_raw))
        if ts.tzinfo is None:
            ts = ts.replace(tzinfo=UTC)

        bars.append(
            OhlcvBar(
                exchange="ashare",
                symbol=symbol,
                timeframe=timeframe,
                ts=ts,
                open=float(row[actual["open"]]),
                high=float(row[actual["high"]]),
                low=float(row[actual["low"]]),
                close=float(row[actual["close"]]),
                volume=float(row[actual["volume"]]),
            )
        )
    return bars


class AkshareSource:
    """Pull A-share OHLCV via AKShare's index-daily endpoint.

    Phase 2 only supports the CSI300 index daily series. Per-stock 1m bars
    require a different AKShare entry point and land in a later phase.
    """

    def __init__(self, akshare_module: Any | None = None) -> None:
        # Lazy import — akshare is heavy and slow to import.
        if akshare_module is None:
            try:
                import akshare as akshare_module  # type: ignore
            except Exception:  # pragma: no cover
                akshare_module = None
        self._ak = akshare_module
        self._bucket = rate_registry.get("ashare")

    async def fetch_index_daily(self, symbol: str) -> list[OhlcvBar]:
        """Return the full daily history for an A-share index symbol.

        Failure modes (network error, schema change) become an empty list
        with a logged warning — never an exception. The caller decides
        whether an empty batch should retry.
        """
        if self._ak is None:
            log.warning("akshare not installed; skipping fetch for %s", symbol)
            return []

        await self._bucket.acquire()
        try:
            # AKShare's HTTP wrappers are sync; offload to a worker thread
            # so we don't block the event loop. anyio is overkill for a
            # one-call site; asyncio's loop.run_in_executor does the job.
            import asyncio

            df = await asyncio.get_running_loop().run_in_executor(
                None, self._ak.stock_zh_index_daily, symbol
            )
            return _normalize_to_bars(df, symbol=symbol, timeframe="1d")
        except Exception as exc:  # noqa: BLE001 — AKShare raises a zoo of types
            log.warning("akshare fetch failed for %s: %s", symbol, exc)
            return []
