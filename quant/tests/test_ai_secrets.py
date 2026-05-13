"""Tests for quant.ai.secrets — cross-language AES-256-GCM compatibility.

The golden vector under test was produced by the gateway's Go
implementation (``gateway/internal/crypto/crypto_test.go``) using
``encryptWithIV`` to pin the IV deterministically. If this test starts
failing the most likely cause is the Go format drifting; regenerate by
running the existing Go ``TestGoldenVector`` and compare with the
constant below.
"""

from __future__ import annotations

import asyncio
from typing import Any

import pytest

from quant.ai import secrets as ai_secrets

# ---------------------------------------------------------------------------
# Golden vector — IDENTICAL to gateway/internal/crypto/crypto_test.go.
# This is the single hardest cross-language contract in the codebase;
# any drift means quant can't decrypt anything the gateway wrote.
# ---------------------------------------------------------------------------
GOLDEN_KEK_HEX = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef"
GOLDEN_PLAINTEXT = "hello-finance_next"
GOLDEN_CIPHERTEXT = "ASNFZ4mrze8BI0Vn.GuLf1Ldp7+9yvqLGYiHcXQ==.wYY2u5d23W+dKBiGmmDLuN5s"


def test_decrypt_golden_vector():
    """Byte-for-byte compatible with gateway/internal/crypto's Go path."""
    pt = ai_secrets._decrypt(GOLDEN_CIPHERTEXT, GOLDEN_KEK_HEX)
    assert pt == GOLDEN_PLAINTEXT


def test_decrypt_rejects_malformed():
    # Empty string is treated as "no ciphertext" → returns empty string,
    # no raise (matches load_ai_secrets fallback-to-env semantics).
    assert ai_secrets._decrypt("", GOLDEN_KEK_HEX) == ""
    # All these should raise either ValueError (our validators) or
    # binascii.Error (base64 decode). Accept the union explicitly so
    # ruff B017 doesn't flag a blind `Exception` catch.
    import binascii

    for bad in ["only.two", "a.b.c.d", "!!.!!.!!"]:
        with pytest.raises((ValueError, binascii.Error)) as exc_info:
            ai_secrets._decrypt(bad, GOLDEN_KEK_HEX)
        assert str(exc_info.value)


def test_decrypt_rejects_bad_key():
    # 30-byte hex (too short) → ValueError
    with pytest.raises(ValueError):
        ai_secrets._decrypt(GOLDEN_CIPHERTEXT, "00" * 30)
    # Non-hex
    with pytest.raises(ValueError):
        ai_secrets._decrypt(GOLDEN_CIPHERTEXT, "zz" * 32)


# ---------------------------------------------------------------------------
# load_ai_secrets — fake Mongo path
# ---------------------------------------------------------------------------


class _FakeCollection:
    def __init__(self, doc: dict[str, Any] | None) -> None:
        self._doc = doc

    async def find_one(self, _filter: dict[str, Any]) -> dict[str, Any] | None:
        return self._doc


class _FakeDB:
    def __init__(self, doc: dict[str, Any] | None) -> None:
        self.system_state = _FakeCollection(doc)


@pytest.fixture(autouse=True)
def _reset_cache():
    """Clear the module-global cache between tests so they don't bleed."""
    ai_secrets.invalidate_cache()
    yield
    ai_secrets.invalidate_cache()


@pytest.fixture(autouse=True)
def _scrub_env(monkeypatch):
    """Wipe every AI-related env var so tests start from a clean slate."""
    for name in [
        "ENCRYPTION_KEY",
        "ANTHROPIC_API_KEY",
        "OPENAI_API_KEY",
        "DEEPSEEK_API_KEY",
        "ANTHROPIC_BASE_URL",
        "OPENAI_BASE_URL",
        "DEEPSEEK_BASE_URL",
        "ANTHROPIC_PRIMARY_MODEL",
        "ANTHROPIC_REFINE_MODEL",
        "OPENAI_PRIMARY_MODEL",
        "OPENAI_REFINE_MODEL",
        "DEEPSEEK_PRIMARY_MODEL",
        "DEEPSEEK_REFINE_MODEL",
        "AI_MODEL_FAMILY",
    ]:
        monkeypatch.delenv(name, raising=False)
    yield


