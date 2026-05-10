"""Polymarket WebSocket subscriber.

Phase 9 wires a real `websockets`-backed default `connect_factory` AND
keeps the seam so unit tests can inject a fake yielding queued
messages (no network I/O leaves the test process).

Polymarket's market-data WS endpoint:
    wss://ws-subscriptions-clob.polymarket.com/ws/market

Subscribe message shape (per Polymarket spec):
    {"type": "Market", "assets_ids": ["<token_id_1>", ...]}

The subscriber is intentionally minimal — it forwards every JSON frame
the server sends. Order-book reconstruction (apply deltas, prune stale
levels) is the caller's responsibility.

NB: reconnection is NOT built in here — intentionally — so retry
policy stays composable. On any I/O failure the generator surfaces the
exception to the caller.
"""

from __future__ import annotations

import json
import logging
from collections.abc import AsyncIterator, Awaitable, Callable
from typing import Any

log = logging.getLogger(__name__)

WS_URL_DEFAULT = "wss://ws-subscriptions-clob.polymarket.com/ws/market"


async def _default_connect(url: str) -> Any:
    """Default production connect factory backed by `websockets`.

    Imports are lazy so unrelated modules don't pay the ``websockets``
    import cost. Tests inject their own factory and never hit this.
    """
    try:
        import websockets  # type: ignore[import-not-found]
    except ImportError as exc:  # pragma: no cover — install-time error
        raise RuntimeError(
            "polymarket ws: `websockets` package not installed; "
            "add it to quant/pyproject.toml dependencies"
        ) from exc
    return await websockets.connect(url)


class PolymarketWS:
    """Minimal Polymarket market-data WS client.

    Parameters
    ----------
    url:
        Override the WS endpoint. Defaults to the public mainnet URL.
    connect_factory:
        ``async def factory(url) -> conn`` returning an object that
        supports ``await conn.send(str)`` and ``async for raw in conn``.
        ``None`` selects the production default backed by ``websockets``.
    """

    def __init__(
        self,
        *,
        url: str | None = None,
        connect_factory: Callable[[str], Awaitable[Any]] | None = None,
    ) -> None:
        self._url = url or WS_URL_DEFAULT
        self._connect_factory = connect_factory or _default_connect

    async def subscribe(self, asset_ids: list[str]) -> AsyncIterator[dict[str, Any]]:
        """Subscribe to live ``Market`` channel updates for the given assets.

        Yields decoded JSON message dicts. Caller validates message shape.
        """
        ws = await self._connect_factory(self._url)
        # Per Polymarket spec the subscribe envelope uses ``assets_ids``
        # (note the plural prefix — the typo is server-side).
        sub = {"type": "Market", "assets_ids": asset_ids}
        await ws.send(json.dumps(sub))
        async for raw in ws:
            try:
                yield json.loads(raw)
            except json.JSONDecodeError:
                log.debug("polymarket ws: skipping non-JSON frame: %r", raw)
                continue
