"""ccxt-python wrapper for OHLCV ingest.

The wrapper does three things on top of raw ccxt:
    1. Routes per-exchange calls through our token-bucket rate limiter.
    2. Pages through long ranges using ccxt's ``since`` + ``limit`` semantics.
    3. Returns a typed list of :class:`OhlcvBar` rather than the raw nested
       lists ccxt emits, so the rest of the pipeline doesn't have to know
       the index conventions.

Tests must NOT hit real exchanges; ``fetch_ohlcv`` is the only seam tests
patch (via monkeypatch on the underlying ccxt exchange instance).
"""

from __future__ import annotations

import os
from collections.abc import Iterable
from dataclasses import dataclass
from datetime import UTC, datetime
from typing import Any

from quant.ratelimit import registry as rate_registry

# ccxt is imported lazily — the package weighs ~30MB and importing it eagerly
# slows down `pytest --collect-only`. Tests stub the exchange object directly
# so they don't pay the import cost either.
try:
    import ccxt.async_support as ccxt_async  # type: ignore
except Exception:  # pragma: no cover - the import only fails offline w/o deps
    ccxt_async = None  # type: ignore


# ccxt timeframe → seconds. Used to advance `since` when paging.
_TIMEFRAME_SECONDS: dict[str, int] = {
    "1m": 60,
    "5m": 5 * 60,
    "1h": 60 * 60,
    "1d": 24 * 60 * 60,
}


@dataclass(slots=True, frozen=True)
class OhlcvBar:
    """One row of the OHLCV time series."""

    exchange: str
    symbol: str
    timeframe: str
    ts: datetime  # UTC, tz-aware
    open: float
    high: float
    low: float
    close: float
    volume: float


def _bar_from_ccxt(
    row: list[Any], *, exchange: str, symbol: str, timeframe: str
) -> OhlcvBar:
    """Convert a single ccxt OHLCV row to our dataclass."""
    # ccxt's [ts, open, high, low, close, volume] convention.
    ts_ms, op, hi, lo, cl, vol = row[:6]
    return OhlcvBar(
        exchange=exchange,
        symbol=symbol,
        timeframe=timeframe,
        ts=datetime.fromtimestamp(ts_ms / 1000.0, tz=UTC),
        open=float(op),
        high=float(hi),
        low=float(lo),
        close=float(cl),
        volume=float(vol),
    )


class CcxtSource:
    """Async ccxt wrapper covering Binance / OKX / Bybit USDT-perp."""

    # Mapping of our short exchange ids to ccxt class names.
    _CCXT_CLASS = {
        "binance": "binanceusdm",  # USDT-M futures
        "okx": "okx",
        "bybit": "bybit",
    }

    def __init__(self, exchange: str, *, ccxt_module: Any = None) -> None:
        self.exchange = exchange.lower()
        if self.exchange not in self._CCXT_CLASS:
            raise ValueError(f"unsupported ccxt exchange: {exchange}")

        # ccxt_module is an injection seam for tests.
        module = ccxt_module if ccxt_module is not None else ccxt_async
        if module is None:
            raise RuntimeError("ccxt is not installed; cannot construct CcxtSource")

        cls_name = self._CCXT_CLASS[self.exchange]
        cls = getattr(module, cls_name)
        # enableRateLimit=False because OUR token bucket governs throughput.
        # timeout bumped to 60s because the first call (load_markets →
        # /fapi/v1/exchangeInfo) downloads a multi-MB catalog that can
        # exceed ccxt's 10s default over slower links / cold paths.
        cfg: dict[str, Any] = {"enableRateLimit": False, "timeout": 60_000}
        # Honor system-level HTTP(S)_PROXY env vars. ccxt's async backend
        # (aiohttp) doesn't auto-detect these; passing httpsProxy explicitly
        # is needed in network-restricted environments where direct egress
        # to api.binance.com / fapi.binance.com is blocked but a local
        # SOCKS/HTTP tunnel is available.
        proxy = (
            os.environ.get("HTTPS_PROXY")
            or os.environ.get("https_proxy")
            or os.environ.get("HTTP_PROXY")
            or os.environ.get("http_proxy")
        )
        if proxy:
            # ccxt rejects setting both http- and https- proxies simultaneously;
            # since every supported exchange uses HTTPS, only httpsProxy matters.
            cfg["httpsProxy"] = proxy
        self._client = cls(cfg)
        self._bucket = rate_registry.get(self.exchange)

    async def close(self) -> None:
        """Release the underlying ccxt session (essential for long runs)."""
        client = self._client
        if hasattr(client, "close"):
            await client.close()

    async def fetch_ohlcv_range(
        self,
        symbol: str,
        timeframe: str,
        start: datetime,
        end: datetime,
        *,
        chunk_limit: int = 1000,
    ) -> list[OhlcvBar]:
        """Return every bar in ``[start, end)`` paginated via ccxt's ``since``.

        ccxt returns at most ``chunk_limit`` bars per call; we walk forward
        until either the end timestamp is reached or the exchange returns
        an empty page (indicating no more history available).
        """
        if timeframe not in _TIMEFRAME_SECONDS:
            raise ValueError(f"unsupported timeframe: {timeframe}")
        if start >= end:
            return []

        start_ms = int(start.timestamp() * 1000)
        end_ms = int(end.timestamp() * 1000)
        timeframe_ms = _TIMEFRAME_SECONDS[timeframe] * 1000

        bars: list[OhlcvBar] = []
        cursor = start_ms

        while cursor < end_ms:
            await self._bucket.acquire()
            page = await self._client.fetch_ohlcv(
                symbol, timeframe=timeframe, since=cursor, limit=chunk_limit
            )
            if not page:
                # No more data on the exchange for this range.
                break

            page_filtered: list[OhlcvBar] = []
            for row in page:
                ts_ms = int(row[0])
                if ts_ms >= end_ms:
                    break
                page_filtered.append(
                    _bar_from_ccxt(
                        row,
                        exchange=self.exchange,
                        symbol=symbol,
                        timeframe=timeframe,
                    )
                )
            bars.extend(page_filtered)

            last_ts_ms = int(page[-1][0])
            # Advance cursor past the last row to avoid re-fetching it. If
            # the exchange returned a partial page (less than chunk_limit
            # AND the last ts < end), break to avoid an infinite loop.
            if last_ts_ms >= end_ms or len(page) < chunk_limit:
                break
            cursor = last_ts_ms + timeframe_ms

        return bars


def to_dicts(bars: Iterable[OhlcvBar]) -> list[dict[str, Any]]:
    """Convenience for tests / Redis Stream payloads."""
    return [
        {
            "exchange": b.exchange,
            "symbol": b.symbol,
            "timeframe": b.timeframe,
            "ts": b.ts.isoformat(),
            "open": b.open,
            "high": b.high,
            "low": b.low,
            "close": b.close,
            "volume": b.volume,
        }
        for b in bars
    ]
