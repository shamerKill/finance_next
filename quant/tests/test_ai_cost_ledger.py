"""Unit tests for the budget gate.

The gate has two axes:
    * per-study cap (in-memory) — easy to test
    * per-day global cap (Mongo aggregation) — needs a fake collection
      that supports either ``aggregate()`` or async iteration
"""

from __future__ import annotations

from typing import Any

import pytest

from quant.ai.claude_client import SONNET_MODEL, ClaudeUsage
from quant.ai.cost_ledger import BudgetGate


class _FakeAggCursor:
    def __init__(self, total: float) -> None:
        self.total = total
        self._yielded = False

    def __aiter__(self) -> _FakeAggCursor:
        return self

    async def __anext__(self) -> dict[str, Any]:
        if self._yielded:
            raise StopAsyncIteration
        self._yielded = True
        return {"total": self.total}


class _FakeOptRunsCol:
    """Minimal stand-in. ``aggregate(...)`` returns a single-row cursor."""

    def __init__(self, daily_total_usd: float) -> None:
        self.daily_total_usd = daily_total_usd
        self.last_pipeline: list[Any] | None = None

    def aggregate(self, pipeline: list[Any]) -> _FakeAggCursor:
        self.last_pipeline = pipeline
        return _FakeAggCursor(self.daily_total_usd)


class _FakeDB:
    def __init__(self, daily_total_usd: float = 0.0) -> None:
        self._daily = daily_total_usd

    def __getitem__(self, name: str) -> _FakeOptRunsCol:
        return _FakeOptRunsCol(self._daily)


@pytest.mark.asyncio
async def test_try_charge_allows_when_under_caps() -> None:
    gate = BudgetGate(
        study_id="s1",
        mongo_db=_FakeDB(daily_total_usd=10.0),
        max_usd_per_study=1.0,
        max_usd_per_day_global=50.0,
    )
    ok, reason = await gate.try_charge(0.10)
    assert ok and reason == ""


@pytest.mark.asyncio
async def test_try_charge_rejects_when_study_cap_exceeded() -> None:
    gate = BudgetGate(
        study_id="s1",
        mongo_db=_FakeDB(),
        max_usd_per_study=0.05,
        max_usd_per_day_global=50.0,
    )
    ok, reason = await gate.try_charge(0.10)
    assert not ok
    assert "study cap" in reason


@pytest.mark.asyncio
async def test_try_charge_rejects_when_daily_cap_exceeded() -> None:
    gate = BudgetGate(
        study_id="s1",
        mongo_db=_FakeDB(daily_total_usd=49.95),
        max_usd_per_study=5.0,
        max_usd_per_day_global=50.0,
    )
    ok, reason = await gate.try_charge(0.10)
    assert not ok
    assert "daily cap" in reason


@pytest.mark.asyncio
async def test_record_increments_study_total_and_persists_cost() -> None:
    gate = BudgetGate(
        study_id="s1",
        mongo_db=_FakeDB(),
        max_usd_per_study=10.0,
        max_usd_per_day_global=100.0,
    )
    usage = ClaudeUsage(input_tokens=1_000, output_tokens=500)
    entry = gate.record(role="define_search_space", model=SONNET_MODEL, usage=usage)
    assert entry.usd > 0
    assert gate.study_spent_usd == entry.usd

    cost = gate.to_persisted_cost()
    assert cost["claudeTokensIn"] == 1_000
    assert cost["claudeTokensOut"] == 500
    assert cost["usdSpent"] == round(entry.usd, 6)
    assert len(cost["events"]) == 1
    assert cost["events"][0]["role"] == "define_search_space"


@pytest.mark.asyncio
async def test_no_mongo_returns_zero_daily() -> None:
    gate = BudgetGate(study_id="s1", mongo_db=None)
    total = await gate.daily_total_usd()
    assert total == 0.0
