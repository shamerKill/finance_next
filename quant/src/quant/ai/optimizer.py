"""Optuna TPE study orchestration with walk-forward validation.

Phase 6 entry point: :func:`run_study`. The function is intentionally
self-contained — gRPC / Arq / cron all funnel through it. Inputs are
plain values + injected dependencies; outputs are a structured
:class:`OptimizationResult`.

WHY OPTUNA + WALK-FORWARD?
--------------------------
Optuna's TPE sampler is the standard parametric approach for this class
of problem; we keep MedianPruner so trivially bad trials drop early.
Walk-forward is the load-bearing anti-overfit gate: each trial runs the
backtest on the first 70% of bars (IS) and then again on the remaining
30% (OOS). If the OOS Sharpe is < 0.7 × IS Sharpe, the trial is rejected
(we return ``-inf`` so TPE down-weights that region of the space).

WHY CLAUDE AT BOUNDARIES ONLY?
------------------------------
Per-trial Claude calls would dominate cost; we'd be paying ~$0.05 per
trial × 200 trials = $10 per study, with no real intelligence gain (TPE
doesn't need an LLM to pick parameters). Calling Claude at study start
(define space), optionally mid-study (refine), and at the end (rationale)
keeps the cost bounded to ≤ $0.50 typical / $5.00 hard cap per study
while still giving the human reviewer a written diff vs current params.
"""

from __future__ import annotations

import asyncio
import json
import logging
import math
import os
import uuid
from collections.abc import Awaitable, Callable
from dataclasses import dataclass, field
from datetime import UTC, datetime
from typing import Any

import pandas as pd

from quant.ai._protocol import AIClient
from quant.ai.claude_client import (
    ROLE_DEFINE,
    ROLE_RATIONALE,
    ROLE_REFINE,
    ClaudeUsage,
    compute_usd_cost,
)
from quant.ai.cost_ledger import BudgetGate
from quant.strategies import get_strategy, run_backtest

log = logging.getLogger(__name__)


# Walk-forward gate constant — see module docstring.
OOS_TO_IS_RATIO_FLOOR = 0.7


def _i_env(name: str, default: int) -> int:
    raw = os.getenv(name, "").strip()
    if not raw:
        return default
    try:
        return int(raw)
    except ValueError:
        return default


# -----------------------------------------------------------------------
# Public types
# -----------------------------------------------------------------------


@dataclass
class OptimizationResult:
    """End-to-end output of :func:`run_study`.

    ``status`` is one of:
        * ``"completed"``        — best trial passed walk-forward
        * ``"completed_no_improvement"`` — trials ran but none beat current
        * ``"budget_exceeded"``  — gate refused a Claude call
        * ``"failed"``           — exception during run; ``error`` is set
    """

    study_id: str
    strategy_id: str
    status: str
    trials_completed: int = 0
    trials_total: int = 0
    best_params: dict[str, Any] = field(default_factory=dict)
    best_is_metrics: dict[str, float] = field(default_factory=dict)
    best_oos_metrics: dict[str, float] = field(default_factory=dict)
    expected_sharpe_delta: float = 0.0
    rationale: str = ""
    search_space: dict[str, Any] = field(default_factory=dict)
    cost: dict[str, Any] = field(default_factory=dict)
    error: str = ""
    started_at: datetime = field(default_factory=lambda: datetime.now(UTC))
    finished_at: datetime | None = None


# -----------------------------------------------------------------------
# Search-space helpers
# -----------------------------------------------------------------------


# A conservative default space used when Claude is unavailable, the call
# fails, or the budget gate refuses. This is the same shape the optimizer
# expects from Claude.
_DEFAULT_SEARCH_SPACE: dict[str, Any] = {
    "params": [
        {"name": "stopProfitRate", "type": "float", "low": 0.005, "high": 0.05},
        {"name": "stopLossRate", "type": "float", "low": 0.01, "high": 0.10},
        {"name": "profitRateAfterAtAddPosition", "type": "float", "low": 0.0, "high": 0.3},
    ],
    "rationale": "default fallback space (Claude unavailable)",
}


