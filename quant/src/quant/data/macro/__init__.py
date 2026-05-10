"""Macro indicator sources (Phase 8).

Two sources cover v1:

* :class:`FREDClient` — US / global series via the FRED REST API
  (St. Louis Fed). Requires ``FRED_API_KEY``; raises
  :class:`quant.data.errors.ErrAPIKeyNotConfigured` at construction
  when unset.
* :class:`AkshareCNMacro` — CN macro indicators via AKShare
  (CPI / PPI / M2 / GDP / PMI).

Storage: new ``macro_indicators`` Timescale hypertable, schema
``(source, code, ts, value, unit)`` with PK on (source, code, ts).
"""

from quant.data.macro.akshare_cn import AkshareCNMacro, MacroPoint  # noqa: F401
from quant.data.macro.fred import FREDClient  # noqa: F401
