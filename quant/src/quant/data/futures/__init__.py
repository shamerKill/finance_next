"""CN commodity / index futures sources (Phase 8).

Single source for v1: AKShare's daily endpoint covering SHFE / DCE /
CZCE commodity contracts plus CFFEX equity-index futures.

Storage convention: existing ``ohlcv`` Timescale hypertable;
``exchange ∈ {shfe, dce, czce, cffex}`` and ``symbol`` is the full
contract id (e.g. ``cu2412``, ``i2501``, ``IF2501``).
"""

from quant.data.futures.akshare_cn import AkshareCNFutures  # noqa: F401
