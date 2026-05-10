"""yfinance wrapper for international equities (Phase 8).

Endpoint: ``yfinance.Ticker(symbol).history(period|start|end, interval)``.
Free, no API key. Symbols use Yahoo's syntax:

* US: ``AAPL`` (NYSE/NASDAQ — Yahoo doesn't disambiguate via suffix)
* HK: ``0700.HK``
* LSE: ``BARC.L``
* TYO: ``7203.T``

Storage convention: we strip Yahoo's exchange suffix and tag the
storage row with our short ``exchange`` code (``nyse``, ``nasdaq``,
``hkex`` etc.). Caller passes the explicit ``exchange`` because Yahoo
doesn't tell us which US venue a symbol trades on.

Tests MUST monkeypatch ``yfinance.Ticker`` to return a fake history
DataFrame — no network calls allowed in CI.

Rate limit: yfinance has no documented limit but Yahoo throttles
aggressive callers; we share the ``ashare`` token bucket as a
conservative cap (this is a per-process limiter and does not coordinate
across replicas).
"""

from __future__ import annotations

import asyncio
import logging
from datetime import UTC, date, datetime
from typing import Any, Literal

from quant.data.ccxt_source import OhlcvBar
from quant.ratelimit import registry as rate_registry

log = logging.getLogger(__name__)


Interval = Literal["1d", "1h", "15m", "5m", "1m"]


class YFinanceEquities:
    """Wrap ``yfinance.Ticker`` with consistent OhlcvBar output."""

    def __init__(self, yfinance_module: Any | None = None) -> None:
        if yfinance_module is None:
            try:
                import yfinance as yfinance_module  # type: ignore
            except Exception:  # pragma: no cover
                yfinance_module = None
        self._yf = yfinance_module
        self._bucket = rate_registry.get("ashare")

    async def fetch(
        self,
        symbol: str,
        interval: Interval,
        start: date,
        end: date,
        *,
        exchange: str = "nasdaq",
    ) -> list[OhlcvBar]:
        """Return bars for ``symbol`` in ``[start, end)``.

        ``exchange`` is the *storage* exchange code we tag rows with;
        it's not passed to Yahoo. Yahoo's symbol format already
        encodes the venue (``0700.HK`` → HK).
        """
        if self._yf is None:
            log.warning("yfinance not installed; skipping fetch for %s", symbol)
            return []

        await self._bucket.acquire()
        try:
            df = await asyncio.get_running_loop().run_in_executor(
                None, self._fetch_sync, symbol, interval, start, end
            )
        except Exception as exc:  # noqa: BLE001
            log.warning("yfinance fetch failed for %s: %s", symbol, exc)
            return []
        if df is None or len(df) == 0:
            return []

        # Yahoo returns columns ``Open/High/Low/Close/Volume`` keyed by
        # a DatetimeIndex (tz-aware for intraday, tz-naive for daily).
        bars: list[OhlcvBar] = []
        bare = symbol.split(".")[0].upper()
        storage_symbol = f"{bare}.{exchange}"
        timeframe = interval
        for ts_raw, row in df.iterrows():
            try:
                if hasattr(ts_raw, "to_pydatetime"):
                    ts = ts_raw.to_pydatetime()
                else:
                    ts = datetime.fromisoformat(str(ts_raw))
                if ts.tzinfo is None:
                    ts = ts.replace(tzinfo=UTC)
                bars.append(
                    OhlcvBar(
                        exchange=exchange,
                        symbol=storage_symbol,
                        timeframe=timeframe,
                        ts=ts,
                        open=float(row.get("Open", row.get("open", 0.0))),
                        high=float(row.get("High", row.get("high", 0.0))),
                        low=float(row.get("Low", row.get("low", 0.0))),
                        close=float(row.get("Close", row.get("close", 0.0))),
                        volume=float(row.get("Volume", row.get("volume", 0.0))),
                    )
                )
            except (TypeError, ValueError, KeyError) as exc:
                log.warning("yfinance row decode failed for %s: %s", symbol, exc)
                continue
        return bars

    def _fetch_sync(
        self, symbol: str, interval: Interval, start: date, end: date
    ) -> Any:
        """Sync helper executed in the default thread-pool executor."""
        ticker = self._yf.Ticker(symbol)
        return ticker.history(
            interval=interval,
            start=start.strftime("%Y-%m-%d"),
            end=end.strftime("%Y-%m-%d"),
            auto_adjust=False,
            actions=False,
        )
