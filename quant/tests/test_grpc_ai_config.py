"""gRPC test for the GetAIConfig RPC.

Spins the QuantServicer in-process with a fake Mongo doc and asserts
the response carries the three prompts verbatim, a non-empty sha256
hash, and the model IDs from the merged config.
"""

from __future__ import annotations

import hashlib
from typing import Any

import grpc
from quantpb.v1 import quant_pb2, quant_pb2_grpc  # type: ignore

from quant import grpc_server
from quant.ai import prompts


class _FakeCol:
    def __init__(self, doc: dict[str, Any] | None) -> None:
        self._doc = doc

    async def find_one(self, _query: dict[str, Any]) -> dict[str, Any] | None:
        return self._doc


class _FakeDB:
    def __init__(self, doc: dict[str, Any] | None) -> None:
        self._col = _FakeCol(doc)

    def __getitem__(self, _name: str) -> _FakeCol:
        return self._col


async def test_get_ai_config_returns_prompts_and_hash_no_mongo() -> None:
    server = grpc.aio.server()
    servicer = grpc_server.QuantServicer()  # no mongo
    quant_pb2_grpc.add_QuantServicer_to_server(servicer, server)
    port = server.add_insecure_port("127.0.0.1:0")
    await server.start()
    try:
        async with grpc.aio.insecure_channel(f"127.0.0.1:{port}") as channel:
            stub = quant_pb2_grpc.QuantStub(channel)
            resp = await stub.GetAIConfig(quant_pb2.GetAIConfigRequest())
    finally:
        await server.stop(grace=0.0)

    assert resp.define_search_space_prompt == prompts.DEFINE_SEARCH_SPACE_SYSTEM
    assert resp.refine_search_space_prompt == prompts.REFINE_SEARCH_SPACE_SYSTEM
    assert resp.final_rationale_prompt == prompts.FINAL_RATIONALE_SYSTEM

    expected_hash = hashlib.sha256(
        (
            prompts.DEFINE_SEARCH_SPACE_SYSTEM
            + prompts.REFINE_SEARCH_SPACE_SYSTEM
            + prompts.FINAL_RATIONALE_SYSTEM
        ).encode("utf-8")
    ).hexdigest()
    assert resp.prompts_hash == expected_hash
    assert resp.prompts_version == prompts.VERSION

    # No Mongo + no env override → defaults to claude family.
    assert resp.model_family_active == "claude"
    assert resp.primary_model_active == "claude-sonnet-4-6"
    assert resp.refine_model_active == "claude-haiku-4-5-20251001"


async def test_get_ai_config_honours_mongo_override() -> None:
    db = _FakeDB(
        {
            "_id": "global",
            "aiConfig": {
                "modelFamily": "openai",
                "openaiPrimaryModel": "gpt-test-primary",
                "openaiRefineModel": "gpt-test-refine",
            },
        }
    )
    server = grpc.aio.server()
    servicer = grpc_server.QuantServicer(mongo_db=db)
    quant_pb2_grpc.add_QuantServicer_to_server(servicer, server)
    port = server.add_insecure_port("127.0.0.1:0")
    await server.start()
    try:
        async with grpc.aio.insecure_channel(f"127.0.0.1:{port}") as channel:
            stub = quant_pb2_grpc.QuantStub(channel)
            resp = await stub.GetAIConfig(quant_pb2.GetAIConfigRequest())
    finally:
        await server.stop(grace=0.0)

    assert resp.model_family_active == "openai"
    assert resp.primary_model_active == "gpt-test-primary"
    assert resp.refine_model_active == "gpt-test-refine"
