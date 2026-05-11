"""OpenAI Responses API wrapper — parallel path to ``claude_client``.

Mirrors :class:`ClaudeClient`'s public surface so it satisfies the
:class:`quant.ai._protocol.AIClient` Protocol. Switching model families
is therefore an env flip (``AI_MODEL_FAMILY=openai``) without touching
the optimizer.

DIFFERENCES FROM CLAUDE PATH
----------------------------
* Endpoint is OpenAI's Responses API (``/v1/responses``), not
  ``/v1/messages``. We require ``stream=True`` because the proxy we go
  through (``aiapi.lib.show``) only serves the streaming variant for
  the ``gpt-5.5`` family at the time of writing.
* Cache fields: OpenAI surfaces ``input_tokens_details.cached_tokens``
  as a read-only count; there's no separately-billed "cache write"
  bucket. We pin ``cache_creation_input_tokens=0`` to keep the dataclass
  shape compatible without inventing a charge.
* System prompt is folded into the ``input`` array as a ``role="system"``
  message — Responses API accepts that natively.
"""

from __future__ import annotations

import json
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

# Model IDs. Defaults can be overridden via env (``OPENAI_PRIMARY_MODEL`` /
# ``OPENAI_REFINE_MODEL``) without recompiling.
OPENAI_MODEL_PRIMARY = os.getenv("OPENAI_PRIMARY_MODEL", "gpt-5.5")
OPENAI_MODEL_REFINE = os.getenv("OPENAI_REFINE_MODEL", "gpt-5.4")

# Roles for the cost ledger — mirror claude_client constants so the same
# ledger entries land regardless of family.
ROLE_DEFINE = "define_search_space"
ROLE_REFINE = "refine_search_space"
ROLE_RATIONALE = "final_rationale"

# ---------------------------------------------------------------------------
# Pricing — TODO(pricing): real per-token rates for gpt-5.5 / gpt-5.4 are
# unknown to us as of 2026-05-11. We deliberately price both at 0 so the
# cost ledger reports usage but no USD charge until rates are added.
# Setting non-zero costs without a verified rate would corrupt the budget
# gate; 0 is fail-safe (never trips the cap) for dev. Real rates land in
# a follow-up commit alongside the next model card update.
# ---------------------------------------------------------------------------
_PRICE_PER_M_INPUT = {OPENAI_MODEL_PRIMARY: 0.0, OPENAI_MODEL_REFINE: 0.0}
_PRICE_PER_M_OUTPUT = {OPENAI_MODEL_PRIMARY: 0.0, OPENAI_MODEL_REFINE: 0.0}


class MissingAPIKeyError(RuntimeError):
    """Raised when neither ``OPENAI_API_KEY`` nor a fallback is set on first use."""


@dataclass
class GPTUsage:
    """Token-level usage for one OpenAI Responses call.

    Field layout mirrors :class:`quant.ai.claude_client.ClaudeUsage` so
    :func:`quant.ai.claude_client.compute_usd_cost` and the cost ledger
    don't need to branch on family.
    """

    input_tokens: int = 0
    output_tokens: int = 0
    cache_read_input_tokens: int = 0
    # Always 0 for OpenAI — Responses API doesn't bill cache writes separately.
    cache_creation_input_tokens: int = 0


def compute_usd_cost(model: str, usage: GPTUsage) -> float:
    """Return USD cost for one OpenAI call.

    Two-bucket model (input + output). ``cache_read_input_tokens`` is
    counted at the same rate as fresh input until we have a verified
    cache-read discount for the family. With ``_PRICE_PER_M_*`` set to 0
    this returns 0.0 for every call — see TODO(pricing) note above.
    """
    in_per_m = _PRICE_PER_M_INPUT.get(model)
    out_per_m = _PRICE_PER_M_OUTPUT.get(model)
    if in_per_m is None or out_per_m is None:
        log.warning("gpt compute_usd_cost: unknown model %r — pricing as 0", model)
        return 0.0
    base_input = max(usage.input_tokens, 0)
    cache_read = max(usage.cache_read_input_tokens, 0)
    output = max(usage.output_tokens, 0)
    cost = (
        ((base_input + cache_read) / 1_000_000.0) * in_per_m
        + (output / 1_000_000.0) * out_per_m
    )
    return round(cost, 6)


# ---------------------------------------------------------------------------
# Client wrapper
# ---------------------------------------------------------------------------


