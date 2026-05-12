"""Process entrypoint: FastAPI healthz + gRPC server.

Run via ``uv run python -m quant.main``. The FastAPI app exposes only
``/healthz`` and ``/version`` for ops; all real work is on gRPC.
"""

from __future__ import annotations

import logging
import os
import sys
from contextlib import asynccontextmanager
from pathlib import Path

# Ensure the committed proto stubs are importable. ``shared-proto/gen/python``
# is added to PYTHONPATH so the stubs' top-level imports
# (``from quant.v1 import quant_pb2``) resolve.
_REPO_ROOT = Path(__file__).resolve().parents[3]
_PROTO_GEN = _REPO_ROOT / "shared-proto" / "gen" / "python"
if _PROTO_GEN.exists():
    sys.path.insert(0, str(_PROTO_GEN))

import redis.asyncio as aioredis  # noqa: E402
from fastapi import FastAPI, Response  # noqa: E402

from quant.config import get_settings  # noqa: E402
from quant.data import mongo as mongo_data  # noqa: E402
from quant.data import timescale  # noqa: E402
from quant.grpc_server import serve as serve_grpc  # noqa: E402
from quant.runtime import run_runtime  # noqa: E402
from quant.runtime.extended_consumer import (  # noqa: E402
    consume_loop as extended_consume_loop,
)

log = logging.getLogger("quant.main")


@asynccontextmanager
async def lifespan(app: FastAPI):
    settings = get_settings()
    # Initialize external clients up front so a misconfiguration surfaces
    # at startup, not on the first request.
    await timescale.init_pool(settings.timescale_dsn)
    redis_client = aioredis.from_url(settings.redis_url, decode_responses=True)

    # Mongo for Phase 3 backtest head docs. Optional in dev — if absent,
    # the RunBacktest RPC returns FAILED_PRECONDITION.
    mongo_uri = os.getenv("MONGODB_URI", "")
    mongo_db = None
    if mongo_uri:
        mongo_db = mongo_data.init_client(mongo_uri)

    # Phase 3: enqueue Arq jobs from the gRPC RPC. We open a redis-backed
    # Arq pool when ARQ_REDIS_URL is set; otherwise the gRPC server runs
    # backtests inline (single-process dev path).
    arq_pool = None
    arq_url = os.getenv("ARQ_REDIS_URL", "")
    if arq_url:
        from arq import create_pool
        from arq.connections import RedisSettings

        arq_pool = await create_pool(RedisSettings.from_dsn(arq_url))

    grpc_server = await serve_grpc(
        port=settings.grpc_port,
        redis_client=redis_client,
        mongo_db=mongo_db,
        arq_pool=arq_pool,
    )

    # Phase 4: long-lived strategy runtime that emits order commands to
    # Redis Stream `command.order.submit` based on signals computed off
    # the latest Timescale OHLCV. Runs only when both Mongo and a real
    # Timescale pool are available, AND `QUANT_RUNTIME_DISABLED` isn't set.
    runtime = None
    if mongo_db is not None:
        async def _ohlcv_fetcher(exchange: str, symbol: str, timeframe: str, n: int):  # noqa: E501
            return await timescale.query_recent_ohlcv(
                exchange=exchange, symbol=symbol, timeframe=timeframe, limit=n
            )

        poll = float(os.getenv("QUANT_RUNTIME_POLL_SEC", "60"))
        runtime = await run_runtime(
            mongo_db=mongo_db,
            redis_client=redis_client,
            ohlcv_fetcher=_ohlcv_fetcher,
            poll_interval=poll,
        )

    # Phase 8: extended-data ingest consumer. Reads admin XADDs from
    # ``command.ingest.<kind>`` Redis Streams and dispatches to the
    # corresponding ``run_*_ingest`` worker function. The cron schedule
    # in ``quant.workers.settings`` is the load-bearing periodic path;
    # this consumer is the *interactive* path that backs the gateway's
    # ``POST /api/v1/admin/ingest/<kind>`` endpoints. We auto-start it
    # alongside the strategy runtime so the admin endpoint isn't
    # silently buffering into a queue with no reader. Disable via
    # ``EXTENDED_CONSUMER_DISABLED=true`` (mirrors ``QUANT_RUNTIME_DISABLED``).
    extended_task = None
    if os.getenv("EXTENDED_CONSUMER_DISABLED", "").strip().lower() not in {
        "1",
        "true",
        "yes",
        "on",
    }:
        import asyncio  # noqa: PLC0415

        extended_task = asyncio.create_task(
            extended_consume_loop(redis_client),
            name="phase8-extended-consumer",
        )

    app.state.redis = redis_client
    app.state.grpc_server = grpc_server
    app.state.arq_pool = arq_pool
    app.state.runtime = runtime
    app.state.extended_consumer_task = extended_task
    try:
        yield
    finally:
        if extended_task is not None:
            extended_task.cancel()
            try:
                await extended_task
            except BaseException:  # noqa: BLE001
                pass
        if runtime is not None:
            await runtime.stop()
        await grpc_server.stop(grace=2.0)
        if arq_pool is not None:
            await arq_pool.aclose()
        await mongo_data.close()
        await redis_client.aclose()
        await timescale.close_pool()


