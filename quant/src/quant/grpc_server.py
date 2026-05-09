"""gRPC server implementing the ``quantpb.v1.Quant`` service.

Phase 2 wired ``IngestNow``. Phase 3 adds ``RunBacktest``,
``GetBacktestStatus`` and ``StreamBacktestProgress``. The remaining
RPCs (``StartOptimization``, ``EvaluateSignal``) stay as ``UNIMPLEMENTED``
until phases 6 and 4 respectively.
"""

from __future__ import annotations

import asyncio
import json
import logging
from datetime import UTC, datetime
from typing import Any

import grpc
from google.protobuf import struct_pb2, timestamp_pb2

# Generated stubs live in shared-proto/gen/python; they're added to PYTHONPATH
# in main.py / conftest.py.
from quantpb.v1 import quant_pb2, quant_pb2_grpc  # type: ignore

from quant.events.redis_stream import BACKTEST_PROGRESS_STREAM
from quant.workers.backtest import (
    STATE_COMPLETED,
    STATE_FAILED,
    STATE_PENDING,
    STATE_RUNNING,
    create_pending_doc,
    new_run_id,
    run_backtest_task,
)
from quant.workers.ingest import run_ingest

log = logging.getLogger(__name__)


def _ts_to_dt(ts: timestamp_pb2.Timestamp) -> datetime:
    """Convert google.protobuf.Timestamp into tz-aware UTC datetime."""
    return datetime.fromtimestamp(ts.seconds + ts.nanos / 1e9, tz=UTC)


def _dt_to_ts(dt: datetime) -> timestamp_pb2.Timestamp:
    out = timestamp_pb2.Timestamp()
    out.FromDatetime(dt.astimezone(UTC).replace(tzinfo=None))
    return out


def _struct_to_dict(s: struct_pb2.Struct) -> dict[str, Any]:
    """Decode a Struct into a plain dict via JSON."""
    if s is None:
        return {}
    # The Struct.Format_dict-style helpers don't always handle nested
    # ListValue; bouncing through json is robust.
    from google.protobuf.json_format import MessageToDict

    return MessageToDict(s, preserving_proto_field_name=True) or {}


def _backtest_request_to_dict(req: quant_pb2.BacktestRequest) -> dict[str, Any]:
    """Translate a BacktestRequest into the dict shape the worker expects."""
    return {
        "strategy_id": req.strategy_id,
        "kind": req.kind or "grid_dca",
        "params": _struct_to_dict(req.params) if req.HasField("params") else {},
        "exchange": req.exchange,
        "symbol": req.symbol,
        "timeframe": req.timeframe,
        "start": _ts_to_dt(req.start),
        "end": _ts_to_dt(req.end),
        "initial_capital": req.initial_capital,
        "commission_rate": req.commission_rate,
        "slippage_bps": req.slippage_bps,
    }


