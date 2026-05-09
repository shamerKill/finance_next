"""Grid DCA strategy — port of the existing ``Option`` schema semantics.

Reference: ``client/data/type.d.ts``::

    createPositions: [{ marginRate, lossAddRate }]
    stopProfitRate
    stopLossRate
    profitRateAfterAtAddPosition
    createCostOrderInProfit  # Phase 4 only — implies a follow-up break-even order

The original NestJS code never executed orders so there's no "ground truth"
to mirror byte-for-byte. We codify the semantics that the documentation
implies: open the first margin tier on bar 0, add the next tier when the
price drops by ``lossAddRate`` from the *average entry*, exit at average
entry × (1 + profit_target). ``profit_target`` shrinks after each add so
DCA-laddered positions exit faster on a small bounce.

This strategy is long-only (the schema doesn't carry a side flag). Phase 4
will revisit when live execution lands.
"""

from __future__ import annotations

from collections.abc import Sequence
from dataclasses import dataclass
from typing import Any

import numpy as np
import pandas as pd

from quant.strategies.base import SignalSet


@dataclass
class _Tier:
    margin_rate: float  # fraction of account capital
    loss_add_rate: float  # 0 for tier 0; e.g. 0.02 = add when price -2% from avg


def _parse_tiers(raw: Sequence[dict[str, Any]] | None) -> list[_Tier]:
    if not raw:
        # Fallback: single tier at full deployment.
        return [_Tier(margin_rate=1.0, loss_add_rate=0.0)]
    out: list[_Tier] = []
    for i, item in enumerate(raw):
        # Accept both camelCase (gateway/Mongo) and snake_case (proto/JSON
        # debug output) — proto Struct passes either through.
        margin_rate = float(item.get("marginRate", item.get("margin_rate", 0.0)))
        loss_add_rate = float(item.get("lossAddRate", item.get("loss_add_rate", 0.0)))
        if margin_rate < 0 or margin_rate > 1.0:
            raise ValueError(f"tier {i}: marginRate must be in [0,1]")
        if loss_add_rate < 0:
            raise ValueError(f"tier {i}: lossAddRate must be >= 0")
        out.append(_Tier(margin_rate=margin_rate, loss_add_rate=loss_add_rate))
    return out


class GridDCAStrategy:
    """Long-only grid DCA with stop-profit / stop-loss.

    Parameters dict (JSON-serialised on the wire, decoded by the gateway):

    * ``createPositions``: list of ``{marginRate, lossAddRate}`` dicts. The
      first tier opens immediately on the first bar; subsequent tiers add
      when price drops by ``lossAddRate`` from the running average entry.
    * ``stopProfitRate``: take-profit threshold above avg entry, e.g.
      ``0.03`` = +3%.
    * ``stopLossRate``: stop-loss threshold below avg entry, e.g.
      ``0.10`` = -10%.
    * ``profitRateAfterAtAddPosition`` (optional): per-add reduction of
      ``stopProfitRate``. After N adds, target = stopProfitRate × max(
      1 - N × profitRateAfterAtAddPosition, 0.1) — clipped at 10% of the
      original target so DCA ladders never go to zero.
    """

    def signals(self, ohlcv: pd.DataFrame, params: dict[str, Any]) -> SignalSet:
        if "close" not in ohlcv.columns:
            raise ValueError("ohlcv must have a 'close' column")
        tiers = _parse_tiers(params.get("createPositions"))
        stop_profit = float(params.get("stopProfitRate", 0.03))
        stop_loss = float(params.get("stopLossRate", 0.10))
        profit_decay = float(params.get("profitRateAfterAtAddPosition", 0.0))

        n = len(ohlcv)
        closes = ohlcv["close"].to_numpy(dtype=np.float64)

        entries = np.zeros(n, dtype=bool)
        exits = np.zeros(n, dtype=bool)
        # Cumulative sizing weights (fraction of initial capital deployed
        # by tier). Indexed from 1 because tier 0 is "no entry yet".
        sizes = np.zeros(n, dtype=np.float64)

        # State
        in_position = False
        avg_entry = 0.0
        invested_qty = 0.0  # base units, used to derive avg entry
        invested_quote = 0.0  # quote currency invested
        next_tier = 0  # index into tiers; 0 means "open initial"
        cumulative_weight = 0.0

        for i in range(n):
            price = closes[i]

            if not in_position:
                # Open tier 0 on the first bar that has data. The runner
                # will shift +1 so execution is on bar 1's open — that's
                # the contract.
                t0 = tiers[0]
                entries[i] = True
                cumulative_weight = t0.margin_rate
                sizes[i] = cumulative_weight
                # Bookkeep at-the-close for state — runner will recompute
                # the actual fill at the next bar's open.
                avg_entry = price
                invested_qty = t0.margin_rate / price if price > 0 else 0.0
                invested_quote = t0.margin_rate
                next_tier = 1
                in_position = True
                continue

            # In position: check exit thresholds first (cheaper to compute).
            n_adds = max(next_tier - 1, 0)
            target_profit = stop_profit * max(1.0 - n_adds * profit_decay, 0.1)
            tp_price = avg_entry * (1.0 + target_profit)
            sl_price = avg_entry * (1.0 - stop_loss)

            if price >= tp_price or price <= sl_price:
                exits[i] = True
                # Reset state — next bar can re-enter.
                in_position = False
                avg_entry = 0.0
                invested_qty = 0.0
                invested_quote = 0.0
                next_tier = 0
                cumulative_weight = 0.0
                # Carry forward last weight for sizes (shouldn't matter since
                # entry will be False on this bar, but keep the array dense).
                sizes[i] = cumulative_weight
                continue

            # Maybe add: when price has fallen by tiers[next_tier].lossAddRate
            # from the running average entry.
            if next_tier < len(tiers):
                tier = tiers[next_tier]
                add_threshold = avg_entry * (1.0 - tier.loss_add_rate)
                if tier.loss_add_rate > 0 and price <= add_threshold:
                    entries[i] = True
                    new_quote = invested_quote + tier.margin_rate
                    new_qty = invested_qty + (tier.margin_rate / price if price > 0 else 0.0)
                    avg_entry = new_quote / new_qty if new_qty > 0 else avg_entry
                    invested_qty = new_qty
                    invested_quote = new_quote
                    cumulative_weight += tier.margin_rate
                    sizes[i] = cumulative_weight
                    next_tier += 1
                    continue

            sizes[i] = cumulative_weight

        return SignalSet(
            entries=pd.Series(entries, index=ohlcv.index, name="entries"),
            exits=pd.Series(exits, index=ohlcv.index, name="exits"),
            sizes=pd.Series(sizes, index=ohlcv.index, name="sizes"),
        )
