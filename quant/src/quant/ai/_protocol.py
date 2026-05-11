"""Family-agnostic AI client protocol + shared parsing helpers.

The optimizer talks to an :class:`AIClient` rather than a concrete
``ClaudeClient`` — both :class:`quant.ai.claude_client.ClaudeClient` and
:class:`quant.ai.gpt_client.GPTClient` satisfy this Protocol structurally,
so swapping families is an env flip (see ``_build_default_ai_client`` in
``quant.workers.optimize``).

We keep this module dependency-light (only ``json``, stdlib typing) so it
can be imported by either client without circular-import headaches.
"""

from __future__ import annotations

import json
from typing import Any, Protocol


class AIClient(Protocol):
    """Public surface that the optimizer relies on.

    The actual usage type differs per family (``ClaudeUsage`` vs
    ``GPTUsage``), but both are plain dataclasses with the same field
    names so the cost ledger handles them uniformly. We use ``Any`` for
    the usage half of the tuple to keep this Protocol from coupling to
    a concrete dataclass.

    ``primary_model`` / ``refine_model`` carry the model ID the call site
    will use. The optimizer reads these (instead of hard-coding Claude
    constants) so the cost ledger / audit trail reflects whichever
    family is currently dispatched.
    """

    primary_model: str
    refine_model: str

    async def define_search_space(
        self,
        *,
        study_context: str,
        user_prompt: str,
    ) -> tuple[dict[str, Any], Any]: ...

    async def refine_search_space(
        self,
        *,
        study_context: str,
        user_prompt: str,
    ) -> tuple[dict[str, Any], Any]: ...

    async def write_final_rationale(
        self,
        *,
        study_context: str,
        user_prompt: str,
    ) -> tuple[str, Any]: ...


def _parse_search_space_json(text: str) -> dict[str, Any]:
    r"""Lenient JSON parser shared by all AI client families.

    Identical behaviour to the original ``ClaudeClient._parse_search_space_json``
    (which still re-exports this via ``claude_client._parse_search_space_json``
    for backward compatibility) — strips ``\`\`\`json ... \`\`\``` fences
    and validates the ``params`` array shape. Lives here so the GPT client
    can reuse it without importing from ``claude_client`` and creating a
    circular dep.
    """
    s = text.strip()
    if s.startswith("```"):
        lines = s.splitlines()
        try:
            start = next(
                i for i, line in enumerate(lines) if line.lstrip().startswith("{")
            )
        except StopIteration:
            raise ValueError("no JSON object found in response") from None
        end = len(lines) - 1
        while end > start and not lines[end].rstrip().endswith("}"):
            end -= 1
        s = "\n".join(lines[start : end + 1])
    try:
        obj = json.loads(s)
    except json.JSONDecodeError as exc:
        raise ValueError(f"failed to parse AI JSON output: {exc}") from exc
    if not isinstance(obj, dict) or "params" not in obj:
        raise ValueError("response missing required 'params' key")
    if not isinstance(obj["params"], list):
        raise ValueError("'params' must be a list")
    return obj
