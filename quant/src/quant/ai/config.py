"""Effective AI-config loader: ``system_state.aiConfig`` over env defaults.

The gateway exposes ``/admin/ai/config`` for a human to override model
family / model IDs / base URLs / budgets / lookback without restarting
the worker. The override lives at ``system_state.aiConfig`` (single doc,
``_id = "global"`` by convention shared with the kill switch). When a
field is absent on the doc, we fall through to the corresponding env
var; when *neither* is set we use a hard-coded default that matches the
behaviour the worker had before this module existed.

The module is intentionally side-effect free aside from one Mongo read.
It does NOT cache — :func:`load_effective_config` is called at study
start (Optuna trials don't touch this) so a 5ms round-trip is cheap and
guarantees a freshly-saved override takes effect on the *next* study
without restart.

Tests that don't run Mongo can pass ``mongo_db=None`` and get an
env-only :class:`EffectiveAIConfig` back.
"""

from __future__ import annotations

import logging
import os
from dataclasses import dataclass
from typing import Any

log = logging.getLogger(__name__)


# Hard-coded defaults — these are the values the codebase used before
# the Mongo override existed. Kept in sync with claude_client.py /
# gpt_client.py constants so the wire stays bit-equal when nothing is
# configured. If you change a default here, mirror it in the gateway's
# /admin/ai/config defaults.
_DEFAULT_MODEL_FAMILY = "claude"
_DEFAULT_ANTHROPIC_PRIMARY = "claude-sonnet-4-6"
_DEFAULT_ANTHROPIC_REFINE = "claude-haiku-4-5-20251001"
_DEFAULT_OPENAI_PRIMARY = "gpt-5.5"
_DEFAULT_OPENAI_REFINE = "gpt-5.4"
_DEFAULT_DEEPSEEK_PRIMARY = "deepseek-v4-pro"
_DEFAULT_DEEPSEEK_REFINE = "deepseek-v4-flash"
_DEFAULT_ANTHROPIC_BASE_URL = "https://api.anthropic.com"
_DEFAULT_OPENAI_BASE_URL = "https://api.openai.com"
_DEFAULT_BUDGET_USD_PER_STUDY = 5.0
_DEFAULT_BUDGET_USD_PER_DAY = 50.0
_DEFAULT_LOOKBACK_DAYS = 90


# Mirrors gateway/internal/store/mongo/system_repo.go convention.
_SYSTEM_STATE_COLLECTION = "system_state"
_SYSTEM_STATE_ID = "global"
_AI_CONFIG_FIELD = "aiConfig"


@dataclass(frozen=True)
class EffectiveAIConfig:
    """Resolved AI-config snapshot for one study.

    ``source`` is a flag that tells callers (and tests) where the
    fields came from:

      * ``"mongo"`` — every field came from the Mongo override doc.
      * ``"env"``   — Mongo had no aiConfig doc; every field came from
        env / hard-coded defaults.
      * ``"mixed"`` — some Mongo fields, some env. Most common in
        practice once admins start tuning individual knobs.
    """

    model_family: str
    anthropic_primary_model: str
    anthropic_refine_model: str
    openai_primary_model: str
    openai_refine_model: str
    deepseek_primary_model: str
    deepseek_refine_model: str
    anthropic_base_url: str
    openai_base_url: str
    budget_usd_per_study: float
    budget_usd_per_day: float
    lookback_days: int
    source: str  # "mongo" | "env" | "mixed"


# ---------------------------------------------------------------------------
# env helpers — fail-soft on parse errors so a typo in env never crashes
# the optimizer; we log and fall back to the hard-coded default.
# ---------------------------------------------------------------------------


def _env_str(name: str, default: str) -> str:
    raw = os.getenv(name, "").strip()
    return raw or default


def _env_float(name: str, default: float) -> float:
    raw = os.getenv(name, "").strip()
    if not raw:
        return default
    try:
        return float(raw)
    except ValueError:
        log.warning("ignoring invalid %s=%r; using default %s", name, raw, default)
        return default


def _env_int(name: str, default: int) -> int:
    raw = os.getenv(name, "").strip()
    if not raw:
        return default
    try:
        return int(raw)
    except ValueError:
        log.warning("ignoring invalid %s=%r; using default %s", name, raw, default)
        return default


def _normalise_family(value: str) -> str:
    """Collapse ``gpt`` to ``openai``; keep ``claude`` / ``deepseek`` as-is.

    Mirrors :func:`quant.workers.optimize._build_default_ai_client`'s
    family normalisation so the UI doesn't have to know about the
    alias. Unknown values fall through to ``claude`` (the historical
    default) — strict validation lives in the gateway handler.
    """
    v = (value or "").strip().lower()
    if v in ("openai", "gpt"):
        return "openai"
    if v == "deepseek":
        return "deepseek"
    return "claude"


# ---------------------------------------------------------------------------
# Public loader
# ---------------------------------------------------------------------------


