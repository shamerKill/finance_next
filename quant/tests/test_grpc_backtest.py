"""End-to-end gRPC test for RunBacktest + GetBacktestStatus.

We use the in-process gRPC server with a fake mongo_db; ``arq_pool=None``
makes the servicer schedule the task inline so we can wait for it to
complete by polling the head doc.
"""

from __future__ import annotations

import asyncio
from datetime import UTC, datetime, timedelta
from typing import Any

import grpc
import numpy as np
import pandas as pd
import pytest
from google.protobuf import struct_pb2, timestamp_pb2
from quantpb.v1 import quant_pb2, quant_pb2_grpc  # type: ignore

from quant import grpc_server
from quant.workers import backtest as bt

# --- Fake collection / db (same shape as test_workers_backtest) ----------


class _FakeCollection:
    def __init__(self) -> None:
        self.docs: dict[str, dict[str, Any]] = {}

    async def insert_one(self, doc: dict[str, Any]) -> None:
        self.docs[doc["_id"]] = dict(doc)

    async def update_one(self, filt, update):
        if filt["_id"] in self.docs and "$set" in update:
            self.docs[filt["_id"]].update(update["$set"])

    async def find_one(self, filt):
        return self.docs.get(filt.get("_id"))


class _FakeDB:
    def __init__(self) -> None:
        self.collections: dict[str, _FakeCollection] = {}

    def __getitem__(self, name: str) -> _FakeCollection:
        if name not in self.collections:
            self.collections[name] = _FakeCollection()
        return self.collections[name]


def _ts_pb(dt: datetime) -> timestamp_pb2.Timestamp:
    out = timestamp_pb2.Timestamp()
    out.FromDatetime(dt.astimezone(UTC).replace(tzinfo=None))
    return out


def _build_struct(d: dict[str, Any]) -> struct_pb2.Struct:
    s = struct_pb2.Struct()
    s.update(d)
    return s


@pytest.fixture
def synthetic_loader(monkeypatch):
    """Patch the worker's default OHLCV loader to return synthetic data."""
    n = 50
    closes = np.linspace(100.0, 105.0, n)
    ts = pd.DatetimeIndex(
        [datetime(2024, 1, 1, tzinfo=UTC) + timedelta(hours=i) for i in range(n)],
        name="ts",
    )
    df = pd.DataFrame(
        {"open": closes, "high": closes, "low": closes, "close": closes, "volume": 1.0},
        index=ts,
    )

    async def loader(**kwargs):
        return df

    async def writer(run_id, rows):
        return len(rows)

    monkeypatch.setattr(bt, "_default_ohlcv_loader", loader)
    monkeypatch.setattr(bt, "_default_equity_writer", writer)
    return df


async def test_run_backtest_returns_handle_and_status_progresses(
    synthetic_loader, fake_redis,
) -> None:
    fake_db = _FakeDB()
    server = grpc.aio.server()
    servicer = grpc_server.QuantServicer(
        redis_client=fake_redis, mongo_db=fake_db, arq_pool=None
    )
    quant_pb2_grpc.add_QuantServicer_to_server(servicer, server)
    port = server.add_insecure_port("127.0.0.1:0")
    await server.start()

    try:
        async with grpc.aio.insecure_channel(f"127.0.0.1:{port}") as channel:
            stub = quant_pb2_grpc.QuantStub(channel)
            params = _build_struct(
                {
                    "createPositions": [{"marginRate": 1.0, "lossAddRate": 0.0}],
                    "stopProfitRate": 0.5,
                    "stopLossRate": 0.5,
                }
            )
            req = quant_pb2.BacktestRequest(
                strategy_id="strat-1",
                kind="grid_dca",
                params=params,
                exchange="binance",
                symbol="BTCUSDT",
                timeframe="1h",
                start=_ts_pb(datetime(2024, 1, 1, tzinfo=UTC)),
                end=_ts_pb(datetime(2024, 1, 5, tzinfo=UTC)),
                initial_capital=10_000.0,
            )
            handle = await stub.RunBacktest(req)
            assert handle.run_id

            # Wait for inline task to complete by polling status.
            for _ in range(30):
                await asyncio.sleep(0.05)
                status = await stub.GetBacktestStatus(
                    quant_pb2.GetBacktestStatusRequest(run_id=handle.run_id)
                )
                if status.state in (bt.STATE_COMPLETED, bt.STATE_FAILED):
                    break
            assert status.state == bt.STATE_COMPLETED
            assert status.progress == pytest.approx(1.0)
            assert "total_return" in status.metrics
    finally:
        await server.stop(grace=0.0)


async def test_run_backtest_requires_strategy_id(synthetic_loader, fake_redis) -> None:
    fake_db = _FakeDB()
    server = grpc.aio.server()
    servicer = grpc_server.QuantServicer(redis_client=fake_redis, mongo_db=fake_db)
    quant_pb2_grpc.add_QuantServicer_to_server(servicer, server)
    port = server.add_insecure_port("127.0.0.1:0")
    await server.start()
    try:
        async with grpc.aio.insecure_channel(f"127.0.0.1:{port}") as channel:
            stub = quant_pb2_grpc.QuantStub(channel)
            with pytest.raises(grpc.aio.AioRpcError) as ex:
                await stub.RunBacktest(quant_pb2.BacktestRequest(strategy_id=""))
            assert ex.value.code() == grpc.StatusCode.INVALID_ARGUMENT
    finally:
        await server.stop(grace=0.0)


async def test_get_status_not_found(synthetic_loader, fake_redis) -> None:
    fake_db = _FakeDB()
    server = grpc.aio.server()
    servicer = grpc_server.QuantServicer(redis_client=fake_redis, mongo_db=fake_db)
    quant_pb2_grpc.add_QuantServicer_to_server(servicer, server)
    port = server.add_insecure_port("127.0.0.1:0")
    await server.start()
    try:
        async with grpc.aio.insecure_channel(f"127.0.0.1:{port}") as channel:
            stub = quant_pb2_grpc.QuantStub(channel)
            with pytest.raises(grpc.aio.AioRpcError) as ex:
                await stub.GetBacktestStatus(
                    quant_pb2.GetBacktestStatusRequest(run_id="does-not-exist")
                )
            assert ex.value.code() == grpc.StatusCode.NOT_FOUND
    finally:
        await server.stop(grace=0.0)
