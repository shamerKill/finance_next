"""DefiLlama wrapper (Phase 8).

Endpoints
---------
* ``GET https://api.llama.fi/protocols`` — list of protocols + current TVL.
* ``GET https://api.llama.fi/tvl/{protocol}`` — current TVL for one
  protocol; cheaper than ``/protocols`` when only one is needed.

No API key. Rate limit is informally documented at "no limit but please
cache aggressively"; we still funnel calls through the daily/hourly
ingest cron rather than calling per-request.
"""

from __future__ import annotations

import logging
from datetime import UTC, datetime

import httpx

from quant.data.onchain.blockchain_info import OnchainPoint

log = logging.getLogger(__name__)


DEFILLAMA_BASE = "https://api.llama.fi"


class DefiLlamaClient:
    def __init__(self, http_client: httpx.AsyncClient | None = None) -> None:
        self._http = http_client or httpx.AsyncClient(timeout=30.0)

    async def aclose(self) -> None:
        if self._http is not None:
            await self._http.aclose()

    async def fetch_tvl(self, protocol: str | None = None) -> list[OnchainPoint]:
        """Return current TVL points.

        ``protocol=None`` fetches the full ``/protocols`` list and emits
        one row per protocol (chain="multi" for cross-chain protocols).
        """
        ts = datetime.now(UTC)
        if protocol:
            try:
                resp = await self._http.get(f"{DEFILLAMA_BASE}/tvl/{protocol}")
                resp.raise_for_status()
                # /tvl/{protocol} returns a bare number.
                value = float(resp.text.strip().strip('"'))
            except Exception as exc:  # noqa: BLE001
                log.warning("defillama tvl(%s) failed: %s", protocol, exc)
                return []
            return [
                OnchainPoint(
                    source="defillama",
                    chain="multi",
                    metric=f"tvl_usd:{protocol}",
                    ts=ts,
                    value=value,
                )
            ]

        try:
            resp = await self._http.get(f"{DEFILLAMA_BASE}/protocols")
            resp.raise_for_status()
            payload = resp.json()
        except Exception as exc:  # noqa: BLE001
            log.warning("defillama protocols failed: %s", exc)
            return []
        out: list[OnchainPoint] = []
        for row in payload or []:
            slug = str(row.get("slug") or row.get("name") or "").strip().lower()
            tvl = row.get("tvl")
            chain = str(row.get("chain") or "multi").lower() or "multi"
            if not slug or tvl is None:
                continue
            try:
                v = float(tvl)
            except (TypeError, ValueError):
                continue
            out.append(
                OnchainPoint(
                    source="defillama",
                    chain=chain,
                    metric=f"tvl_usd:{slug}",
                    ts=ts,
                    value=v,
                )
            )
        return out
