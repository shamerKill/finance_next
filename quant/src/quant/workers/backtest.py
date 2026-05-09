"""Arq task + sync entry point for running a backtest.

Persistence:
  * Mongo ``backtest_results`` head doc (status + metrics + params snapshot)
  * Timescale ``equity_curve`` hypertable (per-bar curve)
  * Redis Stream events:
      - ``event.backtest.progress`` (every ~10% or every 100 bars)
      - ``event.backtest.completed`` (terminal state)

Tests inject:
  * ``ohlcv_loader`` — a callable returning the OHLCV DataFrame, so the
    worker doesn't need a real Timescale.
  * ``mongo_db`` — a mongomock-style db; production resolves via
    :func:`quant.data.mongo.get_db`.
  * ``redis_client`` — fakeredis is fine.
  * ``equity_writer`` — ``async (run_id, rows) -> None``; production wires
    to :func:`quant.data.timescale.insert_equity_curve`.
"""

from __future__ import annotations

import asyncio
import logging
import math
import uuid
from collections.abc import Awaitable, Callable
from datetime import UTC, datetime
from typing import Any

import pandas as pd

from quant.events import redis_stream
from quant.strategies import get_strategy, run_backtest

log = logging.getLogger(__name__)


STATE_PENDING = 1
STATE_RUNNING = 2
STATE_COMPLETED = 3
STATE_FAILED = 4

# Type aliases for the injection seams.
OhlcvLoader = Callable[..., Awaitable[pd.DataFrame]]
EquityWriter = Callable[[str, list[tuple[datetime, float, float, float]]], Awaitable[int]]


def new_run_id() -> str:
    """Hex run-id; suitable as a Mongo string PK + Timescale text key."""
    return uuid.uuid4().hex


def _utcnow() -> datetime:
    return datetime.now(UTC)


async def create_pending_doc(
    mongo_db: Any,
    *,
    run_id: str,
    request: dict[str, Any],
) -> None:
    """Insert the head doc with state=PENDING. Called synchronously by gRPC."""
    await mongo_db["backtest_results"].insert_one(
        {
            "_id": run_id,
            "runId": run_id,
            "strategyId": request.get("strategy_id"),
            "kind": request.get("kind"),
            "params": request.get("params") or {},
            "request": request,
            "state": STATE_PENDING,
            "progress": 0.0,
            "metrics": {},
            "trades": [],
            "createdAt": _utcnow(),
            "startedAt": None,
            "finishedAt": None,
            "error": "",
        }
    )


