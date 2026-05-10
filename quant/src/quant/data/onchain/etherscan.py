"""Etherscan wrapper (Phase 8).

Endpoints used (free tier; ``ETHERSCAN_API_KEY`` required)
----------------------------------------------------------
* ``?module=stats&action=ethsupply``  — total ETH supply (wei).
* ``?module=gastracker&action=gasoracle`` — current gas oracle prices.

Free tier rate limit: ~5 req/sec. We don't share a process-wide bucket
because the cron only calls this hourly.
"""

from __future__ import annotations

import logging
import os
from datetime import UTC, datetime

import httpx

from quant.data.errors import ErrAPIKeyNotConfigured
from quant.data.onchain.blockchain_info import OnchainPoint

log = logging.getLogger(__name__)


ETHERSCAN_BASE = "https://api.etherscan.io/api"


class EtherscanClient:
    ENV_VAR = "ETHERSCAN_API_KEY"

    def __init__(
        self,
        *,
        api_key: str | None = None,
        http_client: httpx.AsyncClient | None = None,
    ) -> None:
        key = api_key if api_key is not None else os.getenv(self.ENV_VAR, "").strip()
        if not key:
            raise ErrAPIKeyNotConfigured("etherscan", self.ENV_VAR)
        self._key = key
        self._http = http_client or httpx.AsyncClient(timeout=30.0)

    async def aclose(self) -> None:
        if self._http is not None:
            await self._http.aclose()

    async def _get(self, params: dict[str, str]) -> dict | None:
        params = {**params, "apikey": self._key}
        try:
            resp = await self._http.get(ETHERSCAN_BASE, params=params)
            resp.raise_for_status()
            data = resp.json()
        except Exception as exc:  # noqa: BLE001
            log.warning("etherscan get failed (%s): %s", params.get("action"), exc)
            return None
        if str(data.get("status")) == "0":
            log.warning("etherscan error (%s): %s", params.get("action"), data.get("message"))
            return None
        return data

    async def fetch_eth_supply(self) -> OnchainPoint | None:
        """Return current ETH supply (in ETH, not wei)."""
        data = await self._get({"module": "stats", "action": "ethsupply"})
        if data is None:
            return None
        try:
            wei = int(data["result"])
        except (KeyError, TypeError, ValueError):
            return None
        return OnchainPoint(
            source="etherscan",
            chain="eth",
            metric="eth_supply",
            ts=datetime.now(UTC),
            value=float(wei) / 1e18,
        )

    async def fetch_gas_price(self) -> dict[str, OnchainPoint]:
        """Return current gas oracle ``{safe,propose,fast}`` prices in gwei."""
        data = await self._get({"module": "gastracker", "action": "gasoracle"})
        if data is None:
            return {}
        result = data.get("result") or {}
        ts = datetime.now(UTC)
        out: dict[str, OnchainPoint] = {}
        for key, metric in (
            ("SafeGasPrice", "gas_safe_gwei"),
            ("ProposeGasPrice", "gas_propose_gwei"),
            ("FastGasPrice", "gas_fast_gwei"),
        ):
            raw = result.get(key)
            if raw is None:
                continue
            try:
                v = float(raw)
            except (TypeError, ValueError):
                continue
            out[metric] = OnchainPoint(
                source="etherscan", chain="eth", metric=metric, ts=ts, value=v
            )
        return out
