"""Arq task + cron entry point for the Phase 6 optimization loop.

Two entry points:

  * :func:`run_optimization_for_strategy` — the heart of one optimization
    cycle. Loads the strategy + history, runs Optuna+Claude end-to-end
    via :func:`quant.ai.optimizer.run_study`, persists the result to
    ``optimization_runs`` + ``ai_recommendations``, and publishes Redis
    Stream events.

  * :func:`optimize_task` — the Arq adapter used by both the cron entry
    and the gRPC StartOptimization manual trigger.

The Arq settings module (``quant.workers.settings``) registers
``optimize_task`` plus a daily cron entry at 02:00 UTC by default
(env: ``AI_OPTIMIZATION_DAILY_CRON``).
"""

from __future__ import annotations

import hashlib
import json
import logging
import os
import uuid
from datetime import UTC, datetime
from typing import Any

from quant.ai.claude_client import ClaudeClient, MissingAPIKeyError
from quant.ai.cost_ledger import BudgetGate
from quant.ai.optimizer import OptimizationResult, run_study
from quant.data import recommendations as rec
from quant.events import redis_stream

log = logging.getLogger(__name__)


# Mirror of quantpb.v1.OptimizationState wire ints (kept in sync with
# the proto enum values).
STATE_PENDING = 1
STATE_RUNNING = 2
STATE_COMPLETED = 3
STATE_FAILED = 4
STATE_BUDGET_EXCEEDED = 5

# Map our optimizer's textual status → wire integer.
_STATUS_TO_STATE = {
    "completed": STATE_COMPLETED,
    "completed_no_improvement": STATE_COMPLETED,
    "budget_exceeded": STATE_BUDGET_EXCEEDED,
    "failed": STATE_FAILED,
}


def _now() -> datetime:
    return datetime.now(UTC)


def new_study_id() -> str:
    """Hex study-id; matches the shape of backtest run-ids."""
    return uuid.uuid4().hex


def new_recommendation_id() -> str:
    return uuid.uuid4().hex


def _claude_context_hash(payload: dict[str, Any]) -> str:
    """Deterministic hash of the Claude prompt context, for cache audit."""
    blob = json.dumps(payload, sort_keys=True, default=str)
    return hashlib.sha256(blob.encode("utf-8")).hexdigest()[:16]


# ---------------------------------------------------------------------------
# Strategy lookup helpers
# ---------------------------------------------------------------------------


async def _load_strategy(mongo_db: Any, strategy_id: str) -> dict[str, Any] | None:
    """Read the legacy ``options`` document — same source the gateway uses."""
    from bson import ObjectId  # type: ignore[import-not-found]

    try:
        oid = ObjectId(strategy_id)
    except Exception:  # noqa: BLE001
        return await mongo_db["options"].find_one({"_id": strategy_id})
    return await mongo_db["options"].find_one({"_id": oid})


async def _recent_study_summaries(
    mongo_db: Any, strategy_id: str, n: int = 5
) -> list[dict[str, Any]]:
    """Return the last ``n`` optimization_runs summaries for a strategy.

    Best-effort: if Mongo doesn't support ``sort()`` on the fake (tests),
    we silently return an empty list.
    """
    try:
        cursor = (
            mongo_db[rec.OPTIMIZATION_RUNS_COLLECTION]
            .find({"strategyId": strategy_id})
            .sort("startedAt", -1)
            .limit(n)
        )
    except (AttributeError, TypeError):
        return []
    out: list[dict[str, Any]] = []
    try:
        async for doc in cursor:
            out.append(
                {
                    "studyId": doc.get("_id"),
                    "state": doc.get("state"),
                    "trialsCompleted": doc.get("trialsCompleted"),
                    "bestValue": doc.get("bestValue"),
                    "startedAt": doc.get("startedAt"),
                }
            )
    except (AttributeError, TypeError):
        return []
    return out