class QuantServicer(quant_pb2_grpc.QuantServicer):  # type: ignore[misc]
    """Implements the Quant gRPC service.

    All long-lived dependencies (Redis client, Mongo handle, Arq pool) are
    optional and injected — when ``None`` the corresponding behavior is
    short-circuited (handy for unit tests).
    """

    def __init__(
        self,
        *,
        redis_client: Any | None = None,
        mongo_db: Any | None = None,
        arq_pool: Any | None = None,
    ) -> None:
        self._redis = redis_client
        self._mongo = mongo_db
        self._arq = arq_pool

    # ------------------------------------------------------------------
    # Phase 2 — IngestNow
    # ------------------------------------------------------------------

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

    # ------------------------------------------------------------------
    # Phase 3 — Backtest
    # ------------------------------------------------------------------

    async def RunBacktest(  # noqa: N802
        self,
        request: quant_pb2.BacktestRequest,
        context: grpc.aio.ServicerContext,
    ) -> quant_pb2.BacktestHandle:
        if not request.strategy_id:
            await context.abort(grpc.StatusCode.INVALID_ARGUMENT, "strategy_id required")
        if self._mongo is None:
            await context.abort(
                grpc.StatusCode.FAILED_PRECONDITION, "mongo not configured for backtests"
            )

        run_id = new_run_id()
        request_dict = _backtest_request_to_dict(request)
        # Mongo can't store python datetime via JSON encode — keep dt objects.
        await create_pending_doc(self._mongo, run_id=run_id, request=_serializable(request_dict))

        if self._arq is not None:
            # Production path: enqueue Arq job; the worker runs it.
            await self._arq.enqueue_job("backtest_task", run_id, _serializable(request_dict))
        else:
            # Dev / test path: run inline so single-process bring-up works
            # without an Arq worker. Caller still gets the handle synchronously.
            asyncio.ensure_future(
                run_backtest_task(
                    {},
                    run_id,
                    request_dict,
                    mongo_db=self._mongo,
                    redis_client=self._redis,
                )
            )

        return quant_pb2.BacktestHandle(
            run_id=run_id,
            enqueued_at=_dt_to_ts(datetime.now(UTC)),
        )

    async def GetBacktestStatus(  # noqa: N802
        self,
        request: quant_pb2.GetBacktestStatusRequest,
        context: grpc.aio.ServicerContext,
    ) -> quant_pb2.BacktestStatus:
        if self._mongo is None:
            await context.abort(
                grpc.StatusCode.FAILED_PRECONDITION, "mongo not configured for backtests"
            )
        doc = await self._mongo["backtest_results"].find_one({"_id": request.run_id})
        if doc is None:
            await context.abort(grpc.StatusCode.NOT_FOUND, "backtest run not found")

        status = quant_pb2.BacktestStatus(
            run_id=request.run_id,
            state=int(doc.get("state", STATE_PENDING)),
            progress=float(doc.get("progress", 0.0)),
            error_message=str(doc.get("error", "")),
        )
        for k, v in (doc.get("metrics") or {}).items():
            try:
                status.metrics[k] = float(v)
            except (TypeError, ValueError):
                continue
        if doc.get("startedAt"):
            status.started_at.CopyFrom(_dt_to_ts(doc["startedAt"]))
        if doc.get("finishedAt"):
            status.finished_at.CopyFrom(_dt_to_ts(doc["finishedAt"]))
        return status

    async def StreamBacktestProgress(  # noqa: N802
        self,
        request: quant_pb2.GetBacktestStatusRequest,
        context: grpc.aio.ServicerContext,
    ):
        """Server-streaming progress until terminal state.

        Implementation reads the Redis Stream ``event.backtest.progress``
        from ``$`` (only new entries) and filters by run_id. Terminates on
        COMPLETED / FAILED.
        """
        if self._redis is None:
            await context.abort(
                grpc.StatusCode.FAILED_PRECONDITION, "redis not configured for streaming"
            )
        last_id = "$"
        while True:
            try:
                resp = await self._redis.xread(
                    {BACKTEST_PROGRESS_STREAM: last_id}, count=16, block=2000
                )
            except Exception as exc:  # noqa: BLE001
                log.warning("xread failed: %s", exc)
                await asyncio.sleep(1.0)
                continue
            if not resp:
                continue
            for _stream, entries in resp:
                for entry_id, fields in entries:
                    last_id = entry_id
                    raw = fields.get("data") if isinstance(fields, dict) else fields.get(b"data")
                    if isinstance(raw, bytes):
                        raw = raw.decode("utf-8")
                    if not raw:
                        continue
                    try:
                        payload = json.loads(raw)
                    except json.JSONDecodeError:
                        continue
                    if payload.get("run_id") != request.run_id:
                        continue
                    state = int(payload.get("state", STATE_RUNNING))
                    yield quant_pb2.BacktestProgress(
                        run_id=payload["run_id"],
                        progress=float(payload.get("progress", 0.0)),
                        recent_equity=list(payload.get("recent_equity") or []),
                        state=state,
                        error_message=str(payload.get("error_message", "")),
                    )
                    if state in (STATE_COMPLETED, STATE_FAILED):
                        return

    # ------------------------------------------------------------------
    # Phase 4 / 6 placeholders
    # ------------------------------------------------------------------

    async def StartOptimization(self, request, context):  # noqa: N802
        await context.abort(grpc.StatusCode.UNIMPLEMENTED, "Phase 6")

    async def EvaluateSignal(self, request, context):  # noqa: N802
        await context.abort(grpc.StatusCode.UNIMPLEMENTED, "Phase 4")


def _serializable(d: dict[str, Any]) -> dict[str, Any]:
    """Convert datetimes to isoformat for Arq's redis-side json encoding.

    Mongo handles native datetimes fine; Arq's job queue serialises via
    pickle by default but redis-py's connection-level encoding hits
    JSON-incompatible types if the pool is configured with decode_responses.
    Defensive: hand a plain-dict copy.
    """
    out: dict[str, Any] = {}
    for k, v in d.items():
        if isinstance(v, datetime):
            out[k] = v.astimezone(UTC).isoformat()
        else:
            out[k] = v
    return out


async def serve(
    *,
    port: int,
    redis_client: Any | None = None,
    mongo_db: Any | None = None,
    arq_pool: Any | None = None,
) -> grpc.aio.Server:
    """Construct and start a gRPC server; returns it for graceful shutdown."""
    server = grpc.aio.server()
    quant_pb2_grpc.add_QuantServicer_to_server(  # type: ignore[attr-defined]
        QuantServicer(redis_client=redis_client, mongo_db=mongo_db, arq_pool=arq_pool),
        server,
    )
    server.add_insecure_port(f"[::]:{port}")
    await server.start()
    log.info("quant grpc listening on :%d", port)
    return server
