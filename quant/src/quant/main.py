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
from fastapi import FastAPI  # noqa: E402

from quant.config import get_settings  # noqa: E402
from quant.data import timescale  # noqa: E402
from quant.grpc_server import serve as serve_grpc  # noqa: E402

log = logging.getLogger("quant.main")


@asynccontextmanager
async def lifespan(app: FastAPI):
    settings = get_settings()
    # Initialize external clients up front so a misconfiguration surfaces
    # at startup, not on the first request.
    await timescale.init_pool(settings.timescale_dsn)
    redis_client = aioredis.from_url(settings.redis_url, decode_responses=True)
    grpc_server = await serve_grpc(port=settings.grpc_port, redis_client=redis_client)

    app.state.redis = redis_client
    app.state.grpc_server = grpc_server
    try:
        yield
    finally:
        await grpc_server.stop(grace=2.0)
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