class GPTClient:
    """Async wrapper around ``openai.AsyncOpenAI``.

    Same public surface as :class:`ClaudeClient` — three coroutine methods
    that each return ``(parsed_result, usage)``. Constructor is cheap;
    SDK is lazily imported so tests that inject a fake client never need
    the ``openai`` package on PYTHONPATH.
    """

    # AIClient Protocol surface — see _protocol.py. The optimizer and
    # cost ledger read these to route auditing on the real model name.
    primary_model: str = OPENAI_MODEL_PRIMARY
    refine_model: str = OPENAI_MODEL_REFINE

    def __init__(
        self,
        *,
        api_key: str | None = None,
        base_url: str | None = None,
        client: Any | None = None,
        max_tokens_define: int = 2048,
        max_tokens_rationale: int = 1024,
        max_tokens_refine: int = 1024,
    ) -> None:
        # Prefer dedicated OPENAI_* envs; fall back to ANTHROPIC_* because
        # the proxy serves both endpoints from the same credential.
        self._api_key = (
            api_key
            or os.getenv("OPENAI_API_KEY")
            or os.getenv("ANTHROPIC_API_KEY")
        )
        raw_base = (
            base_url
            or os.getenv("OPENAI_BASE_URL")
            or os.getenv("ANTHROPIC_BASE_URL")
        )
        # The OpenAI SDK joins requests onto the literal base_url — it
        # does NOT auto-append ``/v1``. The default ``api.openai.com/v1``
        # already includes the version segment; proxies that expose
        # ``/v1/responses`` need the same. If the caller supplied a bare
        # host (e.g. ``https://aiapi.lib.show``) we append ``/v1`` so
        # requests resolve to ``/v1/responses`` rather than ``/responses``
        # (the latter returns an HTML 404 from one-api / new-api proxies).
        if raw_base:
            trimmed = raw_base.rstrip("/")
            if not trimmed.endswith("/v1") and "/v1/" not in trimmed + "/":
                trimmed = trimmed + "/v1"
            self._base_url = trimmed
        else:
            self._base_url = raw_base
        self._client = client
        self.max_tokens_define = max_tokens_define
        self.max_tokens_rationale = max_tokens_rationale
        self.max_tokens_refine = max_tokens_refine

    # ----- internal --------------------------------------------------

    async def _ensure_client(self) -> Any:
        if self._client is not None:
            return self._client
        if not self._api_key:
            raise MissingAPIKeyError(
                "OPENAI_API_KEY (or ANTHROPIC_API_KEY fallback) is required for "
                "AI optimization when AI_MODEL_FAMILY=openai; set it in the "
                "quant worker env or inject a fake client in tests."
            )
        # Lazy import — see class docstring.
        from openai import AsyncOpenAI  # type: ignore[import-not-found]

        kwargs: dict[str, Any] = {"api_key": self._api_key}
        if self._base_url:
            kwargs["base_url"] = self._base_url
        self._client = AsyncOpenAI(**kwargs)
        return self._client

    async def _stream_responses(
        self,
        *,
        model: str,
        system_text: str,
        user_text: str,
        max_output_tokens: int,
    ) -> tuple[str, GPTUsage]:
        """Drive the Responses streaming API and return (text, usage).

        The proxy requires ``stream=True``. We iterate the event stream,
        accumulate ``response.output_text.delta`` text chunks, and snapshot
        ``usage`` from the terminal ``response.completed`` event. If the
        SDK exposes a single non-streaming object we still try to extract
        text + usage from it as a fallback (helps test doubles).
        """
        client = await self._ensure_client()
        input_payload = [
            {"role": "system", "content": system_text},
            {"role": "user", "content": user_text},
        ]
        stream = await client.responses.create(
            model=model,
            input=input_payload,
            max_output_tokens=max_output_tokens,
            stream=True,
        )

        text_parts: list[str] = []
        usage = GPTUsage()
        final_text: str | None = None

        async for event in stream:
            etype = getattr(event, "type", "") or ""
            if etype == "response.output_text.delta":
                delta = getattr(event, "delta", "") or ""
                if delta:
                    text_parts.append(delta)
            elif etype == "response.output_text.done":
                # Terminal text snapshot — some servers emit this with the
                # full text. Prefer it over the concatenated deltas if
                # both are present; otherwise the deltas already cover us.
                ft = getattr(event, "text", None)
                if ft:
                    final_text = ft
            elif etype == "response.completed":
                response_obj = getattr(event, "response", None)
                usage = _extract_usage(response_obj)

        text = final_text if final_text is not None else "".join(text_parts)
        return text, usage

    # ----- public API ------------------------------------------------

    async def define_search_space(
        self,
        *,
        study_context: str,
        user_prompt: str,
    ) -> tuple[dict[str, Any], GPTUsage]:
        """Ask the primary GPT model for a parameter space JSON."""
        # Concatenate the static system prompt + study context — OpenAI
        # Responses API has no separate cache_control hook; we rely on the
        # provider's auto-caching when the prefix is identical run-to-run.
        system_text = DEFINE_SEARCH_SPACE_SYSTEM + "\n\n" + study_context
        text, usage = await self._stream_responses(
            model=OPENAI_MODEL_PRIMARY,
            system_text=system_text,
            user_text=user_prompt,
            max_output_tokens=self.max_tokens_define,
        )
        if not text.strip():
            raise ValueError("GPT returned empty define_search_space response")
        parsed = _parse_search_space_json(text)
        return parsed, usage

    async def refine_search_space(
        self,
        *,
        study_context: str,
        user_prompt: str,
    ) -> tuple[dict[str, Any], GPTUsage]:
        """Mid-study tightening on the lighter refine model."""
        system_text = REFINE_SEARCH_SPACE_SYSTEM + "\n\n" + study_context
        text, usage = await self._stream_responses(
            model=OPENAI_MODEL_REFINE,
            system_text=system_text,
            user_text=user_prompt,
            max_output_tokens=self.max_tokens_refine,
        )
        if not text.strip():
            raise ValueError("GPT returned empty refine_search_space response")
        parsed = _parse_search_space_json(text)
        return parsed, usage

    async def write_final_rationale(
        self,
        *,
        study_context: str,
        user_prompt: str,
    ) -> tuple[str, GPTUsage]:
        """Prose recommendation rationale on the primary model."""
        system_text = FINAL_RATIONALE_SYSTEM + "\n\n" + study_context
        text, usage = await self._stream_responses(
            model=OPENAI_MODEL_PRIMARY,
            system_text=system_text,
            user_text=user_prompt,
            max_output_tokens=self.max_tokens_rationale,
        )
        if not text.strip():
            raise ValueError("GPT returned empty rationale response")
        return text.strip(), usage


