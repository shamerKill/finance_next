"""CryptoPanic wrapper (Phase 8).

Endpoint: ``https://cryptopanic.com/api/v1/posts/``. The free tier
allows public-token-less reads, but signed reads (with ``?auth_token=``)
get higher rate limits.

Env: ``CRYPTOPANIC_TOKEN`` (optional). When unset we still call the
endpoint without it; if the upstream returns 401/429 the call returns
an empty list with a warning rather than raising.

Rate limit: 1 req/sec / token (free tier informally).
"""

from __future__ import annotations

import logging
import os
from dataclasses import dataclass, field
from datetime import UTC, datetime
from typing import Any

import httpx

log = logging.getLogger(__name__)


CRYPTOPANIC_URL = "https://cryptopanic.com/api/v1/posts/"


@dataclass(slots=True)
class NewsItem:
    """One news article — Mongo / Timescale storage shape."""

    id: str
    source: str
    ts: datetime
    title: str
    url: str
    body: str = ""
    sentiment: float = 0.0
    symbols: list[str] = field(default_factory=list)


class CryptoPanicClient:
    ENV_VAR = "CRYPTOPANIC_TOKEN"

    def __init__(
        self,
        *,
        token: str | None = None,
        http_client: httpx.AsyncClient | None = None,
    ) -> None:
        # Optional auth token; free reads still work without it.
        self._token = token if token is not None else os.getenv(self.ENV_VAR, "").strip()
        self._http = http_client or httpx.AsyncClient(timeout=30.0)

    async def aclose(self) -> None:
        if self._http is not None:
            await self._http.aclose()

    async def fetch(
        self,
        currencies: list[str] | None = None,
        since: datetime | None = None,
    ) -> list[NewsItem]:
        """Return recent posts, filtered by currency tickers if provided.

        ``since`` is best-effort — the API doesn't accept a timestamp
        cursor, so we filter client-side after the call.
        """
        params: dict[str, Any] = {"public": "true"}
        if self._token:
            params["auth_token"] = self._token
        if currencies:
            params["currencies"] = ",".join(currencies)
        try:
            resp = await self._http.get(CRYPTOPANIC_URL, params=params)
            resp.raise_for_status()
            data = resp.json()
        except Exception as exc:  # noqa: BLE001
            log.warning("cryptopanic fetch failed: %s", exc)
            return []
        out: list[NewsItem] = []
        for row in (data.get("results") or [])[:200]:
            try:
                ts = datetime.fromisoformat(
                    str(row.get("published_at") or row.get("created_at")).replace(
                        "Z", "+00:00"
                    )
                )
                if ts.tzinfo is None:
                    ts = ts.replace(tzinfo=UTC)
                if since is not None and ts < since:
                    continue
                tickers = [
                    str(c.get("code", "")).upper()
                    for c in (row.get("currencies") or [])
                    if c.get("code")
                ]
                out.append(
                    NewsItem(
                        id=f"cryptopanic:{row.get('id')}",
                        source="cryptopanic",
                        ts=ts,
                        title=str(row.get("title") or ""),
                        url=str(row.get("url") or ""),
                        body="",
                        sentiment=0.0,
                        symbols=tickers,
                    )
                )
            except (KeyError, TypeError, ValueError) as exc:
                log.warning("cryptopanic row decode failed: %s", exc)
                continue
        return out
