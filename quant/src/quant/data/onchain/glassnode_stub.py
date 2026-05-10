"""Glassnode stub (Phase 8 — paid).

Glassnode is a paid on-chain analytics provider. Without the SDK we
can't responsibly proxy. This stub keeps the namespace stable so
operators can swap to the real client by:

    pip install glassnode-sdk            # hypothetical — confirm name
    # 1. Replace this class body to construct a `GlassnodeClient(api_key)`.
    # 2. Implement `fetch_metric` against the v1 metrics REST API.

Until then, every call raises :class:`ErrAPIKeyNotConfigured`.

Env: ``GLASSNODE_API_KEY``.
"""

from __future__ import annotations

import os

from quant.data.errors import ErrAPIKeyNotConfigured


class GlassnodeStub:
    ENV_VAR = "GLASSNODE_API_KEY"

    def __init__(self) -> None:
        api_key = os.getenv(self.ENV_VAR, "").strip()
        if not api_key:
            raise ErrAPIKeyNotConfigured("glassnode", self.ENV_VAR)
        self._api_key = api_key

    async def fetch_metric(self, *_, **__):  # pragma: no cover — stub
        raise ErrAPIKeyNotConfigured("glassnode", self.ENV_VAR)
