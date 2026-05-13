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

from quant.ai import config as ai_config
from quant.ai import secrets as ai_secrets
from quant.ai._protocol import AIClient
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


def _build_base_request(
    strategy: dict[str, Any], *, lookback_days: int = 90
) -> dict[str, Any]:
    """Construct a base backtest-request dict from the strategy document.

    Defaults: ``lookback_days`` of 1h Binance USDM data on the strategy's
    ``execSymbol``. If the strategy's symbol is missing (legacy doc),
    we fall back to BTCUSDT so the optimizer has something to chew on.

    ``lookback_days`` is sourced from :func:`quant.ai.config.load_effective_config`
    upstream (Mongo override + env fallback) instead of being read from
    env here directly — keeps the optimizer's data window controllable
    from the admin UI without restarting the worker.
    """
    from datetime import timedelta

    end = _now()
    start = end - timedelta(days=int(lookback_days))
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
    claude_client: AIClient | None = None,
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

    # Phase 9 follow-up: load the AI-config override from Mongo (with env
    # fallback per field) once at study start. The result threads through
    # base-request lookback, budget gate caps, and the period sub-doc we
    # later persist on the recommendation.
    effective_cfg = await ai_config.load_effective_config(mongo_db)

    current_params = _extract_strategy_params(strategy)
    base_request = _build_base_request(
        strategy, lookback_days=effective_cfg.lookback_days
    )
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

    budget_gate = BudgetGate(
        study_id=study_id,
        mongo_db=mongo_db,
        max_usd_per_study=effective_cfg.budget_usd_per_study,
        max_usd_per_day_global=effective_cfg.budget_usd_per_day,
    )

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
        # The 70/30 split is the walk-forward gate enforced inside
        # quant.ai.optimizer.run_study — keep this period sub-doc in
        # lock-step with that constant so the reviewer UI shows the
        # actual window we evaluated against.
        period = {
            "lookbackDays": effective_cfg.lookback_days,
            "inSampleDays": effective_cfg.lookback_days * 0.7,
            "oosDays": effective_cfg.lookback_days * 0.3,
            "sharpeAnnualized": True,
        }
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
            period=period,
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
    cfg = await ai_config.load_effective_config(mongo_db)
    secrets = await ai_secrets.load_ai_secrets(mongo_db)
    claude_client = _build_ai_client_with_secrets(cfg, secrets)
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

                cfg = await ai_config.load_effective_config(mongo_db)
                secrets = await ai_secrets.load_ai_secrets(mongo_db)
                claude_client = _build_ai_client_with_secrets(cfg, secrets)
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


def _build_default_ai_client(
    cfg: ai_config.EffectiveAIConfig | None = None,
) -> AIClient | None:
    """Return a configured AI client honouring the effective AI config.

    ``cfg`` is the merged Mongo + env :class:`EffectiveAIConfig`. When
    omitted (e.g. legacy call sites or unit tests) we fall back to an
    env-only config so behaviour is unchanged for callers that haven't
    been threaded yet.

    Resolution:

    * ``cfg.model_family == "openai"`` — build a
      :class:`quant.ai.gpt_client.GPTClient` using ``OPENAI_API_KEY`` (or
      ``ANTHROPIC_API_KEY`` fallback — the proxy uses one credential),
      with primary/refine model IDs + base URL from ``cfg``.
    * Anything else (default) — build a :class:`ClaudeClient` using
      ``ANTHROPIC_API_KEY``. Model IDs come from ``cfg``; the Anthropic
      SDK doesn't expose a base_url override in our wrapper so the value
      is informational (surfaced via GetAIConfig).

    Returning ``None`` lets the optimizer skip every AI call (default
    search space + fallback rationale) — useful in dev environments and
    when the budget gate would refuse anyway. We return ``None`` rather
    than constructing a client that will crash on first call: a missing
    key is a config issue, not a bug, and the optimizer's fallback is
    designed for exactly this case.
    """
    # No cfg provided → derive from env (env-only path). We can't await
    # ai_config.load_effective_config from this sync function, so we
    # synthesise an env-only EffectiveAIConfig inline — ai_config's
    # helpers are pure-env when mongo_doc is empty.
    if cfg is None:
        family_raw = os.getenv("AI_MODEL_FAMILY", "claude")
        cfg = ai_config.EffectiveAIConfig(
            model_family=ai_config._normalise_family(family_raw),
            anthropic_primary_model=os.getenv(
                "ANTHROPIC_PRIMARY_MODEL", "claude-sonnet-4-6"
            ),
            anthropic_refine_model=os.getenv(
                "ANTHROPIC_REFINE_MODEL", "claude-haiku-4-5-20251001"
            ),
            openai_primary_model=os.getenv("OPENAI_PRIMARY_MODEL", "gpt-5.5"),
            openai_refine_model=os.getenv("OPENAI_REFINE_MODEL", "gpt-5.4"),
            anthropic_base_url=os.getenv(
                "ANTHROPIC_BASE_URL", "https://api.anthropic.com"
            ),
            openai_base_url=os.getenv("OPENAI_BASE_URL", "https://api.openai.com"),
            budget_usd_per_study=5.0,
            budget_usd_per_day=50.0,
            lookback_days=90,
            source="env",
        )

    if cfg.model_family == "openai":
        from quant.ai.gpt_client import GPTClient

        api_key = os.getenv("OPENAI_API_KEY") or os.getenv("ANTHROPIC_API_KEY")
        if not api_key:
            log.info(
                "model_family=%s but neither OPENAI_API_KEY nor "
                "ANTHROPIC_API_KEY is set; running optimization with default "
                "search space (no AI calls)",
                cfg.model_family,
            )
            return None
        client = GPTClient(base_url=cfg.openai_base_url or None)
        # Pin model IDs from the effective config so the cost ledger /
        # audit trail reflects the resolved (post-override) model rather
        # than the module-level default the GPT client cached at import
        # time. The GPT client's call sites read these instance attrs.
        client.primary_model = cfg.openai_primary_model
        client.refine_model = cfg.openai_refine_model
        return client

    # Default: Anthropic Claude path.
    if not os.getenv("ANTHROPIC_API_KEY"):
        log.info(
            "ANTHROPIC_API_KEY unset; running optimization with default search "
            "space (no Claude calls)"
        )
        return None
    # NB: ClaudeClient.{define,refine,...} currently hard-codes
    # SONNET_MODEL / HAIKU_MODEL in the messages.create call, so swapping
    # the instance attrs only affects the audit / cost-ledger model name,
    # not the wire request. That's acceptable for now — the admin UI
    # surfaces the effective model via GetAIConfig regardless. If we
    # need to actually route per-config models, plumb them into the
    # messages.create call too.
    client = ClaudeClient()
    client.primary_model = cfg.anthropic_primary_model
    client.refine_model = cfg.anthropic_refine_model
    return client