def _build_base_request(strategy: dict[str, Any]) -> dict[str, Any]:
    """Construct a base backtest-request dict from the strategy document.

    Defaults: 90 days of 1h Binance USDM data on the strategy's
    ``execSymbol``. If the strategy's symbol is missing (legacy doc),
    we fall back to BTCUSDT so the optimizer has something to chew on.
    """
    from datetime import timedelta

    end = _now()
    start = end - timedelta(days=int(os.getenv("AI_OPTIMIZATION_LOOKBACK_DAYS", "90")))
    symbol = strategy.get("execSymbol") or "BTCUSDT"
    return {
        "exchange": "binance",
        "symbol": symbol,
        "timeframe": "1h",
        "start": start,
        "end": end,
        "initial_capital": 10_000.0,
        "commission_rate": 0.0004,
        "slippage_bps": 1.0,
    }


# ---------------------------------------------------------------------------
# Main run
# ---------------------------------------------------------------------------


async def run_optimization_for_strategy(
    *,
    study_id: str,
    strategy_id: str,
    mongo_db: Any,
    redis_client: Any | None,
    ohlcv_loader: Any,
    claude_client: ClaudeClient | None = None,
    n_trials_override: int | None = None,
) -> OptimizationResult:
    """End-to-end Phase 6 cycle for one strategy.

    Persists:
        * ``optimization_runs._id = study_id``  → cost ledger + state
        * ``ai_recommendations._id = recommendation_id``  → pending_review

    Emits:
        * ``event.optimization.progress`` (per ~5 trials)
        * ``event.optimization.suggested`` (terminal, when a
          pending_review recommendation is created)

    Returns the :class:`OptimizationResult` for the caller to log /
    surface to gRPC.
    """
    started_at = _now()

    strategy = await _load_strategy(mongo_db, strategy_id)
    if strategy is None:
        result = OptimizationResult(
            study_id=study_id,
            strategy_id=strategy_id,
            status="failed",
            error=f"strategy {strategy_id!r} not found",
        )
        # Insert failed-state head doc so list endpoints surface it.
        try:
            await rec.insert_optimization_run(
                mongo_db,
                study_id=study_id,
                strategy_id=strategy_id,
                algorithm="optuna_tpe",
                param_space={},
                claude_context_hash="",
                n_trials_total=0,
                started_at=started_at,
                state="failed",
            )
            await rec.update_optimization_run(
                mongo_db,
                study_id=study_id,
                fields={
                    "state": "failed",
                    "error": result.error,
                    "finishedAt": _now(),
                },
            )
        except Exception:  # noqa: BLE001 — best-effort ledger write
            log.warning("failed to insert failed-state head doc for %s", study_id)
        return result

    current_params = _extract_strategy_params(strategy)
    base_request = _build_base_request(strategy)
    history = await _recent_study_summaries(mongo_db, strategy_id)
    context_hash = _claude_context_hash(
        {"params": current_params, "history": history, "request": base_request}
    )

    # Pre-write the head doc so the gRPC client can poll status while
    # the run is in flight.
    await rec.insert_optimization_run(
        mongo_db,
        study_id=study_id,
        strategy_id=strategy_id,
        algorithm="optuna_tpe",
        param_space={},  # filled in once Claude returns the space
        claude_context_hash=context_hash,
        n_trials_total=int(n_trials_override or 0),
        started_at=started_at,
        state="running",
    )

    budget_gate = BudgetGate(study_id=study_id, mongo_db=mongo_db)

    async def _on_progress(completed: int, total: int, best: float) -> None:
        """Emit progress every ~5 trials (or on completion)."""
        if completed > 0 and completed % 5 != 0:
            return
        if redis_client is None:
            return
        try:
            await redis_stream.publish_optimization_progress(
                redis_client,
                study_id=study_id,
                trials_completed=completed,
                trials_total=total,
                best_value=best,
                state=STATE_RUNNING,
                current_cost_usd=budget_gate.study_spent_usd,
            )
        except Exception as exc:  # noqa: BLE001
            log.warning("optimization.progress publish failed: %s", exc)

    # ----- Run the study --------------------------------------------------
    try:
        result = await run_study(
            study_id=study_id,
            strategy_id=strategy_id,
            strategy_kind=str(strategy.get("kind") or "grid_dca"),
            current_params=current_params,
            base_request=base_request,
            ohlcv_loader=ohlcv_loader,
            claude_client=claude_client,
            budget_gate=budget_gate,
            n_trials=n_trials_override,
            progress_callback=_on_progress,
            history_summaries=history,
        )
    except MissingAPIKeyError as exc:
        # The gate is expected to refuse before this fires, but keep
        # this as a clear error path so unconfigured deployments fail
        # loudly rather than silently writing stub recommendations.
        result = OptimizationResult(
            study_id=study_id,
            strategy_id=strategy_id,
            status="failed",
            error=str(exc),
        )

    # ----- Persist result -----------------------------------------------
    state_int = _STATUS_TO_STATE.get(result.status, STATE_FAILED)
    head_update: dict[str, Any] = {
        "state": result.status,
        "trialsCompleted": result.trials_completed,
        "trialsTotal": result.trials_total,
        "bestValue": float(result.best_oos_metrics.get("sharpe", 0.0) if result.best_oos_metrics else 0.0),
        "paramSpace": result.search_space,
        "cost": result.cost,
        "finishedAt": result.finished_at or _now(),
        "error": result.error,
    }

    recommendation_id: str | None = None
    if result.status == "completed" and result.best_params:
        recommendation_id = new_recommendation_id()
        await rec.insert_recommendation(
            mongo_db,
            recommendation_id=recommendation_id,
            strategy_id=strategy_id,
            study_id=study_id,
            proposed_params=result.best_params,
            expected_delta={
                "sharpe": float(result.expected_sharpe_delta),
                "return": float(
                    result.best_oos_metrics.get("total_return", 0.0)
                    - 0.0  # Phase 6: control-baseline return is 0 (TBD Phase 7)
                ),
            },
            rationale=result.rationale,
        )
        head_update["recommendationId"] = recommendation_id

    try:
        await rec.update_optimization_run(
            mongo_db, study_id=study_id, fields=head_update
        )
    except Exception as exc:  # noqa: BLE001
        log.warning("optimization_runs head update failed: %s", exc)

    # ----- Emit terminal events -----------------------------------------
    if redis_client is not None:
        try:
            await redis_stream.publish_optimization_progress(
                redis_client,
                study_id=study_id,
                trials_completed=result.trials_completed,
                trials_total=result.trials_total,
                best_value=float(result.best_oos_metrics.get("sharpe", 0.0))
                if result.best_oos_metrics
                else 0.0,
                state=state_int,
                current_cost_usd=budget_gate.study_spent_usd,
                error_message=result.error,
            )
        except Exception as exc:  # noqa: BLE001
            log.warning("terminal optimization.progress publish failed: %s", exc)

        if recommendation_id is not None:
            try:
                await redis_stream.publish_optimization_suggested(
                    redis_client,
                    strategy_id=strategy_id,
                    study_id=study_id,
                    recommendation_id=recommendation_id,
                    expected_sharpe_delta=float(result.expected_sharpe_delta),
                )
            except Exception as exc:  # noqa: BLE001
                log.warning("optimization.suggested publish failed: %s", exc)

    return result


