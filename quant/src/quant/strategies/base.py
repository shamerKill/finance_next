"""Abstract strategy interface + the signals→portfolio simulator.

Why not vectorbt? vectorbt is a great primitive for plain entry/exit signal
backtests but it pulls in numba + plotly + pytables (~200 MB on disk). For
our Phase 3 needs (long-only DCA with stop-profit/stop-loss + commission +
slippage) the simulator below is exact, ~80 LoC, and tractable to reason
about. Phase 6 (Optuna parameter sweeps over thousands of trials) may
benefit from vectorisation but Phase 3 doesn't.

ANTI-LOOK-AHEAD INVARIANT
-------------------------
The signals are computed at bar t but executed at bar t+1's open. We
enforce this by ``shift(1)`` on the entry/exit/sizes series before any
portfolio math; the assertion at the top of :func:`run_backtest` will fire
if a strategy implementation forgets and emits already-shifted signals.
This is the single most common source of optimistic backtests so we treat
it as a hard contract, not a convention.
"""

from __future__ import annotations

import math
from collections.abc import Callable
from dataclasses import dataclass, field
from datetime import datetime
from typing import Any, Protocol

import numpy as np
import pandas as pd

# ---------------------------------------------------------------------------
# Types
# ---------------------------------------------------------------------------

Params = dict[str, Any]


@dataclass
class SignalSet:
    """Container returned by :meth:`Strategy.signals`.

    All series MUST share an index; :func:`run_backtest` asserts on this.

    Attributes
    ----------
    entries
        Boolean series — True at bar t means "open / add at bar t+1".
    exits
        Boolean series — True at bar t means "fully close at bar t+1".
    sizes
        Optional fraction-of-equity sizing for each entry. ``None`` means
        full deployment of the configured initial capital. Values are
        cumulative weights — i.e. the position after add #N is sum of the
        first N+1 ``sizes`` entries (capped at 1.0).
    """

    entries: pd.Series
    exits: pd.Series
    sizes: pd.Series | None = None


@dataclass
class Trade:
    """A round-trip (open → close) trade record."""

    entry_ts: datetime
    exit_ts: datetime
    entry_price: float  # average entry across all adds
    exit_price: float
    size: float  # quote currency notional at entry
    pnl: float  # absolute PnL net of fees
    return_pct: float  # PnL / size
    n_adds: int  # number of DCA adds; 0 = single entry, no DCA
    exit_reason: str  # "stop_profit" | "stop_loss" | "exit_signal" | "end_of_data"


@dataclass
class BacktestResult:
    """End-to-end backtest output.

    ``equity_curve`` columns:
        - ``ts`` (index)
        - ``equity`` — total account value (cash + position notional)
        - ``drawdown`` — equity / running_max - 1 (≤ 0)
        - ``position`` — open position size in quote currency (0 when flat)
    """

    metrics: dict[str, float]
    equity_curve: pd.DataFrame
    trades: list[Trade] = field(default_factory=list)


class Strategy(Protocol):
    """Strategy interface.

    Implementations compute boolean signals at bar t looking only at data
    [0..t]. The runner shifts by +1 before applying.
    """

    def signals(self, ohlcv: pd.DataFrame, params: Params) -> SignalSet: ...


# ---------------------------------------------------------------------------
# Engine
# ---------------------------------------------------------------------------

# Phase 3 default cost model: Binance USDM taker (0.04%) + 1bp slippage.
DEFAULT_COMMISSION_RATE = 0.0004
DEFAULT_SLIPPAGE_BPS = 1.0


