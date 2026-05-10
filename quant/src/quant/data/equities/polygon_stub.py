"""Polygon.io stock OHLCV stub (Phase 8).

Polygon is a paid source. We keep the class here as a placeholder so the
module surface is stable when the operator pays for the SDK key — at
that point the swap is roughly:

    pip install polygon-api-client
    # 1. Replace `__init__` body with:
    #     self._client = RESTClient(api_key=api_key)
    # 2. Implement fetch() with self._client.get_aggs(...)

Until then, every code path raises :class:`ErrAPIKeyNotConfigured` so we
fail closed instead of silently returning empty bars.

Env: ``POLYGON_API_KEY``.
"""

from __future__ import annotations

import os

from quant.data.errors import ErrAPIKeyNotConfigured


class PolygonStockStub:
    ENV_VAR = "POLYGON_API_KEY"

    def __init__(self) -> None:
        api_key = os.getenv(self.ENV_VAR, "").strip()
        if not api_key:
            raise ErrAPIKeyNotConfigured("polygon", self.ENV_VAR)
        # Keep but never use; once SDK lands, this is where the real
        # client construction happens.
        self._api_key = api_key

    async def fetch(self, *_, **__):  # pragma: no cover — stub
        raise ErrAPIKeyNotConfigured("polygon", self.ENV_VAR)
