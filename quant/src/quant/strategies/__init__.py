"""Strategy registry + the in-house signals→portfolio simulator.

Phase 3 ships two concrete strategies:

* :mod:`quant.strategies.grid_dca` — port of the existing ``Option`` schema
  semantics (margin tiers + stop-profit/loss) defined in
  ``client/data/type.d.ts``.

The :func:`get_strategy` helper resolves a kind discriminator to a callable
ready for :func:`base.run_backtest`.
"""

from __future__ import annotations

from typing import Any

from quant.strategies.base import BacktestResult, SignalSet, Strategy, run_backtest
from quant.strategies.grid_dca import GridDCAStrategy

__all__ = [
    "BacktestResult",
    "SignalSet",
    "Strategy",
    "run_backtest",
    "get_strategy",
]


def get_strategy(kind: str) -> Strategy:
    """Return the Strategy instance for a kind discriminator.

    Raises ``ValueError`` for unknown kinds — bubbled to the gRPC layer as
    ``INVALID_ARGUMENT`` so callers see exactly why their request failed.
    """
    k = (kind or "").lower()
    if k in ("grid_dca", "griddca", "grid"):
        return GridDCAStrategy()
    raise ValueError(f"unknown strategy kind: {kind!r}")


def list_kinds() -> list[str]:
    """Available strategy discriminators (UI dropdown source of truth)."""
    return ["grid_dca"]


# Re-export type alias so callers can `from quant.strategies import Params`.
Params = dict[str, Any]