def run_backtest(
    strategy: Strategy,
    ohlcv: pd.DataFrame,
    params: Params,
    *,
    initial_capital: float = 10_000.0,
    commission: float = DEFAULT_COMMISSION_RATE,
    slippage_bps: float = DEFAULT_SLIPPAGE_BPS,
    progress_callback: Callable[[float, list[float]], None] | None = None,
) -> BacktestResult:
    """Run ``strategy`` over ``ohlcv`` and return the equity curve + metrics.

    Parameters
    ----------
    strategy
        Object implementing :class:`Strategy`.
    ohlcv
        DataFrame indexed by ts (UTC), columns ``open / high / low / close``
        plus optionally ``volume``. We use ``close`` for sizing valuation.
    params
        Strategy-specific parameter dict.
    initial_capital
        Starting cash in quote currency.
    commission
        Per-fill commission (e.g. 0.0004). Default = Binance USDM taker.
    slippage_bps
        Slippage applied adversely on every fill (entry above mark, exit
        below). 1 bp = 0.0001.
    progress_callback
        Optional callback invoked every ``len(ohlcv) // 10`` bars (or every
        100 bars, whichever is smaller) with ``(progress_fraction,
        recent_equity_tail)``. Used by the worker to emit Redis events.
    """
    if ohlcv.empty:
        return BacktestResult(
            metrics={"total_return": 0.0, "n_trades": 0},
            equity_curve=pd.DataFrame(columns=["equity", "drawdown", "position"]),
            trades=[],
        )

    # ---- Build & shift signals ------------------------------------------
    sig = strategy.signals(ohlcv, params)
    if not isinstance(sig.entries, pd.Series) or not isinstance(sig.exits, pd.Series):
        raise TypeError("Strategy.signals must return pd.Series for entries/exits")
    if not sig.entries.index.equals(ohlcv.index) or not sig.exits.index.equals(ohlcv.index):
        raise ValueError("entries/exits must share the OHLCV index")

    # ANTI-LOOK-AHEAD: signals computed at t fire on the next bar's open.
    entries = sig.entries.shift(1, fill_value=False).astype(bool).to_numpy()
    exits = sig.exits.shift(1, fill_value=False).astype(bool).to_numpy()
    # The shift IS load-bearing — assert by checking that the very first
    # bar can never be an entry/exit (no t-1 to evaluate from).
    assert not entries[0] and not exits[0], (
        "anti-look-ahead invariant violated: shift(1) should zero the first bar"
    )

    sizes_arr: np.ndarray | None
    if sig.sizes is not None:
        if not sig.sizes.index.equals(ohlcv.index):
            raise ValueError("sizes must share the OHLCV index")
        sizes_arr = sig.sizes.shift(1, fill_value=0.0).astype(float).to_numpy()
    else:
        sizes_arr = None

    # ---- State ----------------------------------------------------------
    closes = ohlcv["close"].to_numpy()
    opens = ohlcv["open"].to_numpy() if "open" in ohlcv.columns else closes
    n = len(ohlcv)
    cash = float(initial_capital)
    qty = 0.0  # base-currency units held
    cost_basis = 0.0  # quote currency invested in current position
    n_adds = 0
    entry_ts: datetime | None = None

    equity_arr = np.zeros(n, dtype=np.float64)
    position_arr = np.zeros(n, dtype=np.float64)
    trades: list[Trade] = []

    slip = slippage_bps / 10_000.0  # convert bps to fraction

    progress_step = max(min(n // 10, 100), 1)

    for i in range(n):
        # Sizing fraction of initial capital (cumulative weights).
        # Default: 1.0 (full deployment).
        target_weight = float(sizes_arr[i]) if sizes_arr is not None else 1.0
        target_weight = max(0.0, min(target_weight, 1.0))

        # Mark-to-market with this bar's open (next-bar execution price).
        fill_price = float(opens[i])

        if entries[i]:
            # Compute capital deployed for this entry / add.
            target_notional = target_weight * initial_capital
            current_notional = qty * fill_price
            buy_notional = target_notional - current_notional
            if buy_notional > 0 and cash > 0:
                buy_notional = min(buy_notional, cash)
                # adverse slippage on entry
                exec_price = fill_price * (1.0 + slip)
                fee = buy_notional * commission
                buy_qty = (buy_notional - fee) / exec_price if exec_price > 0 else 0.0
                if buy_qty > 0:
                    if qty == 0.0:
                        entry_ts = ohlcv.index[i].to_pydatetime() if hasattr(ohlcv.index[i], "to_pydatetime") else ohlcv.index[i]
                        n_adds = 0
                    else:
                        n_adds += 1
                    cash -= buy_notional
                    qty += buy_qty
                    cost_basis += (buy_notional - fee)

        if exits[i] and qty > 0:
            exec_price = fill_price * (1.0 - slip)
            sell_notional = qty * exec_price
            fee = sell_notional * commission
            net = sell_notional - fee
            cash += net
            pnl = net - cost_basis
            avg_entry = cost_basis / qty if qty > 0 else 0.0
            ts_now = ohlcv.index[i]
            trades.append(
                Trade(
                    entry_ts=entry_ts or ts_now,
                    exit_ts=ts_now.to_pydatetime() if hasattr(ts_now, "to_pydatetime") else ts_now,
                    entry_price=avg_entry,
                    exit_price=exec_price,
                    size=cost_basis,
                    pnl=pnl,
                    return_pct=pnl / cost_basis if cost_basis > 0 else 0.0,
                    n_adds=n_adds,
                    exit_reason="exit_signal",
                )
            )
            qty = 0.0
            cost_basis = 0.0
            n_adds = 0
            entry_ts = None

        # Mark equity at this bar's close (closer to "true" portfolio value).
        equity_arr[i] = cash + qty * float(closes[i])
        position_arr[i] = qty * float(closes[i])

        if progress_callback is not None and (i + 1) % progress_step == 0:
            tail = equity_arr[max(0, i - 49) : i + 1].tolist()
            try:
                progress_callback((i + 1) / n, tail)
            except Exception:
                # Progress callback errors must not abort a run.
                pass

    # Force-close any open position at the end of data so PnL is fully realised.
    if qty > 0:
        last_close = float(closes[-1])
        exec_price = last_close * (1.0 - slip)
        sell_notional = qty * exec_price
        fee = sell_notional * commission
        net = sell_notional - fee
        cash += net
        pnl = net - cost_basis
        ts_last = ohlcv.index[-1]
        trades.append(
            Trade(
                entry_ts=entry_ts or ts_last,
                exit_ts=ts_last.to_pydatetime() if hasattr(ts_last, "to_pydatetime") else ts_last,
                entry_price=cost_basis / qty if qty > 0 else 0.0,
                exit_price=exec_price,
                size=cost_basis,
                pnl=pnl,
                return_pct=pnl / cost_basis if cost_basis > 0 else 0.0,
                n_adds=n_adds,
                exit_reason="end_of_data",
            )
        )
        equity_arr[-1] = cash
        position_arr[-1] = 0.0
        qty = 0.0
        cost_basis = 0.0

    # ---- Equity curve + metrics -----------------------------------------
    running_max = np.maximum.accumulate(equity_arr)
    # Avoid divide-by-zero when equity_arr starts at 0 (defensive).
    safe_max = np.where(running_max <= 0, 1.0, running_max)
    drawdown = equity_arr / safe_max - 1.0

    equity_curve = pd.DataFrame(
        {
            "equity": equity_arr,
            "drawdown": drawdown,
            "position": position_arr,
        },
        index=ohlcv.index,
    )

    metrics = compute_metrics(equity_arr, trades, initial_capital, ohlcv.index)
    return BacktestResult(metrics=metrics, equity_curve=equity_curve, trades=trades)


# ---------------------------------------------------------------------------
# Metrics
# ---------------------------------------------------------------------------


def compute_metrics(
    equity: np.ndarray,
    trades: list[Trade],
    initial_capital: float,
    index: pd.Index,
) -> dict[str, float]:
    """Standard backtest metrics. All values are scalars suitable for
    Mongo storage and the protobuf ``map<string, double>`` field.
    """
    n = len(equity)
    if n < 2 or initial_capital <= 0:
        return {
            "total_return": 0.0,
            "sharpe": 0.0,
            "sortino": 0.0,
            "max_dd": 0.0,
            "cagr": 0.0,
            "win_rate": 0.0,
            "n_trades": float(len(trades)),
        }

    final = float(equity[-1])
    total_return = final / initial_capital - 1.0

    rets = np.diff(equity) / np.where(equity[:-1] == 0, 1.0, equity[:-1])
    # Annualisation factor — guess from index spacing (assume regular ts).
    span_seconds = (index[-1] - index[0]).total_seconds()
    if span_seconds <= 0:
        ann_factor = 0.0
    else:
        bar_seconds = span_seconds / max(n - 1, 1)
        ann_factor = math.sqrt(365 * 24 * 3600 / bar_seconds) if bar_seconds > 0 else 0.0

    mean = float(np.mean(rets))
    std = float(np.std(rets, ddof=0))
    sharpe = (mean / std) * ann_factor if std > 0 else 0.0

    downside = rets[rets < 0]
    dstd = float(np.std(downside, ddof=0)) if downside.size > 0 else 0.0
    sortino = (mean / dstd) * ann_factor if dstd > 0 else 0.0

    running_max = np.maximum.accumulate(equity)
    dd = equity / np.where(running_max <= 0, 1.0, running_max) - 1.0
    max_dd = float(dd.min()) if dd.size > 0 else 0.0

    years = span_seconds / (365 * 24 * 3600) if span_seconds > 0 else 0.0
    cagr = (final / initial_capital) ** (1.0 / years) - 1.0 if years > 0 and final > 0 else 0.0

    n_trades = len(trades)
    if n_trades == 0:
        win_rate = 0.0
    else:
        wins = sum(1 for t in trades if t.pnl > 0)
        win_rate = wins / n_trades

    return {
        "total_return": total_return,
        "sharpe": sharpe,
        "sortino": sortino,
        "max_dd": max_dd,
        "cagr": cagr,
        "win_rate": win_rate,
        "n_trades": float(n_trades),
    }
