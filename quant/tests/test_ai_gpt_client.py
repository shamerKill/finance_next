"""Unit tests for the OpenAI Responses API wrapper.

We never make real API calls — every test injects a fake client that
records the request and yields a stub async stream of SSE-shaped events.
The fake exposes the minimum surface
:class:`quant.ai.gpt_client.GPTClient` reaches into
(``responses.create`` returning an async iterator of event objects with
``.type`` + payload attrs / ``.usage``).

The streaming shape mirrors what the real ``/v1/responses`` endpoint
emits: a ``response.created`` opener (ignored), one or more
``response.output_text.delta`` chunks, optional ``response.output_text.done``
snapshot, and a terminal ``response.completed`` carrying usage.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any

import pytest

from quant.ai import gpt_client as gc

# ---------------------------------------------------------------------------
# Fake SSE event types — attribute-shape (mirrors openai-python SDK models).
# ---------------------------------------------------------------------------


@dataclass
class _FakeCreatedEvent:
    type: str = "response.created"


@dataclass
class _FakeDeltaEvent:
    delta: str
    type: str = "response.output_text.delta"


@dataclass
class _FakeDoneEvent:
    text: str
    type: str = "response.output_text.done"


@dataclass
class _FakeUsageDetails:
    cached_tokens: int = 0


@dataclass
class _FakeUsage:
    input_tokens: int = 0
    output_tokens: int = 0
    total_tokens: int = 0
    input_tokens_details: _FakeUsageDetails | None = None


@dataclass
class _FakeResponseObj:
    usage: _FakeUsage | None = None


@dataclass
class _FakeCompletedEvent:
    response: _FakeResponseObj
    type: str = "response.completed"


class _FakeStream:
    """Async iterator yielding the recorded events one-by-one."""

    def __init__(self, events: list[Any]) -> None:
        self._events = list(events)

    def __aiter__(self) -> _FakeStream:
        return self

    async def __anext__(self) -> Any:
        if not self._events:
            raise StopAsyncIteration
        return self._events.pop(0)


class _FakeResponses:
    def __init__(self, events: list[Any]) -> None:
        self._events = events
        self.last_call: dict[str, Any] | None = None

    async def create(self, **kwargs: Any) -> _FakeStream:
        self.last_call = kwargs
        return _FakeStream(self._events)


class _FakeClient:
    def __init__(self, events: list[Any]) -> None:
        self.responses = _FakeResponses(events)


def _completed(
    input_tokens: int = 0,
    output_tokens: int = 0,
    cached_tokens: int = 0,
) -> _FakeCompletedEvent:
    return _FakeCompletedEvent(
        response=_FakeResponseObj(
            usage=_FakeUsage(
                input_tokens=input_tokens,
                output_tokens=output_tokens,
                total_tokens=input_tokens + output_tokens,
                input_tokens_details=_FakeUsageDetails(cached_tokens=cached_tokens),
            )
        )
    )


# ---------------------------------------------------------------------------
# Construction
# ---------------------------------------------------------------------------


def test_construct_without_env_is_lazy(monkeypatch: pytest.MonkeyPatch) -> None:
    """No env, no client kwarg → __init__ must NOT raise (lazy SDK build)."""
    monkeypatch.delenv("OPENAI_API_KEY", raising=False)
    monkeypatch.delenv("ANTHROPIC_API_KEY", raising=False)
    monkeypatch.delenv("OPENAI_BASE_URL", raising=False)
    monkeypatch.delenv("ANTHROPIC_BASE_URL", raising=False)
    # Doesn't blow up on construction:
    client = gc.GPTClient()
    assert client._api_key is None
    assert client._base_url is None


def test_construct_with_fake_client_needs_no_env(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Injected client bypasses the API-key requirement entirely."""
    monkeypatch.delenv("OPENAI_API_KEY", raising=False)
    monkeypatch.delenv("ANTHROPIC_API_KEY", raising=False)
    fake = _FakeClient([])
    client = gc.GPTClient(client=fake)
    assert client._client is fake


