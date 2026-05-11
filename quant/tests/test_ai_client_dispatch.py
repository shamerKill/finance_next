"""Tests for ``_build_default_ai_client`` env-driven dispatch.

The function decides between :class:`ClaudeClient` and :class:`GPTClient`
(or ``None`` if no matching key is set) based on the ``AI_MODEL_FAMILY``
env var. Construction is cheap (lazy SDK build) so we can assert on the
returned instance directly via ``isinstance``.
"""

from __future__ import annotations

import pytest

from quant.ai.claude_client import ClaudeClient
from quant.ai.gpt_client import GPTClient
from quant.workers import optimize


@pytest.fixture(autouse=True)
def _clean_ai_env(monkeypatch: pytest.MonkeyPatch) -> None:
    """Each test starts from a known-clean env."""
    for key in (
        "AI_MODEL_FAMILY",
        "ANTHROPIC_API_KEY",
        "OPENAI_API_KEY",
        "ANTHROPIC_BASE_URL",
        "OPENAI_BASE_URL",
    ):
        monkeypatch.delenv(key, raising=False)


def test_default_no_env_returns_none() -> None:
    """No family, no keys → None (no AI calls; optimizer uses fallback)."""
    assert optimize._build_default_ai_client() is None


def test_default_with_anthropic_key_returns_claude(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv("ANTHROPIC_API_KEY", "sk-ant-test")
    client = optimize._build_default_ai_client()
    assert isinstance(client, ClaudeClient)


def test_explicit_claude_family_returns_claude(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv("AI_MODEL_FAMILY", "claude")
    monkeypatch.setenv("ANTHROPIC_API_KEY", "sk-ant-test")
    client = optimize._build_default_ai_client()
    assert isinstance(client, ClaudeClient)


def test_openai_family_with_openai_key_returns_gpt(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv("AI_MODEL_FAMILY", "openai")
    monkeypatch.setenv("OPENAI_API_KEY", "sk-openai-test")
    client = optimize._build_default_ai_client()
    assert isinstance(client, GPTClient)


def test_gpt_alias_returns_gpt(monkeypatch: pytest.MonkeyPatch) -> None:
    """``AI_MODEL_FAMILY=gpt`` is accepted as a synonym for ``openai``."""
    monkeypatch.setenv("AI_MODEL_FAMILY", "gpt")
    monkeypatch.setenv("OPENAI_API_KEY", "sk-openai-test")
    client = optimize._build_default_ai_client()
    assert isinstance(client, GPTClient)


def test_openai_family_falls_back_to_anthropic_key(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """No OPENAI_API_KEY but ANTHROPIC_API_KEY set → still builds a GPTClient.

    The proxy (``aiapi.lib.show``) uses one credential for both endpoints,
    so the fallback is intentional. The client itself reads the same
    fallback chain in its constructor.
    """
    monkeypatch.setenv("AI_MODEL_FAMILY", "openai")
    monkeypatch.setenv("ANTHROPIC_API_KEY", "sk-ant-test")
    client = optimize._build_default_ai_client()
    assert isinstance(client, GPTClient)


def test_openai_family_no_keys_returns_none(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """``AI_MODEL_FAMILY=openai`` with no keys at all → None, no crash."""
    monkeypatch.setenv("AI_MODEL_FAMILY", "openai")
    client = optimize._build_default_ai_client()
    assert client is None


def test_unknown_family_falls_back_to_claude(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """An unrecognised family value falls through to the default Claude path.

    Documents current behaviour: the function checks only for the two
    openai-family aliases (``openai`` / ``gpt``); anything else lands on
    the Anthropic branch. With ``ANTHROPIC_API_KEY`` set it builds a
    ``ClaudeClient``.
    """
    monkeypatch.setenv("AI_MODEL_FAMILY", "definitely-not-a-real-family")
    monkeypatch.setenv("ANTHROPIC_API_KEY", "sk-ant-test")
    client = optimize._build_default_ai_client()
    assert isinstance(client, ClaudeClient)


def test_unknown_family_no_anthropic_key_returns_none(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Unknown family + missing Anthropic key → None (no AI calls)."""
    monkeypatch.setenv("AI_MODEL_FAMILY", "bogus")
    client = optimize._build_default_ai_client()
    assert client is None


def test_back_compat_alias_dispatches_identically(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """``_build_default_claude_client`` is now an alias for the dispatcher.

    Existing imports (pre-refactor) must keep working, AND now follow
    the new family routing — so it returns a GPTClient when the env
    asks for it, despite its legacy name.
    """
    assert (
        optimize._build_default_claude_client
        is optimize._build_default_ai_client
    )

    # Sanity-check: invoking via the legacy name routes through the same
    # logic — env says openai → GPTClient.
    monkeypatch.setenv("AI_MODEL_FAMILY", "openai")
    monkeypatch.setenv("OPENAI_API_KEY", "sk-openai-test")
    client = optimize._build_default_claude_client()
    assert isinstance(client, GPTClient)


def test_family_value_is_normalised(monkeypatch: pytest.MonkeyPatch) -> None:
    """Whitespace + uppercase are accepted (``strip().lower()`` in impl)."""
    monkeypatch.setenv("AI_MODEL_FAMILY", "  OpenAI  ")
    monkeypatch.setenv("OPENAI_API_KEY", "sk-openai-test")
    client = optimize._build_default_ai_client()
    assert isinstance(client, GPTClient)
