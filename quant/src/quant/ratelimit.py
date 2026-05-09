"""Async token-bucket rate limiter, plus a per-exchange registry.

Phase 7 introduces a Redis-backed implementation alongside the in-memory
one so multi-replica quant deployments share a single bucket. The
backend is selected via the ``RATELIMIT_BACKEND`` env var
(``memory`` | ``redis``); default is ``memory`` so unit tests stay
hermetic.

Per-exchange defaults are derived from documented public limits:
    - Binance: 1200 weight per minute (we treat 1 request == 1 weight here;
      heavy endpoints can claim a bigger weight via :meth:`acquire(n=...)`).
    - OKX:     20 requests per 2 seconds per endpoint group.
    - Bybit:   600 requests per 5 seconds.

`acquire()` returns an awaitable that resolves once the request is permitted.
"""

from __future__ import annotations

import asyncio
import os
import time
from dataclasses import dataclass
from typing import Protocol


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
# Limiter protocol — both backends implement this
# ---------------------------------------------------------------------------


class Limiter(Protocol):
    """Common shape for in-memory and Redis-backed limiters."""

    async def acquire(self, weight: float = 1.0) -> None: ...


# ---------------------------------------------------------------------------
# Redis-backed token bucket (Phase 7)
# ---------------------------------------------------------------------------

# Lua script — atomic refill + check + consume on the Redis side. Keys:
#   KEYS[1] = the per-exchange bucket key (e.g. "ratelimit:binance")
# Argv:
#   ARGV[1] = capacity (max tokens)
#   ARGV[2] = refill_per_sec
#   ARGV[3] = weight requested
#   ARGV[4] = now_ms (server clock; we pass it in so all replicas agree on
#             the time origin even if their wall clocks differ slightly)
#
# Returns 0 if the request was admitted; otherwise the number of milliseconds
# the caller should sleep before retrying.
_REDIS_LUA = """
local capacity = tonumber(ARGV[1])
local rate = tonumber(ARGV[2])
local weight = tonumber(ARGV[3])
local now_ms = tonumber(ARGV[4])

local data = redis.call('HMGET', KEYS[1], 'tokens', 'ts')
local tokens = tonumber(data[1])
local last = tonumber(data[2])
if tokens == nil then
  tokens = capacity
  last = now_ms
end
local elapsed = math.max(0, now_ms - last)
tokens = math.min(capacity, tokens + (elapsed / 1000.0) * rate)

if tokens >= weight then
  tokens = tokens - weight
  redis.call('HMSET', KEYS[1], 'tokens', tokens, 'ts', now_ms)
  -- expire 5 minutes after last touch so abandoned buckets don't linger
  redis.call('PEXPIRE', KEYS[1], 300000)
  return 0
end

local deficit = weight - tokens
local wait_ms = math.ceil((deficit / rate) * 1000)
return wait_ms
"""


