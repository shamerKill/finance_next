"""Polymarket CLOB REST client (orderbook / trades / price-history).

Endpoint: ``https://clob.polymarket.com``. Read paths require no auth;
write paths (POST /order) are handled by the gateway's signed-order
flow, NOT here.
"""

from __future__ import annotations

import logging
import os
from datetime import UTC, datetime
from typing import Any

import httpx

from quant.data.prediction.types import (
    Orderbook,
    OrderbookLevel,
    PricePoint,
    Trade,
)

log = logging.getLogger(__name__)

CLOB_URL_DEFAULT = "https://clob.polymarket.com"


def _parse_ts(value: Any) -> datetime:
    if isinstance(value, (int, float)):
        return datetime.fromtimestamp(float(value), tz=UTC)
    s = str(value).replace("Z", "+00:00")
    try:
        dt = datetime.fromisoformat(s)
    except ValueError:
        return datetime.now(tz=UTC)
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=UTC)
    return dt


class PolymarketCLOBClient:
    """Read-only client for the Polymarket CLOB REST API."""

    def __init__(
        self,
        *,
        base_url: str | None = None,
        http_client: httpx.AsyncClient | None = None,
    ) -> None:
        self._base_url = (base_url or os.getenv("POLYMARKET_CLOB_URL", "") or CLOB_URL_DEFAULT).rstrip("/")
        self._http = http_client or httpx.AsyncClient(timeout=30.0)

    async def aclose(self) -> None:
        await self._http.aclose()

    async def fetch_orderbook(self, token_id: str) -> Orderbook | None:
        """Fetch the current orderbook for one outcome token."""
        url = f"{self._base_url}/book"
        try:
            resp = await self._http.get(url, params={"token_id": token_id})
            resp.raise_for_status()
            data = resp.json()
        except Exception as exc:  # noqa: BLE001
            log.warning("polymarket clob fetch_orderbook failed: %s", exc)
            return None

        bids = [
            OrderbookLevel(price=float(b.get("price", 0)), size=float(b.get("size", 0)))
            for b in (data.get("bids") or [])
        ]
        asks = [
            OrderbookLevel(price=float(a.get("price", 0)), size=float(a.get("size", 0)))
            for a in (data.get("asks") or [])
        ]
        ts_raw = data.get("timestamp") or data.get("ts")
        ts = _parse_ts(ts_raw) if ts_raw else datetime.now(tz=UTC)
        return Orderbook(
            market_id=str(data.get("market") or ""),
            token_id=str(data.get("token_id") or token_id),
            ts=ts,
            bids=bids,
            asks=asks,
        )

    async def fetch_trades(self, token_id: str, limit: int = 100) -> list[Trade]:
        """Fetch recent trades for one outcome token (or whole market)."""
        url = f"{self._base_url}/trades"
        params = {"market": token_id, "limit": limit}
        try:
            resp = await self._http.get(url, params=params)
            resp.raise_for_status()
            data = resp.json()
        except Exception as exc:  # noqa: BLE001
            log.warning("polymarket clob fetch_trades failed: %s", exc)
            return []
        rows: list[dict[str, Any]]
        if isinstance(data, list):
            rows = data
        else:
            rows = data.get("data") or []
        out: list[Trade] = []
        for row in rows:
            try:
                out.append(
                    Trade(
                        id=str(row.get("id") or row.get("transaction_hash") or ""),
                        market_id=str(row.get("market") or ""),
                        token_id=str(row.get("asset_id") or row.get("token_id") or token_id),
                        ts=_parse_ts(row.get("match_time") or row.get("timestamp")),
                        side=str(row.get("side") or "").upper(),
                        price=float(row.get("price", 0)),
                        size=float(row.get("size", 0)),
                        tx_hash=str(row.get("transaction_hash") or ""),
                    )
                )
            except (KeyError, TypeError, ValueError) as exc:
                log.debug("polymarket clob trade decode: %s", exc)
                continue
        return out

    async def fetch_price_history(
        self,
        token_id: str,
        interval: str,
        start: datetime,
        end: datetime,
    ) -> list[PricePoint]:
        """Fetch historical mid-price for one outcome token."""
        url = f"{self._base_url}/prices-history"
        params = {
            "market": token_id,
            "interval": interval,
            "startTs": int(start.timestamp()),
            "endTs": int(end.timestamp()),
        }
        try:
            resp = await self._http.get(url, params=params)
            resp.raise_for_status()
            data = resp.json()
        except Exception as exc:  # noqa: BLE001
            log.warning("polymarket clob fetch_price_history failed: %s", exc)
            return []
        rows: list[dict[str, Any]]
        if isinstance(data, list):
            rows = data
        else:
            rows = data.get("history") or data.get("data") or []
        out: list[PricePoint] = []
        for row in rows:
            try:
                out.append(
                    PricePoint(
                        ts=_parse_ts(row.get("t") or row.get("timestamp")),
                        price=float(row.get("p") or row.get("price", 0)),
                    )
                )
            except (KeyError, TypeError, ValueError) as exc:
                log.debug("polymarket clob price-history decode: %s", exc)
                continue
        return out
