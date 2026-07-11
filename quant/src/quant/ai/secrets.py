"""Load AI provider secrets from Mongo system_state.aiConfig.

The gateway encrypts API keys with AES-256-GCM using the same master KEK
(`ENCRYPTION_KEY` env, 32-byte hex) that the Go envelope service uses.
Ciphertexts are stored at ``system_state._id="global"`` under
``aiConfig.{anthropicApiKeyCiphertext, openaiApiKeyCiphertext,
deepseekApiKeyCiphertext}`` in the byte-identical wire format
``base64(iv).base64(tag).base64(ciphertext)`` — see
``gateway/internal/crypto/crypto.go`` for the canonical implementation
and ``crypto_test.go`` for the golden vector.

Env vars (``ANTHROPIC_API_KEY`` / ``OPENAI_API_KEY`` /
``DEEPSEEK_API_KEY``) remain as a one-release legacy fallback. Order of
precedence for each provider:

    1. Mongo ciphertext (decrypted with ENCRYPTION_KEY)
    2. Plaintext env var

Cache TTL is 5 minutes — calling ``invalidate_cache()`` after a
``PUT /admin/ai/config`` forces a fresh read on the next study.
"""

from __future__ import annotations

import base64
import logging
import os
import time
from dataclasses import dataclass
from typing import Any

from cryptography.hazmat.primitives.ciphers.aead import AESGCM

log = logging.getLogger(__name__)


@dataclass(frozen=True)
class AISecrets:
    """Resolved secrets for one quant worker boot / load_ai_secrets call.

    Strings that resolved to "no value" are ``None``, NOT empty strings.
    The optimiser distinguishes "unset" from "empty" when deciding
    whether to build an AI client at all.
    """

    family: str  # "claude" | "openai" | "deepseek"
    anthropic_api_key: str | None
    openai_api_key: str | None
    deepseek_api_key: str | None
    anthropic_base_url: str | None
    openai_base_url: str | None
    deepseek_base_url: str | None
    anthropic_primary_model: str | None
    anthropic_refine_model: str | None
    openai_primary_model: str | None
    openai_refine_model: str | None
    deepseek_primary_model: str | None
    deepseek_refine_model: str | None
    budget_usd_per_study: float | None
    budget_usd_per_day: float | None
    lookback_days: int | None
    # Streaming dispatch toggle. ``True`` (default) keeps every client
    # on streaming transports; ``False`` flips to one-shot non-stream
    # calls. The mongo overlay stores this as ``streamingEnabled``;
    # missing / None / true → True, explicit false → False. The
    # operator-facing toggle is in ``/settings/ai`` (Node 3.E.6).
    streaming_enabled: bool = True


# ---------------------------------------------------------------------------
# Decryption helpers
# ---------------------------------------------------------------------------


def _decrypt(ciphertext: str, kek_hex: str) -> str:
    """Decrypt gateway-format ciphertext.

    Wire format mirrors ``gateway/internal/crypto/crypto.go`` exactly:

        base64(iv).base64(tag).base64(ciphertext)

    where each segment is independent standard base64. AESGCM expects
    ``ciphertext || tag`` concatenated as input to ``decrypt``, so we
    splice the two byte arrays before calling. ``associated_data=None``
    matches the gateway path which never sets AAD.
    """
    if not ciphertext:
        return ""
    parts = ciphertext.split(".")
    if len(parts) != 3:
        raise ValueError(
            "malformed ciphertext: expected 3 dot-separated base64 parts"
        )
    iv = base64.b64decode(parts[0])
    tag = base64.b64decode(parts[1])
    ct = base64.b64decode(parts[2])
    if len(iv) != 12:
        raise ValueError(f"iv length {len(iv)}, want 12")
    if len(tag) != 16:
        raise ValueError(f"tag length {len(tag)}, want 16")
    try:
        kek = bytes.fromhex(kek_hex)
    except ValueError as exc:
        raise ValueError("ENCRYPTION_KEY must be valid hex") from exc
    if len(kek) != 32:
        raise ValueError(
            f"ENCRYPTION_KEY must be 64 hex chars (32 bytes); got {len(kek)} bytes"
        )
    aesgcm = AESGCM(kek)
    pt = aesgcm.decrypt(iv, ct + tag, associated_data=None)
    return pt.decode("utf-8")


# ---------------------------------------------------------------------------
# Cache + loader
# ---------------------------------------------------------------------------

# Module-global cache. Keyed on a single literal "default" because every
# secret loader reads the same system_state doc (id="global"); we don't
# yet have multi-tenant secret partitioning. The TTL is 5 minutes —
# long enough to amortise Mongo round-trips during a study, short
# enough that a freshly-saved key takes effect within minutes without
# requiring a worker restart.
_cache: dict[str, tuple[float, AISecrets]] = {}
_CACHE_TTL = 300.0  # seconds


def invalidate_cache() -> None:
    """Drop the in-process cache so the next ``load_ai_secrets`` re-reads.

    Called from the gateway's ``PUT /admin/ai/config`` path? No — gateway
    can't reach quant memory directly. The quant worker should call this
    on receiving the corresponding ``event.ai.config.updated`` signal,
    or on a periodic refresh (5min TTL gives the same outcome).
    """
    _cache.clear()


