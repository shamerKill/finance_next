"""Mongo helpers for the Phase 6 ``ai_recommendations`` and
``optimization_runs`` collections.

The Python worker is the WRITE source of truth for both collections.
The Go gateway reads them via its own repo (`gateway/internal/store/mongo/
recommendation_repo.go` + `optimization_run_repo.go`); both sides must
agree on field names — camelCase to match the rest of the schema.
"""

from __future__ import annotations

import logging
from datetime import UTC, datetime
from typing import Any

log = logging.getLogger(__name__)


RECOMMENDATIONS_COLLECTION = "ai_recommendations"
OPTIMIZATION_RUNS_COLLECTION = "optimization_runs"

# Status values for ai_recommendations.
STATUS_PENDING_REVIEW = "pending_review"
STATUS_APPROVED = "approved"
STATUS_REJECTED = "rejected"
STATUS_SUPERSEDED = "superseded"


def _now() -> datetime:
    return datetime.now(UTC)


# ---------------------------------------------------------------------------
# optimization_runs
# ---------------------------------------------------------------------------


async def insert_optimization_run(
    mongo_db: Any,
    *,
    study_id: str,
    strategy_id: str,
    algorithm: str,
    param_space: dict[str, Any],
    claude_context_hash: str,
    n_trials_total: int,
    started_at: datetime,
    state: str = "pending",
) -> None:
    """Insert the head doc with state=pending. Called synchronously by gRPC."""
    await mongo_db[OPTIMIZATION_RUNS_COLLECTION].insert_one(
        {
            "_id": study_id,
            "strategyId": strategy_id,
            "algorithm": algorithm,
            "paramSpace": param_space,
            "claudeContextHash": claude_context_hash,
            "trialsTotal": int(n_trials_total),
            "trialsCompleted": 0,
            "bestTrialId": None,
            "bestValue": 0.0,
            "cost": {
                "claudeTokensIn": 0,
                "claudeTokensOut": 0,
                "cacheReadTokens": 0,
                "cacheWriteTokens": 0,
                "usdSpent": 0.0,
                "events": [],
            },
            "state": state,
            "startedAt": started_at,
            "finishedAt": None,
            "error": "",
            "recommendationId": None,
        }
    )


async def update_optimization_run(
    mongo_db: Any,
    *,
    study_id: str,
    fields: dict[str, Any],
) -> None:
    """Apply $set with the given fields."""
    await mongo_db[OPTIMIZATION_RUNS_COLLECTION].update_one(
        {"_id": study_id},
        {"$set": fields},
    )


# ---------------------------------------------------------------------------
# ai_recommendations
# ---------------------------------------------------------------------------


async def insert_recommendation(
    mongo_db: Any,
    *,
    recommendation_id: str,
    strategy_id: str,
    study_id: str,
    proposed_params: dict[str, Any],
    expected_delta: dict[str, float],
    rationale: str,
    period: dict[str, Any] | None = None,
) -> None:
    """Insert a fresh pending_review recommendation.

    ``period`` (optional, default ``None``) is the walk-forward window
    sub-doc — ``{lookbackDays, inSampleDays, oosDays, sharpeAnnualized}``
    — that the optimizer measured against. Gateway readers default
    missing values to 90/63/27 for legacy docs created before this
    field landed.
    """
    now = _now()
    doc: dict[str, Any] = {
        "_id": recommendation_id,
        "strategyId": strategy_id,
        "studyId": study_id,
        "proposedParams": proposed_params,
        "expectedDelta": expected_delta,
        "rationale": rationale,
        "status": STATUS_PENDING_REVIEW,
        "reviewedBy": None,
        "reviewedAt": None,
        "appliedVersion": None,
        "createdAt": now,
        "updatedAt": now,
    }
    if period is not None:
        doc["period"] = period
    await mongo_db[RECOMMENDATIONS_COLLECTION].insert_one(doc)


# Index helpers — Mongo-side index creation is driven by the Go gateway
# at startup (see :class:`gateway/internal/store/mongo/recommendation_repo.go
# EnsureIndexes`). This module provides the canonical names so both sides
# stay in sync if the gateway code is ever re-read.
RECOMMENDATIONS_INDEXES = [
    # (strategyId, status, createdAt desc) — list query covers
    # ?status=pending_review&strategyId=…
    {"name": "strategyId_status_createdAt"},
]
OPTIMIZATION_RUNS_INDEXES = [
    {"name": "strategyId_startedAt"},  # per-strategy history
    {"name": "startedAt"},  # daily aggregation for budget gate
]
