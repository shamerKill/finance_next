"""Anthropic SDK wrapper with prompt caching + cost computation.

Phase 6 calls Claude **at study boundaries only**. Per-trial inference is
local (Optuna TPE) — Claude is invoked at most three times per study:

  1. ``define_search_space``  → Sonnet 4.6, structured JSON output
  2. ``refine_search_space``  → Haiku 4.5, optional after 50 trials
  3. ``write_final_rationale`` → Sonnet 4.6, prose for the reviewer

The static system prompt + the strategy schema are marked
``cache_control={"type": "ephemeral"}`` so the second and third calls in
a study reuse cached input tokens. Cache TTL is 5 minutes by default; we
opt into the 1-hour TTL for the system prompt because slow studies can
exceed 5 minutes between the first and the third call.

Pricing constants are hard-coded with date stamps; they're snapshots, not
authority — the cost ledger surfaces ``usdSpent`` to the UI/ops, not to
the user.
"""

from __future__ import annotations

import logging
import os
from dataclasses import dataclass
from typing import Any

from quant.ai._protocol import _parse_search_space_json
from quant.ai.prompts import (
    DEFINE_SEARCH_SPACE_SYSTEM,
    FINAL_RATIONALE_SYSTEM,
    REFINE_SEARCH_SPACE_SYSTEM,
)

log = logging.getLogger(__name__)

# Model IDs — see plan §Phase 6 deliverables.1. ``claude-sonnet-4-6`` and
# ``claude-haiku-4-5-20251001`` are the canonical strings; do NOT swap to
# legacy aliases.
SONNET_MODEL = "claude-sonnet-4-6"
HAIKU_MODEL = "claude-haiku-4-5-20251001"

# ---------------------------------------------------------------------------
# Pricing (snapshots, USD per 1M tokens). Keep this in sync with platform docs.
# Last verified: 2026-05-09.
# ---------------------------------------------------------------------------
# Sonnet 4.6: $3/M input, $15/M output
# Haiku  4.5: $1/M input, $5 /M output
# Cache READ: 10% of base input price
# Cache WRITE: 25% premium over base input price (5-minute TTL)
# (1-hour cache write is 100% premium; we don't use 1-hour TTL by default,
#  see set_extended_cache_ttl().)
_PRICE_PER_M_INPUT = {SONNET_MODEL: 3.00, HAIKU_MODEL: 1.00}
_PRICE_PER_M_OUTPUT = {SONNET_MODEL: 15.00, HAIKU_MODEL: 5.00}
_CACHE_READ_MULT = 0.10
_CACHE_WRITE_MULT = 1.25

# Roles for the cost ledger / Mongo `optimization_runs.cost.events[].role`.
ROLE_DEFINE = "define_search_space"
ROLE_REFINE = "refine_search_space"
ROLE_RATIONALE = "final_rationale"


class MissingAPIKeyError(RuntimeError):
    """Raised when ``ANTHROPIC_API_KEY`` is missing on first use."""


@dataclass
class ClaudeUsage:
    """Token-level usage for one Anthropic API call.

    Mirrors what ``anthropic`` returns in ``response.usage``; we copy the
    fields out so the optimizer / cost ledger doesn't depend on the SDK's
    private types.
    """

    input_tokens: int = 0
    output_tokens: int = 0
    cache_read_input_tokens: int = 0
    cache_creation_input_tokens: int = 0


def compute_usd_cost(model: str, usage: ClaudeUsage) -> float:
    """Return USD cost for one Claude call.

    The four-bucket math (uncached input, cache write, cache read, output)
    keeps the ledger faithful even when caching changes the request mix.
    Unknown models cost 0 — we don't *invent* prices for things we don't
    have hard-coded rates for. This is a fail-closed default so a typo in
    a model ID can't silently overcharge a budget.
    """
    in_per_m = _PRICE_PER_M_INPUT.get(model)
    out_per_m = _PRICE_PER_M_OUTPUT.get(model)
    if in_per_m is None or out_per_m is None:
        log.warning("compute_usd_cost: unknown model %r — pricing as 0", model)
        return 0.0

    # `input_tokens` from the API already excludes cache hits — it's the
    # uncached portion only. Don't double-count.
    base_input = max(usage.input_tokens, 0)
    cache_read = max(usage.cache_read_input_tokens, 0)
    cache_write = max(usage.cache_creation_input_tokens, 0)
    output = max(usage.output_tokens, 0)

    cost = (
        (base_input / 1_000_000.0) * in_per_m
        + (cache_read / 1_000_000.0) * in_per_m * _CACHE_READ_MULT
        + (cache_write / 1_000_000.0) * in_per_m * _CACHE_WRITE_MULT
        + (output / 1_000_000.0) * out_per_m
    )
    return round(cost, 6)


# ---------------------------------------------------------------------------
# Client wrapper
# ---------------------------------------------------------------------------


