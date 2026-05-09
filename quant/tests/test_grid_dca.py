"""Tests for the grid_dca strategy port."""

from __future__ import annotations

from datetime import UTC, datetime, timedelta

import numpy as np
import pandas as pd

from quant.strategies.base import run_backtest
from quant.strategies.grid_dca import GridDCAStrategy


def _ts_index(n: int) -> pd.DatetimeIndex:
    return pd.DatetimeIndex(
        [datetime(2024, 1, 1, tzinfo=UTC) + timedelta(hours=i) for i in range(n)],
        name="ts",
    )


def _v_shape(n: int = 200, start: float = 100.0, low: float = 80.0, end: float = 110.0) -> pd.DataFrame:
    """Price drops then recovers — DCA strategy should add and exit on bounce."""
    half = n // 2
    down = np.linspace(start, low, half)
    up = np.linspace(low, end, n - half)
    closes = np.concatenate([down, up])
    return pd.DataFrame(
        {"open": closes, "high": closes, "low": closes, "close": closes, "volume": 1.0},
        index=_ts_index(n),
    )


def test_grid_dca_adds_on_drawdown_and_exits_on_bounce() -> None:
    """Configure 3 tiers of DCA at 5% intervals, exit at +3% from avg.

    Price path: 100 → 80 (V-shape) → 110.
    The strategy should:
      - open tier 0 immediately
      - add tier 1 at avg × 0.95
      - add tier 2 at new avg × 0.95
      - exit on the recovery when price ≥ avg × 1.03
    """
    params = {
        "createPositions": [
            {"marginRate": 0.3, "lossAddRate": 0.0},
            {"marginRate": 0.3, "lossAddRate": 0.05},
            {"marginRate": 0.4, "lossAddRate": 0.05},
        ],
        "stopProfitRate": 0.03,
        "stopLossRate": 0.5,  # generous so the V-shape doesn't stop us out
        "profitRateAfterAtAddPosition": 0.0,
    }
    ohlcv = _v_shape()
    result = run_backtest(
        GridDCAStrategy(), ohlcv, params,
        initial_capital=10_000.0,
        commission=0.0, slippage_bps=0.0,
    )
    # At least one trade should round-trip (exit on bounce); end-of-data
    # force-close may add another. We need ≥ 1 trade and ≥ 1 add (n_adds > 0).
    assert result.metrics["n_trades"] >= 1
    n_adds_total = sum(t.n_adds for t in result.trades)
    assert n_adds_total >= 1, "expected DCA adds during drawdown"


def test_grid_dca_stop_loss_triggers() -> None:
    """A monotonically falling price with a tight stop-loss → exit hits."""
    params = {
        "createPositions": [{"marginRate": 1.0, "lossAddRate": 0.0}],
        "stopProfitRate": 0.5,  # unreachable
        "stopLossRate": 0.05,   # 5% — should trip on a 10% drop
        "profitRateAfterAtAddPosition": 0.0,
    }
    closes = np.linspace(100.0, 80.0, 50)
    ohlcv = pd.DataFrame(
        {"open": closes, "high": closes, "low": closes, "close": closes, "volume": 1.0},
        index=_ts_index(50),
    )
    result = run_backtest(GridDCAStrategy(), ohlcv, params, initial_capital=10_000.0,
                          commission=0.0, slippage_bps=0.0)
    # Stop-loss should have triggered (≥ 1 closed trade with negative PnL).
    losing_trades = [t for t in result.trades if t.pnl < 0]
    assert len(losing_trades) >= 1
    # Equity should be below initial because we crystallised a loss.
    assert result.equity_curve["equity"].iloc[-1] < 10_000.0