@pytest.mark.asyncio
async def test_load_ai_secrets_from_mongo_decrypts_keys(monkeypatch):
    """Mongo ciphertext wins over env fallback."""
    monkeypatch.setenv("ENCRYPTION_KEY", GOLDEN_KEK_HEX)
    monkeypatch.setenv("ANTHROPIC_API_KEY", "env-fallback-should-be-ignored")

    doc = {
        "_id": "global",
        "aiConfig": {
            "modelFamily": "deepseek",
            "anthropicApiKeyCiphertext": GOLDEN_CIPHERTEXT,
            "deepseekBaseURL": "https://proxy.example.com",
            "deepseekPrimaryModel": "deepseek-reasoner",
        },
    }
    db = _FakeDB(doc)

    secrets = await ai_secrets.load_ai_secrets(db)
    assert secrets.family == "deepseek"
    assert secrets.anthropic_api_key == GOLDEN_PLAINTEXT  # decrypted from Mongo
    assert secrets.openai_api_key is None  # no ciphertext, no env
    assert secrets.deepseek_api_key is None
    assert secrets.deepseek_base_url == "https://proxy.example.com"
    assert secrets.deepseek_primary_model == "deepseek-reasoner"


@pytest.mark.asyncio
async def test_load_ai_secrets_env_fallback(monkeypatch):
    """Empty Mongo doc → env vars supply the keys."""
    monkeypatch.setenv("ENCRYPTION_KEY", GOLDEN_KEK_HEX)
    monkeypatch.setenv("ANTHROPIC_API_KEY", "env-anthropic")
    monkeypatch.setenv("OPENAI_API_KEY", "env-openai")
    monkeypatch.setenv("DEEPSEEK_API_KEY", "env-deepseek")
    monkeypatch.setenv("AI_MODEL_FAMILY", "openai")

    db = _FakeDB(None)
    secrets = await ai_secrets.load_ai_secrets(db)
    assert secrets.family == "openai"
    assert secrets.anthropic_api_key == "env-anthropic"
    assert secrets.openai_api_key == "env-openai"
    assert secrets.deepseek_api_key == "env-deepseek"


@pytest.mark.asyncio
async def test_load_ai_secrets_mongo_none_means_env_only():
    """``mongo_db=None`` is the unit-test path; load_ai_secrets must not raise."""
    secrets = await ai_secrets.load_ai_secrets(None)
    # Family defaults to claude when nothing is set.
    assert secrets.family == "claude"
    assert secrets.anthropic_api_key is None
    assert secrets.openai_api_key is None
    assert secrets.deepseek_api_key is None
    # DeepSeek base URL has a hard default ≠ None even with nothing set.
    assert secrets.deepseek_base_url == "https://api.deepseek.com"


@pytest.mark.asyncio
async def test_cache_hit(monkeypatch):
    """Second call within TTL must NOT re-read Mongo."""
    monkeypatch.setenv("ENCRYPTION_KEY", GOLDEN_KEK_HEX)

    class _CountingCollection(_FakeCollection):
        def __init__(self) -> None:
            super().__init__({"_id": "global", "aiConfig": {"modelFamily": "openai"}})
            self.calls = 0

        async def find_one(self, _filter):
            self.calls += 1
            return self._doc

    class _CountingDB:
        def __init__(self) -> None:
            self.system_state = _CountingCollection()

    db = _CountingDB()
    s1 = await ai_secrets.load_ai_secrets(db)
    s2 = await ai_secrets.load_ai_secrets(db)
    assert s1 is s2  # cached
    assert db.system_state.calls == 1  # only one Mongo read


