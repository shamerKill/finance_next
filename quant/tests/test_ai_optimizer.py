"""End-to-end tests for the Optuna optimizer.

We exercise the real :func:`quant.ai.optimizer.run_study` over synthetic
OHLCV with a tiny trial budget so the test is fast (~1s). Claude is fully
mocked through a fake :class:`ClaudeClient` that returns canned JSON.

Walk-forward gate test: build a search space whose ranges only produce
strategies that DO well IS but fail OOS, and assert the run returns
``completed_no_improvement``.
"""

from __future__ import annotations

from datetime import UTC, datetime
from typing import Any

import numpy as np
import pandas as pd
import pytest

from quant.ai.claude_client import ClaudeClient
from quant.ai.cost_ledger import BudgetGate
from quant.ai.optimizer import OOS_TO_IS_RATIO_FLOOR, run_study


def _synthetic_ohlcv(n: int = 400) -> pd.DataFrame:
    """Mild upward drift with sinusoidal mean reversion. Enough variation
    that grid_dca can score nontrivially under several parameter sets.
    """
    rng = np.random.default_rng(0)
    idx = pd.date_range(
        start=datetime(2024, 1, 1, tzinfo=UTC),
        periods=n,
        freq="1h",
    )
    base = 100.0 + np.linspace(0, 2.0, n)
    noise = rng.normal(0, 0.5, n)
    sine = 1.5 * np.sin(np.linspace(0, 6 * np.pi, n))
    close = base + sine + noise
    open_ = np.r_[close[0], close[:-1]]
    high = np.maximum(open_, close) + 0.2
    low = np.minimum(open_, close) - 0.2
    return pd.DataFrame(
        {
            "open": open_,
            "high": high,
            "low": low,
            "close": close,
            "volume": np.ones(n),
        },
        index=idx,
    )


class _FakeClaudeMessages:
    """Returns a small fixed search space + canned rationale text."""

    def __init__(self) -> None:
        self.calls: list[dict[str, Any]] = []

    async def create(self, **kwargs: Any) -> Any:
        self.calls.append(kwargs)
        # Detect rationale call by max_tokens shape (define uses 2048 default,
        # rationale uses 1024). We could also discriminate by system prompt
        # contents but max_tokens is simpler.
        max_tokens = kwargs.get("max_tokens", 0)
        if max_tokens <= 1100:
            text = (
                "Headline change: tighten stopProfitRate. The OOS Sharpe lifted "
                "from baseline. Reviewer should verify max DD didn't worsen."
            )
        else:
            text = (
                '{"params": ['
                '{"name": "stopProfitRate", "type": "float", "low": 0.01, "high": 0.04},'
                '{"name": "stopLossRate", "type": "float", "low": 0.02, "high": 0.08}'
                '], "rationale": "tight"}'
            )

        class _Block:
            def __init__(self) -> None:
                self.type = "text"
                self.text = text

        class _Usage:
            input_tokens = 100
            output_tokens = 50
            cache_read_input_tokens = 0
            cache_creation_input_tokens = 0

        class _Resp:
            def __init__(self) -> None:
                self.content = [_Block()]
                self.usage = _Usage()

        return _Resp()


class _FakeClaudeAdapter:
    def __init__(self) -> None:
        self.messages = _FakeClaudeMessages()


@pytest.fixture
def fake_claude() -> ClaudeClient:
    return ClaudeClient(client=_FakeClaudeAdapter())


@pytest.mark.asyncio
async def test_run_study_completes_and_returns_recommendation(
    fake_claude: ClaudeClient,
) -> None:
    """Smoke test: Optuna runs a few trials, picks a best, rationale comes back."""
    df = _synthetic_ohlcv()

    async def _loader(**_: Any) -> pd.DataFrame:
        return df

    gate = BudgetGate(study_id="t1", mongo_db=None, max_usd_per_study=2.0)
    result = await run_study(
        study_id="t1",
        strategy_id="strat1",
        strategy_kind="grid_dca",
        current_params={
            "createPositions": [{"marginRate": 1.0, "lossAddRate": 0.0}],
            "stopProfitRate": 0.03,
            "stopLossRate": 0.10,
        },
        base_request={
            "exchange": "binance",
            "symbol": "BTCUSDT",
            "timeframe": "1h",
            "start": datetime(2024, 1, 1, tzinfo=UTC),
            "end": datetime(2024, 2, 1, tzinfo=UTC),
            "initial_capital": 10_000.0,
            "commission_rate": 0.0004,
            "slippage_bps": 1.0,
        },
        ohlcv_loader=_loader,
        claude_client=fake_claude,
        budget_gate=gate,
        n_trials=8,
        timeout_seconds=30,
    )

    # Status is either "completed" (Optuna found something + walked through)
    # or "completed_no_improvement" (rare on this synthetic data, but
    # acceptable). Both are non-failure terminal states.
    assert result.status in {"completed", "completed_no_improvement"}
    assert result.trials_completed > 0
    assert result.trials_completed <= 8
    assert result.search_space["params"]
    # Cost ledger picked up at least the define+rationale calls in the
    # success path.
    if result.status == "completed":
        assert result.cost["usdSpent"] > 0
        assert result.rationale  # non-empty
        assert result.best_params  # has at least one suggested value


