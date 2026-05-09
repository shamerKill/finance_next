"""Async token-bucket rate limiter, plus a per-exchange registry.

Rate limits aren't shared across processes yet — Phase 7 swaps in a Redis
backed implementation. For Phase 2 (single quant replica) in-memory is fine
and avoids the latency of a Redis round-trip per request.

Per-exchange defaults are derived from documented public limits:
    - Binance: 1200 weight per minute (we treat 1 request == 1 weight here;
      heavy endpoints can claim a bigger weight via :meth:`acquire(n=...)`).
    - OKX:     20 requests per 2 seconds per endpoint group.
    - Bybit:   600 requests per 5 seconds.

`acquire()` returns an awaitable that resolves once the request is permitted.
"""

from __future__ import annotations

import asyncio
import time
from dataclasses import dataclass


@dataclass
class _BucketState:
    capacity: float
    tokens: float
    refill_per_sec: float
    last_refill: float


class TokenBucket:
    """Classic leaky-bucket / token-bucket hybrid.

    We refill linearly at ``refill_per_sec`` up to ``capacity``. ``acquire``
    sleeps just long enough for the requested weight to be available — it
    never wakes early. Concurrent acquirers are serialized via an internal
    ``asyncio.Lock`` so token accounting is consistent.
    """

    def __init__(self, *, rate_per_sec: float, capacity: float) -> None:
        if rate_per_sec <= 0 or capacity <= 0:
            raise ValueError("rate_per_sec and capacity must be positive")
        self._state = _BucketState(
            capacity=capacity,
            tokens=capacity,
            refill_per_sec=rate_per_sec,
            last_refill=time.monotonic(),
        )
        self._lock = asyncio.Lock()

    async def acquire(self, weight: float = 1.0) -> None:
        """Block until ``weight`` tokens are available, then consume them.

        ``weight`` may exceed the current token count; we still admit it
        eventually (after sleeping). It must not exceed ``capacity`` — that
        request would never be satisfiable, so we raise instead of looping.
        """
        if weight <= 0:
            return
        if weight > self._state.capacity:
            raise ValueError(
                f"weight {weight} exceeds bucket capacity {self._state.capacity}"
            )

        while True:
            async with self._lock:
                self._refill_locked()
                if self._state.tokens >= weight:
                    self._state.tokens -= weight
                    return
                # Compute the exact wait so we wake at the moment the bucket
                # has enough tokens — avoids busy-spinning.
                deficit = weight - self._state.tokens
                wait_seconds = deficit / self._state.refill_per_sec
            # Sleep OUTSIDE the lock so other tasks can still update state.
            await asyncio.sleep(wait_seconds)

    def _refill_locked(self) -> None:
        now = time.monotonic()
        elapsed = now - self._state.last_refill
        if elapsed <= 0:
            return
        self._state.tokens = min(
            self._state.capacity,
            self._state.tokens + elapsed * self._state.refill_per_sec,
        )
        self._state.last_refill = now

    @property
    def tokens(self) -> float:
        """Best-effort current token count (no lock — fine for diagnostics)."""
        self._refill_locked()
        return self._state.tokens


# ---------------------------------------------------------------------------
# Per-exchange registry
# ---------------------------------------------------------------------------

_DEFAULT_BUCKETS: dict[str, tuple[float, float]] = {
    # exchange: (rate_per_sec, capacity)
    "binance": (1200 / 60.0, 1200.0),     # 1200 weight / min
    "okx":     (20 / 2.0, 20.0),          # 20 / 2s per endpoint group
    "bybit":   (600 / 5.0, 600.0),        # 600 / 5s
    "ashare":  (5.0, 10.0),               # AKShare scrapes; be polite.
}


class RateLimiterRegistry:
    """Lazy per-exchange :class:`TokenBucket` factory."""

    def __init__(self) -> None:
        self._buckets: dict[str, TokenBucket] = {}

    def get(self, exchange: str) -> TokenBucket:
        key = exchange.lower()
        if key not in self._buckets:
            try:
                rate, capacity = _DEFAULT_BUCKETS[key]
            except KeyError as exc:
                raise KeyError(f"no default rate limit configured for {exchange}") from exc
            self._buckets[key] = TokenBucket(rate_per_sec=rate, capacity=capacity)
        return self._buckets[key]


# Module-level singleton — quant runs as a single process per replica.
registry = RateLimiterRegistry()