def _extract_usage(response_obj: Any) -> GPTUsage:
    """Pull token counts out of a Responses ``response.completed`` event.

    Handles both dict-shape (raw JSON) and attr-shape (SDK model) — the
    streaming iterator may surface either depending on SDK version.
    """
    if response_obj is None:
        return GPTUsage()

    def _get(obj: Any, key: str, default: Any = None) -> Any:
        if isinstance(obj, dict):
            return obj.get(key, default)
        return getattr(obj, key, default)

    usage = _get(response_obj, "usage")
    if usage is None:
        return GPTUsage()

    input_tokens = int(_get(usage, "input_tokens", 0) or 0)
    output_tokens = int(_get(usage, "output_tokens", 0) or 0)

    cached = 0
    input_details = _get(usage, "input_tokens_details")
    if input_details is not None:
        cached = int(_get(input_details, "cached_tokens", 0) or 0)

    # The "fresh input" bucket is what ClaudeUsage.input_tokens means:
    # tokens that the provider counted as not coming from cache. OpenAI
    # reports a total ``input_tokens`` that already INCLUDES cached_tokens,
    # so subtract to align semantics with the Anthropic shape.
    fresh_input = max(input_tokens - cached, 0)

    return GPTUsage(
        input_tokens=fresh_input,
        output_tokens=output_tokens,
        cache_read_input_tokens=cached,
        cache_creation_input_tokens=0,
    )


# Re-export the JSON parser so callers can import it from this module if
# they want to stay family-agnostic.
__all__ = [
    "GPTClient",
    "GPTUsage",
    "MissingAPIKeyError",
    "OPENAI_MODEL_PRIMARY",
    "OPENAI_MODEL_REFINE",
    "ROLE_DEFINE",
    "ROLE_REFINE",
    "ROLE_RATIONALE",
    "compute_usd_cost",
]

# json import kept for symmetry with claude_client (parse helper lives in
# _protocol.py but downstream may import json from this module's namespace).
_ = json