@pytest.mark.asyncio
async def test_run_study_walk_forward_gate_rejects_overfit(
    fake_claude: ClaudeClient,
) -> None:
    """Trials whose OOS sharpe < 0.7 × IS sharpe must be rejected.

    We patch :func:`run_backtest` so each trial returns mock metrics with
    high IS sharpe but low OOS sharpe — every trial should be filtered.
    """
    from quant.strategies.base import BacktestResult

    call_kind = {"i": 0}

    def _fake_run_backtest(*_args: Any, **_kwargs: Any) -> BacktestResult:
        # First call in each trial is IS, second is OOS — alternate.
        call_kind["i"] += 1
        is_call = call_kind["i"] % 2 == 1
        sharpe = 2.0 if is_call else 0.5  # 0.5 < 0.7 × 2.0 → reject
        return BacktestResult(
            metrics={"sharpe": sharpe, "max_dd": -0.1, "n_trades": 5.0, "total_return": 0.05},
            equity_curve=pd.DataFrame(),
            trades=[],
        )

    df = _synthetic_ohlcv(n=200)

    async def _loader(**_: Any) -> pd.DataFrame:
        return df

    gate = BudgetGate(study_id="t2", mongo_db=None, max_usd_per_study=2.0)

    import quant.ai.optimizer as optimizer_mod

    original = optimizer_mod.run_backtest
    optimizer_mod.run_backtest = _fake_run_backtest  # type: ignore[assignment]
    try:
        result = await run_study(
            study_id="t2",
            strategy_id="strat2",
            strategy_kind="grid_dca",
            current_params={
                "createPositions": [{"marginRate": 1.0, "lossAddRate": 0.0}],
                "stopProfitRate": 0.03,
                "stopLossRate": 0.10,
            },
            base_request={
                "exchange": "binance",
                "symbol": "BTCUSDT",
                "timeframe": "1h",
                "start": datetime(2024, 1, 1, tzinfo=UTC),
                "end": datetime(2024, 2, 1, tzinfo=UTC),
            },
            ohlcv_loader=_loader,
            claude_client=fake_claude,
            budget_gate=gate,
            n_trials=4,
            timeout_seconds=30,
        )
    finally:
        optimizer_mod.run_backtest = original  # type: ignore[assignment]

    # All trials rejected by the walk-forward gate → no best.
    assert result.status == "completed_no_improvement"
    assert not result.best_params

    # Verify the gate constant is still 0.7 (canary for accidental edits).
    assert OOS_TO_IS_RATIO_FLOOR == 0.7


@pytest.mark.asyncio
async def test_run_study_budget_gate_short_circuits_at_define() -> None:
    """When the budget gate refuses the first Claude call we exit
    ``budget_exceeded`` without running any trials.
    """
    df = _synthetic_ohlcv(n=200)

    async def _loader(**_: Any) -> pd.DataFrame:
        return df

    # Cap below even a single define call's projected cost.
    gate = BudgetGate(study_id="t3", mongo_db=None, max_usd_per_study=0.0001)

    fake_claude = ClaudeClient(client=_FakeClaudeAdapter())
    result = await run_study(
        study_id="t3",
        strategy_id="strat3",
        strategy_kind="grid_dca",
        current_params={"stopProfitRate": 0.03, "stopLossRate": 0.10},
        base_request={
            "exchange": "binance",
            "symbol": "BTCUSDT",
            "timeframe": "1h",
            "start": datetime(2024, 1, 1, tzinfo=UTC),
            "end": datetime(2024, 2, 1, tzinfo=UTC),
        },
        ohlcv_loader=_loader,
        claude_client=fake_claude,
        budget_gate=gate,
        n_trials=2,
        timeout_seconds=10,
    )
    assert result.status == "budget_exceeded"