def _extract_strategy_params(strategy: dict[str, Any]) -> dict[str, Any]:
    """Project the legacy Option doc → param dict the simulator reads.

    The Phase 0/3 schema is camelCase on Mongo; the simulator already
    accepts that shape. We pluck out the keys grid_dca touches plus
    pass-through anything custom under ``params`` (Phase 7-ready shape).
    """
    keys = (
        "createPositions",
        "stopProfitRate",
        "stopLossRate",
        "profitRateAfterAtAddPosition",
        "createCostOrderInProfit",
        "positionLevel",
        "openPositionStopTime",
        "execSymbol",
        "orderGroupMargin",
    )
    out: dict[str, Any] = {}
    for k in keys:
        if k in strategy:
            out[k] = strategy[k]
    extra = strategy.get("params")
    if isinstance(extra, dict):
        for k, v in extra.items():
            out.setdefault(k, v)
    return out


# ---------------------------------------------------------------------------
# Arq adapter + cron entry
# ---------------------------------------------------------------------------


async def optimize_task(
    ctx: dict[str, Any],
    strategy_id: str,
    *,
    n_trials_override: int | None = None,
    study_id: str | None = None,
) -> dict[str, Any]:
    """Arq-task adapter; ctx provides redis + mongo handles."""
    mongo_db = ctx.get("mongo_db")
    if mongo_db is None:
        from quant.data import mongo as mongo_data

        mongo_db = mongo_data.get_db()
    redis_client = ctx.get("redis")

    from quant.data import timescale

    async def _ohlcv_loader(**kwargs: Any) -> Any:
        return await timescale.fetch_ohlcv(**kwargs)

    sid = study_id or new_study_id()
    claude_client = _build_default_claude_client()
    result = await run_optimization_for_strategy(
        study_id=sid,
        strategy_id=strategy_id,
        mongo_db=mongo_db,
        redis_client=redis_client,
        ohlcv_loader=_ohlcv_loader,
        claude_client=claude_client,
        n_trials_override=n_trials_override,
    )
    return {
        "study_id": result.study_id,
        "strategy_id": result.strategy_id,
        "status": result.status,
        "trials_completed": result.trials_completed,
        "best_value_oos_sharpe": float(
            result.best_oos_metrics.get("sharpe", 0.0)
        )
        if result.best_oos_metrics
        else 0.0,
        "cost_usd": float((result.cost or {}).get("usdSpent", 0.0)),
        "error": result.error,
    }


