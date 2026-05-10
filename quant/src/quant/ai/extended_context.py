"""Phase 8 extended context for the AI optimizer.

When ``AI_CONTEXT_INCLUDE_EXTENDED=true`` (the default — see env logic
below), :func:`build_extended_context` augments the cached study-context
block with three short summaries:

* recent news for the strategy's symbol (last 24h, top 5 by recency)
* current macro snapshot (latest CPI / FFR / M2)
* on-chain snapshot for crypto symbols (TVL of related protocol or
  chain stats)

The assembled text is appended to the cached portion of the prompt that
:func:`quant.ai.optimizer._study_context_text` produces. With Anthropic
prompt-caching enabled (``cache_control={"type":"ephemeral"}``) the
incremental cost is ~$0.001 per cached call — well inside the existing
``AI_MAX_USD_PER_STUDY`` budget. **If the augmentation would push the
projected token count past budget the optimizer falls back to the
non-extended context and logs a warning** (the ``BudgetGate.try_charge``
inside :func:`_try_define_search_space` is the single source of truth
for that check; this module never touches the budget gate).

Default of the env flag
-----------------------
``true`` if **either** ``FRED_API_KEY`` or ``ETHERSCAN_API_KEY`` is set
— at least one extended source is then likely to return data and the
context isn't pure noise. ``false`` otherwise. Operators can always
force on/off via the env.
"""

from __future__ import annotations

import logging
import os
from datetime import UTC, datetime, timedelta
from typing import Any

log = logging.getLogger(__name__)


def _flag_default() -> bool:
    """Determine the default for ``AI_CONTEXT_INCLUDE_EXTENDED``."""
    return bool(
        os.getenv("FRED_API_KEY", "").strip()
        or os.getenv("ETHERSCAN_API_KEY", "").strip()
    )


def is_enabled() -> bool:
    raw = os.getenv("AI_CONTEXT_INCLUDE_EXTENDED", "").strip().lower()
    if raw in {"1", "true", "yes", "on"}:
        return True
    if raw in {"0", "false", "no", "off"}:
        return False
    return _flag_default()


async def build_extended_context(
    *,
    symbol: str,
    extended_repo: Any | None = None,
) -> str:
    """Render an extended-context text block.

    Returns ``""`` when the env flag is off, the repo isn't available,
    or every individual source raised — i.e. the caller can always
    safely concatenate the result.

    ``extended_repo`` is injected so unit tests can pass a fake module
    with ``recent_news_for_symbol`` / ``latest_macro`` / ``latest_onchain``
    callables. In production we lazily import :mod:`quant.data.extended_repo`.
    """
    if not is_enabled():
        return ""

    if extended_repo is None:
        try:
            from quant.data import extended_repo as _real_repo

            extended_repo = _real_repo
        except Exception as exc:  # noqa: BLE001
            log.warning("extended_repo import failed; skipping AI context: %s", exc)
            return ""

    parts: list[str] = []

    # ---- News (last 24h, top 5) -------------------------------------
    try:
        since = datetime.now(UTC) - timedelta(hours=24)
        rows = await extended_repo.recent_news_for_symbol(
            symbol, since=since, limit=5
        )
    except Exception as exc:  # noqa: BLE001
        log.warning("recent_news fetch failed: %s", exc)
        rows = []
    if rows:
        parts.append("Recent news (24h, top 5):")
        for r in rows:
            ts = r.get("ts")
            ts_iso = ts.isoformat() if hasattr(ts, "isoformat") else str(ts)
            parts.append(
                f"  [{ts_iso}] sentiment={float(r.get('sentiment', 0.0)):+.2f} "
                f"src={r.get('source', '?')}: {r.get('title', '')}"
            )

    # ---- Macro snapshot -----------------------------------------------
    macro_codes = [("fred", "CPIAUCSL"), ("fred", "FEDFUNDS"), ("fred", "M2SL")]
    macro_lines: list[str] = []
    for src, code in macro_codes:
        try:
            row = await extended_repo.latest_macro(src, code)
        except Exception as exc:  # noqa: BLE001
            log.warning("latest_macro(%s,%s) failed: %s", src, code, exc)
            row = None
        if row is not None:
            ts = row.get("ts")
            ts_iso = ts.isoformat() if hasattr(ts, "isoformat") else str(ts)
            macro_lines.append(
                f"  {code} = {row.get('value')} ({row.get('unit', '')}) @ {ts_iso}"
            )
    if macro_lines:
        parts.append("\nMacro snapshot (latest):")
        parts.extend(macro_lines)

    # ---- On-chain (only relevant when symbol looks like crypto) ----
    if "/USDT" in symbol or symbol.upper().startswith(("BTC", "ETH")):
        for chain, metric in (("btc", "hash_rate"), ("eth", "eth_supply")):
            try:
                row = await extended_repo.latest_onchain(chain, metric)
            except Exception as exc:  # noqa: BLE001
                log.warning("latest_onchain(%s,%s) failed: %s", chain, metric, exc)
                row = None
            if row is not None:
                ts = row.get("ts")
                ts_iso = ts.isoformat() if hasattr(ts, "isoformat") else str(ts)
                parts.append(
                    f"\nOn-chain {chain}.{metric} = {row.get('value')} @ {ts_iso}"
                )

    if not parts:
        return ""
    return "\n--- Extended context (Phase 8) ---\n" + "\n".join(parts) + "\n"
