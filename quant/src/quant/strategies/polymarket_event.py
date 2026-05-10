"""Polymarket event-trading strategy (Phase 9 example).

The strategy compares an outcome's *implied probability* (mid price ≈ p)
against a calibration *prior* (manually set, or learned offline). When
implied diverges from prior by more than ``threshold``, emit a BUY
(implied < prior) or SELL (implied > prior) signal.

Backtest PnL for binary markets is winner-take-all at resolve time:
* If position is YES and outcome resolves YES → realised = (1.0 - entry_price) * size
* If position is YES and outcome resolves NO  → realised = -entry_price * size
* SELL/short is the mirror image.

The intra-bar mark-to-market is just current_mid * size, so equity
curve interpolation works the same way as for spot OHLCV strategies.
"""

from __future__ import annotations

from dataclasses import dataclass


@dataclass
class PolymarketEventStrategy:
    """Mean-reversion-to-prior on an outcome token."""

    prior: float = 0.5
    threshold: float = 0.05
    size: float = 10.0  # USDC notional per signal (interpreted by sim)

    def signals(self, mid_prices: list[float]) -> list[str]:
        """Return one signal per bar: ``"BUY"``, ``"SELL"``, or ``""``.

        Uses the bar's CLOSING mid; the simulator must shift(1) to apply
        on the next bar (no look-ahead). The strategy itself doesn't
        know about that — it just emits per-bar.
        """
        out: list[str] = []
        for p in mid_prices:
            if p <= 0 or p >= 1:
                out.append("")
                continue
            if p < self.prior - self.threshold:
                out.append("BUY")  # outcome under-priced, take YES
            elif p > self.prior + self.threshold:
                out.append("SELL")
            else:
                out.append("")
        return out


def realised_pnl_at_resolve(
    *,
    side: str,           # "BUY" (long YES) or "SELL" (short YES)
    entry_price: float,  # mid at entry, in (0, 1)
    size: float,         # USDC notional
    outcome_yes: bool,
) -> float:
    """Compute realised USDC PnL at market resolution.

    Note: a "size" of N USDC at entry_price p buys N/p shares of YES;
    each share pays $1 if YES wins, $0 otherwise. Net PnL therefore is::

        shares = size / entry_price
        if outcome_yes: pnl = shares * 1.0 - size = size * (1/p - 1)
        else:           pnl = -size

    For SELL (short YES via opposite outcome token): mirror image.
    """
    if entry_price <= 0 or entry_price >= 1 or size <= 0:
        return 0.0
    if side == "BUY":
        return size * (1.0 / entry_price - 1.0) if outcome_yes else -size
    if side == "SELL":
        # SELL = buy the NO token at (1 - entry_price). Equivalent shares:
        no_price = 1.0 - entry_price
        if no_price <= 0:
            return 0.0
        return size * (1.0 / no_price - 1.0) if (not outcome_yes) else -size
    return 0.0