@pytest.mark.asyncio
async def test_decryption_failure_falls_back_to_env(monkeypatch):
    """A garbled ciphertext on one provider degrades to env for that provider only."""
    monkeypatch.setenv("ENCRYPTION_KEY", GOLDEN_KEK_HEX)
    monkeypatch.setenv("OPENAI_API_KEY", "env-openai-survivor")

    doc = {
        "_id": "global",
        "aiConfig": {
            # Anthropic ciphertext is garbage — decryption will throw and
            # we expect a None return for that provider (no env fallback
            # was set).
            "anthropicApiKeyCiphertext": "bad.payload.notbase64!!!",
        },
    }
    db = _FakeDB(doc)
    secrets = await ai_secrets.load_ai_secrets(db)
    assert secrets.anthropic_api_key is None
    # OpenAI must still resolve through the env fallback unaffected.
    assert secrets.openai_api_key == "env-openai-survivor"


def test_decrypt_signature_kek_arg_explicit():
    """The two-arg signature is the supported way to pin the KEK in tests
    (so env state never leaks into the helper). Locks the API shape."""
    # Should NOT raise; the kek_hex arg is honored even when env is unset.
    pt = ai_secrets._decrypt(GOLDEN_CIPHERTEXT, GOLDEN_KEK_HEX)
    assert pt == GOLDEN_PLAINTEXT


# Smoke test — load_ai_secrets must produce a valid AISecrets even when
# called with an arbitrary fake DB that lacks the system_state collection
# entirely. This protects against fakeredis-style DBs that don't respond
# to .system_state attribute access.
@pytest.mark.asyncio
async def test_load_ai_secrets_handles_db_without_collection():
    class _BrokenDB:
        @property
        def system_state(self):
            raise AttributeError("simulated missing collection")

    secrets = await ai_secrets.load_ai_secrets(_BrokenDB())
    # Should degrade gracefully to env-only (which is empty in the fixture).
    assert secrets.anthropic_api_key is None
    assert secrets.family == "claude"


# ---------------------------------------------------------------------------
# streamingEnabled toggle (Node 3.E.6) — operator-level flag persisted in
# Mongo as a JSON ``boolean``. Missing / true ⇒ True; explicit false ⇒ False.
# The gateway uses ``*bool`` to round-trip the absent vs explicit-false
# distinction; the quant side only cares about the resolved boolean.
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_streaming_enabled_defaults_true_when_absent():
    """No Mongo doc and no ``streamingEnabled`` field ⇒ default True."""
    secrets = await ai_secrets.load_ai_secrets(_FakeDB(None))
    assert secrets.streaming_enabled is True

    secrets2 = await ai_secrets.load_ai_secrets(_FakeDB({"_id": "global", "aiConfig": {}}))
    assert secrets2.streaming_enabled is True


@pytest.mark.asyncio
async def test_streaming_enabled_explicit_true_round_trip():
    """An explicit ``streamingEnabled=True`` survives the load."""
    doc = {"_id": "global", "aiConfig": {"streamingEnabled": True}}
    secrets = await ai_secrets.load_ai_secrets(_FakeDB(doc))
    assert secrets.streaming_enabled is True


@pytest.mark.asyncio
async def test_streaming_enabled_explicit_false_persists():
    """``streamingEnabled=False`` resolves to False (the only way to disable streaming)."""
    doc = {"_id": "global", "aiConfig": {"streamingEnabled": False}}
    secrets = await ai_secrets.load_ai_secrets(_FakeDB(doc))
    assert secrets.streaming_enabled is False


@pytest.mark.asyncio
async def test_streaming_enabled_truthy_misencoding_defaults_to_true():
    """Defensive: a misencoded non-bool value falls back to True.

    The gateway only writes True/False/absent, but the quant decoder
    should never silently disable streaming based on a string or int.
    """
    for raw in (0, 1, "false", None):
        ai_secrets.invalidate_cache()
        doc = {"_id": "global", "aiConfig": {"streamingEnabled": raw}}
        secrets = await ai_secrets.load_ai_secrets(_FakeDB(doc))
        # Only the literal ``False`` should resolve to False.
        assert secrets.streaming_enabled is True, f"raw={raw!r} should not disable"


# Run-only sanity for the async fixture wiring (some pytest-asyncio
# versions need the explicit event loop to surface failure modes early).
def test_event_loop_runs():
    loop = asyncio.new_event_loop()
    try:
        loop.run_until_complete(asyncio.sleep(0))
    finally:
        loop.close()