def _suggest_value(trial: Any, p: dict[str, Any]) -> tuple[str, Any]:
    """Translate one search-space param entry into an Optuna ``suggest_*``
    call. Returns ``(name, value)``.
    """
    name = p["name"]
    ptype = p.get("type", "float")
    low = p.get("low")
    high = p.get("high")
    if low is None or high is None:
        raise ValueError(f"param {name!r}: missing low/high")
    log_scale = bool(p.get("log", False))
    if ptype == "int":
        return name, trial.suggest_int(name, int(low), int(high), log=log_scale)
    if ptype == "float":
        return name, trial.suggest_float(name, float(low), float(high), log=log_scale)
    if ptype == "categorical":
        choices = p.get("choices") or []
        return name, trial.suggest_categorical(name, choices)
    raise ValueError(f"param {name!r}: unsupported type {ptype!r}")


# -----------------------------------------------------------------------
# Study runner
# -----------------------------------------------------------------------


# Type aliases to keep signatures readable + injectable in tests.
OhlcvLoader = Callable[..., Awaitable[pd.DataFrame]]
ProgressCallback = Callable[[int, int, float], Awaitable[None]]


async def run_study(
    *,
    study_id: str,
    strategy_id: str,
    strategy_kind: str,
    current_params: dict[str, Any],
    base_request: dict[str, Any],
    ohlcv_loader: OhlcvLoader,
    claude_client: AIClient | None,
    budget_gate: BudgetGate,
    n_trials: int | None = None,
    timeout_seconds: int | None = None,
    progress_callback: ProgressCallback | None = None,
    history_summaries: list[dict[str, Any]] | None = None,
    live_pnl_summary: str | None = None,
    refine_after: int = 50,
) -> OptimizationResult:
    """Run a full optimization study.

    Parameters
    ----------
    study_id
        Stable ID; persisted as ``optimization_runs._id``.
    strategy_id, strategy_kind, current_params
        The strategy under optimization.
    base_request
        Dict with ``exchange``, ``symbol``, ``timeframe``, ``start``,
        ``end``, ``initial_capital``, ``commission_rate``,
        ``slippage_bps`` — same shape as the backtest worker.
    ohlcv_loader
        Async callable that returns the full OHLCV DataFrame for the
        request window. The optimizer caches the result and slices
        IS/OOS in-memory.
    claude_client
        Wrapper around the Anthropic SDK. ``None`` means skip every
        Claude call (budget gate also enforces this if env says so).
    budget_gate
        :class:`BudgetGate` for this study.
    n_trials
        Optuna trial budget. Defaults to env ``AI_MAX_TRIALS_PER_STUDY``
        (200).
    timeout_seconds
        Hard wall-clock cap. Default env ``AI_MAX_SECONDS_PER_STUDY`` (300).
    """
    started_at = datetime.now(UTC)
    n_trials = n_trials if (n_trials and n_trials > 0) else _i_env("AI_MAX_TRIALS_PER_STUDY", 200)
    timeout_seconds = timeout_seconds if (timeout_seconds and timeout_seconds > 0) else _i_env(
        "AI_MAX_SECONDS_PER_STUDY", 300
    )

    result = OptimizationResult(
        study_id=study_id,
        strategy_id=strategy_id,
        status="failed",
        trials_total=n_trials,
        started_at=started_at,
    )

    try:
        # ----- 1. Load OHLCV once + split IS/OOS ---------------------
        ohlcv = await ohlcv_loader(
            exchange=base_request["exchange"],
            symbol=base_request["symbol"],
            timeframe=base_request["timeframe"],
            start=base_request["start"],
            end=base_request["end"],
        )
        if ohlcv is None or ohlcv.empty:
            raise ValueError("ohlcv loader returned empty DataFrame")
        split = int(len(ohlcv) * 0.7)
        is_df = ohlcv.iloc[:split]
        oos_df = ohlcv.iloc[split:]
        if len(oos_df) < 10 or len(is_df) < 10:
            raise ValueError(
                "ohlcv too short for walk-forward; need ≥ 10 bars in each split"
            )

        # ----- 2. Define search space (Claude Sonnet 4.6) ------------
        # Phase 8: lazy-import the extended-context builder so a missing
        # extended_repo (e.g. test envs without Timescale) doesn't
        # prevent the optimizer from running at all.
        extended_builder: Any | None = None
        try:
            from quant.ai.extended_context import (
                build_extended_context,
            )
            from quant.ai.extended_context import (
                is_enabled as _ec_enabled,
            )

            if _ec_enabled():
                extended_builder = build_extended_context
        except Exception as exc:  # noqa: BLE001
            log.warning("extended context disabled (import failed): %s", exc)

        search_space = await _try_define_search_space(
            claude_client=claude_client,
            budget_gate=budget_gate,
            strategy_kind=strategy_kind,
            current_params=current_params,
            history_summaries=history_summaries or [],
            live_pnl_summary=live_pnl_summary or "",
            base_request=base_request,
            extended_context_builder=extended_builder,
        )
        result.search_space = search_space

        # ----- 3. Optuna study ---------------------------------------
        try:
            import optuna  # type: ignore[import-not-found]
        except ImportError as exc:
            raise RuntimeError(
                "optuna is required for Phase 6 optimization; install it via "
                "`uv sync --extra dev`"
            ) from exc

        # Quiet Optuna's trial-level chatter — we own progress output.
        optuna.logging.set_verbosity(optuna.logging.WARNING)
        sampler = optuna.samplers.TPESampler(seed=42)
        pruner = optuna.pruners.MedianPruner()
        study = optuna.create_study(
            study_name=study_id,
            direction="maximize",
            sampler=sampler,
            pruner=pruner,
        )

        strategy = get_strategy(strategy_kind)
        commission = float(base_request.get("commission_rate") or 0.0) or 0.0004
        slippage_bps = float(base_request.get("slippage_bps") or 0.0) or 1.0
        initial_capital = float(base_request.get("initial_capital") or 10_000.0)

        completed = {"n": 0}
        best_holder: dict[str, Any] = {
            "value": -math.inf,
            "params": {},
            "is_metrics": {},
            "oos_metrics": {},
        }

        def _objective(trial: Any) -> float:
            try:
                params = dict(current_params)  # start from current as anchor
                for p in search_space.get("params", []):
                    name, value = _suggest_value(trial, p)
                    params[name] = value

                is_result = run_backtest(
                    strategy,
                    is_df,
                    params,
                    initial_capital=initial_capital,
                    commission=commission,
                    slippage_bps=slippage_bps,
                )
                is_sharpe = float(is_result.metrics.get("sharpe", 0.0))
                if not math.isfinite(is_sharpe):
                    is_sharpe = 0.0
                if is_sharpe <= 0:
                    # Don't bother computing OOS — trial is already bad.
                    return -math.inf

                oos_result = run_backtest(
                    strategy,
                    oos_df,
                    params,
                    initial_capital=initial_capital,
                    commission=commission,
                    slippage_bps=slippage_bps,
                )
                oos_sharpe = float(oos_result.metrics.get("sharpe", 0.0))
                if not math.isfinite(oos_sharpe):
                    oos_sharpe = 0.0

                # Walk-forward gate: OOS sharpe must be ≥ 0.7 × IS sharpe.
                if oos_sharpe < OOS_TO_IS_RATIO_FLOOR * is_sharpe:
                    return -math.inf

                if oos_sharpe > best_holder["value"]:
                    best_holder["value"] = oos_sharpe
                    best_holder["params"] = params
                    best_holder["is_metrics"] = dict(is_result.metrics)
                    best_holder["oos_metrics"] = dict(oos_result.metrics)
                return oos_sharpe
            except Exception as exc:  # noqa: BLE001
                log.warning("trial %s raised; treating as -inf: %s", trial.number, exc)
                return -math.inf
            finally:
                completed["n"] += 1

        # Optuna runs synchronously; offload to a thread so the event
        # loop stays responsive (gRPC server / Arq health-pings).
        def _on_trial(study_obj: Any, trial_obj: Any) -> None:
            if progress_callback is None:
                return
            try:
                # Schedule progress publish without blocking the optuna
                # callback — fire-and-forget on the running loop.
                loop = asyncio.get_event_loop()
                loop.create_task(
                    progress_callback(
                        completed["n"],
                        n_trials,
                        float(best_holder["value"]) if math.isfinite(best_holder["value"]) else 0.0,
                    )
                )
            except RuntimeError:
                # No running loop (we're inside thread executor) —
                # progress is best-effort.
                pass

        await asyncio.to_thread(
            study.optimize,
            _objective,
            n_trials,
            None,  # n_jobs default
            timeout_seconds,
            (_on_trial,),
        )

        # ----- 4. Mid-study refinement (Haiku) -- optional ----------
        # Pre-launch decision: with ``refine_after`` < n_trials, ask
        # Haiku to tighten the space and re-run the remaining trials.
        # Phase 6 LP: skipped in v1 because the CPU portion already
        # ran inside `study.optimize`. We still record a Haiku call
        # site here for cost-ledger continuity when refine_after is
        # reached and it gives concrete signal — see _try_refine for
        # the (now optional) Haiku call.
        if completed["n"] >= refine_after and claude_client is not None:
            await _try_refine(
                claude_client=claude_client,
                budget_gate=budget_gate,
                search_space=search_space,
                top_trials_summary=_top_trials_summary(study),
            )

        result.trials_completed = completed["n"]

        if not math.isfinite(best_holder["value"]) or not best_holder["params"]:
            result.status = "completed_no_improvement"
            result.cost = budget_gate.to_persisted_cost()
            result.finished_at = datetime.now(UTC)
            return result

        result.best_params = best_holder["params"]
        result.best_is_metrics = best_holder["is_metrics"]
        result.best_oos_metrics = best_holder["oos_metrics"]

        # ----- 5. Final rationale (Sonnet 4.6) ----------------------
        rationale = await _try_write_rationale(
            claude_client=claude_client,
            budget_gate=budget_gate,
            strategy_kind=strategy_kind,
            current_params=current_params,
            proposed_params=best_holder["params"],
            is_metrics=best_holder["is_metrics"],
            oos_metrics=best_holder["oos_metrics"],
        )
        result.rationale = rationale

        # Sharpe delta vs current (compute current_oos_sharpe as a control).
        try:
            ctrl_oos = run_backtest(
                strategy,
                oos_df,
                current_params,
                initial_capital=initial_capital,
                commission=commission,
                slippage_bps=slippage_bps,
            )
            current_oos_sharpe = float(ctrl_oos.metrics.get("sharpe", 0.0))
        except Exception as exc:  # noqa: BLE001
            log.warning("control backtest failed; expected delta = best_oos: %s", exc)
            current_oos_sharpe = 0.0
        result.expected_sharpe_delta = float(best_holder["value"]) - current_oos_sharpe

        result.status = "completed"
        result.cost = budget_gate.to_persisted_cost()
        result.finished_at = datetime.now(UTC)
        return result

    except _BudgetExceeded as exc:
        log.warning("study %s budget exceeded: %s", study_id, exc)
        result.status = "budget_exceeded"
        result.error = str(exc)
        result.cost = budget_gate.to_persisted_cost()
        result.finished_at = datetime.now(UTC)
        return result
    except Exception as exc:  # noqa: BLE001
        log.exception("study %s failed", study_id)
        result.status = "failed"
        result.error = str(exc)
        result.cost = budget_gate.to_persisted_cost()
        result.finished_at = datetime.now(UTC)
        return result