async def daily_optimize_cron(ctx: dict[str, Any]) -> dict[str, Any]:
    """Cron entry: iterate every strategy with ``live.enabled=true`` or
    ``optimizationEnabled=true`` and enqueue an optimize task each.

    Returns a small summary dict for ops logs.
    """
    mongo_db = ctx.get("mongo_db")
    if mongo_db is None:
        from quant.data import mongo as mongo_data

        mongo_db = mongo_data.get_db()
    arq_pool = ctx.get("arq_pool")

    enqueued: list[str] = []
    cursor = mongo_db["options"].find(
        {
            "$or": [
                {"live.enabled": True},
                {"optimizationEnabled": True},
            ]
        }
    )
    try:
        async for doc in cursor:
            sid = str(doc.get("_id"))
            if arq_pool is not None:
                await arq_pool.enqueue_job("optimize_task", sid)
            else:
                # No Arq pool — run inline (dev fallback).
                redis_client = ctx.get("redis")

                from quant.data import timescale

                async def _ohlcv_loader(**kwargs: Any) -> Any:
                    return await timescale.fetch_ohlcv(**kwargs)

                claude_client = _build_default_claude_client()
                await run_optimization_for_strategy(
                    study_id=new_study_id(),
                    strategy_id=sid,
                    mongo_db=mongo_db,
                    redis_client=redis_client,
                    ohlcv_loader=_ohlcv_loader,
                    claude_client=claude_client,
                )
            enqueued.append(sid)
    except (AttributeError, TypeError) as exc:
        log.warning("daily_optimize_cron iteration failed: %s", exc)

    return {"enqueued_count": len(enqueued), "strategy_ids": enqueued}


def _build_default_claude_client() -> ClaudeClient | None:
    """Return a configured client when ``ANTHROPIC_API_KEY`` is set, else None.

    Returning ``None`` lets the optimizer skip every Claude call (default
    search space + fallback rationale) — useful in dev environments and
    when the budget gate would refuse anyway.
    """
    if not os.getenv("ANTHROPIC_API_KEY"):
        log.info(
            "ANTHROPIC_API_KEY unset; running optimization with default search "
            "space (no Claude calls)"
        )
        return None
    return ClaudeClient()
