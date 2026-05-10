"""Equity OHLCV sources (Phase 8).

Two sources land in v1:

* :class:`AkshareCNEquities` — A 股 个股 daily / intraday via AKShare.
  Requires ``akshare`` package; uses ``stock_zh_a_hist`` (daily, qfq
  adjusted) and ``stock_zh_a_minute`` (intraday). Storage: existing
  ``ohlcv`` Timescale hypertable, ``exchange ∈ {sse, szse}``.
* :class:`YFinanceEquities` — US / HK / global daily + intraday via the
  ``yfinance`` package. Storage: existing ``ohlcv``,
  ``exchange ∈ {nyse, nasdaq, hkex, ...}``.

Symbol convention for storage: ``<symbol>.<exchange>`` (e.g.
``600519.sse``, ``AAPL.nasdaq``, ``00700.hkex``). This avoids
ambiguity when the same symbol exists on multiple venues.

Future paid sources (Polygon.io etc.) drop in next to these as
``polygon_stub.py`` raising :class:`quant.data.errors.ErrAPIKeyNotConfigured`.
"""

from quant.data.equities.akshare_cn import AkshareCNEquities  # noqa: F401
from quant.data.equities.yfinance_intl import YFinanceEquities  # noqa: F401
