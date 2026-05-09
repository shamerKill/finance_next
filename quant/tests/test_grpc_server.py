"""End-to-end gRPC test for IngestNow.

Spins up the QuantServicer in-process backed by a fake ccxt + a stubbed
TimescaleDB writer. Verifies the protobuf round trip (Timestamp, run_id,
bars_ingested) and that the Redis stream sees a published event.
"""

from __future__ import annotations

from datetime import UTC, datetime, timedelta

import grpc
import pytest
from google.protobuf import timestamp_pb2
from quantpb.v1 import quant_pb2, quant_pb2_grpc  # type: ignore

from quant import grpc_server
from quant.data import ccxt_source, timescale
from quant.events import redis_stream


def _ts(dt: datetime) -> timestamp_pb2.Timestamp:
    out = timestamp_pb2.Timestamp()
    out.FromDatetime(dt.astimezone(UTC).replace(tzinfo=None))
    return out


@pytest.fixture
def patched_ingest(monkeypatch, fake_ccxt):
    """Patch ccxt module + timescale upsert + record bars written."""
    monkeypatch.setattr(ccxt_source, "ccxt_async", fake_ccxt)

    written: list[ccxt_source.OhlcvBar] = []

    async def fake_upsert(bars):
        bars_list = list(bars)
        written.extend(bars_list)
        return len(bars_list)

    monkeypatch.setattr(timescale, "upsert_ohlcv", fake_upsert)
    return written


async def test_ingest_now_round_trip(patched_ingest, fake_redis) -> None:
    server = grpc.aio.server()
    servicer = grpc_server.QuantServicer(redis_client=fake_redis)
    quant_pb2_grpc.add_QuantServicer_to_server(servicer, server)
    port = server.add_insecure_port("127.0.0.1:0")
    await server.start()

    try:
        async with grpc.aio.insecure_channel(f"127.0.0.1:{port}") as channel:
            stub = quant_pb2_grpc.QuantStub(channel)
            start = datetime(2024, 1, 1, tzinfo=UTC)
            end = start + timedelta(minutes=10)
            req = quant_pb2.IngestRequest(
                exchange="binance",
                symbol="BTCUSDT",
                timeframe="1m",
                start=_ts(start),
                end=_ts(end),
            )
            ack = await stub.IngestNow(req)

        assert ack.run_id
        assert ack.bars_ingested == 10
        assert len(patched_ingest) == 10

        # Redis stream should have one entry now.
        stream_len = await fake_redis.xlen(redis_stream.OHLCV_INGESTED_STREAM)
        assert stream_len == 1
    finally:
        await server.stop(grace=0.0)


async def test_unimplemented_rpcs_surface_unimplemented_status(patched_ingest) -> None:
    """Phase 4 (EvaluateSignal) and Phase 6 (StartOptimization) are still
    placeholders. Phase 3 wired up RunBacktest; that path is covered by
    test_grpc_backtest.py.
    """
    server = grpc.aio.server()
    servicer = grpc_server.QuantServicer(redis_client=None)
    quant_pb2_grpc.add_QuantServicer_to_server(servicer, server)
    port = server.add_insecure_port("127.0.0.1:0")
    await server.start()

    try:
        async with grpc.aio.insecure_channel(f"127.0.0.1:{port}") as channel:
            stub = quant_pb2_grpc.QuantStub(channel)
            with pytest.raises(grpc.aio.AioRpcError) as ex:
                await stub.EvaluateSignal(quant_pb2.EvaluateRequest(strategy_id="x"))
            assert ex.value.code() == grpc.StatusCode.UNIMPLEMENTED
            with pytest.raises(grpc.aio.AioRpcError) as ex:
                await stub.StartOptimization(
                    quant_pb2.OptimizationRequest(strategy_id="x")
                )
            assert ex.value.code() == grpc.StatusCode.UNIMPLEMENTED
    finally:
        await server.stop(grace=0.0)
