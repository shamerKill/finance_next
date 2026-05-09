"""Per-study + per-day USD budget gate for AI calls.

Phase 6 enforces two hard caps:

    * ``AI_MAX_USD_PER_STUDY``  (env, default $5.00)
    * ``AI_MAX_USD_PER_DAY``    (env, default $50.00)

The gate is consulted BEFORE each Claude call. If projected spend would
exceed either cap, ``try_charge`` returns ``False`` and the optimizer
short-circuits (writes ``OPT_BUDGET_EXCEEDED`` state). Real charges land
via :meth:`record` only after the call returns with measured usage —
never before.

Daily totals come from a Mongo aggregation over today's
``optimization_runs`` documents. We deliberately do NOT cache the daily
total across calls within a study: a parallel study running in another
worker would invalidate the cache, and the read is cheap (~5ms typical).
"""

from __future__ import annotations

import logging
import os
from dataclasses import dataclass, field
from datetime import UTC, datetime, timedelta
from typing import Any

from quant.ai.claude_client import ClaudeUsage, compute_usd_cost

log = logging.getLogger(__name__)


class BudgetExceededError(RuntimeError):
    """Raised by :func:`raise_if_exceeded` helpers (currently unused; the
    optimizer prefers boolean ``try_charge``)."""


def _f_env(name: str, default: float) -> float:
    raw = os.getenv(name, "").strip()
    if not raw:
        return default
    try:
        return float(raw)
    except ValueError:
        log.warning("ignoring invalid %s=%r; using default %s", name, raw, default)
        return default


@dataclass
class _LedgerEntry:
    """One Claude call's accounting row."""

    role: str
    model: str
    usage: ClaudeUsage
    usd: float
    at: datetime


@dataclass
class BudgetGate:
    """Per-study budget gate + ledger.

    One instance per study. The gate keeps an in-memory tally of what
    this study has spent so the per-study cap is enforced even when the
    optimizer makes back-to-back calls before any Mongo write lands. The
    daily cap requires the Mongo handle to aggregate across studies.
    """

    study_id: str
    mongo_db: Any | None = None
    max_usd_per_study: float = field(
        default_factory=lambda: _f_env("AI_MAX_USD_PER_STUDY", 5.0)
    )
    max_usd_per_day_global: float = field(
        default_factory=lambda: _f_env("AI_MAX_USD_PER_DAY", 50.0)
    )

    _entries: list[_LedgerEntry] = field(default_factory=list, init=False)
    _study_spent_usd: float = field(default=0.0, init=False)

    # ------------------------------------------------------------------

    @property
    def study_spent_usd(self) -> float:
        return self._study_spent_usd

    @property
    def entries(self) -> list[_LedgerEntry]:
        return list(self._entries)

    async def daily_total_usd(self) -> float:
        """Sum ``usdSpent`` across today's optimization_runs documents.

        Today is **UTC** — matches the cron schedule timezone. Returns 0
        when Mongo isn't configured (the per-study cap still gates).
        """
        if self.mongo_db is None:
            return 0.0
        start = datetime.now(UTC).replace(hour=0, minute=0, second=0, microsecond=0)
        end = start + timedelta(days=1)
        col = self.mongo_db["optimization_runs"]
        # Use an aggregation when possible — falls back to a Python sum
        # for fakes that don't implement aggregate().
        try:
            cursor = col.aggregate(
                [
                    {"$match": {"startedAt": {"$gte": start, "$lt": end}}},
                    {"$group": {"_id": None, "total": {"$sum": "$cost.usdSpent"}}},
                ]
            )
            async for row in cursor:
                return float(row.get("total", 0.0) or 0.0)
            return 0.0
        except (AttributeError, TypeError):
            # Best-effort fallback for in-memory test fakes.
            total = 0.0
            try:
                async for doc in col.find({"startedAt": {"$gte": start, "$lt": end}}):
                    cost = (doc.get("cost") or {}).get("usdSpent") or 0.0
                    total += float(cost)
            except (AttributeError, TypeError):
                return 0.0
            return total

    async def try_charge(self, projected_usd: float) -> tuple[bool, str]:
        """Pre-flight check; does NOT mutate state.

        Returns ``(True, "")`` when both caps allow the projected spend,
        else ``(False, reason)``. Use :meth:`record` after the call to
        register the *actual* spend.
        """
        if projected_usd < 0:
            projected_usd = 0.0

        new_study_total = self._study_spent_usd + projected_usd
        if new_study_total > self.max_usd_per_study:
            return False, (
                f"study cap exceeded: {new_study_total:.4f} > "
                f"{self.max_usd_per_study:.4f} USD"
            )

        # Day-cap is best-effort (Mongo read can fail) — we treat a read
        # error as 0 so a transient outage doesn't fail-closed every
        # study. The per-study cap is the actually-load-bearing bound.
        try:
            day_total = await self.daily_total_usd()
        except Exception as exc:  # noqa: BLE001
            log.warning("daily budget read failed (treating as 0): %s", exc)
            day_total = 0.0
        if day_total + projected_usd > self.max_usd_per_day_global:
            return False, (
                f"daily cap exceeded: {day_total + projected_usd:.4f} > "
                f"{self.max_usd_per_day_global:.4f} USD"
            )
        return True, ""

    def record(
        self,
        *,
        role: str,
        model: str,
        usage: ClaudeUsage,
    ) -> _LedgerEntry:
        """Register a real charge after a call returns. Returns the entry."""
        cost = compute_usd_cost(model, usage)
        entry = _LedgerEntry(
            role=role,
            model=model,
            usage=usage,
            usd=cost,
            at=datetime.now(UTC),
        )
        self._entries.append(entry)
        self._study_spent_usd += cost
        return entry

    def to_persisted_cost(self) -> dict[str, Any]:
        """Build the ``cost`` sub-document persisted under
        ``optimization_runs._id``. Aggregates token usage across all
        recorded calls.
        """
        tokens_in = sum(e.usage.input_tokens for e in self._entries)
        tokens_out = sum(e.usage.output_tokens for e in self._entries)
        cache_read = sum(e.usage.cache_read_input_tokens for e in self._entries)
        cache_write = sum(e.usage.cache_creation_input_tokens for e in self._entries)
        return {
            "claudeTokensIn": tokens_in,
            "claudeTokensOut": tokens_out,
            "cacheReadTokens": cache_read,
            "cacheWriteTokens": cache_write,
            "usdSpent": round(self._study_spent_usd, 6),
            "events": [
                {
                    "role": e.role,
                    "model": e.model,
                    "usd": e.usd,
                    "tokensIn": e.usage.input_tokens,
                    "tokensOut": e.usage.output_tokens,
                    "cacheReadTokens": e.usage.cache_read_input_tokens,
                    "cacheWriteTokens": e.usage.cache_creation_input_tokens,
                    "at": e.at,
                }
                for e in self._entries
            ],
        }
