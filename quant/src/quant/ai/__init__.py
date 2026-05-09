"""Phase 6 AI optimization loop.

The Phase 6 architecture is intentionally **not** a per-trial Claude call.
Optuna's TPE sampler does the trial loop locally; Claude is invoked only at
study boundaries (define search space, optional mid-study refinement, final
rationale). See ``optimizer.run_study`` for the orchestration entry point
and ``cost_ledger.BudgetGate`` for the hard caps.

Public re-exports keep import surface small for the gRPC server / Arq
worker:
"""

from __future__ import annotations

from quant.ai.claude_client import (
    ClaudeClient,
    ClaudeUsage,
    MissingAPIKeyError,
    compute_usd_cost,
)
from quant.ai.cost_ledger import BudgetExceededError, BudgetGate
from quant.ai.optimizer import OptimizationResult, run_study

__all__ = [
    "BudgetExceededError",
    "BudgetGate",
    "ClaudeClient",
    "ClaudeUsage",
    "MissingAPIKeyError",
    "OptimizationResult",
    "compute_usd_cost",
    "run_study",
]