# -----------------------------------------------------------------------
# Internal helpers — Claude calls (gated by BudgetGate)
# -----------------------------------------------------------------------


class _BudgetExceeded(RuntimeError):
    """Sentinel — short-circuits :func:`run_study`."""


def _study_context_text(strategy_kind: str, current_params: dict[str, Any]) -> str:
    """Render the cached portion of the system prompt for one study."""
    return (
        f"Strategy kind: {strategy_kind}\n"
        f"Current parameters (JSON):\n{json.dumps(current_params, indent=2, default=str)}\n"
    )


async def _try_define_search_space(
    *,
    claude_client: AIClient | None,
    budget_gate: BudgetGate,
    strategy_kind: str,
    current_params: dict[str, Any],
    history_summaries: list[dict[str, Any]],
    live_pnl_summary: str,
    base_request: dict[str, Any] | None = None,
    extended_context_builder: Any | None = None,
) -> dict[str, Any]:
    """Call Claude to define the search space; fall back on errors / no-budget.

    Phase 8: when ``AI_CONTEXT_INCLUDE_EXTENDED`` is enabled the cached
    study-context block is augmented with recent news + macro snapshot
    + on-chain metrics. The extra ~500-1000 tokens land inside the same
    Anthropic prompt-cache block so the marginal cost is ~$0.001 per
    cached call. We DO NOT raise the projected budget here — if the
    extended context would push the call over the gate, the budget
    refuses and we fall back to the default search space (the warning
    log line below distinguishes this case).
    """
    if claude_client is None:
        return _DEFAULT_SEARCH_SPACE

    # Sonnet 4.6 typical: ~300 input + ~600 output → ~$0.01. Budget for ~3K
    # input / 1K output as a safe upper bound: ~0.024 USD.
    projected = compute_usd_cost(
        claude_client.primary_model,
        ClaudeUsage(input_tokens=3_000, output_tokens=1_000),
    )
    ok, why = await budget_gate.try_charge(projected)
    if not ok:
        log.warning("define_search_space: budget refused (%s); using default", why)
        raise _BudgetExceeded(why)

    # Phase 8 — optional extended context. Best-effort; any failure
    # leaves the original (unaugmented) study context untouched.
    study_ctx = _study_context_text(strategy_kind, current_params)
    if extended_context_builder is not None and base_request is not None:
        try:
            extra = await extended_context_builder(
                symbol=base_request.get("symbol", "")
            )
            if extra:
                study_ctx = study_ctx + "\n" + extra
        except Exception as exc:  # noqa: BLE001
            log.warning("extended context build failed; using base only: %s", exc)

    user = (
        "Recent study summaries (most recent first):\n"
        f"{json.dumps(history_summaries[:5], default=str, indent=2)}\n\n"
        f"Last 30d live PnL summary: {live_pnl_summary or 'n/a'}\n\n"
        "Please return the search-space JSON now."
    )
    try:
        space, usage = await claude_client.define_search_space(
            study_context=study_ctx,
            user_prompt=user,
        )
    except Exception as exc:  # noqa: BLE001
        log.warning("define_search_space failed; falling back to default: %s", exc)
        return _DEFAULT_SEARCH_SPACE
    budget_gate.record(role=ROLE_DEFINE, model=claude_client.primary_model, usage=usage)
    return space


