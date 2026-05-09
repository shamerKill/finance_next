"""Unit tests for the signals→portfolio simulator (anti-look-ahead invariant
+ end-to-end shape checks)."""

from __future__ import annotations

from datetime import UTC, datetime, timedelta

import numpy as np
import pandas as pd
import pytest

from quant.strategies.base import SignalSet, run_backtest


class _BuyAndHoldStrategy:
    """Always-on entry on the first bar; never exits. Tests the engine,
    not strategy logic."""

    def signals(self, ohlcv: pd.DataFrame, params: dict) -> SignalSet:
        n = len(ohlcv)
        entries = pd.Series(np.zeros(n, dtype=bool), index=ohlcv.index)
        entries.iloc[0] = True
        exits = pd.Series(np.zeros(n, dtype=bool), index=ohlcv.index)
        sizes = pd.Series(np.ones(n, dtype=float), index=ohlcv.index)
        return SignalSet(entries=entries, exits=exits, sizes=sizes)


def _linear_uptrend(n: int = 100, start: float = 100.0, step: float = 1.0) -> pd.DataFrame:
    ts = pd.DatetimeIndex(
        [datetime(2024, 1, 1, tzinfo=UTC) + timedelta(hours=i) for i in range(n)],
        name="ts",
    )
    closes = np.array([start + i * step for i in range(n)], dtype=np.float64)
    df = pd.DataFrame(
        {"open": closes, "high": closes, "low": closes, "close": closes, "volume": 1.0},
        index=ts,
    )
    return df


def test_runs_on_uptrend_and_realises_gain() -> None:
    ohlcv = _linear_uptrend(n=120, start=100.0, step=0.5)
    result = run_backtest(
        _BuyAndHoldStrategy(), ohlcv, {}, initial_capital=10_000.0,
        commission=0.0, slippage_bps=0.0,
    )
    # Equity should end above initial (price rose from 100 → 159.5).
    assert result.equity_curve["equity"].iloc[-1] > 10_000.0
    # n_trades == 1 because the engine force-closes any open position at end.
    assert result.metrics["n_trades"] == 1.0
    # total_return positive
    assert result.metrics["total_return"] > 0.0


def test_anti_lookahead_first_bar_never_executes() -> None:
    # An adversarial strategy that puts entry/exit on bar 0 to validate the
    # shift(1) defence inside run_backtest.
    class _BarZeroStrategy:
        def signals(self, ohlcv: pd.DataFrame, params: dict) -> SignalSet:
            n = len(ohlcv)
            entries = pd.Series([True] + [False] * (n - 1), index=ohlcv.index)
            exits = pd.Series([True] + [False] * (n - 1), index=ohlcv.index)
            return SignalSet(entries=entries, exits=exits)

    ohlcv = _linear_uptrend(n=10)
    # The assert inside run_backtest must NOT fire (because shift(1) zeros
    # the first bar). And the equity at bar 0 should still equal initial
    # capital — i.e. no trade actually executed on bar 0.
    result = run_backtest(_BarZeroStrategy(), ohlcv, {}, initial_capital=1_000.0)
    assert result.equity_curve["equity"].iloc[0] == pytest.approx(1_000.0)


def test_sizes_index_must_match() -> None:
    # Mismatched index should raise so look-ahead via mis-aligned series
    # can't sneak in.
    class _BadIndexStrategy:
        def signals(self, ohlcv: pd.DataFrame, params: dict) -> SignalSet:
            entries = pd.Series([False] * len(ohlcv), index=ohlcv.index)
            exits = pd.Series([False] * len(ohlcv), index=ohlcv.index)
            sizes = pd.Series([1.0] * (len(ohlcv) + 1))  # WRONG length
            return SignalSet(entries=entries, exits=exits, sizes=sizes)

    ohlcv = _linear_uptrend(n=10)
    with pytest.raises(ValueError):
        run_backtest(_BadIndexStrategy(), ohlcv, {}, initial_capital=1_000.0)


def test_progress_callback_invoked() -> None:
    ohlcv = _linear_uptrend(n=200)
    seen: list[float] = []

    def cb(progress: float, recent_equity: list[float]) -> None:
        seen.append(progress)

    run_backtest(_BuyAndHoldStrategy(), ohlcv, {}, progress_callback=cb)
    # Should have fired multiple times (every ≤ 100 bars).
    assert len(seen) >= 2
    assert all(0.0 < p <= 1.0 for p in seen)


def test_empty_ohlcv_returns_zero_metrics() -> None:
    empty = pd.DataFrame(columns=["open", "high", "low", "close", "volume"])
    res = run_backtest(_BuyAndHoldStrategy(), empty, {}, initial_capital=1_000.0)
    assert res.metrics["n_trades"] == 0
    assert res.metrics["total_return"] == 0.0
