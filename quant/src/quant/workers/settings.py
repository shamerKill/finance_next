"""Arq WorkerSettings.

Run with ``uv run arq quant.workers.settings.WorkerSettings``.
"""

from __future__ import annotations

from arq.connections import RedisSettings

from quant.config import get_settings
from quant.data import timescale
from quant.workers.ingest import ingest_task


async def startup(ctx: dict) -> None:
    """Open the asyncpg pool once per worker process."""
    settings = get_settings()
    await timescale.init_pool(settings.timescale_dsn)
    ctx["timescale_pool"] = timescale.get_pool()


async def shutdown(ctx: dict) -> None:
    """Close the pool on worker exit."""
    await timescale.close_pool()


class WorkerSettings:  # Arq picks up by name.
    functions = [ingest_task]
    on_startup = startup
    on_shutdown = shutdown

    @staticmethod
    def get_redis_settings() -> RedisSettings:
        # Lazy so import-time can complete without env set (e.g. in CI lint).
        return RedisSettings.from_dsn(get_settings().redis_url)

    redis_settings = property(lambda self: WorkerSettings.get_redis_settings())  # noqa: E501
