"""Unit tests for the Anthropic SDK wrapper.

We never make real API calls — every test injects a fake client that
records the request and returns a stub response. The fake exposes the
minimum surface :class:`quant.ai.claude_client.ClaudeClient` reaches
into (``messages.create`` returning an object with ``.content`` +
``.usage``).
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any

import pytest

from quant.ai import claude_client as cc


@dataclass
class _FakeBlock:
    type: str
    text: str = ""


@dataclass
class _FakeUsage:
    input_tokens: int = 0
    output_tokens: int = 0
    cache_read_input_tokens: int = 0
    cache_creation_input_tokens: int = 0


@dataclass
class _FakeResponse:
    content: list[_FakeBlock]
    usage: _FakeUsage


class _FakeMessages:
    def __init__(self, response: _FakeResponse) -> None:
        self.response = response
        self.last_call: dict[str, Any] | None = None

    async def create(self, **kwargs: Any) -> _FakeResponse:
        self.last_call = kwargs
        return self.response


class _FakeClient:
    def __init__(self, response: _FakeResponse) -> None:
        self.messages = _FakeMessages(response)


@pytest.mark.asyncio
async def test_define_search_space_parses_and_returns_usage() -> None:
    response = _FakeResponse(
        content=[
            _FakeBlock(
                type="text",
                text='{"params": [{"name": "stopProfitRate", "type": "float", "low": 0.01, "high": 0.05}], "rationale": "tight"}',
            )
        ],
        usage=_FakeUsage(input_tokens=100, output_tokens=50, cache_read_input_tokens=20),
    )
    fake = _FakeClient(response)
    client = cc.ClaudeClient(client=fake)

    space, usage = await client.define_search_space(
        study_context="ctx", user_prompt="pls"
    )
    assert space["params"][0]["name"] == "stopProfitRate"
    assert usage.input_tokens == 100
    assert usage.output_tokens == 50
    assert usage.cache_read_input_tokens == 20

    # System prompt must include both the static prompt + study ctx +
    # cache_control on the last block.
    sys_blocks = fake.messages.last_call["system"]
    assert isinstance(sys_blocks, list)
    assert len(sys_blocks) == 2
    assert sys_blocks[-1]["cache_control"]["type"] == "ephemeral"


@pytest.mark.asyncio
async def test_define_search_space_strips_code_fences() -> None:
    """Models sometimes wrap JSON in fences despite the prompt — we cope."""
    response = _FakeResponse(
        content=[
            _FakeBlock(
                type="text",
                text='```json\n{"params": [], "rationale": "fenced"}\n```',
            )
        ],
        usage=_FakeUsage(),
    )
    client = cc.ClaudeClient(client=_FakeClient(response))
    space, _ = await client.define_search_space(study_context="x", user_prompt="y")
    assert space["params"] == []


@pytest.mark.asyncio
async def test_write_final_rationale_returns_text() -> None:
    response = _FakeResponse(
        content=[_FakeBlock(type="text", text="Looks good. OOS Sharpe 1.5")],
        usage=_FakeUsage(input_tokens=200, output_tokens=80),
    )
    client = cc.ClaudeClient(client=_FakeClient(response))
    text, usage = await client.write_final_rationale(
        study_context="ctx", user_prompt="?"
    )
    assert "1.5" in text
    assert usage.output_tokens == 80


@pytest.mark.asyncio
async def test_missing_api_key_raises_when_no_client_injected(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.delenv("ANTHROPIC_API_KEY", raising=False)
    client = cc.ClaudeClient()  # no api_key, no client
    with pytest.raises(cc.MissingAPIKeyError):
        await client.define_search_space(study_context="x", user_prompt="y")


def test_compute_usd_cost_sonnet() -> None:
    """Sonnet 4.6: $3/M input, $15/M output. Mixed cache + base."""
    usage = cc.ClaudeUsage(
        input_tokens=1_000,
        output_tokens=500,
        cache_read_input_tokens=2_000,
        cache_creation_input_tokens=1_000,
    )
    cost = cc.compute_usd_cost(cc.SONNET_MODEL, usage)
    # 1000/1M*3 + 2000/1M*3*0.1 + 1000/1M*3*1.25 + 500/1M*15
    expected = 0.003 + 0.0006 + 0.00375 + 0.0075
    assert abs(cost - round(expected, 6)) < 1e-6


def test_compute_usd_cost_haiku_unknown_model_zero() -> None:
    assert cc.compute_usd_cost(cc.HAIKU_MODEL, cc.ClaudeUsage(input_tokens=1_000)) > 0
    assert cc.compute_usd_cost("not-a-model", cc.ClaudeUsage(input_tokens=1_000)) == 0.0


def test_compute_usd_cost_zero_for_empty_usage() -> None:
    assert cc.compute_usd_cost(cc.SONNET_MODEL, cc.ClaudeUsage()) == 0.0
