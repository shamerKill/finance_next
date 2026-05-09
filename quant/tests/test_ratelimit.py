"""Token bucket unit tests."""

from __future__ import annotations

import asyncio
import time

import pytest

from quant.ratelimit import RateLimiterRegistry, TokenBucket


async def test_acquire_within_capacity_does_not_block() -> None:
    bucket = TokenBucket(rate_per_sec=10, capacity=5)
    t0 = time.monotonic()
    for _ in range(5):
        await bucket.acquire()
    elapsed = time.monotonic() - t0
    assert elapsed < 0.05, f"5 fast acquires should be near-instant, took {elapsed:.3f}s"


async def test_acquire_blocks_when_drained() -> None:
    # 10 tokens/sec, capacity 1: every extra acquire after the first
    # should wait ~0.1s for the next refill.
    bucket = TokenBucket(rate_per_sec=10, capacity=1)
    await bucket.acquire()  # consume the seed token

    t0 = time.monotonic()
    await bucket.acquire()
    elapsed = time.monotonic() - t0
    # 0.1s expected; allow generous slack for slow CI.
    assert 0.05 < elapsed < 0.5, f"expected ~0.1s wait, got {elapsed:.3f}s"


async def test_acquire_zero_weight_is_noop() -> None:
    bucket = TokenBucket(rate_per_sec=1, capacity=1)
    await bucket.acquire(0)
    # A zero-weight acquire mustn't drain the bucket.
    assert bucket.tokens >= 0.99


async def test_acquire_over_capacity_raises() -> None:
    bucket = TokenBucket(rate_per_sec=10, capacity=1)
    with pytest.raises(ValueError):
        await bucket.acquire(weight=2)


async def test_concurrent_acquires_serialized() -> None:
    bucket = TokenBucket(rate_per_sec=10, capacity=2)
    # 4 concurrent acquires: first 2 instant, 3rd waits ~0.1s, 4th ~0.2s.
    t0 = time.monotonic()
    await asyncio.gather(*(bucket.acquire() for _ in range(4)))
    elapsed = time.monotonic() - t0
    assert 0.15 < elapsed < 0.6


def test_registry_returns_same_bucket() -> None:
    reg = RateLimiterRegistry()
    a = reg.get("binance")
    b = reg.get("BINANCE")
    assert a is b


def test_registry_unknown_exchange_raises() -> None:
    reg = RateLimiterRegistry()
    with pytest.raises(KeyError):
        reg.get("nonexistent")