class ClaudeClient:
    """Async wrapper around ``anthropic.AsyncAnthropic``.

    Construction is cheap — the SDK lazily resolves the API key from
    ``ANTHROPIC_API_KEY`` (or the explicit ``api_key`` arg). The wrapper
    raises ``MissingAPIKeyError`` only on first call, not on construction,
    so tests that monkeypatch the underlying client never need an API key.

    Tests can pass ``client=<fake>`` to fully bypass the SDK.

    ``primary_model`` and ``refine_model`` are instance attributes (not
    constants on the class) so the optimizer / budget ledger can route
    pricing + auditing on the actual model name being used, regardless of
    whether this client or a sibling (e.g. GPTClient) is in play.
    """

    # AIClient Protocol surface — see _protocol.py.
    primary_model: str = SONNET_MODEL
    refine_model: str = HAIKU_MODEL

    def __init__(
        self,
        *,
        api_key: str | None = None,
        client: Any | None = None,
        max_tokens_define: int = 2048,
        max_tokens_rationale: int = 1024,
        max_tokens_refine: int = 1024,
        stream: bool = False,
    ) -> None:
        self._api_key = api_key or os.getenv("ANTHROPIC_API_KEY")
        self._client = client  # may be set by tests
        self.max_tokens_define = max_tokens_define
        self.max_tokens_rationale = max_tokens_rationale
        self.max_tokens_refine = max_tokens_refine
        # Streaming toggle — when True, swaps the one-shot Messages
        # call to ``messages.create(stream=True)`` and accumulates the
        # delta events. Default is False to preserve Phase 6 behaviour
        # (every prior call site was implicitly one-shot). The
        # ``/settings/ai`` operator toggle threads through
        # ``_build_ai_client_with_secrets``, which passes
        # ``stream=secrets.streaming_enabled`` explicitly.
        self.stream = stream

    # ----- internal --------------------------------------------------

    async def _ensure_client(self) -> Any:
        if self._client is not None:
            return self._client
        if not self._api_key:
            raise MissingAPIKeyError(
                "ANTHROPIC_API_KEY is required for AI optimization; set it in "
                "the quant worker env or inject a fake client in tests."
            )
        # Lazy import — keeps pure-test paths from needing anthropic on PYTHONPATH
        # if a fake client is injected. The dependency is declared in pyproject.toml.
        from anthropic import AsyncAnthropic  # type: ignore[import-not-found]

        self._client = AsyncAnthropic(api_key=self._api_key)
        return self._client

    @staticmethod
    def _extract_text(response: Any) -> str:
        """Pull the first text block out of a Messages API response.

        ``response.content`` is a list of typed blocks; we take the first
        ``type == "text"`` block. If there are none we return empty string —
        callers should fail loudly on empty output, not crash on indexing.
        """
        try:
            for block in response.content:
                if getattr(block, "type", None) == "text":
                    return block.text or ""
        except (AttributeError, TypeError):
            pass
        return ""

    @staticmethod
    def _extract_usage(response: Any) -> ClaudeUsage:
        """Extract usage fields from an Anthropic response."""
        usage = getattr(response, "usage", None)
        if usage is None:
            return ClaudeUsage()
        return ClaudeUsage(
            input_tokens=int(getattr(usage, "input_tokens", 0) or 0),
            output_tokens=int(getattr(usage, "output_tokens", 0) or 0),
            cache_read_input_tokens=int(
                getattr(usage, "cache_read_input_tokens", 0) or 0
            ),
            cache_creation_input_tokens=int(
                getattr(usage, "cache_creation_input_tokens", 0) or 0
            ),
        )

    @staticmethod
    def _build_system(static_prompt: str, study_context: str) -> list[dict[str, Any]]:
        """Render the system prompt with a single cache breakpoint at the end.

        Both blocks share the breakpoint — the Anthropic API caches up to
        the marker. Putting the volatile per-study context BEFORE the
        breakpoint means subsequent calls in the same study share the
        full prefix; we lock in the static prompt + the study context as
        one cache key.
        """
        return [
            {"type": "text", "text": static_prompt},
            {
                "type": "text",
                "text": study_context,
                "cache_control": {"type": "ephemeral"},
            },
        ]

    async def _dispatch(
        self,
        *,
        model: str,
        max_tokens: int,
        system: list[dict[str, Any]],
        user_prompt: str,
    ) -> tuple[str, ClaudeUsage]:
        """Issue one Messages API call and return (text, usage).

        ``self.stream`` picks the SDK transport:
            * False — ``messages.create(...)`` returns a complete Message
              object in one HTTP round-trip. This is what every prior
              Phase 6 call site did implicitly.
            * True — ``messages.create(stream=True)`` returns an async
              event stream we accumulate. Tested on
              anthropic>=0.42 (current pin). The terminal
              ``message_stop`` / ``message_delta`` events carry the
              cumulative usage block.

        Both paths return the same ``(text, ClaudeUsage)`` tuple, so the
        optimizer / cost ledger don't branch on dispatch mode.
        """
        client = await self._ensure_client()
        if not self.stream:
            response = await client.messages.create(
                model=model,
                max_tokens=max_tokens,
                system=system,
                messages=[{"role": "user", "content": user_prompt}],
            )
            return self._extract_text(response), self._extract_usage(response)

        # Streaming variant — iterate events, concatenate text deltas,
        # snapshot final usage. We tolerate both stream-event shapes
        # (event.type=="content_block_delta" with delta.text, and
        # event.type=="message_delta"/"message_stop" with usage updates).
        stream = await client.messages.create(
            model=model,
            max_tokens=max_tokens,
            system=system,
            messages=[{"role": "user", "content": user_prompt}],
            stream=True,
        )
        parts: list[str] = []
        usage = ClaudeUsage()
        async for event in stream:
            etype = getattr(event, "type", "") or ""
            if etype == "content_block_delta":
                delta = getattr(event, "delta", None)
                if delta is not None:
                    text = getattr(delta, "text", None) or ""
                    if text:
                        parts.append(text)
            elif etype in ("message_start", "message_delta", "message_stop"):
                # ``message_start`` carries the message with initial
                # usage; ``message_delta`` updates output_tokens as the
                # stream progresses. Take the latest values.
                msg = getattr(event, "message", None)
                if msg is not None:
                    u = self._extract_usage(msg)
                    if u.input_tokens or u.output_tokens or u.cache_read_input_tokens or u.cache_creation_input_tokens:
                        usage = u
                u2 = getattr(event, "usage", None)
                if u2 is not None:
                    # ``message_delta`` events expose usage at the top
                    # level; merge in the running output count.
                    usage = ClaudeUsage(
                        input_tokens=int(getattr(u2, "input_tokens", usage.input_tokens) or usage.input_tokens),
                        output_tokens=int(getattr(u2, "output_tokens", usage.output_tokens) or usage.output_tokens),
                        cache_read_input_tokens=int(
                            getattr(u2, "cache_read_input_tokens", usage.cache_read_input_tokens)
                            or usage.cache_read_input_tokens
                        ),
                        cache_creation_input_tokens=int(
                            getattr(u2, "cache_creation_input_tokens", usage.cache_creation_input_tokens)
                            or usage.cache_creation_input_tokens
                        ),
                    )
        return "".join(parts), usage

    # ----- public API ------------------------------------------------

    async def define_search_space(
        self,
        *,
        study_context: str,
        user_prompt: str,
    ) -> tuple[dict[str, Any], ClaudeUsage]:
        """Ask Sonnet 4.6 for a parameter space JSON.

        Returns ``(parsed_dict, usage)``. Parse errors raise
        ``ValueError`` — the optimizer falls back to a default space.
        Dispatch picks streaming vs one-shot per ``self.stream``.
        """
        text, usage = await self._dispatch(
            model=SONNET_MODEL,
            max_tokens=self.max_tokens_define,
            system=self._build_system(DEFINE_SEARCH_SPACE_SYSTEM, study_context),
            user_prompt=user_prompt,
        )
        if not text.strip():
            raise ValueError("Claude returned empty define_search_space response")
        parsed = _parse_search_space_json(text)
        return parsed, usage

    async def refine_search_space(
        self,
        *,
        study_context: str,
        user_prompt: str,
    ) -> tuple[dict[str, Any], ClaudeUsage]:
        """Ask Haiku 4.5 to tighten the space mid-study."""
        text, usage = await self._dispatch(
            model=HAIKU_MODEL,
            max_tokens=self.max_tokens_refine,
            system=self._build_system(REFINE_SEARCH_SPACE_SYSTEM, study_context),
            user_prompt=user_prompt,
        )
        if not text.strip():
            raise ValueError("Claude returned empty refine_search_space response")
        parsed = _parse_search_space_json(text)
        return parsed, usage

    async def write_final_rationale(
        self,
        *,
        study_context: str,
        user_prompt: str,
    ) -> tuple[str, ClaudeUsage]:
        """Ask Sonnet 4.6 for the prose recommendation rationale."""
        text, usage = await self._dispatch(
            model=SONNET_MODEL,
            max_tokens=self.max_tokens_rationale,
            system=self._build_system(FINAL_RATIONALE_SYSTEM, study_context),
            user_prompt=user_prompt,
        )
        if not text.strip():
            raise ValueError("Claude returned empty rationale response")
        return text.strip(), usage


# ``_parse_search_space_json`` now lives in :mod:`quant.ai._protocol` so the
# GPT client can reuse it without importing from this module. The name is
# re-exported above (``from quant.ai._protocol import _parse_search_space_json``)
# so existing callers / tests that import it from ``claude_client`` still
# resolve correctly.