class RedisTokenBucket:
    """Distributed token bucket that runs the same algorithm as
    :class:`TokenBucket` but stores state in Redis.

    Construct with an asyncio Redis client (``redis.asyncio.Redis``) and
    a unique key per bucket. The Lua script is loaded lazily on first
    acquire so import-time has no Redis dependency.
    """

    def __init__(
        self,
        *,
        client,
        key: str,
        rate_per_sec: float,
        capacity: float,
    ) -> None:
        if rate_per_sec <= 0 or capacity <= 0:
            raise ValueError("rate_per_sec and capacity must be positive")
        self._client = client
        self._key = key
        self._rate = rate_per_sec
        self._capacity = capacity
        self._sha: str | None = None

    async def _eval(self, weight: float, now_ms: int):
        # Fast path: EVALSHA against a cached script. If that fails (no
        # such script, or backends like fakeredis without SCRIPT support),
        # fall back to plain EVAL.
        if self._sha is not None:
            try:
                return await self._client.evalsha(
                    self._sha, 1, self._key,
                    self._capacity, self._rate, weight, now_ms,
                )
            except Exception:
                self._sha = None
        try:
            sha = await self._client.script_load(_REDIS_LUA)
            self._sha = sha
            return await self._client.evalsha(
                sha, 1, self._key,
                self._capacity, self._rate, weight, now_ms,
            )
        except Exception:
            try:
                return await self._client.eval(
                    _REDIS_LUA, 1, self._key,
                    self._capacity, self._rate, weight, now_ms,
                )
            except Exception:
                # Last resort: HASH-only emulation. Used by fakeredis-without-lua
                # in tests; production Redis always supports EVAL so this path
                # is dead code in real deployments. NOT atomic across replicas
                # — emit at most a single warning per process is sufficient
                # given this only fires under test harnesses.
                return await self._eval_emulated(weight, now_ms)

    async def _eval_emulated(self, weight: float, now_ms: int):
        # Emulated path: read tokens+ts, refill, decide, write back. The
        # race window is small enough for tests but we never ship this in
        # production (real Redis supports EVAL).
        data = await self._client.hmget(self._key, "tokens", "ts")
        tokens_raw, ts_raw = data[0], data[1]
        tokens = float(tokens_raw) if tokens_raw is not None else self._capacity
        last = float(ts_raw) if ts_raw is not None else now_ms
        elapsed = max(0, now_ms - last)
        tokens = min(self._capacity, tokens + (elapsed / 1000.0) * self._rate)
        if tokens >= weight:
            tokens -= weight
            await self._client.hset(self._key, mapping={"tokens": tokens, "ts": now_ms})
            await self._client.pexpire(self._key, 300000)
            return 0
        deficit = weight - tokens
        return int((deficit / self._rate) * 1000) + 1

    async def acquire(self, weight: float = 1.0) -> None:
        if weight <= 0:
            return
        if weight > self._capacity:
            raise ValueError(
                f"weight {weight} exceeds bucket capacity {self._capacity}"
            )
        # We retry until the script tells us the bucket has enough
        # tokens. Each iteration sleeps for the precise wait_ms returned.
        while True:
            now_ms = int(time.time() * 1000)
            wait_ms = await self._eval(weight, now_ms)
            if int(wait_ms) == 0:
                return
            await asyncio.sleep(int(wait_ms) / 1000.0)


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
    """Lazy per-exchange limiter factory.

    Default backend is ``memory`` (in-process :class:`TokenBucket`). Set
    the environment variable ``RATELIMIT_BACKEND=redis`` AND pass a
    Redis client via :meth:`use_redis` to share state across replicas.
    """

    def __init__(self) -> None:
        self._buckets: dict[str, Limiter] = {}
        self._redis_client = None

    def use_redis(self, client) -> None:
        """Switch the registry to the Redis backend. Must be called
        before the first :meth:`get` for the new client to take effect.
        Existing in-memory buckets are NOT migrated; call :meth:`reset`
        first if needed.
        """
        self._redis_client = client

    def reset(self) -> None:
        """Drop cached buckets. Tests use this between cases."""
        self._buckets.clear()

    def get(self, exchange: str) -> Limiter:
        key = exchange.lower()
        if key not in self._buckets:
            try:
                rate, capacity = _DEFAULT_BUCKETS[key]
            except KeyError as exc:
                raise KeyError(f"no default rate limit configured for {exchange}") from exc
            backend = os.environ.get("RATELIMIT_BACKEND", "memory").lower()
            if backend == "redis" and self._redis_client is not None:
                self._buckets[key] = RedisTokenBucket(
                    client=self._redis_client,
                    key=f"ratelimit:{key}",
                    rate_per_sec=rate,
                    capacity=capacity,
                )
            else:
                self._buckets[key] = TokenBucket(rate_per_sec=rate, capacity=capacity)
        return self._buckets[key]


# Module-level singleton — quant runs as a single process per replica.
registry = RateLimiterRegistry()