async def load_effective_config(mongo_db: Any | None) -> EffectiveAIConfig:
    """Merge ``system_state.aiConfig`` over env over hard-coded defaults.

    ``mongo_db`` may be ``None`` (unit tests, dev-mode gRPC without
    Mongo) — in that case we skip straight to env / defaults and tag the
    result with ``source="env"``. A Mongo doc that exists but has no
    ``aiConfig`` field is treated the same way.

    Per-field merge rule: take the Mongo value if present *and*
    non-empty for strings / >0 for numerics, else fall through to env,
    else hard-coded default. This matches what a human admin expects
    from a "partial override" UI ("blank means inherit").
    """
    mongo_doc: dict[str, Any] = {}
    used_mongo = False
    if mongo_db is not None:
        try:
            doc = await mongo_db[_SYSTEM_STATE_COLLECTION].find_one(
                {"_id": _SYSTEM_STATE_ID}
            )
            if doc and isinstance(doc.get(_AI_CONFIG_FIELD), dict):
                mongo_doc = dict(doc[_AI_CONFIG_FIELD])
        except Exception as exc:  # noqa: BLE001
            # Fail-soft: a transient Mongo issue should not break
            # optimization. We log and fall back to env-only.
            log.warning("ai-config Mongo read failed (using env): %s", exc)
            mongo_doc = {}

    def _pick_str(field: str, env_name: str, default: str) -> tuple[str, bool]:
        """Return (resolved_value, used_mongo_for_this_field)."""
        v = mongo_doc.get(field)
        if isinstance(v, str) and v.strip():
            return v.strip(), True
        return _env_str(env_name, default), False

    def _pick_float(field: str, env_name: str, default: float) -> tuple[float, bool]:
        v = mongo_doc.get(field)
        if isinstance(v, (int, float)) and v > 0:
            return float(v), True
        return _env_float(env_name, default), False

    def _pick_int(field: str, env_name: str, default: int) -> tuple[int, bool]:
        v = mongo_doc.get(field)
        if isinstance(v, int) and v > 0:
            return int(v), True
        return _env_int(env_name, default), False

    field_results: list[tuple[Any, bool]] = []

    family_raw, mongo_family = _pick_str(
        "modelFamily", "AI_MODEL_FAMILY", _DEFAULT_MODEL_FAMILY
    )
    family = _normalise_family(family_raw)
    field_results.append((family, mongo_family))

    ap, m = _pick_str(
        "anthropicPrimaryModel", "ANTHROPIC_PRIMARY_MODEL", _DEFAULT_ANTHROPIC_PRIMARY
    )
    field_results.append((ap, m))
    ar, m = _pick_str(
        "anthropicRefineModel", "ANTHROPIC_REFINE_MODEL", _DEFAULT_ANTHROPIC_REFINE
    )
    field_results.append((ar, m))
    op, m = _pick_str(
        "openaiPrimaryModel", "OPENAI_PRIMARY_MODEL", _DEFAULT_OPENAI_PRIMARY
    )
    field_results.append((op, m))
    orf, m = _pick_str(
        "openaiRefineModel", "OPENAI_REFINE_MODEL", _DEFAULT_OPENAI_REFINE
    )
    field_results.append((orf, m))
    dp, m = _pick_str(
        "deepseekPrimaryModel", "DEEPSEEK_PRIMARY_MODEL", _DEFAULT_DEEPSEEK_PRIMARY
    )
    field_results.append((dp, m))
    dr, m = _pick_str(
        "deepseekRefineModel", "DEEPSEEK_REFINE_MODEL", _DEFAULT_DEEPSEEK_REFINE
    )
    field_results.append((dr, m))
    abu, m = _pick_str(
        "anthropicBaseURL", "ANTHROPIC_BASE_URL", _DEFAULT_ANTHROPIC_BASE_URL
    )
    field_results.append((abu, m))
    obu, m = _pick_str("openaiBaseURL", "OPENAI_BASE_URL", _DEFAULT_OPENAI_BASE_URL)
    field_results.append((obu, m))
    bps, m = _pick_float(
        "budgetUsdPerStudy", "AI_MAX_USD_PER_STUDY", _DEFAULT_BUDGET_USD_PER_STUDY
    )
    field_results.append((bps, m))
    bpd, m = _pick_float(
        "budgetUsdPerDay", "AI_MAX_USD_PER_DAY", _DEFAULT_BUDGET_USD_PER_DAY
    )
    field_results.append((bpd, m))
    ld, m = _pick_int(
        "lookbackDays", "AI_OPTIMIZATION_LOOKBACK_DAYS", _DEFAULT_LOOKBACK_DAYS
    )
    field_results.append((ld, m))

    mongo_used_count = sum(1 for _, used in field_results if used)
    if mongo_doc and mongo_used_count == len(field_results):
        source = "mongo"
    elif mongo_used_count > 0:
        source = "mixed"
        used_mongo = True
    else:
        source = "env"
    _ = used_mongo  # silence linter; flag retained for future telemetry

    return EffectiveAIConfig(
        model_family=family,
        anthropic_primary_model=ap,
        anthropic_refine_model=ar,
        openai_primary_model=op,
        openai_refine_model=orf,
        deepseek_primary_model=dp,
        deepseek_refine_model=dr,
        anthropic_base_url=abu,
        openai_base_url=obu,
        budget_usd_per_study=bps,
        budget_usd_per_day=bpd,
        lookback_days=ld,
        source=source,
    )


__all__ = ["EffectiveAIConfig", "load_effective_config"]
