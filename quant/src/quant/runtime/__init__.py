"""Phase 4 strategy runtime — long-lived asyncio task that polls active
strategies, computes signals against the latest OHLCV, and emits order
commands to the gateway via Redis Streams.

The runtime is the *only* component that turns a strategy config into an
order command. The gateway's order engine is the only component that
talks to Binance for writes. This split keeps execution policy +
rate-limiting in one place (Go) and signal computation in another
(Python), which is what the Phase 0 architecture commits to.
"""

from quant.runtime.runtime import StrategyRuntime, run_runtime

__all__ = ["StrategyRuntime", "run_runtime"]
