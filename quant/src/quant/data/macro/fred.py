"""FRED API client (Phase 8).

Endpoint: ``https://api.stlouisfed.org/fred/series/observations``.
Free tier; key registration at https://fred.stlouisfed.org/docs/api/api_key.html.

Default series tracked
----------------------
* ``CPIAUCSL``  — US CPI, all items
* ``UNRATE``    — US unemployment rate
* ``FEDFUNDS``  — Effective federal funds rate (monthly average)
* ``DFF``       — Effective federal funds rate (daily)
* ``DGS10``     — 10-year Treasury constant maturity
* ``M2SL``      — M2 money stock

Rate limit: ~120 req/min on the free tier (per FRED's docs). We don't
share a process-wide bucket because in practice we only call this on
the daily-cron path — once per series, ~10 calls/day total.

Tests must use ``respx`` to mock the HTTPS endpoint; no real network
calls allowed.
"""

from __future__ import annotations

import logging
import os
from collections.abc import Iterable
from dataclasses import dataclass
from datetime import UTC, date, datetime
from typing import Any

import httpx

from quant.data.errors import ErrAPIKeyNotConfigured

log = logging.getLogger(__name__)


FRED_BASE_URL = "https://api.stlouisfed.org/fred/series/observations"

DEFAULT_FRED_SERIES: list[str] = [
    "CPIAUCSL",
    "UNRATE",
    "FEDFUNDS",
    "DFF",
    "DGS10",
    "M2SL",
]


@dataclass(slots=True, frozen=True)
class MacroPoint:
    """One macro observation."""

    source: str
    code: str
    ts: datetime  # UTC, tz-aware (anchored to start-of-day)
    value: float
    unit: str = ""


class FREDClient:
    """Async FRED observations client.

    Construction fails closed if ``FRED_API_KEY`` is unset. Pass an
    explicit ``http_client`` (typically a ``respx``-mocked
    :class:`httpx.AsyncClient`) in tests.
    """

    ENV_VAR = "FRED_API_KEY"

    def __init__(
        self,
        *,
        api_key: str | None = None,
        http_client: httpx.AsyncClient | None = None,
    ) -> None:
        key = api_key if api_key is not None else os.getenv(self.ENV_VAR, "").strip()
        if not key:
            raise ErrAPIKeyNotConfigured("fred", self.ENV_VAR)
        self._api_key = key
        self._http = http_client or httpx.AsyncClient(timeout=30.0)

    async def aclose(self) -> None:
        if self._http is not None:
            await self._http.aclose()

    async def fetch(
        self,
        series_id: str,
        start: date,
        end: date,
    ) -> list[MacroPoint]:
        """Return observations in ``[start, end]`` (FRED end is inclusive).

        FRED's missing-value sentinel is the literal string ``"."``; we
        skip those rows rather than emit ``NaN``.
        """
        params = {
            "series_id": series_id,
            "api_key": self._api_key,
            "file_type": "json",
            "observation_start": start.strftime("%Y-%m-%d"),
            "observation_end": end.strftime("%Y-%m-%d"),
        }
        try:
            resp = await self._http.get(FRED_BASE_URL, params=params)
            resp.raise_for_status()
            data = resp.json()
        except Exception as exc:  # noqa: BLE001
            log.warning("FRED fetch failed for %s: %s", series_id, exc)
            return []

        out: list[MacroPoint] = []
        for obs in data.get("observations") or []:
            value = obs.get("value")
            if value in (None, ".", ""):
                continue
            try:
                v = float(value)
            except (TypeError, ValueError):
                continue
            try:
                ts = datetime.strptime(obs["date"], "%Y-%m-%d").replace(tzinfo=UTC)
            except (KeyError, ValueError):
                continue
            out.append(MacroPoint(source="fred", code=series_id, ts=ts, value=v))
        return out

    async def fetch_default_series(
        self, start: date, end: date
    ) -> Iterable[MacroPoint]:
        """Convenience: fetch every entry in ``DEFAULT_FRED_SERIES``."""
        for code in DEFAULT_FRED_SERIES:
            for p in await self.fetch(code, start, end):
                yield p


def _to_jsonable_observation(obs: dict[str, Any]) -> dict[str, Any]:
    """Test helper — round-trip a FRED observation dict (kept as a
    public symbol so test fixtures can borrow it)."""
    return {"date": obs["date"], "value": obs["value"]}