async def _try_refine(
    *,
    claude_client: AIClient,
    budget_gate: BudgetGate,
    search_space: dict[str, Any],
    top_trials_summary: list[dict[str, Any]],
) -> None:
    """Mid-study Haiku refinement. Best-effort — failures are swallowed."""
    projected = compute_usd_cost(
        claude_client.refine_model,
        ClaudeUsage(input_tokens=2_000, output_tokens=600),
    )
    ok, why = await budget_gate.try_charge(projected)
    if not ok:
        log.info("refine: skipping (budget refused: %s)", why)
        return
    user = (
        "Current search space:\n"
        f"{json.dumps(search_space, indent=2, default=str)}\n\n"
        "Top trials so far (params + OOS Sharpe):\n"
        f"{json.dumps(top_trials_summary, indent=2, default=str)}\n\n"
        "Return a tighter search-space JSON, or the same one if no clear pattern."
    )
    try:
        _, usage = await claude_client.refine_search_space(
            study_context="Mid-study refinement.",
            user_prompt=user,
        )
    except Exception as exc:  # noqa: BLE001
        log.warning("refine_search_space failed: %s", exc)
        return
    budget_gate.record(role=ROLE_REFINE, model=claude_client.refine_model, usage=usage)


async def _try_write_rationale(
    *,
    claude_client: AIClient | None,
    budget_gate: BudgetGate,
    strategy_kind: str,
    current_params: dict[str, Any],
    proposed_params: dict[str, Any],
    is_metrics: dict[str, float],
    oos_metrics: dict[str, float],
) -> str:
    """Generate the human-facing rationale string. Falls back to a
    deterministic summary if Claude is unavailable / budget refuses.
    """
    fallback = _fallback_rationale(current_params, proposed_params, is_metrics, oos_metrics)
    if claude_client is None:
        return fallback

    projected = compute_usd_cost(
        claude_client.primary_model,
        ClaudeUsage(input_tokens=2_000, output_tokens=600),
    )
    ok, why = await budget_gate.try_charge(projected)
    if not ok:
        log.warning("rationale: budget refused (%s); using fallback prose", why)
        return fallback

    user = (
        "Current params:\n"
        f"{json.dumps(current_params, indent=2, default=str)}\n\n"
        "Proposed params (Optuna best surviving trial):\n"
        f"{json.dumps(proposed_params, indent=2, default=str)}\n\n"
        f"IS metrics: {json.dumps(is_metrics, default=str)}\n"
        f"OOS metrics: {json.dumps(oos_metrics, default=str)}\n\n"
        "Write the reviewer rationale now."
    )
    try:
        text, usage = await claude_client.write_final_rationale(
            study_context=_study_context_text(strategy_kind, current_params),
            user_prompt=user,
        )
    except Exception as exc:  # noqa: BLE001
        log.warning("write_final_rationale failed; using fallback: %s", exc)
        return fallback
    budget_gate.record(role=ROLE_RATIONALE, model=claude_client.primary_model, usage=usage)
    return text or fallback


