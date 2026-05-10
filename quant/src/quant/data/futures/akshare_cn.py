"""AKShare wrapper for CN commodity / index futures (Phase 8).

Endpoints
---------
* ``ak.futures_zh_daily_sina(symbol="cu2412")`` — Sina-sourced daily
  bars for a single contract; returns full available history.
* ``ak.get_futures_daily(start_date, end_date, market="SHFE")`` — bulk
  exchange-wide daily snapshot, used for backfill of all live contracts.
  Optional v2 path; v1 only wires the per-contract endpoint.

Symbol convention: CN futures contract codes are exchange-prefixed
internally (lowercase metals/grains for SHFE/DCE/CZCE, uppercase for
CFFEX equity indices). Storage uses the bare contract id and tags
``exchange`` separately.

Failure mode: AKShare's futures endpoints break less often than the
equity ones but still scrape; we swallow exceptions to a logged
warning and return an empty list.
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


Exchange = Literal["shfe", "dce", "czce", "cffex"]


class AkshareCNFutures:
    """Daily futures OHLCV via AKShare."""

    def __init__(self, akshare_module: Any | None = None) -> None:
        if akshare_module is None:
            try:
                import akshare as akshare_module  # type: ignore
            except Exception:  # pragma: no cover
                akshare_module = None
        self._ak = akshare_module
        # Reuse the ashare bucket — same upstream rough cap.
        self._bucket = rate_registry.get("ashare")

    async def fetch_daily(
        self,
        contract: str,
        exchange: Exchange,
        start: date,
        end: date,
    ) -> list[OhlcvBar]:
        """Return daily bars for a single contract in ``[start, end)``."""
        if self._ak is None:
            log.warning("akshare not installed; skipping futures fetch %s", contract)
            return []

        await self._bucket.acquire()
        try:
            df = await asyncio.get_running_loop().run_in_executor(
                None, lambda: self._ak.futures_zh_daily_sina(symbol=contract)
            )
        except Exception as exc:  # noqa: BLE001
            log.warning("akshare futures fetch failed for %s: %s", contract, exc)
            return []

        bars = _normalize_to_bars(df, symbol=contract, timeframe="1d")
        start_dt = datetime(start.year, start.month, start.day, tzinfo=UTC)
        end_dt = datetime(end.year, end.month, end.day, tzinfo=UTC)
        out: list[OhlcvBar] = []
        for b in bars:
            if b.ts < start_dt or b.ts >= end_dt:
                continue
            out.append(
                OhlcvBar(
                    exchange=exchange,
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