async def load_ai_secrets(
    mongo_db: Any,
    kek_hex: str | None = None,
) -> AISecrets:
    """Load + decrypt secrets, falling back to env for missing values.

    Args:
        mongo_db: A motor / pymongo async database handle. May be
            ``None`` (unit tests / dev) — env-only path then applies.
        kek_hex: 64-char hex string for the master KEK. When omitted,
            reads ``ENCRYPTION_KEY``. Empty / invalid = skip decryption,
            fall straight to env.

    The function is intentionally tolerant of partial failure: a
    decryption error on one field (rotated KEK, malformed payload)
    falls back to the env var for that field only — never crashes the
    whole load.
    """
    kek_hex = kek_hex if kek_hex is not None else os.getenv("ENCRYPTION_KEY", "")

    now = time.monotonic()
    cached = _cache.get("default")
    if cached is not None and now < cached[0]:
        return cached[1]

    # Best-effort Mongo read. We tolerate any exception (driver down,
    # collection missing) and degrade to env-only.
    doc: dict[str, Any] | None = None
    if mongo_db is not None:
        try:
            doc = await mongo_db.system_state.find_one({"_id": "global"})
        except Exception as exc:  # noqa: BLE001
            log.warning("ai_secrets: system_state read failed: %s", exc)
            doc = None

    cfg: dict[str, Any] = {}
    if isinstance(doc, dict):
        nested = doc.get("aiConfig")
        if isinstance(nested, dict):
            cfg = nested

    def _decrypt_field(field: str, env_name: str) -> str | None:
        ct = cfg.get(field, "")
        if isinstance(ct, str) and ct and kek_hex:
            try:
                pt = _decrypt(ct, kek_hex)
                if pt:
                    return pt
            except Exception as exc:  # noqa: BLE001
                # Rotated KEK / malformed payload — log + degrade to env
                # for this field only. Other providers are unaffected.
                log.warning(
                    "ai_secrets: decrypt %s failed (%s); falling back to env %s",
                    field,
                    exc,
                    env_name,
                )
        env_val = os.getenv(env_name)
        return env_val if env_val else None

    def _str_or_none(field: str) -> str | None:
        v = cfg.get(field)
        if isinstance(v, str) and v.strip():
            return v.strip()
        return None

    def _float_or_none(field: str) -> float | None:
        v = cfg.get(field)
        if isinstance(v, (int, float)) and v > 0:
            return float(v)
        return None

    def _int_or_none(field: str) -> int | None:
        v = cfg.get(field)
        if isinstance(v, int) and v > 0:
            return v
        return None

    family = cfg.get("modelFamily")
    if not isinstance(family, str) or not family.strip():
        family = os.getenv("AI_MODEL_FAMILY", "claude")
    family = family.strip().lower()
    # Normalize legacy "gpt" alias to "openai" to match
    # ai_config._normalise_family. "deepseek" stays as-is.
    if family == "gpt":
        family = "openai"
    if family not in ("claude", "openai", "deepseek"):
        family = "claude"

    # streamingEnabled: explicit False = honor; None / missing / True = True.
    # The pointer-type on the gateway side becomes JSON ``true``/``false``
    # /absent; we only read False as "off" so a truthy mis-encoding never
    # silently disables streaming.
    streaming_raw = cfg.get("streamingEnabled")
    streaming_enabled = streaming_raw is not False

    secrets = AISecrets(
        family=family,
        anthropic_api_key=_decrypt_field(
            "anthropicApiKeyCiphertext", "ANTHROPIC_API_KEY"
        ),
        openai_api_key=_decrypt_field("openaiApiKeyCiphertext", "OPENAI_API_KEY"),
        deepseek_api_key=_decrypt_field(
            "deepseekApiKeyCiphertext", "DEEPSEEK_API_KEY"
        ),
        anthropic_base_url=_str_or_none("anthropicBaseURL")
        or (os.getenv("ANTHROPIC_BASE_URL") or None),
        openai_base_url=_str_or_none("openaiBaseURL")
        or (os.getenv("OPENAI_BASE_URL") or None),
        deepseek_base_url=_str_or_none("deepseekBaseURL")
        or (os.getenv("DEEPSEEK_BASE_URL") or None)
        or "https://api.deepseek.com",
        anthropic_primary_model=_str_or_none("anthropicPrimaryModel")
        or os.getenv("ANTHROPIC_PRIMARY_MODEL")
        or "claude-sonnet-4-6",
        anthropic_refine_model=_str_or_none("anthropicRefineModel")
        or os.getenv("ANTHROPIC_REFINE_MODEL")
        or "claude-haiku-4-5-20251001",
        openai_primary_model=_str_or_none("openaiPrimaryModel")
        or os.getenv("OPENAI_PRIMARY_MODEL")
        or "gpt-5.5",
        openai_refine_model=_str_or_none("openaiRefineModel")
        or os.getenv("OPENAI_REFINE_MODEL")
        or "gpt-5.4",
        deepseek_primary_model=_str_or_none("deepseekPrimaryModel")
        or os.getenv("DEEPSEEK_PRIMARY_MODEL")
        or "deepseek-v4-pro",
        deepseek_refine_model=_str_or_none("deepseekRefineModel")
        or os.getenv("DEEPSEEK_REFINE_MODEL")
        or "deepseek-v4-flash",
        budget_usd_per_study=_float_or_none("budgetUsdPerStudy"),
        budget_usd_per_day=_float_or_none("budgetUsdPerDay"),
        lookback_days=_int_or_none("lookbackDays"),
        streaming_enabled=streaming_enabled,
    )
    _cache["default"] = (now + _CACHE_TTL, secrets)
    return secrets


__all__ = ["AISecrets", "load_ai_secrets", "invalidate_cache"]
