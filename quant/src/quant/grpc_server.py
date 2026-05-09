"""gRPC server implementing the ``quant.v1.Quant`` service.

Phase 2 only wires up :rpc:`IngestNow`. The other RPCs return
``UNIMPLEMENTED`` so wire compatibility holds for the gateway client.
"""

from __future__ import annotations

import logging
from datetime import UTC, datetime
from typing import Any

import grpc
from google.protobuf import timestamp_pb2

# Generated stubs live in shared-proto/gen/python; they're added to PYTHONPATH
# in main.py. We import lazily so this module can still be imported in
# environments where the proto codegen isn't yet on disk (mostly tests with
# tighter import surfaces).
from quantpb.v1 import quant_pb2, quant_pb2_grpc  # type: ignore

from quant.workers.ingest import run_ingest

log = logging.getLogger(__name__)


def _ts_to_dt(ts: timestamp_pb2.Timestamp) -> datetime:
    """Convert google.protobuf.Timestamp into tz-aware UTC datetime."""
    return datetime.fromtimestamp(ts.seconds + ts.nanos / 1e9, tz=UTC)


def _dt_to_ts(dt: datetime) -> timestamp_pb2.Timestamp:
    out = timestamp_pb2.Timestamp()
    out.FromDatetime(dt.astimezone(UTC).replace(tzinfo=None))
    return out


class QuantServicer(quant_pb2_grpc.QuantServicer):  # type: ignore[misc]
    """Implements the Quant gRPC service.

    The ``redis_client`` is optional — when ``None`` we skip event emission
    instead of failing, which keeps unit tests simple.
    """

    def __init__(self, *, redis_client: Any | None = None) -> None:
        self._redis = redis_client

    async def IngestNow(  # noqa: N802 — proto-mandated method name
        self,
        request: quant_pb2.IngestRequest,
        context: grpc.aio.ServicerContext,
    ) -> quant_pb2.IngestAck:
        try:
            ack = await run_ingest(
                exchange=request.exchange,
                symbol=request.symbol,
                timeframe=request.timeframe,
                start=_ts_to_dt(request.start),
                end=_ts_to_dt(request.end),
                redis_client=self._redis,
            )
        except ValueError as exc:
            await context.abort(grpc.StatusCode.INVALID_ARGUMENT, str(exc))
            raise  # unreachable; satisfies type-checkers

        return quant_pb2.IngestAck(
            run_id=ack["run_id"],
            bars_ingested=ack["bars_ingested"],
            from_ts=_dt_to_ts(ack["from_ts"]),
            to_ts=_dt_to_ts(ack["to_ts"]),
        )

    async def RunBacktest(self, request, context):  # noqa: N802
        await context.abort(grpc.StatusCode.UNIMPLEMENTED, "Phase 3")

    async def GetBacktestStatus(self, request, context):  # noqa: N802
        await context.abort(grpc.StatusCode.UNIMPLEMENTED, "Phase 3")

    async def StartOptimization(self, request, context):  # noqa: N802
        await context.abort(grpc.StatusCode.UNIMPLEMENTED, "Phase 6")

    async def EvaluateSignal(self, request, context):  # noqa: N802
        await context.abort(grpc.StatusCode.UNIMPLEMENTED, "Phase 4")


async def serve(
    *,
    port: int,
    redis_client: Any | None = None,
) -> grpc.aio.Server:
    """Construct and start a gRPC server; returns it for graceful shutdown."""
    server = grpc.aio.server()
    quant_pb2_grpc.add_QuantServicer_to_server(  # type: ignore[attr-defined]
        QuantServicer(redis_client=redis_client),
        server,
    )
    server.add_insecure_port(f"[::]:{port}")
    await server.start()
    log.info("quant grpc listening on :%d", port)
    return server