def create_app() -> FastAPI:
    app = FastAPI(title="finance_next quant", lifespan=lifespan)

    @app.get("/healthz")
    async def healthz() -> dict[str, str]:  # noqa: D401
        return {"status": "ok"}

    @app.get("/version")
    async def version() -> dict[str, str]:
        from quant import __version__

        return {"version": __version__}

    @app.get("/readyz")
    async def readyz(response: Response) -> dict:
        """Readiness probe — checks downstream deps.

        Unlike /healthz (liveness, always 200), /readyz returns 503 when
        any dep fails so docker-compose / k8s can keep the gateway out
        of rotation while quant is still warming up. Each probe is
        2 s-bounded; an entire unresponsive stack returns within ~6 s.

        Mongo is optional in dev — when MONGODB_URI is unset the dep
        reports `disabled` and does not block readiness.
        """
        import asyncio  # noqa: PLC0415

        deps: dict[str, dict] = {}
        any_failed = False

        # Timescale: SELECT 1 via the pool.
        ts_state: dict
        try:
            async with asyncio.timeout(2.0):
                pool = timescale.get_pool()
                async with pool.acquire() as conn:
                    await conn.execute("SELECT 1")
            ts_state = {"status": "ok"}
        except Exception as exc:  # noqa: BLE001
            ts_state = {"status": "error", "err": str(exc)[:200]}
            any_failed = True
        deps["timescale"] = ts_state

        # Redis: PING via the lifespan-attached client.
        redis_state: dict
        try:
            client = getattr(app.state, "redis", None)
            if client is None:
                redis_state = {"status": "disabled"}
            else:
                async with asyncio.timeout(2.0):
                    await client.ping()
                redis_state = {"status": "ok"}
        except Exception as exc:  # noqa: BLE001
            redis_state = {"status": "error", "err": str(exc)[:200]}
            any_failed = True
        deps["redis"] = redis_state

        # Mongo: optional. Probe only if MONGODB_URI was set at boot
        # (the lifespan binds the client lazily under that env var).
        mongo_state: dict
        if not os.getenv("MONGODB_URI"):
            mongo_state = {"status": "disabled"}
        else:
            try:
                async with asyncio.timeout(2.0):
                    db = mongo_data.get_db()
                    if db is None:
                        raise RuntimeError("mongo client not initialised")
                    await db.command("ping")
                mongo_state = {"status": "ok"}
            except Exception as exc:  # noqa: BLE001
                mongo_state = {"status": "error", "err": str(exc)[:200]}
                any_failed = True
        deps["mongo"] = mongo_state

        if any_failed:
            response.status_code = 503
            return {"status": "not_ready", "deps": deps}
        return {"status": "ready", "deps": deps}

    return app


app = create_app()


def main() -> None:
    """Console entrypoint used by ``python -m quant.main``."""
    import uvicorn

    settings = get_settings()
    log_level = os.getenv("LOG_LEVEL", "info")
    uvicorn.run(
        "quant.main:app",
        host="0.0.0.0",
        port=settings.http_port,
        log_level=log_level,
    )


if __name__ == "__main__":
    main()