def test_explicit_api_key_wins_over_env(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("OPENAI_API_KEY", "env-key")
    client = gc.GPTClient(api_key="explicit-key")
    assert client._api_key == "explicit-key"


def test_explicit_base_url_wins_over_env(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("OPENAI_BASE_URL", "https://env.example.com")
    # Note: explicit base_url with /v1 already present stays untouched.
    client = gc.GPTClient(base_url="https://explicit.example.com/v1")
    assert client._base_url == "https://explicit.example.com/v1"


def test_base_url_v1_auto_appended(monkeypatch: pytest.MonkeyPatch) -> None:
    """Bare host (no /v1) gets /v1 appended — the implementer's gotcha."""
    monkeypatch.delenv("OPENAI_BASE_URL", raising=False)
    client = gc.GPTClient(base_url="https://aiapi.lib.show")
    assert client._base_url == "https://aiapi.lib.show/v1"


def test_base_url_v1_not_double_appended() -> None:
    """If caller already ends with /v1, we leave it alone."""
    client = gc.GPTClient(base_url="https://aiapi.lib.show/v1")
    assert client._base_url == "https://aiapi.lib.show/v1"


def test_base_url_v1_not_appended_when_in_middle() -> None:
    """A /v1/ segment elsewhere in the path shouldn't trigger a second append."""
    client = gc.GPTClient(base_url="https://proxy.example/v1/openai")
    # Implementation checks for "/v1/" anywhere in trimmed+"/" — so this
    # path should be left alone.
    assert client._base_url == "https://proxy.example/v1/openai"


@pytest.mark.asyncio
async def test_missing_api_key_raises_on_first_use(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.delenv("OPENAI_API_KEY", raising=False)
    monkeypatch.delenv("ANTHROPIC_API_KEY", raising=False)
    client = gc.GPTClient()  # no client, no key
    with pytest.raises(gc.MissingAPIKeyError):
        await client.define_search_space(study_context="x", user_prompt="y")


# ---------------------------------------------------------------------------
# define_search_space happy path
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_define_search_space_parses_streamed_json_and_usage() -> None:
    """Streamed JSON deltas concatenate into a parseable search space.

    Usage extraction: OpenAI reports total ``input_tokens`` INCLUDING
    cached, so the client subtracts to align with the Anthropic shape:
    fresh_input = total - cached.
    """
    events: list[Any] = [
        _FakeCreatedEvent(),
        _FakeDeltaEvent(delta='{"params": [{"name": "stopLossRate", '),
        _FakeDeltaEvent(
            delta='"type": "float", "low": 0.005, "high": 0.05}], '
        ),
        _FakeDeltaEvent(delta='"rationale": "test rationale"}'),
        _completed(input_tokens=12, output_tokens=5, cached_tokens=4),
    ]
    fake = _FakeClient(events)
    client = gc.GPTClient(client=fake)

    parsed, usage = await client.define_search_space(
        study_context="ctx", user_prompt="please"
    )

    assert isinstance(parsed, dict)
    assert parsed["params"][0]["name"] == "stopLossRate"
    assert parsed["rationale"] == "test rationale"
    # Usage: total 12 minus 4 cached = 8 fresh input.
    assert usage.input_tokens == 8
    assert usage.output_tokens == 5
    assert usage.cache_read_input_tokens == 4
    # Always 0 for OpenAI per the dataclass docstring.
    assert usage.cache_creation_input_tokens == 0

    # Request payload assertions.
    call = fake.responses.last_call
    assert call is not None
    assert call["stream"] is True
    assert call["model"] == gc.OPENAI_MODEL_PRIMARY
    # The input array has system + user roles.
    roles = [m["role"] for m in call["input"]]
    assert roles == ["system", "user"]
    assert "please" in call["input"][-1]["content"]


# ---------------------------------------------------------------------------
# refine_search_space
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_refine_search_space_uses_refine_model() -> None:
    events: list[Any] = [
        _FakeDeltaEvent(delta='{"params": [], "rationale": "refined"}'),
        _completed(input_tokens=3, output_tokens=2, cached_tokens=0),
    ]
    fake = _FakeClient(events)
    client = gc.GPTClient(client=fake)

    parsed, usage = await client.refine_search_space(
        study_context="ctx2", user_prompt="trim"
    )
    assert parsed["params"] == []
    assert parsed["rationale"] == "refined"
    assert usage.input_tokens == 3
    assert usage.output_tokens == 2
    # Model routed to refine, not primary.
    assert fake.responses.last_call["model"] == gc.OPENAI_MODEL_REFINE
    assert fake.responses.last_call["model"] != gc.OPENAI_MODEL_PRIMARY


# ---------------------------------------------------------------------------
# write_final_rationale
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_write_final_rationale_concats_text_deltas() -> None:
    """Plain text deltas concatenate; no JSON parsing here."""
    events: list[Any] = [
        _FakeDeltaEvent(delta="Looks good. "),
        _FakeDeltaEvent(delta="OOS Sharpe 1.5"),
        _completed(input_tokens=200, output_tokens=80, cached_tokens=10),
    ]
    fake = _FakeClient(events)
    client = gc.GPTClient(client=fake)

    text, usage = await client.write_final_rationale(
        study_context="ctx", user_prompt="?"
    )
    assert text == "Looks good. OOS Sharpe 1.5"
    # input_tokens 200 - cached 10 = 190 fresh.
    assert usage.input_tokens == 190
    assert usage.output_tokens == 80
    assert usage.cache_read_input_tokens == 10
    # Rationale uses the primary model.
    assert fake.responses.last_call["model"] == gc.OPENAI_MODEL_PRIMARY


@pytest.mark.asyncio
async def test_write_final_rationale_prefers_done_snapshot() -> None:
    """If a ``response.output_text.done`` event carries a snapshot, use it."""
    events: list[Any] = [
        _FakeDeltaEvent(delta="partial "),
        _FakeDoneEvent(text="final snapshot text"),
        _completed(input_tokens=5, output_tokens=3),
    ]
    fake = _FakeClient(events)
    client = gc.GPTClient(client=fake)
    text, _ = await client.write_final_rationale(study_context="c", user_prompt="p")
    assert text == "final snapshot text"


# ---------------------------------------------------------------------------
# Error handling
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_empty_stream_raises_value_error() -> None:
    """No deltas, no completed event → empty text → ValueError."""
    events: list[Any] = []
    fake = _FakeClient(events)
    client = gc.GPTClient(client=fake)
    with pytest.raises(ValueError, match="empty"):
        await client.define_search_space(study_context="x", user_prompt="y")


@pytest.mark.asyncio
async def test_invalid_json_raises_value_error() -> None:
    """Search-space methods reject text that isn't valid JSON.

    The shared ``_parse_search_space_json`` helper raises ``ValueError``
    on parse failure; we don't fall back to a default space in the
    client itself (the optimizer handles that one layer up).
    """
    events: list[Any] = [
        _FakeDeltaEvent(delta="this is not JSON at all"),
        _completed(input_tokens=2, output_tokens=1),
    ]
    fake = _FakeClient(events)
    client = gc.GPTClient(client=fake)
    with pytest.raises(ValueError):
        await client.define_search_space(study_context="x", user_prompt="y")


@pytest.mark.asyncio
async def test_missing_params_key_raises() -> None:
    """JSON parses but lacks the required ``params`` array."""
    events: list[Any] = [
        _FakeDeltaEvent(delta='{"rationale": "missing params key"}'),
        _completed(),
    ]
    fake = _FakeClient(events)
    client = gc.GPTClient(client=fake)
    with pytest.raises(ValueError, match="params"):
        await client.define_search_space(study_context="x", user_prompt="y")


@pytest.mark.asyncio
async def test_no_completed_event_returns_zero_usage() -> None:
    """No ``response.completed`` → usage stays at the zero default.

    Documents current behaviour: the client does NOT raise on missing
    completed; the cost ledger logs a 0-token call. (If this ever
    changes to raise, swap this test for a ``pytest.raises``.)
    """
    events: list[Any] = [
        _FakeDeltaEvent(delta='{"params": [], "rationale": "ok"}'),
        # No _completed event.
    ]
    fake = _FakeClient(events)
    client = gc.GPTClient(client=fake)
    parsed, usage = await client.define_search_space(
        study_context="x", user_prompt="y"
    )
    assert parsed["params"] == []
    # No completed event → usage left at dataclass defaults.
    assert usage.input_tokens == 0
    assert usage.output_tokens == 0
    assert usage.cache_read_input_tokens == 0
    assert usage.cache_creation_input_tokens == 0


# ---------------------------------------------------------------------------
# _extract_usage helper — covers both dict + attr shapes.
# ---------------------------------------------------------------------------


def test_extract_usage_handles_dict_shape() -> None:
    """The streaming iterator may surface dict payloads on some SDK versions."""
    response_obj = {
        "usage": {
            "input_tokens": 50,
            "output_tokens": 10,
            "input_tokens_details": {"cached_tokens": 30},
        }
    }
    usage = gc._extract_usage(response_obj)
    assert usage.input_tokens == 20  # 50 - 30 cached
    assert usage.cache_read_input_tokens == 30
    assert usage.output_tokens == 10
    assert usage.cache_creation_input_tokens == 0


def test_extract_usage_none_returns_zero() -> None:
    assert gc._extract_usage(None) == gc.GPTUsage()
