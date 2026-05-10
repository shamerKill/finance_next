"""Polymarket Gamma API client (market metadata).

Endpoint: ``https://gamma-api.polymarket.com``. No auth required for
read endpoints.

Tested offline via ``respx`` — no real network in pytest.
"""

from __future__ import annotations

import logging
import os
from datetime import UTC, datetime
from typing import Any

import httpx

from quant.data.prediction.types import PredictionMarket

log = logging.getLogger(__name__)

GAMMA_URL_DEFAULT = "https://gamma-api.polymarket.com"


def _parse_dt(value: Any) -> datetime | None:
    if not value:
        return None
    if isinstance(value, (int, float)):
        try:
            return datetime.fromtimestamp(float(value), tz=UTC)
        except (OSError, ValueError):
            return None
    s = str(value).replace("Z", "+00:00")
    try:
        dt = datetime.fromisoformat(s)
    except ValueError:
        return None
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=UTC)
    return dt


class PolymarketGammaClient:
    """Read-only client for the Polymarket Gamma API."""

    def __init__(
        self,
        *,
        base_url: str | None = None,
        http_client: httpx.AsyncClient | None = None,
    ) -> None:
        self._base_url = (base_url or os.getenv("POLYMARKET_GAMMA_URL", "") or GAMMA_URL_DEFAULT).rstrip("/")
        self._http = http_client or httpx.AsyncClient(timeout=30.0)

    async def aclose(self) -> None:
        await self._http.aclose()

    async def fetch_markets(
        self,
        *,
        active: bool | None = True,
        closed: bool | None = False,
        limit: int = 100,
        offset: int = 0,
    ) -> list[PredictionMarket]:
        """List markets, optionally filtered by active / closed flags."""
        params: dict[str, Any] = {"limit": limit, "offset": offset}
        if active is not None:
            params["active"] = "true" if active else "false"
        if closed is not None:
            params["closed"] = "true" if closed else "false"
        url = f"{self._base_url}/markets"
        try:
            resp = await self._http.get(url, params=params)
            resp.raise_for_status()
            data = resp.json()
        except Exception as exc:  # noqa: BLE001
            log.warning("polymarket gamma fetch_markets failed: %s", exc)
            return []
        # Gamma returns a list at the top level (legacy) OR a {markets:[...]}
        # envelope depending on the deployment. Tolerate both.
        rows: list[Any]
        if isinstance(data, list):
            rows = data
        else:
            rows = data.get("markets") or data.get("data") or []
        out: list[PredictionMarket] = []
        for row in rows:
            try:
                out.append(self._row_to_market(row))
            except (KeyError, TypeError, ValueError) as exc:
                log.debug("polymarket gamma row decode failed: %s", exc)
                continue
        return out

    async def fetch_market(self, market_id: str) -> PredictionMarket | None:
        """Fetch one market by id (condition_id or slug)."""
        url = f"{self._base_url}/markets/{market_id}"
        try:
            resp = await self._http.get(url)
            resp.raise_for_status()
            data = resp.json()
        except Exception as exc:  # noqa: BLE001
            log.warning("polymarket gamma fetch_market failed: %s", exc)
            return None
        if isinstance(data, list) and data:
            data = data[0]
        try:
            return self._row_to_market(data)
        except (KeyError, TypeError, ValueError) as exc:
            log.warning("polymarket gamma fetch_market decode failed: %s", exc)
            return None

    @staticmethod
    def _row_to_market(row: dict[str, Any]) -> PredictionMarket:
        market_id = str(row.get("id") or row.get("slug") or row.get("condition_id") or "")
        if not market_id:
            raise ValueError("missing market id / slug")
        tags_raw = row.get("tags") or []
        if isinstance(tags_raw, str):
            tags = [tags_raw]
        else:
            tags = [str(t) for t in tags_raw if t]
        # Token ids may be a JSON-encoded string (legacy) or a list.
        token_ids_raw = row.get("clobTokenIds") or row.get("token_ids") or []
        if isinstance(token_ids_raw, str):
            try:
                import json as _json

                token_ids = [str(t) for t in _json.loads(token_ids_raw)]
            except (ValueError, TypeError):
                token_ids = []
        else:
            token_ids = [str(t) for t in token_ids_raw]
        return PredictionMarket(
            source="polymarket",
            market_id=market_id,
            condition_id=str(row.get("conditionId") or row.get("condition_id") or ""),
            question=str(row.get("question") or row.get("name") or ""),
            end_date=_parse_dt(row.get("endDate") or row.get("end_date")),
            category=str(row.get("category") or ""),
            tags=tags,
            token_ids=token_ids,
        )
