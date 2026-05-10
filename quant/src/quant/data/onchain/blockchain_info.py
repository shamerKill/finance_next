"""blockchain.info wrapper (Phase 8).

Endpoint: ``https://api.blockchain.info/stats``. No API key. Returns a
JSON object with ~30 BTC chain stats (hash rate, mempool size,
difficulty, total bitcoins, etc.).

Rate limit: ~1 req/sec (informal). Caller-side throttling lives in the
ingest cron, not here.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass
from datetime import UTC, datetime
from typing import Any

import httpx

log = logging.getLogger(__name__)


BLOCKCHAIN_INFO_URL = "https://api.blockchain.info/stats"


@dataclass(slots=True, frozen=True)
class OnchainPoint:
    """One on-chain metric observation."""

    source: str
    chain: str
    metric: str
    ts: datetime  # UTC, tz-aware
    value: float


# Subset of the JSON keys we publish as separate metrics. blockchain.info
# returns more than this; we keep the surface narrow because each new
# metric is one extra row per cron tick.
_METRIC_KEYS: dict[str, str] = {
    "hash_rate": "hash_rate",
    "n_btc_mined": "n_btc_mined",
    "totalbc": "total_btc",
    "difficulty": "difficulty",
    "n_tx": "n_tx",
    "mempool_size": "mempool_size",
    "trade_volume_btc": "trade_volume_btc",
    "trade_volume_usd": "trade_volume_usd",
    "market_price_usd": "market_price_usd",
}


class BlockchainInfoClient:
    """Read-only BTC chain stats via blockchain.info."""

    def __init__(self, http_client: httpx.AsyncClient | None = None) -> None:
        self._http = http_client or httpx.AsyncClient(timeout=30.0)

    async def aclose(self) -> None:
        if self._http is not None:
            await self._http.aclose()

    async def fetch_stats(self) -> dict[str, OnchainPoint]:
        """Return a dict of metric → OnchainPoint snapshot."""
        try:
            resp = await self._http.get(BLOCKCHAIN_INFO_URL)
            resp.raise_for_status()
            data = resp.json()
        except Exception as exc:  # noqa: BLE001
            log.warning("blockchain.info fetch failed: %s", exc)
            return {}
        ts = datetime.now(UTC)
        out: dict[str, OnchainPoint] = {}
        for key, metric in _METRIC_KEYS.items():
            raw = data.get(key)
            if raw is None:
                continue
            try:
                v = float(raw)
            except (TypeError, ValueError):
                continue
            out[metric] = OnchainPoint(
                source="blockchain_info", chain="btc", metric=metric, ts=ts, value=v
            )
        return out


def _map_keys() -> dict[str, str]:
    """Test-visible accessor for the published metric mapping."""
    return dict(_METRIC_KEYS)


def _decode_response(payload: dict[str, Any]) -> dict[str, OnchainPoint]:
    """Pure decoder used by tests; mirrors :meth:`fetch_stats` body."""
    ts = datetime.now(UTC)
    out: dict[str, OnchainPoint] = {}
    for key, metric in _METRIC_KEYS.items():
        raw = payload.get(key)
        if raw is None:
            continue
        try:
            v = float(raw)
        except (TypeError, ValueError):
            continue
        out[metric] = OnchainPoint(
            source="blockchain_info", chain="btc", metric=metric, ts=ts, value=v
        )
    return out