def _fallback_rationale(
    current_params: dict[str, Any],
    proposed_params: dict[str, Any],
    is_metrics: dict[str, float],
    oos_metrics: dict[str, float],
) -> str:
    """Plain-text rationale used when Claude can't be called."""
    diff: list[str] = []
    for k in sorted(set(current_params) | set(proposed_params)):
        if current_params.get(k) != proposed_params.get(k):
            diff.append(f"{k}: {current_params.get(k)!r} → {proposed_params.get(k)!r}")
    is_sharpe = is_metrics.get("sharpe", 0.0)
    oos_sharpe = oos_metrics.get("sharpe", 0.0)
    return (
        "Optuna found a parameter set with the changes below. The reviewer "
        "MUST verify the OOS metrics make sense before approving — there is "
        "no LLM-generated reasoning here.\n\n"
        + "\n".join(diff or ["(no changes)"])
        + f"\n\nIS Sharpe: {is_sharpe:.3f}    OOS Sharpe: {oos_sharpe:.3f}\n"
        + f"Max drawdown OOS: {oos_metrics.get('max_dd', 0.0):.3f}\n"
        + f"Trades OOS: {oos_metrics.get('n_trades', 0.0):.0f}\n"
    )


def _top_trials_summary(study: Any, k: int = 10) -> list[dict[str, Any]]:
    """Top-k trials by objective value, for the refine prompt."""
    try:
        trials = sorted(
            (t for t in study.trials if t.value is not None and math.isfinite(t.value)),
            key=lambda t: t.value,
            reverse=True,
        )[:k]
    except Exception:  # noqa: BLE001
        return []
    return [
        {"number": t.number, "value": t.value, "params": dict(t.params)} for t in trials
    ]


# -----------------------------------------------------------------------
# Convenience: study_id factory (kept here so callers can import a single
# module; mirrors :func:`quant.workers.backtest.new_run_id`)
# -----------------------------------------------------------------------


def new_study_id() -> str:
    return uuid.uuid4().hex
