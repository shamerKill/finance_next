"""Tests for the Phase 8 AI extended-context builder."""

from __future__ import annotations

from datetime import UTC, datetime

from quant.ai import extended_context


class _FakeRepo:
    """Stand-in for :mod:`quant.data.extended_repo`."""

    def __init__(
        self,
        news=None,
        macro=None,
        onchain=None,
        raise_news=False,
    ) -> None:
        self._news = news or []
        self._macro = macro or {}
        self._onchain = onchain or {}
        self._raise_news = raise_news

    async def recent_news_for_symbol(self, symbol, *, since, limit=5):
        if self._raise_news:
            raise RuntimeError("boom")
        return self._news

    async def latest_macro(self, source, code):
        return self._macro.get((source, code))

    async def latest_onchain(self, chain, metric):
        return self._onchain.get((chain, metric))


async def test_disabled_when_env_off(monkeypatch) -> None:
    monkeypatch.setenv("AI_CONTEXT_INCLUDE_EXTENDED", "false")
    repo = _FakeRepo(news=[{"ts": datetime.now(UTC), "title": "x"}])
    out = await extended_context.build_extended_context(
        symbol="BTC/USDT:USDT", extended_repo=repo
    )
    assert out == ""


async def test_default_off_when_no_keys(monkeypatch) -> None:
    monkeypatch.delenv("AI_CONTEXT_INCLUDE_EXTENDED", raising=False)
    monkeypatch.delenv("FRED_API_KEY", raising=False)
    monkeypatch.delenv("ETHERSCAN_API_KEY", raising=False)
    assert extended_context.is_enabled() is False


async def test_default_on_with_fred_key(monkeypatch) -> None:
    monkeypatch.delenv("AI_CONTEXT_INCLUDE_EXTENDED", raising=False)
    monkeypatch.setenv("FRED_API_KEY", "abc")
    assert extended_context.is_enabled() is True


async def test_built_context_includes_each_section(monkeypatch) -> None:
    monkeypatch.setenv("AI_CONTEXT_INCLUDE_EXTENDED", "true")
    now = datetime(2024, 1, 1, tzinfo=UTC)
    repo = _FakeRepo(
        news=[
            {
                "ts": now,
                "title": "BTC rallies",
                "sentiment": 0.4,
                "source": "rss",
            }
        ],
        macro={
            ("fred", "CPIAUCSL"): {
                "ts": now,
                "value": 305.4,
                "unit": "index",
            }
        },
        onchain={
            ("btc", "hash_rate"): {"ts": now, "value": 5e8},
        },
    )
    text = await extended_context.build_extended_context(
        symbol="BTC/USDT:USDT", extended_repo=repo
    )
    assert "Recent news" in text
    assert "BTC rallies" in text
    assert "CPIAUCSL" in text
    assert "btc.hash_rate" in text


async def test_news_failure_is_swallowed(monkeypatch) -> None:
    monkeypatch.setenv("AI_CONTEXT_INCLUDE_EXTENDED", "true")
    repo = _FakeRepo(raise_news=True)
    text = await extended_context.build_extended_context(
        symbol="AAPL.nasdaq", extended_repo=repo
    )
    # No sources returned data → empty string is fine; the optimizer
    # treats that as "use base context only".
    assert text == ""