async def run_backtest_task(
    ctx: dict[str, Any] | None,
    run_id: str,
    request: dict[str, Any],
    *,
    ohlcv_loader: OhlcvLoader | None = None,
    equity_writer: EquityWriter | None = None,
    mongo_db: Any | None = None,
    redis_client: Any | None = None,
) -> dict[str, Any]:
    """Execute a backtest end-to-end. Returns the final head-doc payload.

    All side effects are best-effort — a failed Redis publish must not abort
    the run. Mongo/Timescale failures DO surface as FAILED state.
    """
    ctx = ctx or {}
    mongo_db = mongo_db or _resolve_mongo(ctx)
    redis_client = redis_client or ctx.get("redis")
    ohlcv_loader = ohlcv_loader or _default_ohlcv_loader
    equity_writer = equity_writer or _default_equity_writer

    started_at = _utcnow()
    error_msg = ""
    metrics: dict[str, float] = {}
    final_state = STATE_FAILED
    trades_payload: list[dict[str, Any]] = []
    # Tracked outside the try-block so the finally-style head-update can
    # report whatever progress the run reached before failing.
    last_emit = {"value": 0.0}

    try:
        await mongo_db["backtest_results"].update_one(
            {"_id": run_id},
            {"$set": {"state": STATE_RUNNING, "startedAt": started_at, "progress": 0.0}},
        )

        strategy = get_strategy(request.get("kind") or "")
        params = request.get("params") or {}

        ohlcv = await ohlcv_loader(
            exchange=request["exchange"],
            symbol=request["symbol"],
            timeframe=request["timeframe"],
            start=_to_dt(request["start"]),
            end=_to_dt(request["end"]),
        )
        if ohlcv is None or ohlcv.empty:
            raise ValueError("no OHLCV data in requested range; ingest first")

        # ---- progress callback wiring ---------------------------------
        last_emit["value"] = 0.0
        last_publish = {"value": -1.0}

        def on_progress(progress: float, recent_equity: list[float]) -> None:
            last_emit["value"] = progress
            # Emit if we've advanced ≥ 0.1, capped to handle 100-bar dataset.
            if progress - last_publish["value"] < 0.1 and progress < 1.0:
                return
            last_publish["value"] = progress
            if redis_client is not None:
                # Schedule the publish on the running loop. ``asyncio.run``
                # is wrong here (we're already inside a loop). We use
                # ensure_future so callers don't await per-bar.
                asyncio.ensure_future(
                    redis_stream.publish_backtest_progress(
                        redis_client,
                        run_id=run_id,
                        progress=progress,
                        recent_equity=list(recent_equity),
                        state=STATE_RUNNING,
                    )
                )

        commission = float(request.get("commission_rate") or 0.0)
        if commission <= 0:
            commission = 0.0004
        slippage_bps = float(request.get("slippage_bps") or 0.0)
        if slippage_bps <= 0:
            slippage_bps = 1.0
        initial_capital = float(request.get("initial_capital") or 10_000.0)

        # The simulator is CPU-bound; running it in the event loop is fine
        # for Phase 3 (single backtest at a time). Phase 6 (Optuna) will
        # offload to a process pool.
        result = run_backtest(
            strategy,
            ohlcv,
            params,
            initial_capital=initial_capital,
            commission=commission,
            slippage_bps=slippage_bps,
            progress_callback=on_progress,
        )

        # ---- persist equity curve to Timescale -------------------------
        rows: list[tuple[datetime, float, float, float]] = []
        for ts, row in result.equity_curve.iterrows():
            ts_dt = ts.to_pydatetime() if hasattr(ts, "to_pydatetime") else ts
            equity = _scalar(row["equity"])
            drawdown = _scalar(row["drawdown"])
            position = _scalar(row["position"])
            if any(map(_nan_or_inf, (equity, drawdown, position))):
                continue
            rows.append((ts_dt, equity, drawdown, position))
        await equity_writer(run_id, rows)

        # ---- assemble trades for Mongo head doc ------------------------
        for t in result.trades:
            trades_payload.append(
                {
                    "entryTs": t.entry_ts,
                    "exitTs": t.exit_ts,
                    "entryPrice": _scalar(t.entry_price),
                    "exitPrice": _scalar(t.exit_price),
                    "size": _scalar(t.size),
                    "pnl": _scalar(t.pnl),
                    "returnPct": _scalar(t.return_pct),
                    "nAdds": int(t.n_adds),
                    "exitReason": t.exit_reason,
                }
            )

        metrics = {k: _scalar(v) for k, v in result.metrics.items()}
        final_state = STATE_COMPLETED

    except Exception as exc:  # noqa: BLE001 — surface every failure as FAILED
        log.exception("backtest run failed", extra={"run_id": run_id})
        error_msg = str(exc)
        final_state = STATE_FAILED

    finished_at = _utcnow()
    head_update = {
        "state": final_state,
        "progress": 1.0 if final_state == STATE_COMPLETED else float(last_emit["value"]),
        "metrics": metrics,
        "trades": trades_payload,
        "finishedAt": finished_at,
        "error": error_msg,
    }
    try:
        await mongo_db["backtest_results"].update_one({"_id": run_id}, {"$set": head_update})
    except Exception as exc:  # noqa: BLE001
        log.warning("mongo head update failed: %s", exc)

    if redis_client is not None:
        try:
            await redis_stream.publish_backtest_completed(
                redis_client,
                run_id=run_id,
                strategy_id=str(request.get("strategy_id") or ""),
                metrics=metrics,
                state=final_state,
                error_message=error_msg,
                finished_at=finished_at,
            )
        except Exception as exc:  # noqa: BLE001 — never raise on event publish
            log.warning("backtest.completed publish failed: %s", exc)

    return {
        "run_id": run_id,
        "state": final_state,
        "metrics": metrics,
        "error": error_msg,
        "trades": trades_payload,
        "started_at": started_at,
        "finished_at": finished_at,
    }


# ---------------------------------------------------------------------------
# Default loaders / writers — production wiring
# ---------------------------------------------------------------------------


async def _default_ohlcv_loader(**kwargs: Any) -> pd.DataFrame:
    from quant.data import timescale

    return await timescale.fetch_ohlcv(**kwargs)


async def _default_equity_writer(
    run_id: str, rows: list[tuple[datetime, float, float, float]]
) -> int:
    from quant.data import timescale

    return await timescale.insert_equity_curve(run_id, rows)


def _resolve_mongo(ctx: dict[str, Any]) -> Any:
    db = ctx.get("mongo_db")
    if db is not None:
        return db
    from quant.data import mongo

    return mongo.get_db()


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _to_dt(value: Any) -> datetime:
    if isinstance(value, datetime):
        return value if value.tzinfo else value.replace(tzinfo=UTC)
    if isinstance(value, (int, float)):
        return datetime.fromtimestamp(float(value), tz=UTC)
    if isinstance(value, str):
        return datetime.fromisoformat(value.replace("Z", "+00:00"))
    raise TypeError(f"unsupported timestamp type: {type(value).__name__}")


def _scalar(x: Any) -> float:
    try:
        v = float(x)
    except (TypeError, ValueError):
        return 0.0
    if _nan_or_inf(v):
        return 0.0
    return v


def _nan_or_inf(x: float) -> bool:
    return math.isnan(x) or math.isinf(x)


# ---------------------------------------------------------------------------
# Arq adapter
# ---------------------------------------------------------------------------


async def backtest_task(
    ctx: dict[str, Any],
    run_id: str,
    request: dict[str, Any],
) -> dict[str, Any]:
    """Arq-task adapter; ctx provides redis + mongo + timescale handles."""
    return await run_backtest_task(ctx, run_id, request)
