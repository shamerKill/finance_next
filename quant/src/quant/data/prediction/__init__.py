"""Polymarket prediction-market data sources (Phase 9).

Three clients, all offline-test friendly via respx:

* :class:`PolymarketGammaClient` — market metadata catalogue
  (``https://gamma-api.polymarket.com/markets``).
* :class:`PolymarketCLOBClient`  — orderbook / trades / price-history
  (``https://clob.polymarket.com``).
* :class:`PolymarketWS`          — WebSocket subscriber for live book
  updates (basic skeleton; expand in Phase 9.1).

Storage targets (``infra/timescale/004_prediction.sql``):

* ``prediction_markets``  — metadata catalogue (NOT a hypertable; PK is text)
* ``prediction_quotes``   — orderbook snapshots (hypertable on ts)
* ``prediction_trades``   — executed trades, dedupe by tx_hash (hypertable on ts)
"""

from quant.data.prediction.polymarket_clob import PolymarketCLOBClient  # noqa: F401
from quant.data.prediction.polymarket_gamma import PolymarketGammaClient  # noqa: F401
from quant.data.prediction.polymarket_ws import PolymarketWS  # noqa: F401
from quant.data.prediction.types import (  # noqa: F401
    Orderbook,
    OrderbookLevel,
    PredictionMarket,
    PricePoint,
    Trade,
)
