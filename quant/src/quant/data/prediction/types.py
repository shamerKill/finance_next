"""Dataclasses for the Polymarket data layer.

Storage shape mirrors the Timescale tables in
``infra/timescale/004_prediction.sql``. The Mongo-side equivalent
lives in the gateway's ``domain.PredictionStrategy`` /
``PredictionOrderLog`` (Go); this module only covers the upstream
data-source rows.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime


@dataclass(slots=True)
class PredictionMarket:
    """One row of ``prediction_markets``.

    ``market_id`` is the Polymarket slug or condition id — stable
    across snapshots so quotes/trades can foreign-reference cheaply.
    """

    source: str
    market_id: str
    condition_id: str
    question: str
    end_date: datetime | None = None
    category: str = ""
    tags: list[str] = field(default_factory=list)
    # Per-market token ids (YES, NO). Carrying them on the metadata
    # row lets downstream callers fan out to /book without re-hitting
    # the gamma API.
    token_ids: list[str] = field(default_factory=list)


@dataclass(slots=True)
class OrderbookLevel:
    """One side level (price, size)."""

    price: float
    size: float


@dataclass(slots=True)
class Orderbook:
    """A single orderbook snapshot for one outcome token."""

    market_id: str
    token_id: str
    ts: datetime
    bids: list[OrderbookLevel] = field(default_factory=list)
    asks: list[OrderbookLevel] = field(default_factory=list)

    @property
    def mid(self) -> float | None:
        """Midpoint of best bid + best ask, or None when one side is empty."""
        if not self.bids or not self.asks:
            return None
        return (self.bids[0].price + self.asks[0].price) / 2


@dataclass(slots=True)
class Trade:
    """One row of ``prediction_trades``."""

    id: str
    market_id: str
    token_id: str
    ts: datetime
    side: str  # "BUY" or "SELL"
    price: float
    size: float
    tx_hash: str = ""


@dataclass(slots=True)
class PricePoint:
    """One historical price point — used by ``prices-history`` endpoint."""

    ts: datetime
    price: float
