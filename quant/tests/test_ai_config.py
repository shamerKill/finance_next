"""Tests for ``quant.ai.config.load_effective_config``.

The loader merges ``system_state.aiConfig`` (Mongo) over env over
hard-coded defaults, per-field. These tests pin the three modes:
mongo-only, env-only, and mixed.
"""

from __future__ import annotations

from typing import Any

import pytest

from quant.ai import config as ai_config

# ---------------------------------------------------------------------------
# Fake Mongo
# ---------------------------------------------------------------------------


class _FakeCol:
    def __init__(self, doc: dict[str, Any] | None) -> None:
        self._doc = doc

    async def find_one(self, query: dict[str, Any]) -> dict[str, Any] | None:
        if self._doc is None:
            return None
        return dict(self._doc) if self._doc.get("_id") == query.get("_id") else None


class _FakeDB:
    def __init__(self, system_state_doc: dict[str, Any] | None) -> None:
        self._col = _FakeCol(system_state_doc)

    def __getitem__(self, name: str) -> _FakeCol:
        assert name == "system_state"
        return self._col


@pytest.fixture(autouse=True)
def _clean_env(monkeypatch: pytest.MonkeyPatch) -> None:
    """Each test starts from a known-clean env."""
    for key in (
        "AI_MODEL_FAMILY",
        "ANTHROPIC_PRIMARY_MODEL",
        "ANTHROPIC_REFINE_MODEL",
        "OPENAI_PRIMARY_MODEL",
        "OPENAI_REFINE_MODEL",
        "ANTHROPIC_BASE_URL",
        "OPENAI_BASE_URL",
        "AI_MAX_USD_PER_STUDY",
        "AI_MAX_USD_PER_DAY",
        "AI_OPTIMIZATION_LOOKBACK_DAYS",
    ):
        monkeypatch.delenv(key, raising=False)


# ---------------------------------------------------------------------------


async def test_no_mongo_returns_env_defaults() -> None:
    """mongo_db=None — fall through to env / defaults; source="env"."""
    cfg = await ai_config.load_effective_config(None)
    assert cfg.model_family == "claude"
    assert cfg.anthropic_primary_model == "claude-sonnet-4-6"
    assert cfg.budget_usd_per_study == pytest.approx(5.0)
    assert cfg.budget_usd_per_day == pytest.approx(50.0)
    assert cfg.lookback_days == 90
    assert cfg.source == "env"


async def test_env_only_picks_up_env_overrides(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv("AI_MODEL_FAMILY", "openai")
    monkeypatch.setenv("AI_OPTIMIZATION_LOOKBACK_DAYS", "30")
    monkeypatch.setenv("AI_MAX_USD_PER_STUDY", "12.5")
    cfg = await ai_config.load_effective_config(None)
    assert cfg.model_family == "openai"
    assert cfg.lookback_days == 30
    assert cfg.budget_usd_per_study == pytest.approx(12.5)
    assert cfg.source == "env"


async def test_mongo_doc_absent_falls_to_env() -> None:
    """system_state doc exists but lacks aiConfig — same as no doc."""
    db = _FakeDB({"_id": "global", "tradingHalted": False})
    cfg = await ai_config.load_effective_config(db)
    assert cfg.source == "env"
    assert cfg.model_family == "claude"


async def test_mongo_full_override_takes_precedence() -> None:
    db = _FakeDB(
        {
            "_id": "global",
            "aiConfig": {
                "modelFamily": "openai",
                "anthropicPrimaryModel": "claude-test-primary",
                "anthropicRefineModel": "claude-test-refine",
                "openaiPrimaryModel": "gpt-test-primary",
                "openaiRefineModel": "gpt-test-refine",
                "anthropicBaseURL": "https://anthropic.example.com",
                "openaiBaseURL": "https://openai.example.com",
                "budgetUsdPerStudy": 9.5,
                "budgetUsdPerDay": 99.0,
                "lookbackDays": 45,
            },
        }
    )
    cfg = await ai_config.load_effective_config(db)
    assert cfg.model_family == "openai"
    assert cfg.openai_primary_model == "gpt-test-primary"
    assert cfg.openai_refine_model == "gpt-test-refine"
    assert cfg.anthropic_primary_model == "claude-test-primary"
    assert cfg.budget_usd_per_study == pytest.approx(9.5)
    assert cfg.budget_usd_per_day == pytest.approx(99.0)
    assert cfg.lookback_days == 45
    assert cfg.source == "mongo"


async def test_partial_override_is_mixed(monkeypatch: pytest.MonkeyPatch) -> None:
    """Some Mongo fields, some env → source="mixed"."""
    monkeypatch.setenv("AI_OPTIMIZATION_LOOKBACK_DAYS", "120")
    db = _FakeDB(
        {
            "_id": "global",
            "aiConfig": {
                "modelFamily": "openai",
                "budgetUsdPerStudy": 7.5,
            },
        }
    )
    cfg = await ai_config.load_effective_config(db)
    assert cfg.model_family == "openai"
    assert cfg.budget_usd_per_study == pytest.approx(7.5)
    # env-sourced (not on the Mongo doc):
    assert cfg.lookback_days == 120
    # default-sourced:
    assert cfg.openai_primary_model == "gpt-5.5"
    assert cfg.source == "mixed"


async def test_invalid_mongo_value_falls_through() -> None:
    """Empty string / zero / wrong type for a Mongo field → ignore, fall through."""
    db = _FakeDB(
        {
            "_id": "global",
            "aiConfig": {
                "modelFamily": "",  # falsy str — ignored
                "lookbackDays": 0,  # not >0 — ignored
                "budgetUsdPerStudy": "not-a-number",  # wrong type — ignored
            },
        }
    )
    cfg = await ai_config.load_effective_config(db)
    assert cfg.model_family == "claude"
    assert cfg.lookback_days == 90
    assert cfg.budget_usd_per_study == pytest.approx(5.0)
    assert cfg.source == "env"


async def test_gpt_alias_normalises_to_openai() -> None:
    db = _FakeDB(
        {"_id": "global", "aiConfig": {"modelFamily": "GPT", "lookbackDays": 60}}
    )
    cfg = await ai_config.load_effective_config(db)
    assert cfg.model_family == "openai"
    assert cfg.lookback_days == 60


async def test_mongo_read_failure_falls_back_to_env() -> None:
    class _BrokenCol:
        async def find_one(self, _q: dict[str, Any]) -> Any:
            raise RuntimeError("mongo down")

    class _BrokenDB:
        def __getitem__(self, name: str) -> _BrokenCol:
            return _BrokenCol()

    cfg = await ai_config.load_effective_config(_BrokenDB())
    assert cfg.source == "env"
    assert cfg.model_family == "claude"
