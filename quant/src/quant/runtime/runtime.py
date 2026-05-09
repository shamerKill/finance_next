"""Long-lived asyncio loop that publishes order commands for active
strategies.

Lifecycle
---------
The runtime is started by ``quant.main.lifespan`` and lives for the
duration of the FastAPI process. It stops cleanly when the lifespan
context exits or when ``QUANT_RUNTIME_DISABLED=true`` is set in the env
(the loop never starts in that case — useful for tests / cold starts).

Per-tick algorithm (every ``poll_interval`` seconds, default 60s):

    1. Query Mongo ``options`` for documents with ``live.enabled=true``.
       (We don't yet rename the collection to ``strategies`` — that's
       Phase 6. Each "strategy" today is one Option document.)
    2. For each active strategy:
       a. Load the strategy's most recent N bars from TimescaleDB
          (per its ``execSymbol`` and a configured timeframe).
       b. Run the matching strategy class (today: ``grid_dca``) to
          generate ``SignalSet``.
       c. Compare the LAST bar's signals against the per-strategy
          ``last_seen_bar`` cache. If a fresh entry/exit/add fires on
          the last bar, build a ``SubmitOrderCommand``.
       d. Publish to Redis Stream ``command.order.submit`` with an
          ``idempotencyKey = "<strategy_id>:<kind>:<symbol>:<bar_ts>"``
          so re-running on the same bar collapses on the gateway side.

Idempotency
-----------
The runtime is intentionally re-entry safe: if it crashes and restarts
mid-bar, the gateway's deterministic clientOrderId derivation maps the
same idempotency key to the same Binance ``newClientOrderId``, and the
gateway's ``order_log`` unique index causes the second submission to
collapse onto the existing row.

Why poll instead of WS?
-----------------------
For Phase 4 we don't need sub-second reaction time. Polling Mongo + the
last few hundred bars from Timescale every minute is a cheap and
debuggable contract. Phase 5+ will revisit when latency-sensitive
strategies land — at that point the natural progression is a Redis
``event.ohlcv.ingested`` subscriber instead of a wallclock tick.
"""

from __future__ import annotations

import asyncio
import json
import logging
import os
from collections.abc import Awaitable, Callable
from dataclasses import dataclass
from datetime import UTC, datetime
from typing import Any

import pandas as pd

from quant.strategies.base import Strategy
from quant.strategies.grid_dca import GridDCAStrategy

log = logging.getLogger(__name__)


COMMAND_SUBMIT_STREAM = "command.order.submit"

# Strategy registry. Phase 5 onward this would grow to include OKX-only
# strategies etc.; for now it's a single class.
_STRATEGY_REGISTRY: dict[str, Callable[[], Strategy]] = {
    "grid_dca": lambda: GridDCAStrategy(),
}


def get_strategy(kind: str) -> Strategy:
    """Look up a registered strategy by kind. Raises KeyError on miss."""
    factory = _STRATEGY_REGISTRY.get(kind)
    if factory is None:
        raise KeyError(f"unknown strategy kind: {kind}")
    return factory()


@dataclass
class StrategyTick:
    """Internal result of evaluating one strategy on its latest bars.

    Attributes mirror what we'd publish to Redis. ``command`` may be
    None when no fresh signal fires on the last bar.
    """

    strategy_id: str
    bar_ts: datetime | None
    command: dict[str, Any] | None


