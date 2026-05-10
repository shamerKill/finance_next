"""Arq WorkerSettings.

Run with ``uv run arq quant.workers.settings.WorkerSettings``.
"""

from __future__ import annotations

import logging
import os

import redis.asyncio as aioredis
from arq.connections import RedisSettings
from arq.cron import cron

from quant.config import get_settings
from quant.data import mongo as mongo_data
from quant.data import timescale
from quant.workers.backtest import backtest_task
from quant.workers.extended_ingest import (
    daily_equities_cron,
    daily_macro_cron,
    hourly_news_cron,
    hourly_onchain_cron,
    ingest_equities,
    ingest_futures,
    ingest_macro,
    ingest_news,
    ingest_onchain,
)
from quant.workers.ingest import ingest_task
from quant.workers.optimize import daily_optimize_cron, optimize_task

log = logging.getLogger(__name__)


class CronParseError(ValueError):
    """Raised when ``AI_OPTIMIZATION_DAILY_CRON`` is set to a value we
    can't parse. Surfaced loudly so a typo in deploy config doesn't get
    silently swallowed and run the cron at the wrong wall-clock time
    (or at the default 02:00 UTC, which the operator may not expect).
    """


def _parse_cron(spec: str) -> dict[str, set[int]]:
    """Translate a tiny subset of crontab syntax into Arq's ``cron`` kwargs.

    Supports ``M H * * *`` only (no day-of-week / day-of-month / lists /
    ranges / steps) — we only need a daily schedule for the AI loop.

    Raises :class:`CronParseError` on any parse failure. The caller is
    expected to either propagate the error (preferred — so the worker
    fails to start with a clear message) or log + fall back explicitly.
    Returning ``None`` silently is a footgun: a typo would land you at
    02:00 UTC every day with no log line saying so.
    """
    parts = spec.strip().split()
    if len(parts) != 5:
        raise CronParseError(
            f"cron spec {spec!r}: expected 5 fields (M H * * *), got {len(parts)}"
        )
    minute, hour, dom, mon, dow = parts
    if dom != "*" or mon != "*" or dow != "*":
        raise CronParseError(
            f"cron spec {spec!r}: only daily 'M H * * *' is supported "
            "(no day-of-month, month, or day-of-week)"
        )
    try:
        m_int = int(minute)
        h_int = int(hour)
    except ValueError as exc:
        raise CronParseError(
            f"cron spec {spec!r}: minute/hour must be integers"
        ) from exc
    if not (0 <= m_int <= 59) or not (0 <= h_int <= 23):
        raise CronParseError(
            f"cron spec {spec!r}: minute must be 0-59 and hour 0-23"
        )
    return {"minute": {m_int}, "hour": {h_int}}


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

    # Phase 6: open an Arq pool reference so the cron entry can re-enqueue
    # per-strategy optimize tasks rather than running them inline.
    arq_url = os.getenv("ARQ_REDIS_URL", "") or settings.redis_url
    try:
        from arq import create_pool

        ctx["arq_pool"] = await create_pool(RedisSettings.from_dsn(arq_url))
    except Exception as exc:  # noqa: BLE001
        log.warning("arq pool init failed; cron will run optimize inline: %s", exc)


async def shutdown(ctx: dict) -> None:
    """Close pools on worker exit."""
    await timescale.close_pool()
    await mongo_data.close()
    redis_client = ctx.get("redis")
    if redis_client is not None:
        await redis_client.aclose()
    arq_pool = ctx.get("arq_pool")
    if arq_pool is not None:
        try:
            await arq_pool.aclose()
        except Exception:  # noqa: BLE001
            pass


def _cron_jobs() -> list:
    """Build the cron schedule list. Default: daily 02:00 UTC.

    Misconfiguration policy: we LOG.ERROR + fall back to the default
    02:00 UTC schedule on parse failure when the operator did NOT set
    the env (the default itself can't fail). When the operator
    explicitly sets ``AI_OPTIMIZATION_DAILY_CRON`` to a bad value, we
    raise — silently mis-scheduling the AI optimization loop because of
    a typo in deploy config has caused outages elsewhere in the codebase.
    """
    spec = os.getenv("AI_OPTIMIZATION_DAILY_CRON", "").strip()
    if not spec:
        kwargs = {"minute": {0}, "hour": {2}}
    else:
        try:
            kwargs = _parse_cron(spec)
        except CronParseError as exc:
            log.error(
                "AI_OPTIMIZATION_DAILY_CRON=%r is invalid: %s — refusing to "
                "silently fall back. Fix the env or unset it to use the "
                "02:00 UTC default.",
                spec,
                exc,
            )
            raise
    # Phase 8 cron: each schedule is intentionally simple (M H * * *) so
    # _parse_cron's strict validation covers them too. Dates in UTC.
    return [
        cron(
            daily_optimize_cron,
            name="daily_optimize_cron",
            run_at_startup=False,
            **kwargs,
        ),
        cron(
            daily_macro_cron,
            name="daily_macro_cron",
            run_at_startup=False,
            minute={30},
            hour={0},
        ),
        cron(
            daily_equities_cron,
            name="daily_equities_cron",
            run_at_startup=False,
            minute={0},
            hour={16},
        ),
        cron(
            hourly_onchain_cron,
            name="hourly_onchain_cron",
            run_at_startup=False,
            minute={5},
        ),
        cron(
            hourly_news_cron,
            name="hourly_news_cron",
            run_at_startup=False,
            minute={15},
        ),
    ]


class WorkerSettings:  # Arq picks up by name.
    functions = [
        ingest_task,
        backtest_task,
        optimize_task,
        # Phase 8 ad-hoc ingest tasks (admin POST endpoints enqueue these).
        ingest_equities,
        ingest_futures,
        ingest_macro,
        ingest_onchain,
        ingest_news,
    ]
    cron_jobs = _cron_jobs()
    on_startup = startup
    on_shutdown = shutdown

    @staticmethod
    def get_redis_settings() -> RedisSettings:
        # Lazy so import-time can complete without env set (e.g. in CI lint).
        return RedisSettings.from_dsn(get_settings().redis_url)

    redis_settings = property(lambda self: WorkerSettings.get_redis_settings())  # noqa: E501
