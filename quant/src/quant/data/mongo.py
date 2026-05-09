"""Async Mongo client (motor) for the backtest_results head collection.

Phase 3 only writes the *head* doc here — the equity curve lives in
TimescaleDB. The collection name + indexes match what
``gateway/internal/store/mongo/backtest_repo.go`` reads, so both services
agree on the wire shape.

Lazy-init pattern mirrors :mod:`quant.data.timescale`.
"""

from __future__ import annotations

import logging
from typing import Any

log = logging.getLogger(__name__)

_client: Any | None = None
_db: Any | None = None


def init_client(uri: str, *, db_name: str | None = None) -> Any:
    """Construct the process-wide motor client + database handle."""
    global _client, _db
    if _client is not None and _db is not None:
        return _db

    # motor pulls in pymongo at import; we defer the import so unit tests
    # that don't touch Mongo can still import this module.
    from motor.motor_asyncio import AsyncIOMotorClient

    _client = AsyncIOMotorClient(uri)
    name = db_name or _database_from_uri(uri) or "finance"
    _db = _client[name]
    return _db


def get_db() -> Any:
    """Return the cached database handle or raise."""
    if _db is None:
        raise RuntimeError("mongo client not initialised; call init_client() first")
    return _db


async def close() -> None:
    global _client, _db
    if _client is not None:
        _client.close()
    _client = None
    _db = None


def set_db_for_test(db: Any) -> None:
    """Inject a (typically mongomock-style) handle for unit tests.

    Lets tests skip the motor import entirely.
    """
    global _db
    _db = db


def _database_from_uri(uri: str) -> str | None:
    """Extract the trailing /<db> from a Mongo URI; mirror the Go gateway."""
    if "?" in uri:
        uri = uri.split("?", 1)[0]
    if "//" not in uri:
        return None
    rest = uri.split("//", 1)[1]
    if "/" not in rest:
        return None
    return rest.split("/", 1)[1] or None


# Collection name matches gateway/internal/store/mongo/backtest_repo.go.
BACKTESTS_COLLECTION = "backtest_results"


def backtests() -> Any:
    """Convenience accessor for the backtest_results collection."""
    return get_db()[BACKTESTS_COLLECTION]
