"""Nansen stub (Phase 8 — paid).

Nansen is a paid on-chain wallet-labelling / smart-money tracking
provider. Same swap pattern as :mod:`quant.data.onchain.glassnode_stub`.

Env: ``NANSEN_API_KEY``.
"""

from __future__ import annotations

import os

from quant.data.errors import ErrAPIKeyNotConfigured


class NansenStub:
    ENV_VAR = "NANSEN_API_KEY"

    def __init__(self) -> None:
        api_key = os.getenv(self.ENV_VAR, "").strip()
        if not api_key:
            raise ErrAPIKeyNotConfigured("nansen", self.ENV_VAR)
        self._api_key = api_key

    async def fetch(self, *_, **__):  # pragma: no cover — stub
        raise ErrAPIKeyNotConfigured("nansen", self.ENV_VAR)
