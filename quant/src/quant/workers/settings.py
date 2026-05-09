"""Arq WorkerSettings.

Run with ``uv run arq quant.workers.settings.WorkerSettings``.
"""

from __future__ import annotations

import os

import redis.asyncio as aioredis
from arq.connections import RedisSettings

from quant.config import get_settings
from quant.data import mongo as mongo_data
from quant.data import timescale
from quant.workers.backtest import backtest_task
from quant.workers.ingest import ingest_task


async def startup(ctx: dict) -> None:
    """Open the asyncpg pool + Mongo + Redis clients once per worker process."""
    settings = get_settings()
    await timescale.init_pool(settings.timescale_dsn)
    ctx["timescale_pool"] = timescale.get_pool()

    # Mongo (Phase 3 backtest head doc writes). Optional in dev; if MONGODB_URI
    # is unset we leave ctx['mongo_db'] absent and the worker will fail loudly
    # on backtest tasks.
    mongo_uri = os.getenv("MONGODB_URI", "")
    if mongo_uri:
        ctx["mongo_db"] = mongo_data.init_client(mongo_uri)

    # Redis client for event publication (the Arq queue uses its own conn).
    ctx["redis"] = aioredis.from_url(settings.redis_url, decode_responses=True)


async def shutdown(ctx: dict) -> None:
    """Close pools on worker exit."""
    await timescale.close_pool()
    await mongo_data.close()
    redis_client = ctx.get("redis")
    if redis_client is not None:
        await redis_client.aclose()


class WorkerSettings:  # Arq picks up by name.
    functions = [ingest_task, backtest_task]
    on_startup = startup
    on_shutdown = shutdown

    @staticmethod
    def get_redis_settings() -> RedisSettings:
        # Lazy so import-time can complete without env set (e.g. in CI lint).
        return RedisSettings.from_dsn(get_settings().redis_url)

    redis_settings = property(lambda self: WorkerSettings.get_redis_settings())  # noqa: E501