class StrategyRuntime:
    """Async runtime loop. One instance per gateway process.

    Constructor takes injected dependencies so tests can swap in
    in-memory fakes (mongomock-style mongo, fakeredis, fixed-bar
    Timescale fetcher).
    """

    def __init__(
        self,
        *,
        mongo_db: Any,
        redis_client: Any,
        # ohlcv_fetcher: async (exchange, symbol, timeframe, n) -> pd.DataFrame
        ohlcv_fetcher: Callable[[str, str, str, int], Awaitable[pd.DataFrame]],
        poll_interval: float = 60.0,
        bars_per_tick: int = 250,
        clock: Callable[[], datetime] | None = None,
        log: logging.Logger | None = None,
    ) -> None:
        self._mongo = mongo_db
        self._redis = redis_client
        self._fetch = ohlcv_fetcher
        self._poll_interval = poll_interval
        self._bars_per_tick = bars_per_tick
        self._clock = clock or (lambda: datetime.now(tz=UTC))
        self._log = log or logging.getLogger(__name__)
        # Per-strategy last-seen bar timestamp. We use the bar ts (not
        # an event count) so a runtime restart that re-reads the same
        # last bar still doesn't double-emit.
        self._last_bar: dict[str, datetime] = {}
        self._stopped = asyncio.Event()

    async def stop(self) -> None:
        """Signal the run loop to exit at the next iteration."""
        self._stopped.set()

    async def run(self) -> None:
        """Run forever (or until ``stop()``)."""
        self._log.info(
            "runtime starting", extra={"poll_interval": self._poll_interval}
        )
        try:
            while not self._stopped.is_set():
                try:
                    await self.tick_once()
                except Exception:  # noqa: BLE001
                    # A single tick failure must not bring down the loop.
                    self._log.exception("runtime tick failed")
                # Sleep with cancel-friendly wait.
                try:
                    await asyncio.wait_for(self._stopped.wait(), timeout=self._poll_interval)
                except TimeoutError:
                    pass
        finally:
            self._log.info("runtime stopped")

    async def tick_once(self) -> list[StrategyTick]:
        """Process one polling tick. Returned list is for tests; the
        caller doesn't need it.
        """
        active = await self._load_active_strategies()
        results: list[StrategyTick] = []
        for opt in active:
            try:
                tick = await self._evaluate_strategy(opt)
            except Exception:  # noqa: BLE001
                self._log.exception(
                    "strategy evaluation failed",
                    extra={"strategy_id": str(opt.get("_id"))},
                )
                continue
            results.append(tick)
            if tick.command is not None:
                await self._publish_command(tick.command)
        return results

    async def _load_active_strategies(self) -> list[dict[str, Any]]:
        """Query Mongo for live-enabled documents.

        We don't filter by `live.mode` — both testnet and mainnet flow
        through the gateway risk gate. The gate enforces mainnet
        permission separately.
        """
        cursor = self._mongo["options"].find({"live.enabled": True})
        # motor's cursor.to_list when available; mongomock-async returns
        # a normal async iterator.
        if hasattr(cursor, "to_list"):
            return await cursor.to_list(length=500)
        out: list[dict[str, Any]] = []
        async for doc in cursor:
            out.append(doc)
        return out

    async def _evaluate_strategy(self, opt: dict[str, Any]) -> StrategyTick:
        strategy_id = str(opt.get("_id") or opt.get("id") or "")
        symbol = opt.get("execSymbol") or ""
        live = opt.get("live") or {}
        kind = live.get("kind") or "grid_dca"
        # `timeframe` lives on the strategy doc once we attach it; today
        # we default to 1h to keep poll cost low.
        timeframe = (live.get("timeframe") or "1h")
        exchange = (live.get("exchange") or "binance")

        if not strategy_id or not symbol:
            return StrategyTick(strategy_id=strategy_id, bar_ts=None, command=None)

        ohlcv = await self._fetch(exchange, symbol, timeframe, self._bars_per_tick)
        if ohlcv is None or len(ohlcv) < 2:
            return StrategyTick(strategy_id=strategy_id, bar_ts=None, command=None)

        params = {
            "createPositions": opt.get("createPositions") or [],
            "stopProfitRate": opt.get("stopProfitRate", 0.03),
            "stopLossRate": opt.get("stopLossRate", 0.10),
            "profitRateAfterAtAddPosition": opt.get(
                "profitRateAfterAtAddPosition", 0.0
            ),
        }
        strategy = get_strategy(kind)
        signals = strategy.signals(ohlcv, params)

        last_idx = len(ohlcv) - 1
        last_ts_obj = ohlcv.index[last_idx]
        last_ts = (
            last_ts_obj.to_pydatetime()
            if hasattr(last_ts_obj, "to_pydatetime")
            else last_ts_obj
        )
        if last_ts.tzinfo is None:
            last_ts = last_ts.replace(tzinfo=UTC)

        prev_seen = self._last_bar.get(strategy_id)
        # Skip if we've already processed this bar (or a more recent one
        # — clock skew between Timescale and the runtime can momentarily
        # show an older bar). Always advance the marker so the cache
        # converges on the latest seen.
        if prev_seen is not None and last_ts <= prev_seen:
            return StrategyTick(strategy_id=strategy_id, bar_ts=last_ts, command=None)
        self._last_bar[strategy_id] = last_ts

        # On the first observation of a strategy, don't fire signals
        # against the last bar — we don't know whether the previous run
        # already emitted that command. The gateway's deterministic
        # idempotency key would dedupe, but emitting a *new* one for a
        # historical bar is misleading. Wait for the *next* bar.
        if prev_seen is None:
            return StrategyTick(strategy_id=strategy_id, bar_ts=last_ts, command=None)

        is_entry = bool(signals.entries.iloc[last_idx])
        is_exit = bool(signals.exits.iloc[last_idx])
        if not is_entry and not is_exit:
            return StrategyTick(strategy_id=strategy_id, bar_ts=last_ts, command=None)

        if is_entry and is_exit:
            # Conflict — don't act.
            self._log.warning(
                "strategy emitted both entry and exit on same bar; skipping",
                extra={"strategy_id": strategy_id, "bar_ts": last_ts.isoformat()},
            )
            return StrategyTick(strategy_id=strategy_id, bar_ts=last_ts, command=None)

        # Sizing: derive qty from per-strategy `risk.maxPositionUsd` and
        # the bar's close. The runtime intentionally does NOT have full
        # access to wallet balance — the gateway's risk gate is the
        # authoritative size-cap enforcer. We just pick a notional under
        # the cap and let the gate accept/reject.
        risk = opt.get("risk") or {}
        max_notional = float(risk.get("maxPositionUsd", 0.0))
        if max_notional <= 0:
            self._log.warning(
                "strategy missing risk.maxPositionUsd; refusing to size order",
                extra={"strategy_id": strategy_id},
            )
            return StrategyTick(strategy_id=strategy_id, bar_ts=last_ts, command=None)

        # Use a conservative 0.5x of max for the sized order to leave
        # room for adds. Phase 5 will replace with proper portfolio sizing.
        notional = max_notional * 0.5
        last_close = float(ohlcv["close"].iloc[last_idx])
        if last_close <= 0:
            return StrategyTick(strategy_id=strategy_id, bar_ts=last_ts, command=None)
        qty = round(notional / last_close, 6)
        if qty <= 0:
            return StrategyTick(strategy_id=strategy_id, bar_ts=last_ts, command=None)

        signal_kind = "entry" if is_entry else "exit"
        side = "BUY" if is_entry else "SELL"
        idempotency_key = f"{strategy_id}:{signal_kind}:{symbol}:{int(last_ts.timestamp())}"
        command = {
            "strategyId": strategy_id,
            "accountId": live.get("accountId", ""),
            "symbol": symbol,
            "side": side,
            "type": "MARKET",
            "qty": qty,
            "markPrice": last_close,
            "idempotencyKey": idempotency_key,
        }
        return StrategyTick(strategy_id=strategy_id, bar_ts=last_ts, command=command)

    async def _publish_command(self, command: dict[str, Any]) -> str:
        """XADD the command to the order-engine stream."""
        return await self._redis.xadd(
            COMMAND_SUBMIT_STREAM,
            {"data": json.dumps(command)},
        )


async def run_runtime(
    *,
    mongo_db: Any,
    redis_client: Any,
    ohlcv_fetcher: Callable[[str, str, str, int], Awaitable[pd.DataFrame]],
    poll_interval: float = 60.0,
) -> StrategyRuntime | None:
    """Construct + start the runtime in a background task.

    Returns the constructed runtime so the caller can `await rt.stop()`
    on shutdown. Returns ``None`` (and logs at INFO) when
    ``QUANT_RUNTIME_DISABLED=true`` is set.
    """
    if os.getenv("QUANT_RUNTIME_DISABLED", "").lower() in {"1", "true", "yes"}:
        log.info("runtime disabled via QUANT_RUNTIME_DISABLED")
        return None
    rt = StrategyRuntime(
        mongo_db=mongo_db,
        redis_client=redis_client,
        ohlcv_fetcher=ohlcv_fetcher,
        poll_interval=poll_interval,
    )
    asyncio.create_task(rt.run())
    return rt
