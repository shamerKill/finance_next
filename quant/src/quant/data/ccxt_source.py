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
    """Async ccxt wrapper covering Binance / OKX / Bybit.

    Binance is special-cased: we try USDM-margined futures first (where the
    project's order engine actually executes) and fall back to the spot
    exchange when ccxt returns ``BadSymbol``. That covers pairs like
    USDCUSDT that only exist on spot — ingestion succeeds so the user can
    backtest them, even though live trading would still fail at the
    order-engine layer (a separate, clearer error).
    """

    # Primary mapping of our short exchange ids to ccxt class names.
    _CCXT_CLASS = {
        "binance": "binanceusdm",  # USDT-M futures (primary)
        "okx": "okx",
        "bybit": "bybit",
    }
    # Per-exchange fallback chain used when the primary class reports a
    # BadSymbol for the requested symbol. Only Binance has one today
    # (spot covers the long tail of USDC- and FDUSD-quoted pairs).
    _CCXT_FALLBACK = {
        "binance": ["binance"],  # spot
    }

    def __init__(self, exchange: str, *, ccxt_module: Any = None) -> None:
        self.exchange = exchange.lower()
        if self.exchange not in self._CCXT_CLASS:
            raise ValueError(f"unsupported ccxt exchange: {exchange}")

        # ccxt_module is an injection seam for tests.
        module = ccxt_module if ccxt_module is not None else ccxt_async
        if module is None:
            raise RuntimeError("ccxt is not installed; cannot construct CcxtSource")
        self._module = module

        # Construct the primary client. Fallback clients are lazy — they're
        # only built when BadSymbol fires, so the common path stays cheap.
        self._client = self._make_client(self._CCXT_CLASS[self.exchange])
        self._fallbacks_built: dict[str, Any] = {}
        self._bucket = rate_registry.get(self.exchange)

    def _make_client(self, ccxt_class_name: str) -> Any:
        cls = getattr(self._module, ccxt_class_name)
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
        return cls(cfg)

    def _fallback_clients(self) -> list[tuple[str, Any]]:
        """Lazily build fallback clients on first need.

        Returns [(ccxt_class_name, client), ...] in fallback order.
        """
        out: list[tuple[str, Any]] = []
        for name in self._CCXT_FALLBACK.get(self.exchange, []):
            if name not in self._fallbacks_built:
                self._fallbacks_built[name] = self._make_client(name)
            out.append((name, self._fallbacks_built[name]))
        return out

    async def close(self) -> None:
        """Release the underlying ccxt session(s) (essential for long runs)."""
        # Close any lazily-built fallback clients first so we don't leak
        # aiohttp sessions when a fallback was activated.
        for c in self._fallbacks_built.values():
            if hasattr(c, "close"):
                try:
                    await c.close()
                except Exception:  # noqa: BLE001
                    pass
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

        BadSymbol on the primary client (USDM futures for binance) triggers
        a single rebuild against the spot fallback class — pairs like
        USDCUSDT that don't exist on USDM still ingest from spot.

        Before any fetch we **load_markets() and verify the symbol exists
        in the cached catalog**. Binance's spot kline endpoint has been
        observed to URL-encode non-ASCII symbols and return klines for
        whatever symbol the encoded bytes happened to match — silently
        storing wrong-pair data. Validating against load_markets() makes
        BadSymbol fire deterministically before we ingest junk.
        """
        if timeframe not in _TIMEFRAME_SECONDS:
            raise ValueError(f"unsupported timeframe: {timeframe}")
        if start >= end:
            return []

        # Lazy ccxt import so the error class is available without forcing
        # the module at construction time (tests still inject fakes).
        from ccxt.base.errors import BadSymbol  # type: ignore[import-not-found]

        async def ensure_symbol(c: Any) -> bool:
            """Return True iff the symbol is present in c's market catalog.

            ccxt keys ``client.markets`` by **unified** symbol (e.g.
            ``BTC/USDT:USDT``) and ``client.markets_by_id`` by **native**
            id (e.g. ``BTCUSDT``). Users typically pass the native form,
            so accept either. Also try a unified-canonical variant the
            project's `quant.data.symbols` module would produce, to keep
            consistency with the orderengine path.
            """
            try:
                if not getattr(c, "markets", None):
                    await c.load_markets()
            except Exception:  # noqa: BLE001 — let the actual fetch raise meaningfully
                return True  # be generous: if load_markets fails (rate limit etc),
                # don't preemptively reject; the fetch will surface the real error
            markets = getattr(c, "markets", None) or {}
            if symbol in markets:
                return True
            markets_by_id = getattr(c, "markets_by_id", None) or {}
            # markets_by_id values can be a list (when multiple unified
            # symbols share an id, e.g. spot vs futures on some venues);
            # presence under any form is enough.
            if symbol in markets_by_id:
                return True
            # Last-ditch: case-insensitive native-id scan.
            upper = symbol.upper()
            for native_id in markets_by_id.keys():
                if isinstance(native_id, str) and native_id.upper() == upper:
                    return True
            return False

        start_ms = int(start.timestamp() * 1000)
        end_ms = int(end.timestamp() * 1000)
        timeframe_ms = _TIMEFRAME_SECONDS[timeframe] * 1000

        bars: list[OhlcvBar] = []
        cursor = start_ms
        client = self._client
        active_class = self._CCXT_CLASS[self.exchange]

        # Pre-validate against the primary; if absent, rotate to fallback
        # *before* attempting any fetch. Anchors deterministic BadSymbol.
        if not await ensure_symbol(client):
            rotated = False
            for fb_name, fb_client in self._fallback_clients():
                if await ensure_symbol(fb_client):
                    client = fb_client
                    active_class = fb_name
                    rotated = True
                    break
            if not rotated:
                raise BadSymbol(
                    f"{self.exchange}: symbol {symbol!r} not present in any "
                    f"venue catalog (USDM futures, spot). Check spelling."
                )

        while cursor < end_ms:
            await self._bucket.acquire()
            try:
                page = await client.fetch_ohlcv(
                    symbol, timeframe=timeframe, since=cursor, limit=chunk_limit
                )
            except Exception as exc:  # noqa: BLE001
                if (
                    type(exc).__name__ == "BadSymbol"
                    and active_class == self._CCXT_CLASS[self.exchange]
                ):
                    # First-fetch BadSymbol on the primary — rotate to the
                    # first fallback class (spot for binance) and retry the
                    # same window. Only rotate once; if every fallback also
                    # BadSymbols, let the final exception propagate to the
                    # caller (gateway translates it to a 400).
                    rotated = False
                    for fb_name, fb_client in self._fallback_clients():
                        try:
                            page = await fb_client.fetch_ohlcv(
                                symbol,
                                timeframe=timeframe,
                                since=cursor,
                                limit=chunk_limit,
                            )
                            client = fb_client
                            active_class = fb_name
                            rotated = True
                            break
                        except Exception:  # noqa: BLE001
                            continue
                    if not rotated:
                        raise
                else:
                    raise
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