# Backwards-compatible alias — existing imports keep working.
_build_default_claude_client = _build_default_ai_client


def _build_ai_client_with_secrets(
    cfg: ai_config.EffectiveAIConfig,
    secrets: ai_secrets.AISecrets,
) -> AIClient | None:
    """Build an AI client using Mongo-persisted secrets + effective config.

    Routing:
        * ``cfg.model_family == "openai"`` — GPTClient on the Responses API
          (gpt-5.x via Anthropic-style proxy). API key prefers
          ``secrets.openai_api_key`` (decrypted Mongo ciphertext) then
          ``OPENAI_API_KEY`` env then ``ANTHROPIC_API_KEY`` env (proxy
          fallback). Returns ``None`` when no key resolves so the
          optimizer falls back to its default search space.
        * ``cfg.model_family == "deepseek"`` — GPTClient on the
          chat.completions endpoint (DeepSeek + most OpenAI-compat
          proxies). API key from ``secrets.deepseek_api_key``. Default
          base URL ``https://api.deepseek.com`` is applied by
          ``load_ai_secrets``. Returns ``None`` if no key.
        * default (Claude) — ClaudeClient. API key from
          ``secrets.anthropic_api_key``.

    The function is sync (Mongo I/O has already happened upstream in
    ``load_ai_secrets``). Callers pass through both ``cfg`` and
    ``secrets`` so the cost-ledger / audit trail can report the
    resolved family + model strings even when one provider's key
    resolves to None.
    """
    family = (cfg.model_family or secrets.family or "claude").lower()

    if family == "openai":
        from quant.ai.gpt_client import ENDPOINT_RESPONSES, GPTClient

        api_key = (
            secrets.openai_api_key
            or os.getenv("OPENAI_API_KEY")
            or secrets.anthropic_api_key
            or os.getenv("ANTHROPIC_API_KEY")
        )
        if not api_key:
            log.info(
                "model_family=openai but no OPENAI_API_KEY / Mongo key present; "
                "running optimization with default search space (no AI calls)"
            )
            return None
        client = GPTClient(
            api_key=api_key,
            base_url=secrets.openai_base_url or cfg.openai_base_url or None,
            endpoint=ENDPOINT_RESPONSES,
            stream=secrets.streaming_enabled,
        )
        client.primary_model = (
            secrets.openai_primary_model or cfg.openai_primary_model
        )
        client.refine_model = (
            secrets.openai_refine_model or cfg.openai_refine_model
        )
        return client

    if family == "deepseek":
        from quant.ai.gpt_client import ENDPOINT_CHAT_COMPLETIONS, GPTClient

        api_key = secrets.deepseek_api_key or os.getenv("DEEPSEEK_API_KEY")
        if not api_key:
            log.info(
                "model_family=deepseek but no DEEPSEEK_API_KEY present; "
                "running optimization with default search space (no AI calls)"
            )
            return None
        # DeepSeek uses OpenAI-compatible chat.completions surface, so
        # we reuse GPTClient with the chat_completions endpoint flavour.
        client = GPTClient(
            api_key=api_key,
            base_url=secrets.deepseek_base_url or "https://api.deepseek.com",
            endpoint=ENDPOINT_CHAT_COMPLETIONS,
            stream=secrets.streaming_enabled,
        )
        client.primary_model = secrets.deepseek_primary_model or "deepseek-chat"
        client.refine_model = secrets.deepseek_refine_model or "deepseek-chat"
        return client

    # Default: Anthropic Claude path.
    api_key = secrets.anthropic_api_key or os.getenv("ANTHROPIC_API_KEY")
    if not api_key:
        log.info(
            "No ANTHROPIC_API_KEY (env or Mongo) configured; running "
            "optimization with default search space (no Claude calls)"
        )
        return None
    client = ClaudeClient(api_key=api_key, stream=secrets.streaming_enabled)
    client.primary_model = (
        secrets.anthropic_primary_model or cfg.anthropic_primary_model
    )
    client.refine_model = (
        secrets.anthropic_refine_model or cfg.anthropic_refine_model
    )
    return client
